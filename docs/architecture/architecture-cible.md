# ChatISEN · Architecture cible après la revue

**Conception du 26 novembre 2026.** Le dépôt contient React/Vite, une API Fastify modulaire, les migrations PostgreSQL, Compose et la CI GitHub Actions. Les quatre services déployables, la topologie multi-zone, coturn et le CD de cette planche restent à réaliser. La démo du 25 novembre sert de référence de migration. [Inventaire de la démo](infrastructure-gcp.md) · [Mandat R02](../revisions/R02-advanced-luna.md)

**La planche à présenter** est [svg/05-architecture-globale.svg](svg/05-architecture-globale.svg). Elle reprend les identifiants de flux `T01` à `T21` et les règles `FW1` à `FW6` de ce dossier. La planche de la démo du 25 novembre est conservée dans [svg/25-demo-globale.svg](svg/25-demo-globale.svg).

Le domaine du jury aboutit à un load balancer HTTPS. Il choisit l’un des Nginx, qui sert les mêmes fichiers React aux navigateurs A et B. Chaque navigateur reçoit un cookie de session distinct. Nginx dirige les requêtes REST vers les services Fastify. PostgreSQL conserve l’état relationnel. Les pistes vont du navigateur au nœud LiveKit de la salle, avec coturn pour ICE et le relais. GitHub Actions commande les déploiements via les API GCP.

## Réponses aux retours de présentation

| Retour | Décision visible | Preuve attendue |
|---|---|---|
| VPC, zone et VM | Projet GCP → VPC global → sous-réseaux régionaux → VM Compute Engine zonales. LB, Cloud SQL, Redis et Artifact Registry ont leur propre frontière de services gérés. | Inventaire IaC des tags, sous-réseaux et zones. |
| Client statique | React/Vite produit HTML, CSS, JS et sw.js. Nginx les distribue depuis les deux VM. Les navigateurs A et B utilisent le même build, deux cookies et deux connexions média. | Même digest de front dans les deux zones, sessions distinctes. |
| Sens du CD | GitHub Actions publie les images vers Artifact Registry et déclenche le job de migration et le déploiement vers les API GCP. La VM lit ensuite son image au démarrage. | Run CD avec SHA, digest, migration et modèle d’instance. |
| STUN/TURN et résidence | Coturn exploité par l’équipe dans europe-west4-a. La région et le SLA du STUN public de la démo restent à établir. | Candidats srflx et relay obtenus sur le banc, région prouvée pour coturn. |
| Stockage | PostgreSQL relationnel et journal durable. Une transaction valide l’appartenance, numérote et écrit le message. Les sauvegardes servent à la reprise à un point dans le temps. | Écritures concurrentes, import sur base isolée, puis restauration. |
| Web Push et worker | FCM, Mozilla, Apple ou Windows selon l’abonnement. Le même sw.js s’exécute dans A et B. | Remise onglet fermé, révocation et cas de refus. |
| Scalabilité et disponibilité | Deux VM applicatives, deux SFU et PostgreSQL régional. Une salle reste sur un SFU. Coturn a une VM pour la première livraison. | Arrêt d’une API et d’un SFU, avec résultats chat et média séparés. |

## Composants et placement

