workspace "ChatISEN" "Démonstration Google Cloud (déploiement ab465a3) et profil Compose R01 (repère bf1cd60)" {
    !impliedRelationships false
    model {
        student = person "Membre de ChatISEN" "S’inscrit, recherche un contact, ouvre un fil privé ou de groupe et relit son historique."
        reviewer = person "Enseignant" "Teste la démonstration depuis Internet avec un navigateur ordinaire."
        operator = person "Équipe projet" "Déploie, consulte la santé des services et dépanne la VM."
        dns = softwareSystem "DNS du domaine ISEN" "Résout le domaine du site vers le frontal HTTPS."
        stun = softwareSystem "STUN Google" "stun.l.google.com:19302. Aide les navigateurs à découvrir leur adresse pour ICE."
        tailscale = softwareSystem "Tailscale" "Réseau privé envisagé pour l’administration." {
            tags "Cible"
        }
        bench = softwareSystem "Client de test v1" "Exerce les routes d’admission de Fastify par injection HTTP."
        chat = softwareSystem "ChatISEN" "Comptes, messagerie et appels directs. Démonstration standalone en HTTPS sur Google Compute Engine." {
            group "Navigateur web" {
                web = container "Client React" "Interface web responsive sur ordinateur et mobile. Session par cookie, requêtes JSON et une socket par fil." "JavaScript / React 19.3.1" {
                    shell = component "App et Auth" "Au montage GET /me. Sinon formulaire login ou register. Le profil chargé contient csrfToken." "useState / useEffect"
                    lists = component "Liste et recherche" "loadConversations parcourt les pages puis charge chaque détail. Recherche exacte, création de direct ou groupe." "main.tsx"
                    thread = component "Fil et composition" "select charge détail et historique. send réutilise clientId au retry du même brouillon. upsert par ID et tri BigInt(seq)." "main.tsx"
                    socketEffect = component "Effet WebSocket" "Une socket par fil sélectionné. Reconnexion à 1 500 ms et reprise depuis cursor.current." "WebSocket du navigateur"
                    httpClient = component "api et mutation" "fetch sur /api/v1, credentials include. JSON, x-csrf-token sur mutations et prise en charge de 204." "Fetch API"
                }
                localBrowser = container "Client standalone" "HTML, CSS et app.js. Messages via WebSocket, pistes audio et vidéo directement entre les navigateurs." "HTML / JavaScript / WebRTC"
            }
            group "Serveur R01 · Docker Engine et Compose v2" {
                edge = container "nginx · frontal TLS" "Pile Compose de recette. Hôte :80 → redirection, :443 → TLS." "nginx:1.27-alpine" {
                    tags "Configuration"
                }
                webHost = container "web · serveur statique" "Sert index.html et assets/ depuis /usr/share/nginx/html, après compilation Vite 6.4.6." "nginx:1.27-alpine" {
                    tags "Configuration"
                }
                api = container "API applicative" "apps/api/dist/server.js sur node:24-bookworm-slim. DATABASE_URL active /api/v1 sur PostgreSQL. L’ancien /api utilise ses propres Maps." "Fastify 5.12.8 / Node.js 24" {
                    entry = component "Montage Fastify" "server.ts monte cookie, CORS, multipart et WebSocket. DATABASE_URL initialise le repository et les handlers v1." "TypeScript / Fastify"
                    identity = component "Identité et sessions" "identity/postgres-routes.ts. Cookie __Host-chatisen, session SQL 24 h, Argon2id et HMAC CSRF via security.ts." "TypeScript / argon2"
                    conversations = component "Routes de conversation" "chat/postgres-routes.ts. Direct, groupes, messages et événements. group-operations.ts applique les droits de propriétaire." "TypeScript / HTTP"
                    stream = component "Abonnements WebSocket" "chat/postgres-websocket.ts. Contrôle Origin et session puis abonnement au fil. Journal par afterSeq, 100 événements par lot." "@fastify/websocket / ws"
                    repo = component "PostgresRepository" "repositories/postgres.ts. Pool pg, transactions, verrous et clé clientId. Les écritures alimentent le journal." "pg 8.23.1"
                    calls = component "Admission d’appel" "calls/postgres-routes.ts. Drapeau expérimental, droits par fil et JWT HS256 pour une salle, valable au plus 300 s." "TypeScript / JWT HS256" {
                        tags "Experimental"
                    }
                    metrics = component "Sondes et métriques" "server.ts et metrics.ts. /healthz, /readyz (ping SQL) et /metrics. Compteurs de chat alimentés par /api historique." "prom-client" {
                        tags "Configuration"
                    }
                    legacy = component "Routes historiques /api" "server.ts utilise les Maps de store.ts et les canaux de ws.ts. Comptes et fichiers volatils, jetons média de démo." "Fastify / RAM"
                }
                db = container "postgres · base et journal" "14 tables. Comptes, membres, sessions, messages et événements ordonnés. Volume pgdata." "postgres:17-alpine" {
                    tags "Database"
                }
                migration = container "migrate · migration SQL" "Job unique. Attend pg_isready. Applique les 2 fichiers sous transaction puis débloque l’API s’il sort avec 0." "node db/migrate.mjs" {
                    tags "Configuration"
                }
                media = container "livekit · serveur média" "Déclaré dans Compose local. Connexion du client React et trajet WebRTC public à valider." "LiveKit 1.8.4 / SFU" {
                    tags "Cible"
                }
                prom = container "prometheus · collecte" "Interroge api:3000/metrics toutes les 15 s." "Prometheus 3.1.0" {
                    tags "Configuration"
                }
                grafana = container "grafana · tableaux" "Datasource Prometheus. Requêtes HTTP et messages historiques." "Grafana 12.0.0" {
                    tags "Configuration"
                }
            }
            group "Profil standalone" {
                caddy = container "Caddy · entrée HTTPS sur GCP" "Sur la VM Debian 13. Redirige HTTP :80, termine TLS sur :443 et relaie HTTP et WebSocket sur loopback." "Caddy / TLS"
                local = container "Serveur standalone" "apps/standalone/server.mjs. Sur la VM, systemd lance chatisen.service avec Node 24.14.1 en écoute sur 127.0.0.1:3000. En local, pnpm dev." "Node.js / node:http" {
                    localRouter = component "Entrée du serveur" "server.mjs sert apps/web/public, oriente /api et accepte l’Upgrade sur /api/ws. GET /readyz rend json-demo." "node:http"
                    localAuth = component "Identité et session" "scrypt, empreinte SHA-256 du jeton de session, HMAC CSRF. Cookie __Host-chatisen en HTTPS, Secure, HttpOnly et SameSite=Lax." "node:crypto"
                    localChat = component "Messagerie et persistance" "Directs, groupes et messages. Vérifie l’appartenance, incrémente lastSeq et écrit le document JSON avant diffusion." "node:http / node:fs"
                    localChannels = component "Abonnements WebSocket" "Canaux par conversation. Contrôle PUBLIC_ORIGIN, la session et le membre. Diffuse messages et signalisation de l’appel." "WS / SSE"
                    localCalls = component "Signalisation des appels" "Invitations, réponses, SDP et ICE vers la session du pair. GET /api/config communique le serveur STUN aux navigateurs." "HTTP + WebSocket"
                }
                localFile = container "Stockage JSON standalone" "Sur GCP, /var/lib/chatisen/chatisen.json. Comptes, sessions, conversations, membres, messages, appels et pièces jointes." "Fichier sur disque" {
                    tags "Database"
                }
            }
        }

        student -> chat "Échange des messages et passe des appels" "Navigateur web"
        reviewer -> chat "Ouvre ia-pple.isen.fedyna.fr" "HTTPS / WSS :443"
        reviewer -> dns "Résout le nom de démonstration" "DNS"
        chat -> stun "Découverte ICE par les navigateurs de la démonstration" "STUN"
        operator -> tailscale "Ouvre une session privée d’administration" "Tailnet"
        tailscale -> chat "Accès de l’équipe à la VM" "SSH / supervision, cible" {
            tags "Cible"
        }
        student -> edge "Ouvre l’application" "HTTPS / WSS"
        reviewer -> caddy "Ouvre le domaine ISEN" "HTTPS / WSS :443"
        web -> edge "Charge l’interface et appelle la même origine" "HTTPS / WSS"
        edge -> webHost "Achemine / et /assets/" "HTTP web:80"
        edge -> api "Achemine /api/, /healthz et /metrics. Upgrade sur /api/ws et /api/v1/ws." "HTTP / WS api:3000"
        edge -> media "Route /livekit/ en retirant le préfixe" "WS livekit:7880" {
            tags "Cible"
        }
        web -> api "Utilise le contrat v1 via le proxy" "HTTPS / WSS"
        web -> media "Publie et reçoit les pistes" "WebRTC / ICE" {
            tags "Cible"
        }
        api -> db "Lit et écrit. Relit le journal avec LISTEN / NOTIFY" "SQL postgres:5432"
        migration -> db "Applique 001_initial.sql puis 002_group_commands.sql" "SQL / TCP 5432"
        prom -> metrics "Collecte /metrics" "HTTP interne"
        prom -> api "Scrape /metrics toutes les 15 s" "HTTP api:3000"
        legacy -> metrics "Incrémente messages et sockets sur le parcours historique"
        grafana -> prom "Interroge les séries" "HTTP prometheus:9090"
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
        web -> entry "Appelle /api/v1 via le frontal" "HTTPS / WSS"
        entry -> identity "Monte /auth et /me"
        entry -> conversations "Monte /users, groupes et messages"
        entry -> stream "Monte /ws"
        entry -> calls "Monte les POST d’appel"
        entry -> legacy "Monte /api historique en mémoire"
        entry -> metrics "Monte sondes et hook onResponse"
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
        localBrowser -> dns "Résout le domaine public" "DNS"
        localBrowser -> caddy "Charge le site et appelle /api et /api/ws" "HTTPS / WSS :443"
        localBrowser -> stun "Découvre les adresses candidates" "STUN :19302"
        caddy -> local "Achemine HTTP et Upgrade WebSocket" "127.0.0.1:3000"
        caddy -> localRouter "Relaie HTML, JSON et WebSocket" "HTTP / WS vers 127.0.0.1:3000"
        localBrowser -> local "Charge le site et utilise /api et /api/ws" "HTTP / WS :3000"
        local -> localFile "Lit au démarrage. Réécrit comptes, sessions, fils, messages et appels."
        localBrowser -> localChat "Recherche et écrit" "HTTP /api"
        localBrowser -> localChannels "Souscrit à tous les fils connus" "WS /api/ws"
        localBrowser -> localCalls "Crée, accepte et signale" "HTTP /api"
        localRouter -> localAuth "Inscription, connexion et mutations"
        localRouter -> localChat "Conversations et messages"
        localRouter -> localChannels "Upgrade /api/ws"
        localRouter -> localCalls "Appels et configuration ICE"
        localChat -> localAuth "Identifie le membre et contrôle la mutation"
        localCalls -> localAuth "Vérifie membre, utilisateur et session de signalisation"
        localChat -> localFile "Persiste avant émission"
        localCalls -> localFile "Persiste les métadonnées d’appel"
        localChat -> localChannels "Diffuse message.created"
        localCalls -> localChannels "Diffuse invitation, état et signal ciblé"
        localChannels -> localAuth "Revérifie les droits"

        deploymentEnvironment "Démonstration Google Cloud" {
            clientHost = deploymentNode "Poste du jury" "Connexion depuis Internet." "Ordinateur ou mobile" {
                browser = deploymentNode "Navigateur web" "Exécute le client standalone." "Navigateur" {
                    clientInstance = containerInstance localBrowser
                }
            }
            peerHost = deploymentNode "Second navigateur" "Le pair reçoit les pistes WebRTC." "Navigateur" {
                peer = infrastructureNode "Pair WebRTC" "Exécute le même client web."
            }
            schoolDns = deploymentNode "DNS public" "Résolution du domaine de démo." "DNS" {
                dnsRecord = infrastructureNode "ia-pple.isen.fedyna.fr" "Pointe vers le frontal HTTPS."
            }
            stunHost = deploymentNode "Service externe STUN" "Aide à la découverte des candidats ICE." "STUN" {
                stunEndpoint = infrastructureNode "stun.l.google.com:19302" "Service observé dans GET /api/config."
            }
            cloud = deploymentNode "Google Cloud" "Hébergement de démonstration." "VPC" {
                firewall = infrastructureNode "Entrée réseau de la VM" "Redirige les requêtes HTTP vers HTTPS." "TCP / pare-feu VPC"
                vm = deploymentNode "VM Compute Engine" "Debian 13. Le service Node écoute uniquement sur loopback." "Debian 13" {
                    manager = infrastructureNode "systemd" "Démarre et supervise les services Caddy et chatisen." "chatisen.service"
                    caddyInstance = containerInstance caddy
                    standaloneInstance = containerInstance local
                    jsonInstance = containerInstance localFile
                }
            }
            clientInstance -> dnsRecord "Résout le domaine ISEN" "DNS"
            clientInstance -> firewall "Charge le site et ouvre /api/ws" "HTTP :80 / HTTPS et WSS :443"
            firewall -> caddyInstance "Achemine le trafic Web" "TCP 80 et 443"
            manager -> caddyInstance "Supervise le frontal TLS"
            manager -> standaloneInstance "Lance le service Node en tant que chatisen"
            clientInstance -> stunEndpoint "Découvre ses candidats ICE" "STUN :19302"
            clientInstance -> peer "Échange les pistes audio et vidéo entre navigateurs" "WebRTC / DTLS-SRTP"
        }
    }

    views {
        systemContext chat "01-contexte" "Périmètre utilisateur, démonstration GCP et administration." {
            title "01 · Contexte"
            include student reviewer operator dns stun tailscale chat
            autoLayout tb
        }
        container chat "02-conteneurs" "Démo standalone sur GCP et pile Docker Compose de recette." {
            title "02 · Conteneurs"
            include edge webHost web api db migration media prom grafana localBrowser caddy local localFile
            exclude "relationship==web->api"
            autoLayout tb
        }
        component local "03-composants-api" "Déploiement réel sur Google Compute Engine. VM Debian 13 et service systemd chatisen, Node.js 24.14.1." {
            title "03 · Composants de la démonstration Google Cloud"
            include localBrowser dns stun caddy localRouter localAuth localChat localChannels localCalls localFile
            exclude "relationship==localBrowser->localChat" "relationship==localBrowser->localChannels" "relationship==localBrowser->localCalls"
            autoLayout tb
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
