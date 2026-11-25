const architecture = {
  "views": [
    {
      "id": "01-contexte",
      "title": "Contexte",
      "build": "User et jury entrent par le domaine ISEN. Ops entre par SSH sur l’hôte. Admin utilise le plan de contrôle GCP avec IAM. Le propriétaire d’un groupe est un rôle applicatif du parcours User.",
      "check": "Comparer le DNS au champ external-ip de la VM. Vérifier HTTPS, l’identité de l’hôte administré et les droits du projet séparément.",
      "links": [
        [
          "Inventaire GCP et reconstruction",
          "infrastructure-gcp.md"
        ],
        [
          "Code en service",
          "https://github.com/Zayonx-0/ChatISEN/tree/9b08996060c52700b035d646bf6ac64075ef3ea6"
        ]
      ],
      "details": [
        {
          "id": "07-profils",
          "title": "Historique R01 · comparer le banc et le mode Node",
          "steps": [
            "git clone https://github.com/Zayonx-0/ChatISEN.git ChatISEN",
            "cd ChatISEN",
            "git checkout --detach bf1cd6029de69598c9d0c035b5abeb6dedc06fbd",
            "# Node 24 et pnpm 10.20.0",
            "pnpm install --frozen-lockfile",
            "pnpm typecheck",
            "pnpm build",
            "",
            "# Profil local sur cette machine",
            "pnpm db:seed",
            "HOST=127.0.0.1 PORT=3000 COOKIE_SECURE=false CHATISEN_DATA_FILE=./data/chatisen.json pnpm dev",
            "# Ouvrir http://127.0.0.1:3000/"
          ],
          "build": "pnpm dev démarre le serveur Node et son client HTML/JS. La pile R01 assemble le build React, Fastify et PostgreSQL. Le même processus Fastify expose aussi une API historique en mémoire. Choisir le point d’entrée fixe le client, le protocole, les comptes et le stockage.",
          "check": "Une inscription locale produit une entrée users dans le fichier configuré par CHATISEN_DATA_FILE. Une inscription v1 produit une ligne users dans PostgreSQL. La relecture du compte après redémarrage doit utiliser le même profil.",
          "links": [
            [
              "Commandes de reconstruction",
              "README.md#reconstruire-le-snapshot"
            ],
            [
              "Entrées pnpm",
              "../../package.json"
            ],
            [
              "Entrée standalone",
              "../../apps/standalone/server.mjs"
            ],
            [
              "Entrée Fastify",
              "../../apps/api/src/server.ts"
            ]
          ],
          "stepsTitle": "Reconstruire depuis un dossier neuf"
        },
        {
          "id": "22-recette",
          "title": "Recette et couverture du sujet",
          "steps": [
            "# DATABASE_URL doit viser une base PostgreSQL jetable, Chromium doit être installé",
            "pnpm db:migrate",
            "pnpm test",
            "pnpm test:e2e",
            "make verify LEVEL=core  # garde J1 encore en échec au commit de référence"
          ],
          "build": "Le socle des pages 12 et 17 du sujet comprend comptes, messagerie privée et de groupe, historique, appels audio et vidéo à deux, déploiement et supervision. R01 vise cette réception sur Compose. Le schéma rattache les extensions et les investigations au code et aux essais qui restent à produire.",
          "check": "Sur le snapshot, pnpm test:e2e couvre les profils de laboratoire. Pour J1, le mandat demande le parcours complet sur une pile HTTPS vierge. make verify LEVEL=core termine volontairement en échec tant que cette recette manque.",
          "links": [
            [
              "Sujet, pages 12 et 17",
              "../../ChatISEN - Project Briefing.pdf"
            ],
            [
              "Essais et limites",
              "../report/journal-des-preuves.md"
            ],
            [
              "Critères J1",
              "../revisions/R01-socle-j1.md"
            ],
            [
              "Garde de réception",
              "../../scripts/verify.mjs"
            ]
          ]
        }
      ],
      "tables": [
        "Placement et points d’entrée",
        "Flux nommés"
      ]
    },
    {
      "id": "02-conteneurs",
      "title": "Conteneurs",
      "build": "Une VM Compute Engine à 4 vCPU et 6 Gio héberge Caddy, Node et le disque JSON. Le navigateur exécute le front distribué par Node. Le DNS aboutit directement à l’IPv4 de la VM ; Caddy utilise un seul backend.",
      "check": "Vérifier la zone europe-west4-a, le VPC default, les sockets de Caddy et le bind de Node sur 127.0.0.1:3000. Le schéma physique et les postes de coût sont dépliables.",
      "links": [
        [
          "Inventaire GCP et reconstruction",
          "infrastructure-gcp.md"
        ],
        [
          "Caddy",
          "../../ops/gcp/Caddyfile.template"
        ],
        [
          "Unité systemd",
          "../../ops/gcp/chatisen.service"
        ]
      ],
      "details": [
        {
          "id": "04-deploiement-gcp",
          "title": "Déploiement Google Cloud",
          "steps": [
            "curl -fsS https://ia-pple.isen.fedyna.fr/readyz",
            "curl -fsS https://ia-pple.isen.fedyna.fr/api/config"
          ],
          "build": "Une VM Compute Engine à 4 vCPU et 6 Gio héberge Caddy, Node et le disque JSON. Le navigateur exécute le front distribué par Node. Le DNS aboutit directement à l’IPv4 de la VM ; Caddy utilise un seul backend.",
          "check": "Vérifier la zone europe-west4-a, le VPC default, les sockets de Caddy et le bind de Node sur 127.0.0.1:3000. Le schéma physique et les postes de coût sont dépliables.",
          "links": [
            [
              "Inventaire vérifié",
              "infrastructure-gcp.md"
            ],
            [
              "Vue de déploiement",
              "details/vues.dsl"
            ],
            [
              "Procédure GCP versionnée",
              "https://github.com/Zayonx-0/ChatISEN/blob/ab465a31c4eda0ce9290d1168daebd39f29e8e44/ops/gcp/README.md"
            ],
            [
              "Disponibilité du démonstrateur",
              "https://ia-pple.isen.fedyna.fr/readyz"
            ]
          ],
          "tables": [
            "Placement et points d’entrée",
            "Pare-feu et exposition"
          ]
        },
        {
          "id": "08-compose",
          "title": "Assemblage Compose local",
          "steps": [
            "# Hôte de recette avec Docker Compose v2, mkcert et Chromium",
            "make bootstrap",
            "export R01_COMPOSE_PROJECT=r01-e2e-architecture",
            "export R01_BASE_URL=https://localhost",
            "docker compose -p \"$R01_COMPOSE_PROJECT\" -f infra/compose/docker-compose.yml config --quiet",
            "docker compose -p \"$R01_COMPOSE_PROJECT\" -f infra/compose/docker-compose.yml up -d --build",
            "docker compose -p \"$R01_COMPOSE_PROJECT\" -f infra/compose/docker-compose.yml ps -a",
            "pnpm exec playwright test -c tests/e2e/playwright.config.mjs"
          ],
          "build": "Docker Engine et Compose v2 assemblent huit services. La base saine débloque migrate, son succès débloque api. Vite compile le client web sous Node.js 24, puis un Nginx interne sert les fichiers. Le Nginx frontal termine le TLS. Le runner GitHub Actions Ubuntu 24.04 contrôle la configuration et exécute les tests avec PostgreSQL 17 et Chromium.",
          "check": "docker compose config doit réussir. Sur hôte de recette, migrate sort avec 0, la seconde application laisse deux noms de migration, api:3000/readyz indique postgres et le navigateur accepte le certificat de https://localhost. La preuve intégrée reste ouverte.",
          "links": [
            [
              "Compose",
              "../../infra/compose/docker-compose.yml"
            ],
            [
              "Image API",
              "../../apps/api/Dockerfile"
            ],
            [
              "Image web",
              "../../apps/web/Dockerfile"
            ],
            [
              "CI GitHub Actions",
              "../../.github/workflows/r01.yml"
            ],
            [
              "Recette HTTPS",
              "../../tests/e2e/README.md"
            ]
          ]
        },
        {
          "id": "19-exploitation",
          "title": "Banc R01 · Sondes, métriques et Grafana",
          "build": "Démarrer Prometheus avec prometheus.yml et Grafana avec le datasource et les deux panneaux versionnés. Le frontal relaie /metrics et /healthz dans la configuration locale. /readyz se teste directement auprès de l’API. L’indicateur de messages est alimenté par le parcours historique.",
          "check": "Dans une pile jetable, une indisponibilité de PostgreSQL doit faire passer /readyz interne à 503. Vérifier up du job chatisen-api et une variation de requêtes sur la fenêtre de test. Les messages et connexions v1 demandent encore leur instrumentation et une capture du tableau.",
          "links": [
            [
              "Registre et métriques",
              "../../apps/api/src/metrics.ts"
            ],
            [
              "Scrape Prometheus",
              "../../ops/monitoring/prometheus.yml"
            ],
            [
              "Datasource",
              "../../ops/monitoring/grafana/provisioning/datasources/datasource.yml"
            ],
            [
              "Requêtes Grafana",
              "../../ops/monitoring/grafana/provisioning/dashboards/chatisen.json"
            ]
          ]
        }
      ],
      "tables": [
        "Placement et points d’entrée",
        "Services et responsabilités",
        "Calcul du coût"
      ]
    },
    {
      "id": "03-composants-api",
      "title": "Composants",
      "build": "Le VPC filtre l’entrée vers la VM en europe-west4-a. Caddy reçoit le trafic autorisé et transfère sur loopback. Les composants Node contrôlent identité, appartenance, écriture JSON, livraison temps réel, signalisation et Push. Les pistes média circulent entre navigateurs.",
      "check": "Suivre un message F02 → F03 → F04/F05 → F06 → F07/F10, puis vérifier le destinataire, la présence dans l’historique et le refus du tiers. Les règles de pare-feu et les flux sont dépliables ci-dessous.",
      "links": [
        [
          "Inventaire GCP et reconstruction",
          "infrastructure-gcp.md"
        ],
        [
          "Routeur, sessions, chat et appels",
          "../../apps/standalone/server.mjs"
        ],
        [
          "Service Web Push",
          "../../apps/standalone/push.mjs"
        ]
      ],
      "details": [
        {
          "id": "16-standalone",
          "title": "Serveur local, JSON et notifications",
          "steps": [
            "# Chromium Playwright installé",
            "pnpm exec playwright test tests/e2e/standalone.spec.ts",
            "node --test tests/security/standalone-realtime.test.mjs"
          ],
          "build": "Le client JS demande tous les fils, s’y abonne par WS et rafraîchit la liste et les appels entrants toutes les 3 s. Un message dans un autre fil déclenche compteur et notification. L’alerte système nécessite une permission et un onglet masqué. SSE est offert aux autres clients. En HTTP de développement, le cookie est chatisen.",
          "check": "Bob ouvre le fil de Charlie. Un message d’Alice doit créer un indicateur non lu et une notification dans la page. Un nouveau direct doit apparaître sans recharger. Après redémarrage avec le même fichier JSON, la session encore valide retrouve le message.",
          "links": [
            [
              "Routage et stockage JSON",
              "../../apps/standalone/server.mjs"
            ],
            [
              "Client et notifications",
              "../../apps/web/public/app.js"
            ],
            [
              "Tests WS et SSE",
              "../../tests/security/standalone-realtime.test.mjs"
            ],
            [
              "Tests navigateur",
              "../../tests/e2e/standalone.spec.ts"
            ]
          ],
          "tables": [
            "Services et responsabilités"
          ]
        },
        {
          "id": "17-appel-direct",
          "title": "Appel WebRTC entre deux pairs",
          "steps": [
            "# Chromium Playwright installé, appareils et permissions synthétiques dans le test",
            "pnpm exec playwright test tests/e2e/standalone.spec.ts -g 'notifications et appels'"
          ],
          "build": "Sur le banc local bf1cd60, l’offre, la réponse et les candidats ICE transitent par HTTP puis par la socket distante. Les pistes passent directement entre navigateurs et iceServers est vide. Le profil GCP ajoute un serveur STUN fourni par GET /api/config.",
          "check": "E22 utilise deux sessions avec périphériques synthétiques. Observer bytesReceived audio et framesDecoded vidéo strictement positifs des deux côtés, puis mute, caméra, refus et raccrochage. La traversée de réseaux distincts reste à éprouver.",
          "links": [
            [
              "Client WebRTC",
              "../../apps/web/public/app.js"
            ],
            [
              "Signalisation et états",
              "../../apps/standalone/server.mjs"
            ],
            [
              "Mesures sur les deux pairs",
              "../../tests/e2e/standalone.spec.ts"
            ],
            [
              "Preuves E22 à E24",
              "../report/journal-des-preuves.md#e22--notifications-et-appels-directs-sur-le-profil-local"
            ],
            [
              "Résultat CI E24",
              "../report/preuves/45583168142/extrait.txt"
            ]
          ]
        },
        {
          "id": "23-composants-fastify",
          "title": "Banc R01 · Composants Fastify · recette Compose R01",
          "build": "server.ts oriente les requêtes vers identité, conversations, abonnements et admission d’appel. L’identité reste intégrée à Fastify. Conversations, groupes et temps réel partagent le repository PostgreSQL et les contrôles d’appartenance.",
          "check": "Avec PostgreSQL migré, GET /api/v1/me sans cookie répond 401 et les écritures restent disponibles après recréation du pool. L’admission LiveKit est expérimentale et répond 503 avec la configuration par défaut.",
          "links": [
            [
              "Montage des modules",
              "../../apps/api/src/server.ts"
            ],
            [
              "Pool et transactions",
              "../../apps/api/src/repositories/postgres.ts"
            ],
            [
              "Tests du repository",
              "../../tests/integration/c/postgres-repository.test.ts"
            ]
          ]
        },
        {
          "id": "09-interface-react",
          "title": "Banc R01 · Navigation et état React",
          "steps": [
            "# DATABASE_URL doit viser une base PostgreSQL jetable, Chromium doit être installé",
            "pnpm db:migrate",
            "pnpm exec playwright test tests/e2e/chat.spec.ts"
          ],
          "build": "App et Auth sont dans main.tsx. Après /me, React charge les pages de conversations puis leurs détails. La sélection charge l’historique et ouvre une seule socket. Chaque fil conserve son brouillon et sa commande en attente en mémoire. La sélection la plus récente prévaut sur les réponses HTTP tardives.",
          "check": "Deux sessions échangent, Bob change de fil, retrouve l’historique et peut revenir à la liste à 390 px. Un envoi réessayé avec le même texte réutilise clientId. L’interface React au SHA repère ne comporte aucun bouton d’appel.",
          "links": [
            [
              "App, Auth et accès réseau",
              "../../apps/web/src/main.tsx"
            ],
            [
              "CSS React",
              "../../apps/web/src/styles.css"
            ],
            [
              "Test Playwright v1",
              "../../tests/e2e/chat.spec.ts"
            ]
          ]
        },
        {
          "id": "21-ecrans",
          "title": "Banc R01 · Écrans ordinateur et mobile",
          "build": "Reproduire le formulaire de session, la liste des contacts, le fil et le composeur. React crée un groupe depuis un contact et demande son titre. Standalone ajoute les contrôles de notification et la fenêtre d’appel. La maquette situe les commandes, les feuilles de style donnent leurs valeurs exactes.",
          "check": "À 390 px, React alterne liste et fil par le bouton de retour. Standalone garde la liste au-dessus du fil. Sur un appel local entrant, Bob voit Accepter et Refuser. Après acceptation vidéo, les commandes micro, caméra et raccrochage sont disponibles.",
          "links": [
            [
              "Styles exacts React",
              "../../apps/web/src/styles.css"
            ],
            [
              "HTML et CSS standalone",
              "../../apps/web/public/index.html"
            ],
            [
              "États du client local",
              "../../apps/web/public/app.js"
            ],
            [
              "Recette locale",
              "../../tests/e2e/standalone.spec.ts"
            ]
          ]
        },
        {
          "id": "10-identite",
          "title": "Banc R01 · Connexion et révocation",
          "steps": [
            "# DATABASE_URL doit viser une base PostgreSQL jetable",
            "node --import tsx --test tests/integration/identity/postgres-identity.test.ts"
          ],
          "build": "L’identité est locale à Fastify. Le mot de passe est traité par argon2, le cookie transporte le jeton opaque et la base conserve son empreinte. Le CSRF est un HMAC du jeton de session. Inscription et connexion exigent la même origine. Une mutation authentifiée ajoute le contrôle CSRF.",
          "check": "Inscription 201 et cookie sécurisé, handle dupliqué 409, session reconnue après nouveau pool, mauvaise origine ou CSRF 403, déconnexion 204 puis relecture du cookie révoqué 401.",
          "links": [
            [
              "Routes d’identité",
              "../../apps/api/src/identity/postgres-routes.ts"
            ],
            [
              "Argon2id et CSRF",
              "../../apps/api/src/security.ts"
            ],
            [
              "Test identité",
              "../../tests/integration/identity/postgres-identity.test.ts"
            ],
            [
              "Choix face à Keycloak",
              "../adr/001-choix.md"
            ]
          ]
        },
        {
          "id": "11-groupes",
          "title": "Banc R01 · Propriété et membres d’un groupe",
          "steps": [
            "# DATABASE_URL doit viser une base PostgreSQL jetable",
            "node --import tsx --test tests/integration/chat/postgres-chat.test.ts"
          ],
          "build": "Le groupe démarre avec un owner et entre 1 et 99 autres membres. Le verrou de commande garantit une création unique. Les mutations suivantes prennent les verrous dans l’ordre conversation puis membre et consignent leur événement dans la même transaction.",
          "check": "Créer deux fois simultanément avec la même clé donne 201 et 200 pour le même ID. Modifier le titre de la commande répétée donne 409. Transférer la propriété, quitter puis faire quitter le dernier owner ferme le groupe. Ève reçoit 404.",
          "links": [
            [
              "Règles de groupe",
              "../../apps/api/src/chat/group-operations.ts"
            ],
            [
              "Création idempotente",
              "../../apps/api/src/repositories/postgres.ts"
            ],
            [
              "Tests de rôles et conflits",
              "../../tests/integration/chat/postgres-chat.test.ts"
            ]
          ]
        },
        {
          "id": "18-admission-livekit",
          "title": "Banc R01 · Admission de salle LiveKit",
          "steps": [
            "# DATABASE_URL doit viser une base PostgreSQL jetable",
            "node --import tsx --test --test-concurrency=1 tests/security/livekit-token.test.ts tests/integration/calls/postgres-calls.test.ts"
          ],
          "build": "Les trois commandes expérimentales exigent CHATISEN_EXPERIMENTAL_CALLS=true dans le processus API. L’identité média unit l’UUID utilisateur à l’UUID session. Le serveur signe un JWT qui autorise une seule salle. Le client React au SHA repère ne consomme pas ce jeton.",
          "check": "Sur le banc d’injection, vérifier signature HS256, room, sub, exp ≤ 300 s et expiration de session. Un tiers reçoit 404 et un nouvel accès après logout reçoit 401. Une piste distante et la coupure d’un participant SFU exigent un essai distinct sur LiveKit.",
          "links": [
            [
              "Admission et signature",
              "../../apps/api/src/calls/postgres-routes.ts"
            ],
            [
              "Test de signature",
              "../../tests/security/livekit-token.test.ts"
            ],
            [
              "Test avec PostgreSQL",
              "../../tests/integration/calls/postgres-calls.test.ts"
            ],
            [
              "Preuve E19",
              "../report/journal-des-preuves.md#e19--admission-média-expérimentale-et-contrôles-associés"
            ]
          ]
        }
      ],
      "tables": [
        "Pare-feu et exposition",
        "Flux nommés",
        "Services et responsabilités"
      ]
    },
    {
      "id": "04-code",
      "title": "Code et données",
      "build": "Les collections du fichier JSON sont reliées par les identifiants utilisateur, session et conversation. Un même processus vérifie le membre, attribue seq, enregistre le texte et diffuse. Les schémas SQL et le code du laboratoire sont en annexe.",
      "check": "Sur une réplique synthétique, vérifier lastSeq, senderId, le rôle et les IDs de session. Un second envoi avec la même clé conserve l’ID du message. Redémarrer le processus et contrôler le même historique.",
      "links": [
        [
          "Inventaire GCP et reconstruction",
          "infrastructure-gcp.md"
        ],
        [
          "Structures et écriture locale",
          "../../apps/standalone/server.mjs"
        ],
        [
          "Tests de confidentialité",
          "../../tests/security/standalone-realtime.test.mjs"
        ]
      ],
      "details": [
        {
          "id": "24-code-postgres",
          "title": "Banc R01 · transaction PostgreSQL",
          "build": "Le composant PostgresRepository valide l’appartenance, verrouille le fil puis son membre, et écrit journal et message dans la même transaction. Chaque requête transporte un clientId choisi par React. Le serveur WebSocket relit le journal après le curseur et le client fusionne par ID. Les cartes de code, les schémas SQL et les deux séquences permettent de reproduire ce parcours.",
          "check": "Un premier envoi répond 201. La même commande répond 200 avec le même ID et n’incrémente la séquence qu’une fois. Un autre texte avec la même clé répond 409. Après coupure, vérifier la livraison de chaque message manqué dans l’ordre, une seule fois.",
          "links": [
            [
              "Écriture et transaction",
              "../../apps/api/src/repositories/postgres.ts"
            ],
            [
              "Route et MessageDto",
              "../../apps/api/src/chat/postgres-routes.ts"
            ],
            [
              "Lecture du journal",
              "../../apps/api/src/chat/postgres-websocket.ts"
            ],
            [
              "Migration du socle",
              "../../db/migrations/001_initial.sql"
            ],
            [
              "Test de concurrence et rollback",
              "../../tests/integration/c/postgres-repository.test.ts"
            ]
          ]
        },
        {
          "id": "05-message-prive",
          "title": "Banc R01 · Envoi d’un message privé",
          "wire": [
            "Alice → HTTP POST /api/v1/conversations/10000000-0000-4000-8000-000000000001/messages",
            "Origin: https://localhost",
            "Cookie: __Host-chatisen=<session d’Alice>",
            "X-CSRF-Token: <csrfToken reçu au login>",
            "Content-Type: application/json",
            "{\n  \"clientId\": \"30000000-0000-4000-8000-000000000003\",\n  \"text\": \"Bonjour Bob\"\n}",
            "",
            "HTTP 201 puis 200 si Alice répète à l’identique",
            "{\n  \"id\": \"40000000-0000-4000-8000-000000000004\",\n  \"conversationId\": \"10000000-0000-4000-8000-000000000001\",\n  \"seq\": \"1\",\n  \"senderId\": \"20000000-0000-4000-8000-000000000002\",\n  \"clientId\": \"30000000-0000-4000-8000-000000000003\",\n  \"createdAt\": \"2026-11-25T09:00:00.000Z\",\n  \"text\": \"Bonjour Bob\"\n}",
            "",
            "Serveur → Bob déjà abonné, après lecture du journal",
            "{\n  \"v\": 1,\n  \"type\": \"event\",\n  \"conversationId\": \"10000000-0000-4000-8000-000000000001\",\n  \"seq\": \"1\",\n  \"at\": \"2026-11-25T09:00:00.000Z\",\n  \"event\": \"message.created\",\n  \"data\": {\n    \"conversationId\": \"10000000-0000-4000-8000-000000000001\",\n    \"senderId\": \"20000000-0000-4000-8000-000000000002\",\n    \"clientId\": \"30000000-0000-4000-8000-000000000003\",\n    \"text\": \"Bonjour Bob\",\n    \"id\": \"40000000-0000-4000-8000-000000000004\"\n  }\n}"
          ],
          "steps": [
            "# DATABASE_URL doit viser une base PostgreSQL jetable",
            "node --import tsx --test --test-concurrency=1 tests/integration/c/postgres-repository.test.ts tests/integration/chat/postgres-chat.test.ts"
          ],
          "build": "Alice et Bob exécutent le même client React. Alice poste le message, Bob est déjà abonné. Le commit rend le message durable. La réponse HTTP et la notification PostgreSQL peuvent parvenir dans les deux ordres. NOTIFY transporte conversationId et seq, le contenu est relu dans le journal.",
          "check": "Même clientId et même texte donnent le même ID avec 201 puis 200. Un texte différent donne 409. Les compteurs en base montrent un seul message, un seul événement et une seule progression de last_seq.",
          "links": [
            [
              "Transaction appendMessage",
              "../../apps/api/src/repositories/postgres.ts"
            ],
            [
              "Ordre et concurrence",
              "../../tests/integration/c/postgres-repository.test.ts"
            ],
            [
              "Envoi dans Chromium",
              "../../tests/e2e/chat.spec.ts"
            ]
          ]
        },
        {
          "id": "06-reconnexion",
          "title": "Banc R01 · Rattrapage après coupure",
          "wire": [
            "Après Upgrade /api/v1/ws avec Origin et cookie valides, sur un direct dont last_seq=1",
            "Serveur → Bob   {\"v\":1,\"type\":\"ready\",\"heartbeatSeconds\":30}",
            "Bob → serveur   {\"v\":1,\"type\":\"subscribe\",\"conversationId\":\"10000000-0000-4000-8000-000000000001\",\"afterSeq\":\"0\"}",
            "Serveur → Bob   {\"v\":1,\"type\":\"subscribed\",\"conversationId\":\"10000000-0000-4000-8000-000000000001\",\"snapshotSeq\":\"1\"}",
            "Serveur → Bob",
            "{\n  \"v\": 1,\n  \"type\": \"event\",\n  \"conversationId\": \"10000000-0000-4000-8000-000000000001\",\n  \"seq\": \"1\",\n  \"at\": \"2026-11-25T09:00:00.000Z\",\n  \"event\": \"message.created\",\n  \"data\": {\n    \"conversationId\": \"10000000-0000-4000-8000-000000000001\",\n    \"senderId\": \"20000000-0000-4000-8000-000000000002\",\n    \"clientId\": \"30000000-0000-4000-8000-000000000003\",\n    \"text\": \"Bonjour Bob\",\n    \"id\": \"40000000-0000-4000-8000-000000000004\"\n  }\n}",
            "",
            "Nouvelle souscription après livraison de cet événement",
            "{\n  \"v\": 1,\n  \"type\": \"subscribe\",\n  \"conversationId\": \"10000000-0000-4000-8000-000000000001\",\n  \"afterSeq\": \"1\"\n}",
            "Si last_seq vaut encore 1, aucun event supplémentaire."
          ],
          "steps": [
            "# DATABASE_URL doit viser une base PostgreSQL jetable, Chromium doit être installé",
            "pnpm db:migrate",
            "pnpm exec playwright test tests/e2e/chat.spec.ts"
          ],
          "build": "Bob reprend après sa dernière séquence. Le serveur draine le journal par pages de 100, sur signal PostgreSQL ou au réveil périodique. Il revérifie la session et le membre avant chaque livraison. GET /events est disponible séparément. Le client React traite les événements lors du réabonnement.",
          "check": "Couper Bob 15 secondes, envoyer 20 messages, rétablir le réseau. Chacun doit réapparaître exactement une fois. Avec une session révoquée ou un membre retiré, aucun contenu du fil ne doit être livré au prochain contrôle.",
          "links": [
            [
              "Abonnements et rattrapage",
              "../../apps/api/src/chat/postgres-websocket.ts"
            ],
            [
              "Tests WS PostgreSQL",
              "../../tests/integration/chat/postgres-websocket.test.ts"
            ],
            [
              "Parcours de coupure",
              "../../tests/e2e/chat.spec.ts"
            ]
          ]
        },
        {
          "id": "14-http-identite-groupes",
          "title": "Banc R01 · HTTP des comptes et groupes",
          "steps": [
            "# DATABASE_URL doit viser une base PostgreSQL jetable",
            "node --import tsx --test --test-concurrency=1 tests/integration/identity/postgres-identity.test.ts tests/integration/chat/postgres-chat.test.ts"
          ],
          "build": "La planche répertorie les handlers montés. Utiliser les enveloppes exactes, y compris la différence entre {user: Profil} à la connexion et Profil à la racine pour /me. La lecture d’un groupe vérifie l’appartenance. La modification de ses membres vérifie aussi le rôle.",
          "check": "Valider les réponses du serveur contre les schémas. À la création concurrente d’un direct Alice↔Bob, obtenir un 201 et un 200 pour un ID identique. La liste ne doit révéler à Ève aucun de leurs fils.",
          "links": [
            [
              "Handlers d’identité",
              "../../apps/api/src/identity/postgres-routes.ts"
            ],
            [
              "Handlers de conversation",
              "../../apps/api/src/chat/postgres-routes.ts"
            ],
            [
              "Schémas HTTP",
              "../../packages/contracts/schemas/http.json"
            ],
            [
              "Tests de contrat",
              "../../tests/integration/chat/postgres-chat.test.ts"
            ]
          ]
        },
        {
          "id": "15-http-flux-appels",
          "title": "Banc R01 · HTTP des messages, WS et média",
          "steps": [
            "# DATABASE_URL doit viser une base PostgreSQL jetable",
            "node --import tsx --test --test-concurrency=1 tests/contract/contract.test.mjs tests/integration/chat/postgres-websocket.test.ts tests/integration/calls/postgres-calls.test.ts"
          ],
          "build": "Le serveur v1 transporte seq en chaîne, distingue les deux sens de pagination et retourne les erreurs sous {code,message,requestId}. La génération compare les deux planches HTTP aux handlers Fastify. Les opérations OpenAPI encore à raccorder sont listées ci-dessous.",
          "check": "Lire 125 messages en trois pages de 50, sans doublon. Relire les événements après 100 doit rendre les 25 derniers dans l’essai dédié. Un tiers reçoit 404. En mode par défaut, une demande de création d’appel v1 reçoit 503.",
          "links": [
            [
              "Contrat prévu OpenAPI",
              "../../packages/contracts/schemas/openapi.json"
            ],
            [
              "Schémas WS",
              "../../packages/contracts/schemas/ws.json"
            ],
            [
              "Handlers WS",
              "../../apps/api/src/chat/postgres-websocket.ts"
            ],
            [
              "Tests appels",
              "../../tests/integration/calls/postgres-calls.test.ts"
            ]
          ],
          "contract": true
        },
        {
          "id": "12-donnees-chat",
          "title": "Banc R01 · Schéma SQL de la messagerie",
          "steps": [
            "# DATABASE_URL doit viser une base PostgreSQL jetable",
            "pnpm db:migrate",
            "psql \"$DATABASE_URL\" -c 'SELECT id FROM _chatisen_migrations ORDER BY id'",
            "node --import tsx --test tests/integration/c/postgres-repository.test.ts"
          ],
          "build": "Les colonnes, types, clés et liens sont tirés du DDL. La paire triée d’un direct ouvert est unique. Un index partiel autorise un seul owner actif par groupe. Chaque message référence son événement par (conversation_id,seq). Le trigger transmet sur chatisen_conversation_events le fil et sa séquence après commit.",
          "check": "Sur une base jetable, node db/migrate.mjs applique les deux fichiers une première fois, puis first/second permettent de constater qu’au second passage applied est vide. Les retries concurrents créent un message et un événement, et le rollback ne consomme aucune séquence.",
          "sql": true,
          "links": [
            [
              "Migration du socle",
              "../../db/migrations/001_initial.sql"
            ],
            [
              "Migration des commandes",
              "../../db/migrations/002_group_commands.sql"
            ],
            [
              "Runner effectif",
              "../../db/migrate.mjs"
            ],
            [
              "Test de transaction",
              "../../tests/integration/c/postgres-repository.test.ts"
            ]
          ]
        },
        {
          "id": "13-donnees-media",
          "title": "Banc R01 · Schéma SQL des appels et fichiers",
          "steps": [
            "# DATABASE_URL doit viser une base PostgreSQL jetable",
            "pnpm db:migrate",
            "node --import tsx --test tests/integration/calls/postgres-calls.test.ts"
          ],
          "build": "Le module expérimental écrit calls et call_participants. Le schéma prévoit aussi attachments, media_jobs, webhook_receipts et quality_samples. Ces tables existent dès la migration. Le traitement des jobs, l’ingestion des webhooks et le dépôt de fichiers ou de mesures en v1 restent à raccorder.",
          "check": "La migration doit créer ces six tables. L’admission d’un membre crée ou actualise un participant invited lié à sa session. Un deuxième appel ouvert dans le même fil est refusé. Le DDL fixe le plafond de fichier à 5 242 880 octets.",
          "sql": true,
          "links": [
            [
              "DDL exact",
              "../../db/migrations/001_initial.sql"
            ],
            [
              "Écritures d’admission",
              "../../apps/api/src/calls/postgres-routes.ts"
            ],
            [
              "Test d’appels PostgreSQL",
              "../../tests/integration/calls/postgres-calls.test.ts"
            ]
          ]
        },
        {
          "id": "20-api-locales",
          "title": "API standalone et API historique",
          "steps": [
            "node --import tsx --test --test-concurrency=1 tests/security/standalone-realtime.test.mjs tests/security/fastify-realtime.test.ts"
          ],
          "build": "Le navigateur standalone utilise /api. Le serveur Fastify expose également un /api historique, avec d’autres règles d’identité, de message et d’appel. Le tableau indique, route par route, le comportement de chaque processus. En local, fixer CHATISEN_DATA_FILE permet de réutiliser le fichier du seed.",
          "check": "Sur le standalone, créer un direct déjà existant rend 200 et son ID initial. Un signal d’appel accepté est livré à la session du pair par WS. Sur Fastify historique, le jeton renvoyé contient le préfixe demo. et ses Maps repartent vides au redémarrage.",
          "links": [
            [
              "Serveur JSON",
              "../../apps/standalone/server.mjs"
            ],
            [
              "Serveur historique",
              "../../apps/api/src/server.ts"
            ],
            [
              "Maps et clés",
              "../../apps/api/src/store.ts"
            ],
            [
              "Test des accès historiques",
              "../../tests/security/fastify-realtime.test.ts"
            ]
          ]
        }
      ],
      "tables": [
        "Données, résidences et reprise"
      ]
    }
  ],
  "migrations": {
    "001_initial.sql": "-- ChatISEN schema v1.  This migration is safe to run twice: the runner\n-- records it in _chatisen_migrations and every object is guarded as well.\nCREATE EXTENSION IF NOT EXISTS pgcrypto;\n\nDO $$ BEGIN\n  CREATE TYPE conversation_type AS ENUM ('direct', 'group');\nEXCEPTION WHEN duplicate_object THEN NULL; END $$;\nDO $$ BEGIN\n  CREATE TYPE member_role AS ENUM ('owner', 'member');\nEXCEPTION WHEN duplicate_object THEN NULL; END $$;\nDO $$ BEGIN\n  CREATE TYPE message_kind AS ENUM ('text', 'file');\nEXCEPTION WHEN duplicate_object THEN NULL; END $$;\nDO $$ BEGIN\n  CREATE TYPE call_mode AS ENUM ('audio', 'video');\nEXCEPTION WHEN duplicate_object THEN NULL; END $$;\nDO $$ BEGIN\n  CREATE TYPE call_state AS ENUM ('ringing', 'active', 'ended');\nEXCEPTION WHEN duplicate_object THEN NULL; END $$;\nDO $$ BEGIN\n  CREATE TYPE participant_state AS ENUM ('invited', 'joined', 'declined', 'left', 'removed');\nEXCEPTION WHEN duplicate_object THEN NULL; END $$;\nDO $$ BEGIN\n  CREATE TYPE media_job_kind AS ENUM ('remove_participant', 'close_room', 'reconcile');\nEXCEPTION WHEN duplicate_object THEN NULL; END $$;\nDO $$ BEGIN\n  CREATE TYPE media_job_state AS ENUM ('pending', 'running', 'done', 'failed');\nEXCEPTION WHEN duplicate_object THEN NULL; END $$;\n\nCREATE TABLE IF NOT EXISTS users (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  handle varchar(32) NOT NULL UNIQUE,\n  display_name varchar(80) NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),\n  password_hash text NOT NULL,\n  created_at timestamptz NOT NULL DEFAULT now(),\n  CONSTRAINT users_handle_format CHECK (handle = lower(handle) AND handle ~ '^[a-z0-9_]{3,32}$')\n);\n\nCREATE TABLE IF NOT EXISTS sessions (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  token_hash bytea NOT NULL UNIQUE,\n  created_at timestamptz NOT NULL DEFAULT now(),\n  last_seen_at timestamptz NOT NULL DEFAULT now(),\n  expires_at timestamptz NOT NULL,\n  absolute_expires_at timestamptz NOT NULL,\n  revoked_at timestamptz,\n  CHECK (expires_at <= absolute_expires_at),\n  CHECK (octet_length(token_hash) = 32)\n);\nCREATE INDEX IF NOT EXISTS sessions_token_expiry_idx ON sessions (token_hash, expires_at) WHERE revoked_at IS NULL;\nCREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id, expires_at);\n\nCREATE TABLE IF NOT EXISTS conversations (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  type conversation_type NOT NULL,\n  title varchar(120),\n  direct_user_low uuid REFERENCES users(id) ON DELETE RESTRICT,\n  direct_user_high uuid REFERENCES users(id) ON DELETE RESTRICT,\n  last_seq bigint NOT NULL DEFAULT 0 CHECK (last_seq >= 0),\n  created_at timestamptz NOT NULL DEFAULT now(),\n  updated_at timestamptz NOT NULL DEFAULT now(),\n  closed_at timestamptz,\n  CONSTRAINT conversations_direct_pair_order CHECK (direct_user_low IS NULL OR direct_user_high IS NULL OR direct_user_low < direct_user_high),\n  CONSTRAINT conversations_type_shape CHECK (\n    (type = 'direct' AND direct_user_low IS NOT NULL AND direct_user_high IS NOT NULL AND title IS NULL)\n    OR (type = 'group' AND direct_user_low IS NULL AND direct_user_high IS NULL AND title IS NOT NULL AND char_length(title) BETWEEN 1 AND 120)\n  )\n);\nCREATE UNIQUE INDEX IF NOT EXISTS conversations_direct_pair_idx ON conversations (direct_user_low, direct_user_high) WHERE type = 'direct' AND closed_at IS NULL;\n\nCREATE TABLE IF NOT EXISTS conversation_members (\n  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,\n  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,\n  role member_role NOT NULL DEFAULT 'member',\n  joined_at timestamptz NOT NULL DEFAULT now(),\n  left_at timestamptz,\n  PRIMARY KEY (conversation_id, user_id)\n);\nCREATE INDEX IF NOT EXISTS conversation_members_user_active_idx ON conversation_members (user_id, conversation_id) WHERE left_at IS NULL;\nCREATE UNIQUE INDEX IF NOT EXISTS conversation_members_one_owner_idx ON conversation_members (conversation_id) WHERE role = 'owner' AND left_at IS NULL;\n\nCREATE TABLE IF NOT EXISTS conversation_events (\n  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,\n  seq bigint NOT NULL CHECK (seq > 0),\n  event_type varchar(64) NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_.-]{2,63}$'),\n  entity_id uuid,\n  payload jsonb NOT NULL,\n  occurred_at timestamptz NOT NULL DEFAULT now(),\n  PRIMARY KEY (conversation_id, seq),\n  CONSTRAINT conversation_events_payload_bound CHECK (octet_length(payload::text) <= 65536)\n);\nCREATE INDEX IF NOT EXISTS conversation_events_time_idx ON conversation_events (conversation_id, occurred_at);\n\nCREATE TABLE IF NOT EXISTS messages (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  conversation_id uuid NOT NULL,\n  seq bigint NOT NULL,\n  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,\n  client_id uuid NOT NULL,\n  kind message_kind NOT NULL DEFAULT 'text',\n  text text,\n  created_at timestamptz NOT NULL DEFAULT now(),\n  CONSTRAINT messages_event_fk FOREIGN KEY (conversation_id, seq) REFERENCES conversation_events(conversation_id, seq) ON DELETE CASCADE,\n  CONSTRAINT messages_text_bound CHECK (text IS NULL OR char_length(text) BETWEEN 1 AND 4000),\n  CONSTRAINT messages_kind_shape CHECK ((kind = 'text' AND text IS NOT NULL AND char_length(btrim(text)) > 0) OR (kind = 'file' AND text IS NULL)),\n  UNIQUE (conversation_id, seq),\n  UNIQUE (conversation_id, sender_id, client_id)\n);\nCREATE INDEX IF NOT EXISTS messages_conversation_order_idx ON messages (conversation_id, seq);\n\nCREATE TABLE IF NOT EXISTS attachments (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  message_id uuid NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE,\n  file_name varchar(255) NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 255),\n  media_type varchar(64) NOT NULL CHECK (media_type IN ('image/png', 'image/jpeg', 'application/pdf', 'text/plain')),\n  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 5242880),\n  sha256 bytea NOT NULL CHECK (octet_length(sha256) = 32),\n  data bytea NOT NULL,\n  created_at timestamptz NOT NULL DEFAULT now()\n);\n\nCREATE TABLE IF NOT EXISTS calls (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,\n  initiator_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,\n  client_id uuid NOT NULL,\n  mode call_mode NOT NULL,\n  state call_state NOT NULL DEFAULT 'ringing',\n  room_name varchar(80) NOT NULL UNIQUE,\n  created_at timestamptz NOT NULL DEFAULT now(),\n  active_at timestamptz,\n  ended_at timestamptz,\n  end_reason varchar(80),\n  UNIQUE (conversation_id, initiator_id, client_id),\n  CHECK ((state = 'ended' AND ended_at IS NOT NULL) OR (state <> 'ended' AND ended_at IS NULL))\n);\nCREATE UNIQUE INDEX IF NOT EXISTS calls_one_open_per_conversation_idx ON calls (conversation_id) WHERE state <> 'ended';\nCREATE INDEX IF NOT EXISTS calls_conversation_idx ON calls (conversation_id, created_at DESC);\n\nCREATE TABLE IF NOT EXISTS call_participants (\n  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,\n  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,\n  session_id uuid REFERENCES sessions(id) ON DELETE SET NULL,\n  state participant_state NOT NULL DEFAULT 'invited',\n  livekit_identity varchar(128),\n  admission_expires_at timestamptz,\n  joined_at timestamptz,\n  left_at timestamptz,\n  PRIMARY KEY (call_id, user_id),\n  UNIQUE (call_id, livekit_identity)\n);\nCREATE INDEX IF NOT EXISTS call_participants_session_idx ON call_participants (session_id) WHERE session_id IS NOT NULL;\n\nCREATE TABLE IF NOT EXISTS media_jobs (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  kind media_job_kind NOT NULL,\n  call_id uuid REFERENCES calls(id) ON DELETE CASCADE,\n  participant_user_id uuid REFERENCES users(id) ON DELETE CASCADE,\n  state media_job_state NOT NULL DEFAULT 'pending',\n  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),\n  run_after timestamptz NOT NULL DEFAULT now(),\n  last_error text,\n  created_at timestamptz NOT NULL DEFAULT now(),\n  completed_at timestamptz,\n  UNIQUE (kind, call_id, participant_user_id, state)\n);\nCREATE INDEX IF NOT EXISTS media_jobs_ready_idx ON media_jobs (run_after, id) WHERE state IN ('pending', 'failed');\n\nCREATE TABLE IF NOT EXISTS webhook_receipts (\n  provider varchar(32) NOT NULL,\n  provider_event_id varchar(255) NOT NULL,\n  received_at timestamptz NOT NULL DEFAULT now(),\n  payload_hash bytea NOT NULL CHECK (octet_length(payload_hash) = 32),\n  PRIMARY KEY (provider, provider_event_id)\n);\n\nCREATE TABLE IF NOT EXISTS quality_samples (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,\n  participant_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  study_session varchar(64) NOT NULL CHECK (study_session ~ '^[a-zA-Z0-9_-]{8,64}$'),\n  window_start timestamptz NOT NULL,\n  schema_version smallint NOT NULL DEFAULT 1 CHECK (schema_version = 1),\n  packets_received integer NOT NULL CHECK (packets_received >= 0),\n  packets_lost integer NOT NULL CHECK (packets_lost >= 0),\n  jitter_ms numeric(12,3) NOT NULL CHECK (jitter_ms >= 0),\n  rtt_ms numeric(12,3) NOT NULL CHECK (rtt_ms >= 0),\n  bitrate_kbps numeric(14,3) NOT NULL CHECK (bitrate_kbps >= 0),\n  track_present boolean NOT NULL,\n  scenario varchar(32),\n  created_at timestamptz NOT NULL DEFAULT now()\n);\nCREATE INDEX IF NOT EXISTS quality_samples_time_idx ON quality_samples (study_session, window_start);\n\nCREATE OR REPLACE FUNCTION chatisen_notify_conversation_event() RETURNS trigger LANGUAGE plpgsql AS $$\nBEGIN\n  PERFORM pg_notify('chatisen_conversation_events', json_build_object('conversationId', NEW.conversation_id::text, 'seq', NEW.seq::text)::text);\n  RETURN NEW;\nEND;\n$$;\nDROP TRIGGER IF EXISTS conversation_events_notify ON conversation_events;\nCREATE TRIGGER conversation_events_notify AFTER INSERT ON conversation_events FOR EACH ROW EXECUTE FUNCTION chatisen_notify_conversation_event();\n\nCREATE TABLE IF NOT EXISTS _chatisen_migrations (\n  id varchar(255) PRIMARY KEY,\n  applied_at timestamptz NOT NULL DEFAULT now()\n);\n\n",
    "002_group_commands.sql": "-- Persist idempotency keys for group creation independently of message retries.\nCREATE TABLE group_creation_commands (\n  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  client_id uuid NOT NULL,\n  command_hash bytea NOT NULL CHECK (octet_length(command_hash) = 32),\n  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,\n  created_at timestamptz NOT NULL DEFAULT now(),\n  PRIMARY KEY (user_id, client_id)\n);\n"
  },
  "contractGaps": [
    "GET /calls/{id}",
    "GET /files/{id}",
    "PATCH /me",
    "POST /calls/{id}/decline",
    "POST /calls/{id}/leave",
    "POST /calls/{id}/quality",
    "POST /conversations/{id}/files"
  ],
  "inventory": {
    "Placement et points d’entrée": [
      [
        "Élément",
        "Valeur",
        "Portée et preuve"
      ],
      [
        "Projet et hôte",
        "project-fd23d3d9-a7e8-4002-a7a · instance-20261123-141011",
        "Projet et nom renvoyés par les métadonnées de l’instance."
      ],
      [
        "Région et zone",
        "europe-west4 (Pays-Bas) · europe-west4-a",
        "Zone de la VM. Un arrêt de la VM, de son disque ou de la zone interrompt le site."
      ],
      [
        "Calcul",
        "e2-custom-4-6144 · 4 vCPU · 6 Gio configurés",
        "Type issu des métadonnées, 4 CPU disponibles dans l’OS, Debian GNU/Linux 13."
      ],
      [
        "VPC et interface",
        "default (global) · réseau local 10.164.0.0/20 · IP interne 10.164.0.2 · passerelle 10.164.0.1",
        "Métadonnées de l’interface 0. CIDR calculé avec le masque 255.255.240.0. Nom administratif du sous-réseau à confirmer côté projet."
      ],
      [
        "DNS et entrée publique",
        "ia-pple.isen.fedyna.fr → A 35.214.178.128 · aucun AAAA retourné lors du contrôle",
        "L’IPv4 est celle de l’interface de la VM, confirmée depuis l’intérieur. Un utilisateur et un enseignant suivent le même chemin, depuis Internet."
      ],
      [
        "Répartition de charge",
        "Entrée directe sur la VM puis un seul upstream Caddy vers 127.0.0.1:3000",
        "Aucun load balancer sur le trajet DNS→VM démontré. Le tag réseau lb-health-check ne prouve pas l’existence d’un LB. Le nombre de ressources indépendantes du projet demande un inventaire du plan de contrôle."
      ],
      [
        "Disque et copies",
        "Disque de démarrage 10 Gio ; /dev/sda1 en ext4 héberge /var/lib/chatisen",
        "lsblk et findmnt. Le type tarifaire, les snapshots, leurs emplacements et la réservation de l’IP demandent un relevé Compute Engine."
      ],
      [
        "Identités",
        "User entre par HTTPS ; Ops par SSH TCP 22 ; Admin infrastructure par console/API GCP et IAM",
        "SSH direct authentifié pendant le contrôle. IAM exprime le chemin d’administration cloud. Les rôles réellement attribués et les autres modes d’accès demandent une lecture du projet. Le rôle owner d’un groupe s’applique uniquement à cette conversation."
      ]
    ],
    "Services et responsabilités": [
      [
        "Service / emplacement",
        "Responsabilité et état observé",
        "Point de contrôle"
      ],
      [
        "DNS du domaine ISEN, externe",
        "Publie l’enregistrement A du site. Le gestionnaire de la zone DNS reste à identifier dans l’inventaire de l’équipe.",
        "dig A et AAAA puis comparaison à l’adresse externe de la NIC."
      ],
      [
        "Caddy 2.6.2, VM",
        "TLS et redirection HTTP ; proxy vers Node pour pages, API et Upgrade WS. Sert directement le lecteur C4 sous /architecture/. Le fichier actif porte aussi le nom historique 35-214-178-128.sslip.io.",
        "État systemd, domaines et validation HTTPS. Le template Git décrit le site principal."
      ],
      [
        "chatisen.service, VM",
        "Un processus Node.js 24.14.1 sous utilisateur Unix chatisen. Sert apps/web/public, route /api, publie WS/SSE et lit ou réécrit le document JSON.",
        "systemctl is-active chatisen ; GET /readyz répond persistence=json-demo."
      ],
      [
        "Front et service worker, navigateur",
        "HTML, CSS et app.js pour comptes, DM, groupes et appels. sw.js peut notifier quand l’onglet est fermé et ouvrir le fil. Les fichiers sont distribués par le serveur Node de la même VM.",
        "SHA-256 du bundle ; parcours à 2–3 sessions ; test Web Push avec deux profils persistants."
      ],
      [
        "Stockage local, VM",
        "/var/lib/chatisen/chatisen.json, propriétaire chatisen, mode 0600, répertoire 0700. Les références entre collections sont résolues par Node.",
        "stat sur le chemin et findmnt sur le répertoire, sans lecture du contenu privé."
      ],
      [
        "Configuration de service, VM",
        "/etc/chatisen/chatisen.env appartient à root, mode 0600 ; secrets CSRF et VAPID, origine et STUN. systemd lit l’environnement au démarrage.",
        "Vérifier noms des paramètres du script de déploiement et modes, comparer l’origine et la configuration publique."
      ],
      [
        "OpenSSH et systemd, VM",
        "Connexion de l’exploitant et supervision des unités caddy/chatisen. Les journaux hôte passent par journald/rsyslog.",
        "ssh.service actif ; systemctl et journalctl avec privilèges d’exploitation autorisés."
      ],
      [
        "Google Cloud Ops Agent, VM",
        "Sous-services Fluent Bit et collecteur OpenTelemetry actifs. Leurs ports de supervision locaux sont distincts du port du chat. Cloud Logging/Monitoring sont les destinations habituelles du produit ; la réception, le bucket et la rétention demandent une preuve côté console.",
        "États systemd et processus propriétaires des sockets 20201/20202 ; rechercher une série et un journal datés dans le projet."
      ],
      [
        "WebRTC et STUN, navigateurs + service externe",
        "SDP/ICE via Node pour établir l’appel. STUN Google pour découvrir les candidats. Les deux navigateurs transportent le son et l’image entre eux. Le banc GCP n’emploie aucune SFU/TURN applicative dans cette configuration.",
        "GET /api/config, paire ICE sélectionnée et progression des compteurs inbound-rtp à chaque extrémité."
      ],
      [
        "Web Push, module Node + fournisseurs externes",
        "Création de l’abonnement, filtrage des sessions/membres, envoi chiffré et remise au service worker du navigateur. Les domaines éligibles sont définis dans push.mjs.",
        "Vérifier abonnement, suppression après déconnexion et réception après fermeture de l’onglet."
      ],
      [
        "Services de plateforme de l’hôte",
        "Guest agent GCE, OS Config, mises à jour Debian, réseau/résolution/horloge systemd. L’hôte exécute aussi cron, Exim sur loopback et services système Debian.",
        "Inventaire des unités actives ; Docker, PostgreSQL, Tailscale et nftables.service déclarés inactifs au contrôle."
      ],
      [
        "Banc R01, ailleurs que sur le trajet public",
        "Nginx, web React, API Fastify, migration, PostgreSQL, LiveKit, Prometheus et Grafana. Décrit sous infra/compose pour la recette.",
        "Les 8 entrées de services dans Compose. Déplier « Assemblage Compose local » dans le lecteur."
      ]
    ],
    "Flux nommés": [
      [
        "Flux",
        "Origine → destination",
        "Protocole et données",
        "Autorisation ou observation"
      ],
      [
        "F01 · Résolution",
        "Navigateur → résolveur DNS → zone du domaine",
        "Nom du site, réponse A publique. Le transport vers le résolveur dépend du poste.",
        "Lecture publique ; vérifier la réponse et son TTL lors de la reconstruction."
      ],
      [
        "F02 · Entrée User",
        "Navigateur → IPv4 de la VM → filtrage VPC → Caddy",
        "TCP 80 redirige. HTTPS/WSS sur TCP 443. Caddy écoute aussi UDP 443 pour HTTP/3.",
        "TLS au frontal ; reachabilité publique de l’UDP à confirmer. Le navigateur n’a besoin d’aucun VPN."
      ],
      [
        "F03 · Distribution",
        "Caddy → serveur Node sur la même VM, ou fichiers du lecteur",
        "HTTP/1.1 et Upgrade via 127.0.0.1:3000 ; /architecture/ servi par Caddy depuis le clone",
        "Les assets du front sont publics. Sur les routes privées Node vérifie le cookie et les droits."
      ],
      [
        "F04 · Identité",
        "Navigateur → routeur → identité → document JSON",
        "POST /api/auth/register, login, logout ; GET /api/auth/me. Cookie __Host-chatisen ; secret mot de passe dérivé par scrypt, token de session haché",
        "Session limitée à 24 h. Vérifications CSRF pour mutations gardées, règles propres à chaque route."
      ],
      [
        "F05 · Direct, groupe, envoi",
        "Navigateur → messagerie dans Node",
        "HTTPS POST /api/conversations puis /api/conversations/{id}/messages. Historique par GET. Retrait de membre par DELETE",
        "Membre actif pour lire et écrire, owner pour retirer ; id de commande clientMessageId ; numéro d’ordre par conversation."
      ],
      [
        "F06 · Persistance",
        "Modules Node → mémoire du processus → système de fichiers de la VM",
        "Lecture initiale, writeFileSync du JSON complet. Comptes, sessions, conversations, membres, messages, appels, abonnements Push, pièces préexistantes",
        "Accès Unix du service ; aucune connexion SQL dans ce chemin. Une seule instance écrivaine, pas de transaction ni de réplication applicative."
      ],
      [
        "F07 · Livraison chat",
        "Node → clients abonnés du fil",
        "Upgrade /api/ws puis message.created ; GET /api/events?conversationId=… offre SSE. Accès depuis Internet via Caddy/TLS.",
        "Contrôle d’origine et de session aux points d’entrée, appartenance revalidée avant diffusion. Le front utilise la socket et rafraîchit aussi sa liste."
      ],
      [
        "F08 · Établissement d’appel",
        "Navigateurs → routeur appels ; navigateurs → STUN Google",
        "POST /api/conversations/{id}/calls ; answer/end/signal ; SDP et candidats ICE ciblés par session via WS ; découverte STUN sur 19302",
        "Direct à deux membres, site HTTPS et permissions micro/caméra. Le STUN reçoit des métadonnées réseau."
      ],
      [
        "F09 · Média",
        "Navigateur appelant ↔ navigateur correspondant",
        "ICE puis audio/vidéo DTLS-SRTP sur la paire négociée, ports dynamiques ; signalisation séparée",
        "Source des statistiques = navigateur. Les restrictions NAT peuvent empêcher la liaison. Les pistes ne transitent pas par le disque ou par Caddy."
      ],
      [
        "F10 · Envoi Push",
        "Navigateur → API d’abonnement ; Node → fournisseur push par HTTPS 443 sortant",
        "/api/push/config et /api/push/subscriptions ; notification chiffrée contenant type, conversationId, messageId et senderName, TTL 120 s",
        "Consentement navigateur, association à la session, membre actif et session valide au moment de l’envoi."
      ],
      [
        "F11 · Réveil",
        "Fournisseur push → service worker du destinataire",
        "Transport de remise géré par le navigateur. Notification puis retour au fil au clic",
        "Cette remise ne crée aucun port entrant sur la VM. La disponibilité dépend du fournisseur et du poste."
      ],
      [
        "F12 · Exploitation",
        "Poste Ops → IP publique de la VM → sshd → systemd/journaux",
        "SSH TCP 22 par clé ; gestion locale des unités, certificats et checkout. Sorties de maintenance HTTPS pour Git, runtime et dépendances",
        "Accès direct vérifié. Source autorisée par le VPC et droits sudo/IAM à distinguer. Dépôts, registres et ACME sont des dépendances d’exploitation."
      ],
      [
        "F13 · Administration",
        "Admin infrastructure → console/API Google Cloud → projet et ressources",
        "HTTPS TCP 443 vers Google ; inventaire, IAM, VPC et configuration des VM/disques, selon les droits",
        "Aucun portail admin global dans le code de la démo. Le propriétaire d’un groupe suit F02/F05 avec son compte applicatif."
      ],
      [
        "F14 · Observabilité",
        "Ops/jury → Caddy → Node ; agent hôte → services d’observabilité Google si configurés",
        "/healthz, /readyz, /metrics ; séries utilisateurs/messages. Agent Fluent Bit et collecteur OpenTelemetry présents",
        "Les deux premières sondes décrivent le processus. La sonde json-demo n’effectue pas de contrôle d’écriture disque. Confirmer l’ingestion et la rétention depuis le projet."
      ]
    ],
    "Pare-feu et exposition": [
      [
        "Direction / cible",
        "Constat mesuré sur la VM",
        "Ce qui décide de l’exposition"
      ],
      [
        "Entrée web vers ens4",
        "Caddy écoute TCP 80/443, le site répond en HTTPS ; UDP 443 en écoute",
        "La règle VPC autorisant chaque protocole, sa source et sa priorité doivent être relevées indépendamment."
      ],
      [
        "Entrée Ops",
        "sshd en écoute TCP 22, SSH direct vérifié depuis le poste de mesure",
        "Une connexion réussie ne renseigne pas tous les CIDR autorisés. Accès IAP et politiques hiérarchiques à inventorier."
      ],
      [
        "Port 27028",
        "Aucune écoute 27028 dans ss -lntu",
        "Le tag instance-27028-codex existe. Un tag seul ne crée aucun listener et ne suffit pas à identifier une règle effective."
      ],
      [
        "Loopback",
        "Node TCP 3000, API Caddy TCP 2019, SMTP TCP 25 et résolveur local port 53",
        "Le bind local empêche l’accès direct par l’IP de la VM à ces sockets. La route publique de l’app passe par Caddy."
      ],
      [
        "Autres listeners",
        "Ops Agent TCP 20201 et 20202, résolveur local TCP/UDP 5355, DHCP sur l’interface",
        "Vérifier règles ingress et cibles avant de conclure à une exposition Internet. Aucune nécessité applicative d’ouvrir ces ports au jury."
      ],
      [
        "Règles effectives",
        "Tags d’instance relevés : http-server, https-server, instance-27028-codex, lb-health-check",
        "La lecture des règles Compute a renvoyé ACCESS_TOKEN_SCOPE_INSUFFICIENT depuis la VM. Nom, priorité, sens, source/destination, action, protocoles, cible, journalisation et politique héritée restent à confirmer au niveau projet."
      ],
      [
        "Sorties",
        "Navigateur vers STUN/son pair ; VM vers push HTTPS, services de maintenance et éventuellement télémétrie",
        "Des essais applicatifs prouvent un flux à un instant donné. Le périmètre des autorisations egress dépend des règles effectives."
      ]
    ],
    "Données, résidences et reprise": [
      [
        "Donnée",
        "Relations et emplacement",
        "Conséquence pour l’équipe"
      ],
      [
        "Identités, sessions et autorisations",
        "users.id → sessions.userId ; users.id et conversations.id → members. Le rôle appartient au couple utilisateur/conversation. JSON sur disque racine en europe-west4-a.",
        "La session résulte d’un cookie HTTP-only et doit rester active. La sortie du groupe renseigne leftAt. Les mots de passe sont dérivés, les sessions persistées sous forme d’empreinte."
      ],
      [
        "Messages et pièces",
        "messages.conversationId et senderId rattachent fil et auteur, seq ordonne le fil. Les pièces préexistantes sont lues par attachment.conversationId. Même disque et même copie mémoire Node.",
        "Contrôle du membre à la lecture. L’endpoint de téléchargement existant n’établit pas un parcours d’upload sur ce profil."
      ],
      [
        "Appels et abonnements",
        "calls référence le direct, les deux utilisateurs et leurs sessions. pushSubscriptions lie utilisateur et session à un endpoint et aux clés publiques/de chiffrement nécessaires à Push.",
        "SDP/ICE et média sont transitoires. Le JSON persiste les métadonnées d’appel. L’envoi Push contient des identifiants et le nom affiché ; le texte du message est absent du payload."
      ],
      [
        "Hors VM",
        "Navigateurs et notifications sur les appareils des participants ; DNS, STUN et fournisseurs Web Push externes ; télémétrie Google si collectée",
        "La zone néerlandaise localise le disque applicatif. Localisation finale des postes, du traitement par les prestataires, des logs et des copies à documenter avant toute conclusion RGPD."
      ],
      [
        "Sauvegardes et continuité",
        "Fichier local et configuration sur un hôte, lecture au démarrage et réécriture en place. Snapshot/backup, rétention, chiffrement avec clé gérée par le client et restauration vérifiée à confirmer",
        "Une interruption durant l’écriture peut affecter le document. Pour une copie cohérente, prévoir une fenêtre de maintenance, restaurer sur hôte isolé, vérifier comptes synthétiques, groupes et historique, mesurer RPO/RTO."
      ]
    ],
    "Calcul du coût": [
      [
        "Poste",
        "Quantité à prendre",
        "Calcul et source à associer"
      ],
      [
        "Compute Engine E2 custom",
        "4 vCPU et 6 Gio en europe-west4 ; H = heures facturables",
        "H × (4 × prix vCPU/h + 6 × prix Gio RAM/h) en prenant les SKU custom et la devise du compte, ou H × prix complet de la VM. Une seule de ces deux méthodes."
      ],
      [
        "Disque",
        "Un disque de démarrage provisionné à 10 Gio vue invité ; vérifier taille et type tarifaires dans Compute",
        "Taille facturée × prix unitaire du type par mois, proratisé ; ajouter les données de snapshots selon taille réellement stockée et région des copies."
      ],
      [
        "IPv4 publique",
        "Une IPv4 attachée observée ; nature de la réservation à confirmer",
        "Heures d’adresse facturables × tarif de la catégorie d’adresse. Distinguer adresse attachée et éventuelle réservation inutilisée."
      ],
      [
        "Trafic",
        "Octets sortants facturables de la VM, ventilés par destination ; HTTPS/WS, Push et signalisation",
        "Somme des Gio par tranche et destination × tarif correspondant. Le média P2P circule entre les postes ; un futur relais média changerait le calcul."
      ],
      [
        "Télémétrie, DNS, reprise",
        "Logs ingérés/conservés, séries payantes, DNS éventuellement facturé au gestionnaire de zone, snapshots et copies",
        "Quantités facturées × tarifs applicables. Aucun forfait de LB, SFU, Cloud SQL ou seconde VM à imputer au service web sans ressource attribuée à ChatISEN."
      ],
      [
        "Exploitation et total",
        "Heures de maintenance et de restauration, tarif interne ; période et devise communes",
        "TCO = infrastructure + coûts d’exploitation. Présenter brut, remises, crédits, taxes et net séparément. Les consommations réelles viennent de Billing."
      ]
    ]
  }
};
