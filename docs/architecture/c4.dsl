workspace "ChatISEN" "Architecture exploitée sur Compute Engine · inventaire du 25 novembre 2026 et laboratoire R01" {
    !impliedRelationships false
    model {
        student = person "User · membre ou enseignant" "Utilise le site public et les médias dans son navigateur."
        operator = person "Ops · exploitation" "Accès SSH à Debian. Suit les services, déploie le code et consulte les sondes."
        admin = person "Admin · infrastructure GCP" "Administre les ressources du projet via les API GCP avec une identité IAM autorisée."
        dns = softwareSystem "DNS du domaine ISEN" "Le nom ia-pple.isen.fedyna.fr résout vers 35.214.178.128."
        stun = softwareSystem "STUN Google" "Découverte ICE par les navigateurs sur stun.l.google.com:19302."
        pushProvider = softwareSystem "Service push du navigateur" "FCM, Mozilla ou autre fournisseur accepté par push.mjs. Livre au service worker."
        peerBrowser = softwareSystem "Navigateur du correspondant" "Terminaison du média audio et vidéo pendant un appel direct."
        control = softwareSystem "Plan de contrôle GCP" "Console et API Compute Engine, VPC, IAM et observabilité. Autorisations distinctes de ChatISEN."
        perimeter = softwareSystem "Pare-feu du VPC default · nic0" "IPv4 Standard 35.214.178.128. Règles web TCP 80/443 (P1000), SSH 22 (P65534). TCP 27028 permis, sans écoute. Voir les huit règles IPv4 et la limite IAM."
        snapshots = softwareSystem "Snapshots Compute Engine · multi-région eu" "default-schedule-1 copie le disque chaque jour. Deux snapshots standards prêts au relevé du 25 novembre."
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
            group "Banc Compose R01 · environnement distinct" {
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
            group "VM GCE unique · europe-west4-a · Pays-Bas" {
                os = container "Debian · administration" "sshd reçoit les connexions Ops. systemd lance Caddy et chatisen. Le Google Cloud Ops Agent tourne sur cet hôte." "Debian 13 / systemd"
                caddy = container "Caddy · frontal unique de la VM" "Sur la VM Debian 13. Redirige HTTP :80, termine TLS sur :443 et relaie HTTP et WebSocket sur loopback." "Caddy / TLS"
                local = container "chatisen.service · Node sur la VM" "apps/standalone/server.mjs. Sur la VM, systemd lance chatisen.service avec Node 24.14.1 en écoute sur 127.0.0.1:3000. En local, pnpm dev." "Node.js / node:http" {
                    localRouter = component "Entrée du serveur" "server.mjs sert apps/web/public, oriente /api et accepte l’Upgrade sur /api/ws. GET /readyz rend json-demo." "node:http"
                    localAuth = component "Identité et session" "scrypt, empreinte SHA-256 du jeton de session, HMAC CSRF. Cookie __Host-chatisen en HTTPS, Secure, HttpOnly et SameSite=Lax." "node:crypto"
                    localChat = component "Messagerie et persistance" "Directs, groupes et messages. Vérifie l’appartenance, incrémente lastSeq et écrit le document JSON avant diffusion." "node:http / node:fs"
                    localChannels = component "Abonnements WebSocket" "Canaux par conversation. Contrôle PUBLIC_ORIGIN, la session et le membre. Diffuse messages et signalisation de l’appel." "WS / SSE"
                    localCalls = component "Signalisation des appels" "Invitations, réponses, SDP et ICE vers la session du pair. GET /api/config communique le serveur STUN aux navigateurs." "HTTP + WebSocket"
                    localPush = component "Notifications hors onglet" "push.mjs vérifie la session et le membre destinataire. Envoi Web Push chiffré, VAPID, puis sw.js affiche la notification." "web-push / Push API"
                    localStatus = component "Sondes et compteurs" "/healthz, /readyz et /metrics. Compte utilisateurs et messages sur la copie en mémoire." "HTTP GET"
                }
                localFile = container "Fichier JSON · disque de démarrage" "/var/lib/chatisen/chatisen.json sur ext4. Comptes, sessions, membres, fils, messages et appels." "pd-balanced · 10 Go · europe-west4-a" {
                    tags "Database"
                }
            }
        }

        student -> chat "F02 · Ouvre le site et utilise sa session" "HTTPS / WSS 443"
        student -> dns "F01 · Résout le nom du site" "DNS public"
        operator -> chat "F12 · Exploite la VM" "SSH TCP 22"
        admin -> control "F13 · Gère réseau, VM et IAM" "Console / API HTTPS 443"
        control -> chat "F13 · Configure Compute Engine et le VPC" "Plan de contrôle"
        chat -> stun "F08 · Le client découvre ses candidats ICE" "STUN 19302"
        chat -> peerBrowser "F09 · Le client échange les pistes" "WebRTC / DTLS-SRTP"
        chat -> pushProvider "F10 · Notifie après un message" "Web Push / HTTPS 443"
        student -> edge "Ouvre l’application" "HTTPS / WSS"
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
        student -> perimeter "F02 · Entre par le domaine du jury" "HTTPS / WSS 443"
        student -> localBrowser "F02 · Ouvre une session ou gère son groupe"
        student -> web "Utilise le client du banc R01"
        localBrowser -> dns "F01 · Résout le domaine du jury" "DNS"
        localBrowser -> perimeter "F02 · Demande le site et le flux temps réel" "HTTP 80, HTTPS/WSS 443"
        perimeter -> caddy "F02 · default-allow-http / https" "TCP 80 et 443"
        operator -> perimeter "F12 · Ouvre la session de maintenance" "SSH 22"
        perimeter -> os "F12 · default-allow-ssh vers sshd" "TCP 22"
        os -> local "F12 · Supervise chatisen.service" "systemd"
        os -> caddy "F12 · Supervise caddy.service" "systemd"
        localBrowser -> stun "F08 · Découvre les adresses candidates" "STUN 19302"
        localBrowser -> peerBrowser "F09 · Échange audio et vidéo" "ICE / DTLS-SRTP"
        caddy -> local "F03 · Transmet pages, API et Upgrade" "HTTP / WS 127.0.0.1:3000"
        caddy -> localRouter "F03 · Termine TLS puis relaie" "HTTP / WS 127.0.0.1:3000"
        localFile -> snapshots "F15 · GCE capture le disque de démarrage" "Snapshot standard quotidien"
        local -> localFile "F06 · Charge puis réécrit le document" "Système de fichiers ext4"
        local -> pushProvider "F10 · Transmet une notification chiffrée" "HTTPS 443"
        pushProvider -> localBrowser "F11 · Réveille le service worker" "Web Push"
        admin -> perimeter "F13 · Gère les règles via IAM" "Plan de contrôle GCP"
        localBrowser -> localChat "Recherche et écrit" "HTTP /api"
        localBrowser -> localChannels "Souscrit à tous les fils connus" "WS /api/ws"
        localBrowser -> localCalls "Crée, accepte et signale" "HTTP /api"
        localRouter -> localAuth "F04 · Crée et vérifie les sessions"
        localRouter -> localChat "F05 · Groupes, directs et messages"
        localRouter -> localChannels "F07 · Ouvre les abonnements" "WS / SSE"
        localRouter -> localCalls "F08 · Invite, accepte et relaie SDP/ICE"
        localRouter -> localPush "F10 · Enregistre l’abonnement"
        localRouter -> localStatus "F14 · Lit santé et compteurs"
        localAuth -> localFile "F06 · Enregistre compte, session ou révocation" "JSON"
        localChat -> localFile "F06 · Écrit membres, fil et message" "JSON"
        localCalls -> localFile "F06 · Enregistre les métadonnées d’appel" "JSON"
        localChat -> localChannels "F07 · Diffuse message.created"
        localCalls -> localChannels "F08 · Signal ciblé par session"
        localChannels -> localAuth "F04 · Revalide session et appartenance"
        localChat -> localPush "F10 · Demande la notification après écriture"
        localPush -> pushProvider "F10 · Envoie via VAPID" "HTTPS 443"
        localPush -> localFile "F06 · Abonne ou révoque" "JSON"
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
                dnsRecord = infrastructureNode "ia-pple.isen.fedyna.fr" "Enregistrement A : 35.214.178.128. IPv4 statique régionale, niveau Standard."
            }
            stunHost = deploymentNode "Service externe STUN" "Aide à la découverte des candidats ICE." "STUN" {
                stunEndpoint = infrastructureNode "stun.l.google.com:19302" "Service observé dans GET /api/config."
            }
            cloud = deploymentNode "Google Cloud · projet ChatISEN" "Une VM en fonctionnement dans la liste du projet." "Compute Engine" {
                eu = deploymentNode "Multi-région eu" "Stockage des copies standard du disque." "Google Cloud" {
                    savedDisks = infrastructureNode "Snapshots standards" "Deux copies prêtes, datées des 23 et 24 novembre 2026." "Compute Engine"
                }
                vpc = deploymentNode "VPC default · global" "Région du sous-réseau : europe-west4." "Google Cloud VPC" {
                    subnet = deploymentNode "Sous-réseau default · europe-west4 · 10.164.0.0/20" "10.164.0.0/20 (P0), passerelle 10.164.0.1. Route Internet 0.0.0.0/0 (P1000)." "Sous-réseau régional" {
                        firewall = infrastructureNode "F02/F12 · Filtrage VPC vers nic0" "8 règles IPv4 visibles. Web TCP 80/443 à P1000, SSH à P65534. Destination nic0 : 10.164.0.2 (éphémère)." "Pare-feu VPC"
                        zone = deploymentNode "europe-west4-a" "Unique zone observée pour le service du jury." "Zone GCE" {
                            bootDisk = infrastructureNode "Disque de démarrage · 10 Go" "Disque persistant équilibré attaché à la VM." "pd-balanced zonal"
                            vm = deploymentNode "instance-20261123-141011" "nic0 : IPv4 statique Standard 35.214.178.128, interne éphémère 10.164.0.2. Caddy et Node sur cet hôte." "e2-custom-4-6144 · Debian 13" {
                                manager = infrastructureNode "systemd" "Supervise les services caddy et chatisen." "Debian"
                                caddyInstance = containerInstance caddy
                                standaloneInstance = containerInstance local
                                jsonInstance = containerInstance localFile
                            }
                        }
                    }
                }
            }
            jsonInstance -> bootDisk "F06 · Héberge le fichier sur /dev/sda1" "ext4"
            bootDisk -> savedDisks "F15 · Capture quotidienne du disque" "default-schedule-1"
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
        systemContext chat "01-contexte" "Trois acteurs, leur point d’entrée et les dépendances hors VM." {
            title "01 · Contexte — User, Ops et Admin"
            include student operator admin dns chat control stun pushProvider peerBrowser
            autoLayout tb
        }
        container chat "02-conteneurs" "Une seule VM applicative dans europe-west4-a. Le client s’exécute sur le poste." {
            title "02 · Conteneurs — site GCP en service"
            include localBrowser perimeter caddy os local localFile operator pushProvider peerBrowser stun snapshots
            autoLayout tb
        }
        component local "03-composants-api" "Trajet réseau, modules de chatisen.service, sorties et disque sur la VM de europe-west4-a." {
            title "03 · Composants — VM GCP · europe-west4-a"
            include student operator admin os perimeter caddy localRouter localAuth localChat localChannels localCalls localPush localStatus localFile pushProvider snapshots
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
