# Google Cloud · inventaire et reconstruction de la démo ChatISEN

Le site du jury repose sur **l’unique VM du projet**, `instance-20261123-141011`. Caddy termine TLS et transmet les requêtes à Node sur la même machine. Node sert le front, traite l’API et écrit sur le disque de démarrage. Le mot **standalone** est le nom de ce programme dans le dépôt. Le front s’exécute ensuite dans le navigateur de chaque participant. La pile Docker Compose R01 se reconstruit en laboratoire. [C4 hors ligne](index.html#03-composants-api) · [Service systemd](../../ops/gcp/chatisen.service)

Contrôle du **25 novembre 2026, 13 h 43–13 h 46 UTC**. DNS et HTTPS depuis un poste externe, puis inventaire SSH de l’hôte, métadonnées Compute Engine, sockets et permissions de fichiers. Le checkout de la VM porte le SHA `9b08996060c52700b035d646bf6ac64075ef3ea6`. Le `main` vérifié ensuite à `09ed65a` ajoute uniquement des fichiers de rapport et de mandat par rapport à ce SHA. Le SHA-256 du JavaScript du domaine et du même fichier Git est `ef45b97f78e41d4ac93e59333fccfd00f8659b241b25e8a6c5baa43bb0aad3ca`. La source du code et la preuve de placement ont ainsi des références indépendantes. [Source déployée](https://github.com/Zayonx-0/ChatISEN/tree/9b08996060c52700b035d646bf6ac64075ef3ea6) · [Preuve Push sur le site](../report/journal-des-preuves.md#e28--push-sur-le-site-déployé)

**Recoupement des sources.** Le relevé de console transmis par l’équipe, effectué le 25 novembre vers **13 h 47 UTC**, compte une instance en fonctionnement et attribue son IPv4 réservée à `nic0`. Depuis le poste externe à **14 h 03 UTC**, la réponse A a de nouveau donné `35.214.178.128` (TTL retourné 900 s). Aucun enregistrement AAAA ou CNAME n’a été retourné. La connexion HTTPS a joint cette même IPv4, validé le certificat et obtenu HTTP 200 sur `/readyz` avec `persistence=json-demo`. Le contrôle SSH antérieur établit le trajet sur l’hôte. [Instances du projet](https://console.cloud.google.com/compute/instances?project=project-fd23d3d9-a7e8-4002-a7a) · [Détails de la VM](https://console.cloud.google.com/compute/instancesDetail/zones/europe-west4-a/instances/instance-20261123-141011?project=project-fd23d3d9-a7e8-4002-a7a) · [Adresses IP](https://console.cloud.google.com/networking/addresses/list?project=project-fd23d3d9-a7e8-4002-a7a)

## Placement et points d’entrée

| Élément | Valeur | Portée et preuve |
|---|---|---|
| Projet et hôte | project-fd23d3d9-a7e8-4002-a7a · instance-20261123-141011 | Une seule instance listée dans le projet, en fonctionnement. Le nom et le projet correspondent aux métadonnées interrogées par SSH. |
| Région et zone | europe-west4 (Pays-Bas) · europe-west4-a | Zone de la VM. Un arrêt de la VM, de son disque ou de la zone interrompt le site. |
| Calcul | e2-custom-4-6144 · 4 vCPU · 6 Gio configurés | Type issu des métadonnées, 4 CPU disponibles dans l’OS, Debian GNU/Linux 13. |
| VPC et interface | VPC global default → sous-réseau régional default (europe-west4) → nic0 IPv4. CIDR 10.164.0.0/20, passerelle 10.164.0.1, IP interne éphémère 10.164.0.2 | Concordance entre détails du sous-réseau dans la console, masque et adresse dans les métadonnées de la VM. |
| Routes du VPC | 10.164.0.0/20 → réseau default, priorité 0. 0.0.0.0/0 → passerelle Internet par défaut, priorité 1000. | Routes effectives visibles pour le VPC default dans europe-west4. Les priorités de routage et de filtrage appartiennent à des mécanismes distincts. |
| DNS et entrée publique | ia-pple.isen.fedyna.fr → 35.214.178.128, IPv4 statique réservée et attachée à nic0, région europe-west4, niveau réseau Standard | Concordance entre DNS externe, adresse distante HTTPS, console et métadonnées de la VM. |
| Répartition de charge | Entrée directe sur l’IPv4 de la VM, puis un seul backend Caddy sur 127.0.0.1:3000 | Aucun LB sur ce trajet. La liste des health checks Compute du projet était vide. Les forwarding rules, backends et LB éventuels ailleurs dans le projet restent à inventorier. |
| Disque et copies | Un disque de démarrage zonal Persistent Disk équilibré (pd-balanced), 10 Go affichés, europe-west4-a. /dev/sda1 en ext4 héberge /var/lib/chatisen | Seul disque attaché d’après la console. Deux snapshots standards prêts relevés en multi-région eu. |
| Identités | User entre par HTTPS ; Ops par SSH TCP 22 ; Admin infrastructure par console/API GCP et IAM | SSH direct authentifié pendant le contrôle. IAM exprime le chemin d’administration cloud. Les rôles réellement attribués et les autres modes d’accès demandent une lecture du projet. Le rôle owner d’un groupe s’applique uniquement à cette conversation. |

Le point d’entrée web est unique. Le serveur accepte aussi SSH pour Ops. Une seule adresse publique ne limite pas à elle seule la surface d’exposition. Le résultat dépend des règles applicables à l’interface, des sockets écoutées et du service derrière chacune. Caddy administre localement son API sur `127.0.0.1:2019`, et le backend applicatif écoute sur `127.0.0.1:3000`. [Configuration du proxy](../../ops/gcp/Caddyfile.template) · [Régions et zones Compute Engine](https://cloud.google.com/compute/docs/regions-zones)

## Services et responsabilités

| Service / emplacement | Responsabilité et état observé | Point de contrôle |
|---|---|---|
| DNS du domaine ISEN, externe | Publie l’enregistrement A du site. Le gestionnaire de la zone DNS reste à identifier dans l’inventaire de l’équipe. | dig A et AAAA puis comparaison à l’adresse externe de la NIC. |
| Caddy 2.6.2, VM | TLS et redirection HTTP ; proxy vers Node pour pages, API et Upgrade WS. Sert directement le lecteur C4 sous /architecture/. Le fichier actif porte aussi le nom historique 35-214-178-128.sslip.io. | État systemd, domaines et validation HTTPS. Le template Git décrit le site principal. |
| chatisen.service, VM | Un processus Node.js 24.14.1 sous utilisateur Unix chatisen. Sert apps/web/public, route /api, publie WS/SSE et lit ou réécrit le document JSON. | systemctl is-active chatisen ; GET /readyz répond persistence=json-demo. |
| Front et service worker, navigateur | HTML, CSS et app.js pour comptes, DM, groupes et appels. sw.js peut notifier quand l’onglet est fermé et ouvrir le fil. Les fichiers sont distribués par le serveur Node de la même VM. | SHA-256 du bundle ; parcours à 2–3 sessions ; test Web Push avec deux profils persistants. |
| Stockage local, VM | /var/lib/chatisen/chatisen.json, propriétaire chatisen, mode 0600, répertoire 0700. Les références entre collections sont résolues par Node. | stat sur le chemin et findmnt sur le répertoire, sans lecture du contenu privé. |
| Snapshots Compute Engine, multi-région eu | La politique default-schedule-1 attachée au disque déclenche une copie quotidienne. Compute Engine assure cette opération. | Comparer les créations UTC dans le relevé des snapshots et tester séparément la restauration applicative. |
| Configuration de service, VM | /etc/chatisen/chatisen.env appartient à root, mode 0600 ; secrets CSRF et VAPID, origine et STUN. systemd lit l’environnement au démarrage. | Vérifier noms des paramètres du script de déploiement et modes, comparer l’origine et la configuration publique. |
| OpenSSH et systemd, VM | Connexion de l’exploitant et supervision des unités caddy/chatisen. Les journaux hôte passent par journald/rsyslog. | ssh.service actif ; systemctl et journalctl avec privilèges d’exploitation autorisés. |
| Google Cloud Ops Agent, VM | Sous-services Fluent Bit et collecteur OpenTelemetry actifs. Leurs ports de supervision locaux sont distincts du port du chat. Cloud Logging/Monitoring sont les destinations habituelles du produit ; la réception, le bucket et la rétention demandent une preuve côté console. | États systemd et processus propriétaires des sockets 20201/20202 ; rechercher une série et un journal datés dans le projet. |
| WebRTC et STUN, navigateurs + service externe | SDP/ICE via Node pour établir l’appel. STUN Google pour découvrir les candidats. Les deux navigateurs transportent le son et l’image entre eux. Le banc GCP n’emploie aucune SFU/TURN applicative dans cette configuration. | GET /api/config, paire ICE sélectionnée et progression des compteurs inbound-rtp à chaque extrémité. |
| Web Push, module Node + fournisseurs externes | Création de l’abonnement, filtrage des sessions/membres, envoi chiffré et remise au service worker du navigateur. Les domaines éligibles sont définis dans push.mjs. | Vérifier abonnement, suppression après déconnexion et réception après fermeture de l’onglet. |
| Services de plateforme de l’hôte | Guest agent GCE, OS Config, mises à jour Debian, réseau/résolution/horloge systemd. L’hôte exécute aussi cron, Exim sur loopback et services système Debian. | Inventaire des unités actives ; Docker, PostgreSQL, Tailscale et nftables.service déclarés inactifs au contrôle. |
| Banc R01, ailleurs que sur le trajet public | Nginx, web React, API Fastify, migration, PostgreSQL, LiveKit, Prometheus et Grafana. Décrit sous infra/compose pour la recette. | Les 8 entrées de services dans Compose. Déplier « Assemblage Compose local » dans le lecteur. |

## Flux nommés

| Flux | Origine → destination | Protocole et données | Autorisation ou observation |
|---|---|---|---|
| F01 · Résolution | Navigateur → résolveur DNS → zone du domaine | Nom du site, réponse A publique. Le transport vers le résolveur dépend du poste. | Lecture publique ; vérifier la réponse et son TTL lors de la reconstruction. |
| F02 · Entrée User | Navigateur → IPv4 de la VM → filtrage VPC → Caddy | TCP 80 redirige. HTTPS/WSS sur TCP 443. Caddy écoute aussi UDP 443 pour HTTP/3. | TLS au frontal ; reachabilité publique de l’UDP à confirmer. Le navigateur n’a besoin d’aucun VPN. |
| F03 · Distribution | Caddy → serveur Node sur la même VM, ou fichiers du lecteur | HTTP/1.1 et Upgrade via 127.0.0.1:3000 ; /architecture/ servi par Caddy depuis le clone | Les assets du front sont publics. Sur les routes privées Node vérifie le cookie et les droits. |
| F04 · Identité | Navigateur → routeur → identité → document JSON | POST /api/auth/register, login, logout ; GET /api/auth/me. Cookie __Host-chatisen ; secret mot de passe dérivé par scrypt, token de session haché | Session limitée à 24 h. Vérifications CSRF pour mutations gardées, règles propres à chaque route. |
| F05 · Direct, groupe, envoi | Navigateur → messagerie dans Node | HTTPS POST /api/conversations puis /api/conversations/{id}/messages. Historique par GET. Retrait de membre par DELETE | Membre actif pour lire et écrire, owner pour retirer ; id de commande clientMessageId ; numéro d’ordre par conversation. |
| F06 · Persistance | Modules Node → mémoire du processus → système de fichiers de la VM | Lecture initiale, writeFileSync du JSON complet. Comptes, sessions, conversations, membres, messages, appels, abonnements Push, pièces préexistantes | Accès Unix du service ; aucune connexion SQL dans ce chemin. Une seule instance écrivaine, pas de transaction ni de réplication applicative. |
| F07 · Livraison chat | Node → clients abonnés du fil | Upgrade /api/ws puis message.created ; GET /api/events?conversationId=… offre SSE. Accès depuis Internet via Caddy/TLS. | Contrôle d’origine et de session aux points d’entrée, appartenance revalidée avant diffusion. Le front utilise la socket et rafraîchit aussi sa liste. |
| F08 · Établissement d’appel | Navigateurs → routeur appels ; navigateurs → STUN Google | POST /api/conversations/{id}/calls ; answer/end/signal ; SDP et candidats ICE ciblés par session via WS ; découverte STUN sur 19302 | Direct à deux membres, site HTTPS et permissions micro/caméra. Le STUN reçoit des métadonnées réseau. |
| F09 · Média | Navigateur appelant ↔ navigateur correspondant | ICE puis audio/vidéo DTLS-SRTP sur la paire négociée, ports dynamiques ; signalisation séparée | Source des statistiques = navigateur. Les restrictions NAT peuvent empêcher la liaison. Les pistes ne transitent pas par le disque ou par Caddy. |
| F10 · Envoi Push | Navigateur → API d’abonnement ; Node → fournisseur push par HTTPS 443 sortant | /api/push/config et /api/push/subscriptions ; notification chiffrée contenant type, conversationId, messageId et senderName, TTL 120 s | Consentement navigateur, association à la session, membre actif et session valide au moment de l’envoi. |
| F11 · Réveil | Fournisseur push → service worker du destinataire | Transport de remise géré par le navigateur. Notification puis retour au fil au clic | Cette remise ne crée aucun port entrant sur la VM. La disponibilité dépend du fournisseur et du poste. |
| F12 · Exploitation | Poste Ops → IP publique de la VM → sshd → systemd/journaux | SSH TCP 22 par clé ; gestion locale des unités, certificats et checkout. Sorties de maintenance HTTPS pour Git, runtime et dépendances | Accès direct vérifié. Source autorisée par le VPC et droits sudo/IAM à distinguer. Dépôts, registres et ACME sont des dépendances d’exploitation. |
| F13 · Administration | Admin infrastructure → console/API Google Cloud → projet et ressources | HTTPS TCP 443 vers Google ; inventaire, IAM, VPC et configuration des VM/disques, selon les droits | Aucun portail admin global dans le code de la démo. Le propriétaire d’un groupe suit F02/F05 avec son compte applicatif. |
| F14 · Observabilité | Ops/jury → Caddy → Node ; agent hôte → services d’observabilité Google si configurés | /healthz, /readyz, /metrics ; séries utilisateurs/messages. Agent Fluent Bit et collecteur OpenTelemetry présents | Les deux premières sondes décrivent le processus. La sonde json-demo n’effectue pas de contrôle d’écriture disque. Confirmer l’ingestion et la rétention depuis le projet. |
| F15 · Copie du disque | Disque pd-balanced en europe-west4-a → service de snapshots Compute Engine → stockage multi-région eu | Capture planifiée du disque de démarrage par la plateforme. Fréquence quotidienne selon default-schedule-1. | Deux snapshots prêts observés. Aucun port à ouvrir sur la VM pour ce flux. Cohérence métier, rétention et restauration restent à vérifier. |
| F16 · Intégration continue | Contributeur → dépôt GitHub privé → runner GitHub Actions | Déclenchement sur pull request et push sur main. Installation verrouillée, builds, contrôle de Compose, tests PostgreSQL et Chromium. | Consulter le résultat associé au SHA de la PR. Le workflow r01.yml valide le candidat et archive les traces des tests. |
| F17 · Livraison sur la VM | Ops via F12, puis VM → dépôt GitHub privé | Récupération Git puis sélection d’un SHA de main dans /opt/chatisen/app. Une modification des dessins devient lisible via Caddy. | Livraison déclenchée par Ops. Vérifier la provenance du SHA, les fichiers publics et la disponibilité. |

## Authentification User

Les requêtes partent du navigateur sur l’origine publique, traversent Caddy en HTTPS via F02 et arrivent à Node via F03. F04 est le module d’identité locale de ce même processus. [Code de l’identité et des sessions](../../apps/standalone/server.mjs) · [Réglages du service en ligne](../../ops/gcp/chatisen.service)

| Étape | Requête ou donnée | Contrôle ou résultat |
|---|---|---|
| Inscrire ou connecter | POST /api/auth/register ou POST /api/auth/login, avec identifiant et mot de passe dans le corps HTTPS. | Node conserve un hash scrypt salé dans users[].passwordHash à l’inscription et le vérifie à la connexion. Un mauvais identifiant ou mot de passe renvoie 401 à la connexion. |
| Ouvrir la session | Node génère un jeton aléatoire opaque de 32 octets. Le JSON conserve son SHA-256 dans sessions[].tokenHash, lié à userId avec expiration à 24 h. | Le jeton est renvoyé au navigateur par Set-Cookie __Host-chatisen. Attributs Secure, HttpOnly, SameSite=Lax et Path=/. La réponse JSON fournit le profil et le jeton CSRF calculé par HMAC. |
| Retrouver le profil | GET /api/auth/me. Le navigateur transmet le cookie automatiquement. | Node recherche l’empreinte de la session, vérifie son expiration et sa révocation. Sans session valide, la route renvoie 401. |
| Autoriser une action | Le client ajoute x-csrf-token aux écritures gardées. Pour le fil privé, Node vérifie l’appartenance active. | Une session identifie le compte. L’appartenance au fil détermine ses droits. WebSocket vérifie aussi l’origine et les droits de souscription. |
| Déconnecter | POST /api/auth/logout. | Node renseigne revokedAt si la session est active et efface le cookie. Le jeton révoqué doit ensuite être rejeté par /api/auth/me. |

Le contrôle de support se joue sur un environnement de test avec deux comptes et un tiers. Vérifier les attributs du cookie, le refus de lecture du tiers, le refus d’une écriture gardée sans jeton CSRF et le statut après déconnexion. [Tests de confidentialité WebSocket/SSE](../../tests/security/standalone-realtime.test.mjs)

## Règles VPC visibles sur nic0

Ces huit règles IPv4 correspondent aux tags de l’instance ou à toutes les VM du VPC `default`. Elles ont toutes le sens **INGRESS**, l’action **ALLOW** et la journalisation **désactivée**. La console n’a pas pu afficher les associations de politiques héritées faute du droit `compute.organizations.listAssociations`. La lecture depuis le compte de la VM avait également échoué par manque de scopes. La politique effective complète, les règles de sortie et le filtrage local Debian restent à confirmer. [Règles VPC du projet](https://console.cloud.google.com/networking/firewalls/list?project=project-fd23d3d9-a7e8-4002-a7a) · [Sous-réseau régional](https://console.cloud.google.com/networking/subnetworks/details/europe-west4/default?project=project-fd23d3d9-a7e8-4002-a7a)

| Règle VPC · entrée autorisée, logs désactivés | Priorité | Source IPv4 | Protocole / ports | Cible |
|---|---:|---|---|---|
| default-allow-http | 1000 | 0.0.0.0/0 | TCP 80 | Tag http-server |
| default-allow-https | 1000 | 0.0.0.0/0 | TCP 443 | Tag https-server |
| allow-tcp-27028-instance | 1000 | 0.0.0.0/0 | TCP 27028 | Tag instance-27028-codex |
| default-allow-health-check | 1000 | 35.191.0.0/16, 130.211.0.0/22, 209.85.152.0/22, 209.85.204.0/22 | TCP tous ports | Tag lb-health-check |
| default-allow-ssh | 65534 | 0.0.0.0/0 | TCP 22 | Toutes les VM du VPC |
| default-allow-rdp | 65534 | 0.0.0.0/0 | TCP 3389 | Toutes les VM du VPC |
| default-allow-icmp | 65534 | 0.0.0.0/0 | ICMP | Toutes les VM du VPC |
| default-allow-internal | 65534 | 10.128.0.0/9 | TCP et UDP 0–65535, ICMP | Toutes les VM du VPC |

Une règle distincte de health check IPv6 figure dans la console. L’interface relevée est IPv4 uniquement. Le tag `lb-health-check` cible la VM même si la liste des vérifications d’état Compute Engine du projet est vide. [Vérifications d’état du projet](https://console.cloud.google.com/compute/healthChecks?project=project-fd23d3d9-a7e8-4002-a7a)

## Pare-feu et exposition

| Chemin | Filtrage VPC visible | Service ou résultat observé |
|---|---|---|
| User → TCP 80 et 443 | Deux autorisations IPv4 publiques, priorité 1000, ciblent les tags web de la VM. | Caddy accepte TCP, redirige HTTP et termine TLS. HTTPS/WSS est relayé vers Node sur loopback. |
| User → UDP 443 | La règle HTTPS publique listée couvre TCP. Aucune des huit règles relevées n’autorise UDP 443 depuis 0.0.0.0/0. | Caddy écoute en UDP 443. La disponibilité d’HTTP/3 depuis Internet reste non démontrée. |
| Ops → TCP 22 | Autorisé depuis 0.0.0.0/0 pour toutes les VM, priorité 65534. | sshd écoutait et la connexion SSH directe par clé a réussi depuis le poste de contrôle. IAP, OS Login et origines effectives complètes à vérifier. |
| TCP 27028 et TCP 3389 | Autorisations publiques visibles via le tag dédié pour 27028 et pour toutes les VM du VPC pour 3389. | Aucune écoute sur ces deux ports dans ss. Les utilisateurs accèdent au chat par HTTPS 443. |
| Sources internes et plages de health check | La règle interne autorise TCP/UDP/ICMP depuis 10.128.0.0/9. La règle health check autorise TCP depuis les quatre plages indiquées. | Ops Agent écoute sur TCP 20201/20202. L’accessibilité dépend de l’origine et du filtrage effectif. Aucun accès public à ces services n’a été démontré. |
| Services sur loopback | La portée d’une règle VPC et l’adresse d’écoute du processus se vérifient séparément. | Node TCP 3000, API Caddy TCP 2019, SMTP TCP 25 et résolveur local sur 53. Node reçoit le trafic public via Caddy. |
| Autres écoutes et sorties | ICMP public figure au niveau VPC. Politiques egress et règles locales actives à confirmer. | Résolution locale TCP/UDP 5355, DHCP sur l’interface. Le navigateur contacte STUN et son pair. La VM envoie les notifications Push en HTTPS. |

**Surface minimale pour ce service.** Le jury a besoin du frontal HTTPS ; garder le port HTTP uniquement si la redirection ou le mécanisme ACME retenu l’exige. Une règle Ops séparée peut limiter SSH aux sources d’administration ou à un chemin IAP testé. L’UDP 443 sert à HTTP/3 si ce protocole est retenu. Le port 27028 et les endpoints de l’agent ne sont requis par aucun parcours utilisateur observé. Comparer ces besoins aux règles effectives avant de proposer une modification avec l’équipe chargée de la VM.

## Données, résidences et reprise

| Donnée | Relations et emplacement | Conséquence pour l’équipe |
|---|---|---|
| Identités, sessions et autorisations | users.id → sessions.userId ; users.id et conversations.id → members. Le rôle appartient au couple utilisateur/conversation. JSON sur disque racine en europe-west4-a. | La session résulte d’un cookie HTTP-only et doit rester active. La sortie du groupe renseigne leftAt. Les mots de passe sont dérivés, les sessions persistées sous forme d’empreinte. |
| Messages et pièces | messages.conversationId et senderId rattachent fil et auteur, seq ordonne le fil. Les pièces préexistantes sont lues par attachment.conversationId. Même disque et même copie mémoire Node. | Contrôle du membre à la lecture. L’endpoint de téléchargement existant n’établit pas un parcours d’upload sur ce profil. |
| Appels et abonnements | calls référence le direct, les deux utilisateurs et leurs sessions. pushSubscriptions lie utilisateur et session à un endpoint et aux clés publiques/de chiffrement nécessaires à Push. | SDP/ICE et média sont transitoires. Le JSON persiste les métadonnées d’appel. L’envoi Push contient des identifiants et le nom affiché ; le texte du message est absent du payload. |
| Hors VM | Navigateurs et notifications sur les appareils des participants, DNS, STUN et fournisseurs Web Push externes, télémétrie Google si collectée | Le disque actif est aux Pays-Bas et les deux snapshots observés sont en multi-région européenne. La localisation des postes, des prestataires et des journaux reste à documenter. |
| Sauvegardes et continuité | Le document est réécrit en place sur le disque qui fait l’objet des snapshots planifiés. La console n’affiche aucun plan Backup and DR dans la section de cette VM. | Une copie de disque prête n’établit pas l’intégrité du JSON. Restaurer sur hôte isolé, vérifier comptes synthétiques, groupes et historique, puis mesurer perte de données et délai de reprise. |

## Copies du disque en Europe

| Objet | Observation datée | Portée |
|---|---|---|
| Politique default-schedule-1 | Quotidienne, fenêtre affichée 22 h–23 h. Fuseau de cette fenêtre non précisé dans la vue consultée. | Attachée au disque de démarrage de la VM. Durée de conservation et comportement à la suppression du disque à vérifier dans la politique. |
| Snapshot du 23 novembre 2026 | Création à 22:03:17 UTC · standard, planifié, prêt · 1,13 Go affichés | Multi-région eu, source disque instance-20261123-141011. |
| Snapshot du 24 novembre 2026 | Création à 22:03:17 UTC · standard, planifié, prêt · 200,78 Mo affichés | Même disque source et multi-région eu. Tailles ponctuelles de la console. Le stockage facturé sur un mois dépend aussi de leur durée de conservation. |

Le relevé couvre les snapshots standards listés dans ce projet. Les dates de création sont en UTC. Le contenu exact des copies, les autres destinations de sauvegarde et le succès d’une restauration applicative restent à établir. [Instantanés Compute Engine](https://console.cloud.google.com/compute/snapshots?project=project-fd23d3d9-a7e8-4002-a7a)

Pour le dossier RGPD, relever responsable, finalités, durées de conservation réellement configurées, localisation des copies et des journaux, sous-traitants et procédure d’effacement. Une suppression applicative, la révocation d’une session et l’expiration d’une sauvegarde sont trois opérations différentes. [Relations et code de persistance](../../apps/standalone/server.mjs) · [Contenu transmis en Push](../../apps/standalone/push.mjs)

## Calcul du coût

| Poste | Quantité à prendre | Calcul et source à associer |
|---|---|---|
| Compute Engine E2 custom | 4 vCPU et 6 Gio en europe-west4 ; H = heures facturables | H × (4 × prix vCPU/h + 6 × prix Gio RAM/h) en prenant les SKU custom et la devise du compte, ou H × prix complet de la VM. Une seule de ces deux méthodes. |
| Disque et snapshots | Un disque pd-balanced zonal de 10 Go affichés, deux snapshots standards multi-région eu (1,13 Go et 200,78 Mo affichés) | Proratiser la capacité provisionnée et appliquer le tarif régional pd-balanced. Calculer les snapshots selon l’usage facturé dans le temps et le SKU applicable. |
| IPv4 publique | Une adresse statique Standard réservée dans europe-west4 et attachée à la VM | Heures d’adresse attachée × tarif applicable. Une autre IPv4 réservée et inutilisée dans us-central1 figure au projet. Son coût éventuel relève du projet jusqu’à attribution. |
| Trafic | Octets sortants facturables de la VM, ventilés par destination ; HTTPS/WS, Push et signalisation | Somme des Gio par tranche et destination × tarif correspondant. Le média P2P circule entre les postes ; un futur relais média changerait le calcul. |
| Télémétrie et DNS | Logs ingérés et conservés, séries payantes, DNS éventuellement facturé au gestionnaire de zone | Quantités facturées × tarifs applicables. Imputer les ressources dont l’usage pour ChatISEN est établi. |
| Exploitation et total | Heures de maintenance et de restauration, tarif interne ; période et devise communes | TCO = infrastructure + coûts d’exploitation. Présenter brut, remises, crédits, taxes et net séparément. Les consommations réelles viennent de Billing. |

Exemple de dimensionnement **pour un mois hypothétique de 730 h continues** : 2 920 vCPU·h, 4 380 Gio RAM·h, un disque provisionné pour le mois et jusqu’à 730 h d’IPv4 attachée. Le bandeau de la console affichait 266,57 € de crédit d’essai restant. Seul un rapport Billing daté permettra de publier une dépense brute ou nette. Laisser les prix et l’egress inconnus en cases à renseigner. [Prix Compute Engine](https://cloud.google.com/compute/vm-instance-pricing) · [Disques et adresses](https://cloud.google.com/compute/disks-image-pricing) · [Prix réseau](https://cloud.google.com/vpc/network-pricing) · [Calculatrice Google Cloud](https://cloud.google.com/products/calculator)

**Périmètre financier.** L’adresse inutilisée `34.61.228.109` se trouve en `us-central1`. Son association à ChatISEN n’a pas été établie. Le coût éventuel de cette réservation est à vérifier au niveau projet. Les forwarding rules et backends, Cloud NAT, Cloud SQL et les buckets Cloud Storage n’ont pas été inventoriés. [Adresses IP du projet](https://console.cloud.google.com/networking/addresses/list?project=project-fd23d3d9-a7e8-4002-a7a)

## Reproduire sur un environnement isolé

1. Sur le projet de test, reproduire une VM Debian 13 de type e2-custom-4-6144 en europe-west4-a, un disque pd-balanced zonal de 10 Go, un sous-réseau régional /20 et une IPv4 régionale réservée de niveau Standard. Conserver un plan d’adressage, un domaine et des secrets propres au banc. Comparer les routes et les cibles des règles VPC à la matrice ci-dessus. La reproduction exacte des politiques héritées et des paquets exige leurs versions et leurs paramètres effectifs.
2. Installer Debian 13, le runtime Node 24.14.1 au chemin attendu de l’unité et Caddy (version observée 2.6.2). Vérifier la somme publiée du runtime, disposer du checkout du SHA indiqué ci-dessus dans `/opt/chatisen/app` et des prérequis listés dans le runbook. Configurer le DNS du domaine de test vers l’IP de la réplique et les accès TCP/TLS correspondants. [Installation GCP](../../ops/gcp/README.md)
3. Sur cette réplique, exécuter `sudo bash /opt/chatisen/app/ops/gcp/install.sh <domaine-de-test>`. Le script installe la dépendance Web Push depuis le lockfile, prépare le compte et l’environnement, installe l’unité et Caddy. Ajouter séparément une redirection de domaine historique si elle fait partie du périmètre. Noter aussi la configuration de l’agent Ops et la politique de sauvegarde du projet. [Installateur](../../ops/gcp/install.sh) · [Unité](../../ops/gcp/chatisen.service) · [Caddy](../../ops/gcp/Caddyfile.template)
4. Tester DNS, redirection, certificat, `/healthz`, `/readyz`, lecteur et fichiers servis. Examiner `ss -lntu` sur la réplique pour distinguer loopback et entrée publique. Avec trois comptes synthétiques, créer le groupe depuis l’interface, envoyer puis relire l’historique après redémarrage de la réplique, retirer un membre. À deux, relever les octets audio et les images décodées dans les deux navigateurs. Avec consentement Push, fermer l’onglet et constater la notification. [Parcours UI](../../tests/e2e/standalone.spec.ts) · [Recette des autorisations](../../tests/security/standalone-realtime.test.mjs) · [Recette Web Push](../../tests/security/push-api.test.mjs)
5. Pour tester la reprise, appliquer une politique quotidienne de snapshots standards en multi-région eu sur le disque de test, après confirmation du fuseau et de la rétention. Restaurer un snapshot dans un nouveau disque sur le banc isolé. Démarrer le service, vérifier les identités, les groupes et l’historique synthétiques attendus, relever le SHA, les horodatages et les écarts. Cette recette reste à exécuter.

## Compléter l’inventaire depuis Cloud Shell

Avec un compte lecteur du projet, ces consultations identifient le périmètre qui n’est pas visible depuis la VM. Le relevé des règles doit conserver nom, sens, priorité, action, protocoles/ports, source/destination, cible, état, journalisation et origine de politique. Séparer les règles du VPC et les politiques hiérarchiques/régionales. Pour les prix réels, exporter les coûts agrégés du projet sur une période identifiée depuis Cloud Billing.

```sh
P=project-fd23d3d9-a7e8-4002-a7a
Z=europe-west4-a
VM=instance-20261123-141011
gcloud compute instances list --project="$P" --format='table(name,zone.basename(),status,machineType.basename())'
gcloud compute instances describe "$VM" --zone="$Z" --project="$P" --format='yaml(networkInterfaces[].name,networkInterfaces[].subnetwork,disks[].source,scheduling.provisioningModel)'
gcloud compute instances network-interfaces get-effective-firewalls "$VM" --project="$P" --zone="$Z" --network-interface=nic0
gcloud compute firewall-rules list --project="$P" --filter='network:default'
gcloud compute routes list --project="$P" --filter='network:default'
gcloud compute networks subnets list --project="$P" --regions=europe-west4
gcloud compute addresses list --project="$P"
gcloud compute forwarding-rules list --project="$P"
gcloud compute backend-services list --project="$P"
gcloud compute health-checks list --project="$P"
gcloud compute routers list --project="$P"
# Pour chaque routeur pertinent : gcloud compute routers nats list --project="$P" --router=NOM --region=REGION
gcloud sql instances list --project="$P"
gcloud storage buckets list --project="$P" --format='table(name,location,storageClass)'
gcloud compute resource-policies describe default-schedule-1 --region=europe-west4 --project="$P" --format='yaml(snapshotSchedulePolicy)'
gcloud compute disks describe "$VM" --zone="$Z" --project="$P" --format='yaml(type,sizeGb,sourceImage,resourcePolicies,diskEncryptionKey.kmsKeyName)'
gcloud compute snapshots list --project="$P" --format='table(name,sourceDisk.basename(),storageLocations,status)'
```

Une commande sans permission reçoit le statut « non vérifié ». Une liste terminée sans erreur et vide permet de consigner l’absence dans son périmètre. Pour l’exposition réseau, comparer les règles aux besoins F02/F12 et aux sockets réellement liées, puis vérifier en préproduction les accès effectifs depuis les origines prévues.

### Compléments pour une prochaine révision

Depuis une identité disposant de la lecture nécessaire, exporter le pare-feu effectif de nic0 et ses politiques héritées. Confirmer le mode d’administration IAM/IAP/OS Login, les destinations et rétentions de logs, le fuseau et la conservation des snapshots. Pour une vision du projet entier, compléter les listes de forwarding rules, backends, NAT, Cloud SQL et buckets. Un rapport Billing sur une période et dans une devise identifiées permettra ensuite de calculer l’usage facturé, les crédits et le net. La preuve de restauration se produit sur un banc isolé avec des données synthétiques.