| Composant | Technologie et implantation retenues | Rôle et critère de sortie |
|---|---|---|
| Entrée web | Google Cloud External Application Load Balancer global, IPv4 Premium, certificat géré. Backend aux Pays-Bas sur deux zones. | Termine HTTPS/WSS, répartit vers Nginx, redirige 80. Vérifier DNS, TLS, WSS et retrait du backend défaillant. |
| Réseau | VPC chatisen-cible. Sous-réseaux privés app 10.40.10.0/24 et média 10.40.20.0/24 dans europe-west4. Plage PSA 10.40.32.0/20 proposée, à valider contre les réseaux existants. | VM app sans IP publique et sorties via Cloud NAT. VM média avec IPv4 réservées pour ICE. |
| Front et API | Deux groupes d’instances zonaux de 1 VM Debian 13 (a et b), Docker Engine et Compose. Nginx sert le build React/Vite et relaie les quatre Fastify sur un bridge privé. | Les réplicas portent les mêmes digests. Nginx route par chemin et méthode sous /api/v1. Les ports des Fastify restent sur le bridge. |
| Services métier | Node.js 24, TypeScript et Fastify 5. Quatre images et processus : svc-identity `:3001`, svc-chat `:3002`, svc-calls `:3003`, svc-notify `:3004`. | État durable en SQL. La mémoire locale ne garde que les connexions et caches reconstruisibles. Reprise sur une autre VM par curseur. |
| PostgreSQL | Cloud SQL PostgreSQL 17 régional HA, IP privée via Private Service Access, primaire et secours multi-zone. Cloud SQL Auth Proxy sur les VM app. | Le proxy reste sur le réseau Docker. Budget de connexions par service/réplica. Configurer et vérifier sauvegardes et journaux PITR en Europe. |
| Média | Deux SFU LiveKit, une VM par zone. Nginx route WSS vers leurs IP privées TCP 7880. Memorystore for Redis Standard régional avec TLS et AUTH. | Redis coordonne le routage. Une salle a un nœud responsable. Tester drain, rejoin et perte d’un nœud. |
| ICE | Coturn sur VM dédiée en europe-west4-a avec IPv4 réservée et certificat TURN/TLS. | STUN UDP 3478, TURN UDP 3478 ou TLS TCP 5349. Relais UDP borné. Vérifier le SDK, les identifiants courts et la paire ICE sélectionnée. |
| Exploitation | Cloud Logging et Monitoring, Admin via IAM, maintenance Ops par IAP et OS Login. | Sondes minimales, logs expurgés, alertes. Vérifier emplacement des buckets de logs et rétention. |
| Livraison | GitHub Actions avec OIDC fédéré par Workload Identity Federation, Artifact Registry régional et API Compute Engine. Secrets dans Secret Manager. | CI builds/tests, CD avec migration versionnée, canari, puis roulement. Vérifier que l’identité des VM ne peut que lire les images autorisées. |

## Services Fastify et propriétés des données

