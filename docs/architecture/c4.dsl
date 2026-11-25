workspace "ChatISEN" "Architecture R01 au commit bf1cd60 et cible de démonstration Google Cloud" {
    !impliedRelationships false
    model {
        student = person "Membre de ChatISEN" "Échange des messages privés ou de groupe, rejoint un appel."
        reviewer = person "Enseignant" "Ouvre l’URL de démonstration avec un navigateur standard."
        operator = person "Équipe projet" "Déploie, surveille et dépanne la plateforme."
        dns = softwareSystem "DNS du domaine ISEN" "Résout ia-pple.isen.fedyna.fr vers l’IPv4 externe réservée de la VM." {
            tags "Cible"
        }
        tailscale = softwareSystem "Tailscale" "Accès privé d’administration retenu pour la cible." {
            tags "Cible"
        }
        bench = softwareSystem "Client de test v1" "Exerce les routes d’admission de Fastify par injection HTTP."
        chat = softwareSystem "ChatISEN" "Plateforme académique de communication temps réel." {
            edge = container "nginx · frontal TLS" "Route la page, les requêtes API et les mises à niveau WebSocket." "nginx:1.27-alpine" {
                tags "Configuration"
            }
            webHost = container "web · fichiers compilés" "Sert /usr/share/nginx/html depuis la sortie Vite." "nginx:1.27-alpine" {
                tags "Configuration"
            }
            web = container "Client React" "apps/web/src/main.tsx dans le navigateur. Un fil actif et un curseur en mémoire." "React 19.3.1 / Vite 6.4.6" {
                shell = component "App et Auth" "Au montage GET /me. Sinon formulaire login ou register. Le profil chargé contient csrfToken." "useState / useEffect"
                lists = component "Liste et recherche" "loadConversations parcourt les pages puis charge chaque détail. Recherche exacte, création de direct ou groupe." "main.tsx"
                thread = component "Fil et composition" "select charge détail et historique. send réutilise clientId au retry du même brouillon. upsert par ID et tri BigInt(seq)." "main.tsx"
                socketEffect = component "Effet WebSocket" "Une socket par fil sélectionné. Reconnexion à 1 500 ms et reprise depuis cursor.current." "WebSocket du navigateur"
                httpClient = component "api et mutation" "fetch sur /api/v1, credentials include. JSON, x-csrf-token sur mutations et prise en charge de 204." "Fetch API"
            }
            api = container "API applicative" "apps/api/dist/server.js. DATABASE_URL active les modules v1. Les anciennes routes sont aussi enregistrées." "Fastify 5.12.8 / Node.js 24" {
                identity = component "Identité et sessions" "identity/postgres-routes.ts authentifie le cookie. security.ts fournit Argon2id et le HMAC CSRF." "TypeScript / argon2"
                conversations = component "Routes de conversation" "chat/postgres-routes.ts monte les routes v1. group-operations.ts traite rôles et mutations sous verrou." "TypeScript / HTTP"
                stream = component "Diffusion WebSocket v1" "chat/postgres-websocket.ts tient les abonnements en RAM. Le journal PostgreSQL permet la reprise." "@fastify/websocket / ws"
                repo = component "Accès PostgreSQL" "repositories/postgres.ts fournit pg.Pool et transaction. Chat et appels exécutent aussi du SQL via ce pool." "pg 8.23.1"
                calls = component "Admission d’appel" "Contrôle la session, l’appartenance et l’état de l’appel. Retourne un jeton signé limité à une salle." "TypeScript / JWT HS256" {
                    tags "Experimental"
                }
                metrics = component "Métriques API" "Expose compteurs HTTP, messages et connexions instrumentées." "prom-client" {
                    tags "Configuration"
                }
                legacy = component "Routes historiques /api" "server.ts utilise les Maps de store.ts et les canaux de ws.ts. Comptes et fichiers volatils, jetons média de démo." "Fastify / RAM"
            }
            db = container "Base et journal" "Comptes, sessions, membres, messages et événements." "PostgreSQL 17" {
                tags "Database"
            }
            migration = container "Migration au démarrage" "Applique le schéma sur la base saine avant le démarrage de l’API." "Node.js / SQL" {
                tags "Configuration"
            }
            media = container "Serveur média" "Salle, signalisation et retransmission de pistes à chaque abonné." "LiveKit / SFU" {
                tags "Cible"
            }
            prom = container "Collecte des métriques" "Interroge l’endpoint interne /metrics de l’API." "Prometheus" {
                tags "Configuration"
            }
            grafana = container "Tableau de bord" "Consulte les séries Prometheus pour l’équipe projet." "Grafana" {
                tags "Configuration"
            }
            localBrowser = container "Client standalone" "apps/web/public/index.html et app.js. Notifications et appels directs à deux." "JavaScript / DOM / WebRTC"
            local = container "Serveur standalone" "pnpm dev lance apps/standalone/server.mjs. Un processus HTTP sert les fichiers et /api." "Node.js / node:http" {
                localAuth = component "session et mutate" "scrypt, cookie de session, recherche du hash SHA-256 et contrôle du HMAC CSRF sur mutations métier." "node:crypto"
                localChat = component "api et save" "Utilisateurs, directs, groupes et messages. Incrémente lastSeq et écrit le document JSON avant diffusion du message." "node:http / node:fs"
                localChannels = component "Canaux en mémoire" "wsChannels et listeners indexés par conversation. WS et SSE revérifient la session et le membre à la livraison." "WebSocket / EventSource"
                localCalls = component "Appels directs" "Invitation, réponse, fin et relais éphémère des offres SDP et candidats ICE vers la session du pair." "HTTP + WebSocket"
            }
            localFile = container "Fichier JSON local" "Sept collections. CHATISEN_DATA_FILE fixe le chemin. save réécrit le fichier, un seul processus." "Fichier sur disque" {
                tags "Database"
            }
        }

        student -> chat "Utilise la messagerie et les appels"
        reviewer -> chat "Accède à la démonstration"
        operator -> chat "Déploie et exploite"
        reviewer -> dns "Résout le nom de démonstration" "DNS"
        operator -> tailscale "Accède à l’administration" "Tailnet"
        student -> edge "Ouvre l’application" "HTTPS / WSS"
        reviewer -> edge "Ouvre l’URL avec :27028" "HTTPS / WSS" {
            tags "Cible"
        }
        web -> edge "Charge la page et appelle la même origine" "HTTPS / WSS"
        edge -> webHost "Achemine / et /assets/" "HTTP web:80"
        edge -> api "Achemine /api/v1 et /api/v1/ws" "HTTP / WS interne"
        edge -> media "Achemine la signalisation /livekit/" "WebSocket" {
            tags "Cible"
        }
        web -> api "Utilise le contrat v1 via le proxy" "HTTPS / WSS"
        web -> media "Publie et reçoit les pistes" "WebRTC / ICE" {
            tags "Cible"
        }
        api -> db "Lit et écrit les données métier" "SQL / TCP 5432"
        migration -> db "Applique 001_initial.sql puis 002_group_commands.sql" "SQL / TCP 5432"
        prom -> metrics "Collecte /metrics" "HTTP interne"
        prom -> api "Scrape /metrics toutes les 15 s" "HTTP api:3000"
        legacy -> metrics "Incrémente messages et sockets sur le parcours historique"
        grafana -> prom "Interroge les séries" "PromQL / HTTP interne"
        operator -> grafana "Consulte les tableaux de bord" "Accès privé prévu" {
            tags "Cible"
        }

        web -> identity "Ouvre la session et charge le profil" "HTTPS"
        web -> conversations "Lit le fil et soumet les messages" "HTTPS"
        web -> stream "Ouvre la socket et indique son curseur" "WSS"
        web -> calls "Demande une admission de salle" "HTTPS" {
            tags "Cible"
        }
        bench -> calls "Exerce create, join et end"
        calls -> bench "Retourne le résultat de la commande"
        identity -> web "Renvoie le profil et gère le cookie de session"
        repo -> identity "Restitue utilisateur et session"
        db -> repo "Retourne les lignes et l’état de transaction"
        identity -> repo "Enregistre et vérifie les sessions"
        conversations -> identity "Vérifie session, origine et CSRF selon l’action"
        conversations -> repo "Vérifie les droits et appelle les transactions métier"
        stream -> identity "Authentifie la session à l’ouverture"
        stream -> repo "Revalide session et appartenance avant livraison"
        repo -> db "Exécute les requêtes et les transactions" "pg / SQL"
        stream -> db "Écoute les notifications et relit le journal" "LISTEN et SELECT"
        db -> stream "Réveille la diffusion après le commit" "NOTIFY"
        stream -> web "Délivre les événements du fil" "WSS"
        conversations -> web "Retourne l’état de l’écriture au client" "HTTPS"
        calls -> identity "Contrôle la session et le CSRF"
        calls -> repo "Vérifie l’appartenance et enregistre l’admission" {
            tags "Experimental"
        }
        shell -> httpClient "Charge la session et envoie le formulaire"
        shell -> lists "Charge la liste après authentification"
        lists -> httpClient "Recherche, liste, détail et création"
        lists -> thread "Sélectionne le fil"
        thread -> httpClient "Pagine et envoie le texte"
        thread -> socketEffect "Un changement de fil remplace la socket"
        socketEffect -> api "Ouvre /api/v1/ws et envoie subscribe avec afterSeq" "WebSocket"
        httpClient -> api "Envoie requête et cookie" "JSON / HTTP"
        student -> localBrowser "Utilise le profil pnpm dev"
        student -> web "Utilise le profil React"
        localBrowser -> local "Charge le site et utilise /api et /api/ws" "HTTP / WS"
        local -> localFile "Charge au démarrage et réécrit à chaque mutation durable"
        localBrowser -> localChat "Recherche et écrit" "HTTP /api"
        localBrowser -> localChannels "Souscrit à tous les fils connus" "WS /api/ws"
        localBrowser -> localCalls "Crée, accepte et signale" "HTTP /api"
        localChat -> localAuth "Identifie le membre et contrôle la mutation"
        localCalls -> localAuth "Vérifie membre, utilisateur et session de signalisation"
        localChat -> localFile "Persiste avant émission"
        localCalls -> localFile "Persiste les métadonnées d’appel"
        localChat -> localChannels "Diffuse message.created"
        localCalls -> localChannels "Diffuse invitation, état et signal ciblé"
        localChannels -> localAuth "Revérifie les droits"

        deploymentEnvironment "Cible Google Cloud" {
            clientHost = deploymentNode "Poste de l’enseignant" "Réseau extérieur." "Poste client" {
                browser = infrastructureNode "Navigateur de l’enseignant" "Exécute React et se connecte depuis Internet." "Chromium ou Firefox"
            }
            schoolDns = deploymentNode "DNS de l’école" "Résolution du nom public." "DNS" {
                dnsRecord = infrastructureNode "ia-pple.isen.fedyna.fr" "Enregistrement A vers l’IPv4 externe de la VM." {
                    tags "Cible"
                }
            }
            cloud = deploymentNode "Google Cloud Compute Engine" "Cible de déploiement à valider sur la VM." "VPC / VM Linux" {
                firewall = infrastructureNode "Firewall VPC et IPv4 statique" "Entrée Web : TCP 27028. Ports publics 80 et 443 fermés." "Règles réseau GCP" {
                    tags "Cible"
                }
                docker = deploymentNode "Docker Compose sur la VM" "Les services internes communiquent sur le réseau Docker." "Docker Engine" {
                    proxyInstance = containerInstance edge
                    staticFiles = containerInstance webHost
                    apiInstance = containerInstance api
                    migratorInstance = containerInstance migration
                    dbInstance = containerInstance db
                    sfInstance = containerInstance media
                    promInstance = containerInstance prom
                    grafanaInstance = containerInstance grafana
                }
                admin = infrastructureNode "Interface d’administration" "Accès privé prévu pour SSH et Grafana." "Tailscale" {
                    tags "Cible"
                }
                mediaEntry = infrastructureNode "Chemin média public à valider" "Relais ou multiplexage compatible avec la contrainte 27028 à éprouver." "ICE / TURN" {
                    tags "Cible"
                }
            }
            browser -> dnsRecord "Résout le nom" "DNS" {
                tags "Cible"
            }
            browser -> firewall "Accède au site et à la signalisation" "HTTPS / WSS :27028" {
                tags "Cible"
            }
            firewall -> proxyInstance "Transmet HTTPS et WSS" "TCP 27028" {
                tags "Cible"
            }
            browser -> mediaEntry "Trajet audio/vidéo à valider" "WebRTC / ICE" {
                tags "Cible"
            }
            mediaEntry -> sfInstance "Achemine le média après négociation" "WebRTC" {
                tags "Cible"
            }
            admin -> grafanaInstance "Accès de l’équipe aux tableaux de bord" "Tunnel privé" {
                tags "Cible"
            }
        }
    }

    views {
        systemContext chat "01-contexte" "Acteurs et systèmes extérieurs retenus pour la démonstration." {
            title "01 · Contexte de ChatISEN"
            include student reviewer operator dns tailscale chat
            autoLayout lr
        }
        container chat "02-conteneurs" "Messagerie, signalisation et supervision." {
            title "02 · Services applicatifs et protocoles"
            include edge webHost web api db migration media prom grafana
            exclude "relationship.source==web && relationship.destination==api"
            exclude "relationship.source==api && relationship.destination==web"
            exclude "relationship.source==db && relationship.destination==api"
            autoLayout tb
        }
        component api "03-composants-api" "Identité, autorisation, transaction et diffusion au sein de Fastify." {
            title "03 · Composants de l’API Fastify"
            include identity conversations repo stream calls db metrics legacy prom
            exclude "relationship.source==db && relationship.destination==repo"
            exclude "relationship.source==repo && relationship.destination==identity"
            exclude "relationship.source==db && relationship.destination==stream"
            autoLayout tb
        }
        deployment chat "Cible Google Cloud" "04-deploiement-gcp" "Cible réseau. Le port public 27028 et le chemin média font l’objet de validations distinctes." {
            title "04 · Déploiement cible sur Google Cloud"
            include *
            exclude "relationship.source==dbInstance && relationship.destination==apiInstance"
            autoLayout tb
        }
        dynamic api "05-message-prive" "Alice est connectée et Bob est déjà abonné au fil." {
            title "05 · Envoi d’un message privé"
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
            title "06 · Rattrapage d’un fil après une coupure"
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
            title "07 · Quelle application reconstruit-on ?"
            include student web api db localBrowser local localFile
            autoLayout tb
        }
        component web "09-interface-react" "Composants et fonctions du même fichier main.tsx." {
            title "09 · Une action dans le client React"
            include shell lists thread socketEffect httpClient api
            autoLayout tb
        }
        dynamic api "10-identite" "Connexion puis accès privé avec la même session PostgreSQL." {
            title "10 · Où ChatISEN authentifie Alice"
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
            title "16 · Du navigateur au fichier JSON local"
            include localBrowser localAuth localChat localChannels localCalls localFile
            autoLayout tb
        }
        dynamic api "18-admission-livekit" "Séquence exercée par tests HTTP, avec une base et sans serveur SFU." {
            title "18 · Admission LiveKit expérimentale"
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

        styles {
            element "Element" {
                background #E8F1FA
                color #10283F
                stroke #38678E
                strokeWidth 2
                fontSize 23
            }
            element "Person" {
                shape Person
                background #173955
                color #FFFFFF
                stroke #173955
            }
            element "Database" {
                shape Cylinder
            }
            element "Configuration" {
                background #F0F2F5
                color #273443
                stroke #748397
            }
            element "Experimental" {
                background #FFF1D5
                color #402C0E
                stroke #A46010
            }
            element "Cible" {
                background #F6EFFB
                color #402959
                stroke #895EA3
                border dashed
            }
            relationship "Relationship" {
                color #37516E
                style solid
                fontSize 20
            }
            relationship "Experimental" {
                color #A46010
                style dashed
            }
            relationship "Cible" {
                color #895EA3
                style dashed
            }
        }
    }
}
