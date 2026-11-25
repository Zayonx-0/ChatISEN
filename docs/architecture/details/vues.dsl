workspace extends ../c4.dsl {
    views {
        deployment chat "Démonstration Google Cloud" "04-deploiement-gcp" "Entrée Web publique, VM Debian 13 et média direct entre navigateurs." {
            title "Déploiement de démonstration sur Google Cloud"
            include *
            exclude "relationship==clientInstance->caddyInstance" "relationship==clientInstance->standaloneInstance"
            autoLayout tb
        }
        component api "23-composants-fastify" "Pile Compose R01 de recette. Vue complémentaire au profil GCP standalone." {
            title "Composants Fastify · recette R01"
            include web entry identity conversations repo stream calls db metrics legacy
            exclude "relationship==web->identity" "relationship==web->conversations" "relationship==web->stream" "relationship==web->calls"
            exclude "relationship==identity->web" "relationship==conversations->web" "relationship==stream->web"
            exclude "relationship==db->repo" "relationship==repo->identity" "relationship==db->stream"
            autoLayout tb
        }
        dynamic api "05-message-prive" "Alice est connectée et Bob est déjà abonné au fil." {
            title "Envoi d’un message privé"
            web -> conversations "Alice envoie texte et clientId : POST /api/v1/conversations/{id}/messages."
            conversations -> identity "Contrôle du cookie, de l’origine et du jeton CSRF."
            conversations -> repo "Écrit le message pour l’utilisateur authentifié."
            repo -> db "BEGIN. Verrouille conversation puis membre actif (FOR UPDATE). Cherche la clé (conversation_id, sender_id, client_id)."
            repo -> db "Nouvelle clé : last_seq + 1, INSERT conversation_events puis messages, COMMIT. Toute erreur annule les trois écritures."
            conversations -> web "201 + Message. Même clé et texte : 200, même ID. Texte différent : 409 IDEMPOTENCY_CONFLICT."
            db -> stream "Seulement après un nouvel INSERT et son commit : NOTIFY réveille les abonnements du fil. Un retry identique ne crée aucun événement."
            stream -> repo "Revalide la session de Bob et son appartenance."
            stream -> db "Lit les événements où seq > curseur, dans l’ordre."
            stream -> web "Bob reçoit message.created. React fusionne par ID."
            autoLayout lr
        }
        dynamic api "06-reconnexion" "Bob reprend depuis la dernière séquence reçue." {
            title "Rattrapage d’un fil après une coupure"
            web -> stream "Après fermeture, Bob rouvre /api/v1/ws au bout de 1 500 ms."
            stream -> identity "Vérifie l’origine au handshake et authentifie le cookie."
            stream -> web "Envoie ready (heartbeatSeconds=30)."
            web -> stream "Envoie {v:1, type:subscribe, conversationId, afterSeq} avec un curseur décimal en chaîne."
            stream -> repo "Vérifie la session et l’appartenance à la conversation."
            stream -> db "Lit conversations.last_seq pour l’accusé subscribed(snapshotSeq)."
            stream -> web "Confirme l’abonnement. Un curseur 0 relit depuis le début."
            stream -> db "SELECT seq > afterSeq ORDER BY seq LIMIT 100. NOTIFY ou réveil périodique à 10 s relance la lecture."
            stream -> repo "Revalide les droits avant de livrer chaque événement."
            stream -> web "event avec seq, at, event, data. React avance son curseur et fusionne les messages par ID."
            stream -> web "Accès perdu : error NOT_MEMBER. Tampon > 1 Mio : resync_required(fromSeq). Dans ces deux cas, le serveur retire l’abonnement."
            autoLayout lr
        }
        container chat "07-profils" "Deux points d’entrée, deux clients, deux magasins de données." {
            title "Quelle application reconstruit-on ?"
            include student web api db localBrowser local localFile
            autoLayout tb
        }
        component web "09-interface-react" "Composants et fonctions du même fichier main.tsx." {
            title "Une action dans le client React"
            include shell lists thread socketEffect httpClient api
            autoLayout tb
        }
        dynamic api "10-identite" "Connexion puis accès privé avec la même session PostgreSQL." {
            title "Où ChatISEN authentifie Alice"
            web -> identity "POST /api/v1/auth/login {handle,password}. Origin doit égaler CORS_ORIGIN."
            identity -> repo "findUserByHandle normalise le handle en minuscules."
            repo -> db "SELECT users par handle. À l’inscription : Argon2id, 19 456 Kio, t=2, p=1."
            repo -> identity "Rend password_hash. argon2.verify contrôle le mot de passe. Échec : 401."
            identity -> repo "Génère 32 octets aléatoires en base64url. createSession reçoit SHA-256 du jeton."
            repo -> db "INSERT sessions. expires_at et absolute_expires_at sont fixés à 24 h."
            identity -> web "200 {user}, avec csrfToken. Set-Cookie __Host-chatisen, Secure, HttpOnly, SameSite=Lax, Path=/, Max-Age=86400."
            web -> identity "GET /api/v1/me avec cookie. postgresAuthenticator recharge session valide et utilisateur. Réponse : profil à la racine."
            web -> identity "POST /api/v1/auth/logout, Origin et x-csrf-token = HMAC-SHA256(secret, jeton) en base64url."
            identity -> repo "revokeSession écrit revoked_at."
            identity -> web "204, cookie effacé. Un GET /me avec le jeton révoqué renvoie 401."
            autoLayout lr
        }
        component local "16-standalone" "Responsabilités dans le processus node:http du profil local." {
            title "Du navigateur au fichier JSON local"
            include localBrowser localAuth localChat localChannels localCalls localFile
            autoLayout tb
        }
        dynamic api "18-admission-livekit" "Séquence exercée par tests HTTP, avec une base et sans serveur SFU." {
            title "Admission LiveKit expérimentale"
            bench -> calls "POST /api/v1/conversations/{id}/calls {clientId,mode}. CHATISEN_EXPERIMENTAL_CALLS doit valoir true, sinon 503."
            calls -> identity "Chaque mutation vérifie session, Origin et x-csrf-token."
            calls -> repo "Verrouille conversation puis membre. Insère calls, state=ringing, room_name=chatisen_<UUID appel>. Un seul appel ouvert par fil."
            calls -> bench "Création 201, retry identique 200, conflit 409. Aucun événement d’invitation v1."
            bench -> calls "POST /api/v1/calls/{id}/join. LIVEKIT_URL doit désigner une URL wss et les clés doivent être configurées."
            calls -> repo "Verrouille conversation, membre, session et appel. Upsert call_participants, état invited. Identité = userId_sessionId."
            calls -> bench "200 {callId,serverUrl,token,expiresAt}, Cache-Control no-store. JWT HS256, salle unique, roomJoin, canPublish et canSubscribe."
            bench -> calls "POST /api/v1/calls/{id}/end par initiateur ou owner. 403 pour un autre membre."
            calls -> repo "Écrit state=ended et ended_at. Une admission ultérieure renvoie 409 CALL_ENDED."
            calls -> bench "204. Le JWT déjà émis expire au plus tôt entre +300 s et l’expiration de session. La déconnexion SFU reste à intégrer."
            autoLayout lr
        }
    }
}