| Service | Contrat et opérations | Tables qu’il écrit | Vérification |
|---|---|---|---|
| Identité | /api/v1/auth/register, login et logout, GET/PATCH /api/v1/me. Argon2id, cookie opaque __Host-chatisen, hash de session et CSRF. | identity.users et identity.sessions. | Attributs du cookie, expiration et logout, session utilisable après changement de VM. |
| Chat | /api/v1/conversations, membres, historique, fichiers, événements et /api/v1/ws. REST porte les commandes et WSS les événements. | chat.conversations, conversation_members, messages, conversation_events, attachments, group_creation_commands et outbox. | Un envoi à A/B avec la même clé rend un seul message. Un tiers ne reçoit aucun historique privé. |
| Appels | /api/v1/conversations/{id}/calls, /api/v1/calls/*, admission SFU, webhook, qualité et identifiants TURN courts. | media.calls, call_participants, media_jobs, webhook_receipts et quality_samples. | Audio et vidéo reçus, refus après révocation, jobs et webhooks idempotents. |
| Notifications | GET /api/v1/push/config, POST/DELETE /api/v1/push/subscriptions et worker de remise. Routes à ajouter au contrat. | notify.push_subscriptions et notify.push_deliveries. Le worker lit une projection de l’outbox Chat. | Déduplication par événement/abonnement, retrait sur réponse 404/410 du prestataire et révocation liée à la session. |

**Un cluster, des droits séparés.** Un rôle SQL d’écriture par service. Les références FK utilisent des UUID. Les services relisent des projections autorisées pour session ou appartenance active via vues ou fonctions à droits bornés. Le rôle de migration reste distinct. Une modification d’appartenance et une admission concurrente prennent le même verrou transactionnel par conversation avant vérification. Le chat incrémente la séquence, écrit le message, l’événement et l’outbox dans une transaction. PostgreSQL notifie au commit. Les réplicas relisent le journal par `afterSeq` même si une notification a été perdue. Les jobs externes ont un bail, un retry et une clé de déduplication. Le service Appels traite les révocations et expulsions auprès de LiveKit. [Routes existantes](../../apps/api/src/server.ts) · [Migrations existantes](../../db/migrations/001_initial.sql)

## Authentification d’un utilisateur

L’identité est locale à ChatISEN, sans fournisseur externe. Le parcours se lit dans la carte « Authentification d’un user » de la planche.

1. Le navigateur envoie l’identifiant et le mot de passe à `POST /api/v1/auth/login` en HTTPS.
2. svc-identity compare le mot de passe au hash **Argon2id** (19 456 Kio de mémoire, 2 passes, parallélisme 1).
3. Il crée un jeton aléatoire de **24 h**. La table `identity.sessions` ne stocke que son empreinte **SHA-256**.
4. Il renvoie le cookie `__Host-chatisen` (`Secure`, `HttpOnly`, `SameSite=Lax`, chemin `/`) et un jeton **CSRF** (HMAC) exigé sur les écritures.
5. À chaque requête, le service appelé relit la session, puis vérifie le droit sur la conversation.
6. La déconnexion révoque la session en base et efface le cookie.

Ces réglages viennent du code R01. [security.ts](../../apps/api/src/security.ts) · [postgres-routes.ts](../../apps/api/src/identity/postgres-routes.ts)

## Flux de la cible

| Flux | Origine → destination | Protocole, données et responsabilité | Vérification |
|---|---|---|---|
| T01 · DNS | Navigateurs A/B → résolveur et DNS ISEN | A du LB et nom ICE dédié à coturn. | Vérifier résolution et certificat depuis deux réseaux. |
| T02 · Entrée | A/B → IPv4 du LB global | HTTPS/WSS TCP 443. TCP 80 redirige. | GET front, certificat et handshake WSS. |
| T03 · Distribution | Proxies et health checks GCP → Nginx a/b | HTTP TCP 8080 sur réseau privé, /healthz-edge. Le TLS utilisateur termine au LB. | Retrait d’un backend en panne et absence d’accès direct public. |
| T04 · Statique | Nginx → A/B via LB | Build React/Vite statique, sw.js et cache des fichiers versionnés. | Même build et deux sessions distinctes. |
| T05 · Routage REST | Nginx → quatre Fastify | Bridge privé, chemins et méthodes /api/v1. Upgrade vers Chat pour la socket. | Contrat des quatre services et ports privés vérifiés. |
| T06 · Authentification | React → Identité → SQL | Identifiant et mot de passe via HTTPS, Argon2id, session opaque et hash SQL. Cookie Secure/HttpOnly/SameSite et CSRF. | Reprise de la session sur l’autre VM, refus après logout. |
| T07 · Écriture métier | React → Chat → SQL | Clé client, contrôle des droits, séquence, message, journal et outbox atomiques. | Écriture concurrente sans doublon, historique trié. |
| T08 · Temps réel | Chat a/b → A/B | PostgreSQL LISTEN/NOTIFY réveillant la lecture durable. WSS livre et rattrape par séquence. | Deux clients sur deux VM, arrêt d’un réplica puis reprise sans trou. |
| T09 · Données privées | Fastify/migration → Cloud SQL | Auth Proxy, port serveur Cloud SQL 3307 et accès HTTPS aux API. Un rôle d’écriture par service. | Connexion via IP privée et refus depuis Internet. |
| T10 · Admission | A/B → Appels via REST → Nginx → LiveKit | Jeton lié à session/salle, WSS /livekit/ puis HTTP/WS privé 7880. Webhook et administration par chemins privés authentifiés. | SDK réel, renouvellement et refus après révocation. |
| T11 · Média direct | A/B ↔ SFU de la salle | ICE et DTLS-SRTP, UDP 7882 multiplexé, TCP 7881 en secours. IP annoncée par nœud. | Candidats sélectionnés et compteurs de son/images reçus. |
| T12 · STUN/TURN | A/B ↔ coturn ↔ SFU | STUN Binding UDP 3478. TURN UDP 3478 ou TLS TCP 5349. Relais UDP 49160–49200 côté coturn. | Obtenir srflx, forcer relay et constater les pistes reçues. |
| T13 · Coordination | SFU a/b ↔ Redis privé | TLS TCP 6378 si activé, port confirmé sur l’instance, AUTH. Routage des salles. | Créations distribuées, reconnexion lors d’une perte de SFU. |
| T14 · Abonnement et envoi Push | A/B → Notifications → fournisseur | Endpoint et paramètres p256dh/auth en HTTPS. Worker sort par NAT en TCP 443, authentifie par VAPID et chiffre le payload. | Minimum transmis, droits, expiration et retries. |
| T15 · Remise Push | Fournisseur externe → service worker A ou B | Le même /sw.js reçoit push et appelle showNotification. Le clic rouvre le fil. | Notifier onglet fermé selon navigateur et autorisations. |
| T16 · Exploitation | Ops → IAP/OS Login → VM. Admin → Console/API GCP. | HTTPS 443 vers GCP, SSH 22 via plage IAP, rôles IAM distincts. | Connexion Ops et refus hors accès autorisé. |
| T17 · Observabilité | VM → Cloud Logging/Monitoring. Ops → tableaux via IAM. | Logs et métriques par HTTPS 443, sondes LB minimales. | Ingestion, alerte, rétention et région des logs. |
| T18 · Build et images | GitHub Actions CI → Artifact Registry europe-west4 | HTTPS 443 et identité fédérée, images par digest. | Associer commit, digests, builds et tests. |
| T19 · Déploiement | GitHub Actions CD → APIs Cloud Run Jobs et Compute Engine | OIDC fédéré, migration via job privé avec accès VPC, nouveau modèle d’instance et roulement. | Migration avant canari, reprise sur digest précédent. |
| T20 · Lecture d’image | VM ou job de migration → Artifact Registry | GET par digest via HTTPS 443 et compte de service lecteur. | Comparer le digest effectif sur chaque instance. |
| T21 · Reprise | Cloud SQL → sauvegardes/PITR → restauration isolée | Opération gérée, emplacement de sauvegarde européen à configurer. | Restaurer à un instant choisi, comparer données, mesurer RPO/RTO. |

## Pare-feu de la cible

| Surface | Sources et cible | Ports et contrôle | Recette |
|---|---|---|---|
| Entrée LB (hors VPC) | Internet → frontend géré de GCP | TCP 443 HTTPS/WSS, TCP 80 redirigé. | Jury, TLS, WSS et redirection. |
| FW1 · Backends app | Proxies et health checks 35.191.0.0/16 et 130.211.0.0/22 → tag app-edge | TCP 8080 seulement. Fastify sur bridge Docker. | LB sain sur les deux zones, accès direct ailleurs refusé. |
| FW2 · Administration | IAP 35.235.240.0/20 → VM ciblées | TCP 22, IAM et OS Login. | Tester IAP puis un refus depuis Internet. |
| FW3 · LiveKit privé | App → SFU a/b | TCP 7880 privé. Route publique de signalisation autorisée au cas par cas. Admin SFU et webhooks signés sur routes privées. | Une requête d’administration externe ne traverse pas l’edge. |
| FW4 · LiveKit média | Navigateurs et coturn → IPv4 SFU | UDP 7882 et TCP 7881 en secours. | Trafic bidirectionnel et paire ICE mesurée. |
| FW5 · Coturn public | A/B → IPv4 coturn | UDP 3478 pour STUN/TURN et TCP 5349 pour TURN/TLS. Authentifier et borner les allocations TURN. | Diagnostic STUN puis TURN avec jeton expiré rejeté. |
| FW6 · Relais coturn | IPv4 des deux SFU → coturn | UDP 49160–49200, plage d’essai à dimensionner. Coturn limite aussi ses pairs aux SFU. | Conférence à quatre, ports et comportement de saturation. |
| Tout autre entrant | Toute source → toutes les VM | Refus implicite du VPC dédié. Aucune règle publique pour SSH, 3389, 5432 ou 3001–3004. | Balayage de ports depuis un réseau extérieur. |
| Services gérés | App/job migration → Cloud SQL privé. SFU → Redis privé. VM/CI → APIs et Registry. | 3307 pour Auth Proxy, TLS Redis selon port instance, HTTPS 443 pour les APIs. | DB et Redis privés, vérification des identités et du chiffrement. |

[Filtres GCP pour les LB](https://cloud.google.com/load-balancing/docs/https) · [Ports LiveKit](https://docs.livekit.io/transport/self-hosting/ports-firewall/)

## STUN, TURN et résidence

- La démo annonce **stun.l.google.com:19302**. Aucun relais TURN n’est annoncé dans sa configuration. DNS, latence et candidat ICE décrivent une mesure, sans établir la région de traitement ni un SLA stable. Le **99,999 %** cité oralement reste à vérifier pour cet endpoint public.
- Coturn est **auto-hébergé par l’équipe**, sur une VM GCP en europe-west4-a. Il traite les requêtes de découverte et relaie les paquets média chiffrés si le chemin direct vers la SFU échoue. Configurer la paire IPv4 privée/publique de coturn et les IPv4 annoncées par les SFU. Vérifier les `iceServers` réellement reçus du SDK et la config ICE de la SFU. Aucun STUN public tiers ne doit apparaître dans les mesures de réception de la cible. Le port 5349 suppose que le réseau client le laisse sortir.
- Aucun coût de VM STUN séparée n’est imputé à la démo actuelle. Le coût direct du STUN public et son SLA restent non établis. Le prix de coturn se décompose en **heures VM + IPv4 + disque + sortie réseau + exploitation**. Avec un tarif indicatif IPv4 de **0,005 USD/h** et 730 h, l’IPv4 représente **3,65 USD/mois** avant VM, disque, transfert et Ops. Confirmer le SKU applicable et le prix e2-micro dans europe-west4. STUN échange peu de données. Un relais TURN consomme une sortie proportionnelle aux pistes relayées. Chiffrer à partir des Gio mesurés. [Tarif des VM](https://cloud.google.com/compute/vm-instance-pricing) · [Tarifs réseau et IPv4](https://cloud.google.com/vpc/network-pricing)
- Les VM, le relais et PostgreSQL ont une implantation européenne explicite. Configurer et vérifier l’emplacement de sauvegardes et de logs. Le LB global, DNS, GitHub et les fournisseurs de Push ont des traitements distincts. Documenter les données traitées, les sous-traitants et les durées avant de conclure sur le RGPD.

## Web Push dans les deux navigateurs

React enregistre le même **/sw.js** sous l’origine HTTPS. Chaque navigateur demande l’autorisation, puis crée une **PushSubscription** propre à son profil, avec endpoint et clés `p256dh/auth`. Le service Notifications l’associe à une session active. Son worker lit l’événement et utilise la bibliothèque **web-push** pour signer l’envoi avec **VAPID** et chiffrer le payload. Pour la cible, transmettre type et ID opaque seulement. Le fournisseur réveille le service worker de la souscription concernée. `showNotification` affiche l’alerte, puis le clic ouvre le fil. [Service de référence](../../apps/standalone/push.mjs) · [Worker de référence](../../apps/web/public/sw.js)

| Fournisseur | Endpoint accepté dans le code de référence | Portée |
|---|---|---|
| Google Firebase Cloud Messaging (FCM) | fcm.googleapis.com | Dépend du navigateur et de l’abonnement. |
| Mozilla Push Service | updates.push.services.mozilla.com | Dépend du navigateur et de l’abonnement. |
| Apple Web Push | web.push.apple.com et sous-domaines de push.apple.com | Dépend de la plateforme et de ses autorisations. |
| Windows Push Notification Service | Sous-domaines de notify.windows.com | Accepté par le code. Vérifier le navigateur et le support de notification en recette. |

## Service worker /sw.js

**Les service workers « A » et « B » désignent le même fichier `/sw.js`**, installé séparément dans le navigateur A et dans le navigateur B. Chacun possède son abonnement, son endpoint et ses clés.

| Dans `/sw.js` | Ce qui s’exécute |
|---|---|
| `install` et `activate` | `skipWaiting()` puis `clients.claim()` pour prendre la main sans rechargement. |
| `push` | Lit `type`, `conversationId`, `messageId` et `senderName`. Reste muet si une fenêtre du chat est visible, sinon appelle `showNotification()`. |
| `notificationclick` | Met au premier plan la fenêtre existante ou en ouvre une sur la conversation. |
| `pushsubscriptionchange` | Se réabonne avec la même clé VAPID et envoie le nouvel abonnement au serveur. |

**À reprendre pour la cible :** le worker actuel appelle `/api/auth/me` et `/api/push/subscriptions`. Il doit passer à `/api/v1/me` et `/api/v1/push/subscriptions`. Le champ `senderName` du payload actuel est à retirer pour respecter la minimisation décrite plus haut, ou à conserver comme choix assumé.

## Migration, CD et reprise

1. Versionner l’infrastructure et l’appliquer en staging. Secrets dans Secret Manager. Restreindre la WIF de GitHub au dépôt et aux références de livraison. Séparer identités push d’images, déploiement/migration et pull par VM.
2. CI sur PR avec typecheck, tests, build et parcours navigateur. Le CD part d’une release ou d’un lancement explicite sur un environnement protégé. Il déclenche un Cloud Run Job de migration connecté au VPC et à Cloud SQL. Après réussite, mettre à jour les groupes d’instances par modèle versionné avec canari et santé avant roulement par zone. Déployer par digest. Garder des migrations rétrocompatibles pour ramener le digest précédent.
3. Importer les données de la démo sur banc isolé. Comparer utilisateurs, groupes, droits et historique. Gérer l’ancien hash via une vérification scrypt suivie d’un rehash Argon2id, ou réinitialiser les comptes. Invalider les anciennes sessions. Pour la bascule, planifier une suspension d’écritures, l’import final, le contrôle puis DNS. Un retour implique de réconcilier les écritures de la nouvelle version.
4. Les **10 Go** observés sont la capacité du disque de démarrage, et la taille du JSON reste à mesurer. Un seul processus effectue des écritures synchrones du document entier. Une interruption pendant l’écriture peut le rendre invalide. Le disque conserve les données entre redémarrages et les snapshots servent de copies de reprise. Le dossier n’établit aucune fuite de descripteurs. PostgreSQL apporte des écritures concurrentes, des contraintes et des transactions adaptées au modèle relationnel. [Code JSON historique](../../apps/standalone/server.mjs)

En arrêtant un backend web, mesurer la continuité des requêtes et le rattrapage des sockets. En arrêtant un SFU, mesurer la reconnexion. Le routage Redis distribue les salles, et chaque salle reste sur un nœud à un instant donné. Une panne du coturn unique affecte les utilisateurs qui ont besoin d’un relais. Une seconde VM coturn avec endpoint ICE distinct est l’évolution si le niveau de disponibilité l’exige. Budgéter séparément app, SFU, coturn, PostgreSQL HA, Redis, LB, NAT et trafic. Aucun SLA applicatif ne découle automatiquement du SLA d’une brique.
