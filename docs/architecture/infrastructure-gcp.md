# Google Cloud · inventaire et reconstruction de la démo ChatISEN

Le site du jury repose sur **une VM applicative identifiée**, `instance-20261123-141011`. Caddy termine TLS et transmet les requêtes à Node sur la même machine. Node sert le front, traite l’API et écrit sur le disque de démarrage. Le mot **standalone** est le nom de ce programme dans le dépôt. Le front s’exécute ensuite dans le navigateur de chaque participant. La pile Docker Compose R01 se reconstruit en laboratoire. [C4 hors ligne](index.html#03-composants-api) · [Service systemd](../../ops/gcp/chatisen.service)

Contrôle du **25 novembre 2026, 13 h 43–13 h 46 UTC**. DNS et HTTPS depuis un poste externe, puis inventaire SSH de l’hôte, métadonnées Compute Engine, sockets et permissions de fichiers. Le checkout de la VM porte le SHA `9b08996060c52700b035d646bf6ac64075ef3ea6`. Le `main` vérifié ensuite à `09ed65a` ajoute uniquement des fichiers de rapport et de mandat par rapport à ce SHA. Le SHA-256 du JavaScript du domaine et du même fichier Git est `ef45b97f78e41d4ac93e59333fccfd00f8659b241b25e8a6c5baa43bb0aad3ca`. La source du code et la preuve de placement ont ainsi des références indépendantes. [Source déployée](https://github.com/Zayonx-0/ChatISEN/tree/9b08996060c52700b035d646bf6ac64075ef3ea6) · [Preuve Push sur le site](../report/journal-des-preuves.md#e28--push-sur-le-site-déployé)

## Placement et points d’entrée

| Élément | Valeur | Portée et preuve |
|---|---|---|
| Projet et hôte | project-fd23d3d9-a7e8-4002-a7a · instance-20261123-141011 | Projet et nom renvoyés par les métadonnées de l’instance. |
| Région et zone | europe-west4 (Pays-Bas) · europe-west4-a | Zone de la VM. Un arrêt de la VM, de son disque ou de la zone interrompt le site. |
| Calcul | e2-custom-4-6144 · 4 vCPU · 6 Gio configurés | Type issu des métadonnées, 4 CPU disponibles dans l’OS, Debian GNU/Linux 13. |
| VPC et interface | default (global) · réseau local 10.164.0.0/20 · IP interne 10.164.0.2 · passerelle 10.164.0.1 | Métadonnées de l’interface 0. CIDR calculé avec le masque 255.255.240.0. Nom administratif du sous-réseau à confirmer côté projet. |
| DNS et entrée publique | ia-pple.isen.fedyna.fr → A 35.214.178.128 · aucun AAAA retourné lors du contrôle | L’IPv4 est celle de l’interface de la VM, confirmée depuis l’intérieur. Un utilisateur et un enseignant suivent le même chemin, depuis Internet. |
| Répartition de charge | Entrée directe sur la VM puis un seul upstream Caddy vers 127.0.0.1:3000 | Aucun load balancer sur le trajet DNS→VM démontré. Le tag réseau lb-health-check ne prouve pas l’existence d’un LB. Le nombre de ressources indépendantes du projet demande un inventaire du plan de contrôle. |
| Disque et copies | Disque de démarrage 10 Gio ; /dev/sda1 en ext4 héberge /var/lib/chatisen | lsblk et findmnt. Le type tarifaire, les snapshots, leurs emplacements et la réservation de l’IP demandent un relevé Compute Engine. |
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

## Pare-feu et exposition

| Direction / cible | Constat mesuré sur la VM | Ce qui décide de l’exposition |
|---|---|---|
| Entrée web vers ens4 | Caddy écoute TCP 80/443, le site répond en HTTPS ; UDP 443 en écoute | La règle VPC autorisant chaque protocole, sa source et sa priorité doivent être relevées indépendamment. |
| Entrée Ops | sshd en écoute TCP 22, SSH direct vérifié depuis le poste de mesure | Une connexion réussie ne renseigne pas tous les CIDR autorisés. Accès IAP et politiques hiérarchiques à inventorier. |
| Port 27028 | Aucune écoute 27028 dans ss -lntu | Le tag instance-27028-codex existe. Un tag seul ne crée aucun listener et ne suffit pas à identifier une règle effective. |
| Loopback | Node TCP 3000, API Caddy TCP 2019, SMTP TCP 25 et résolveur local port 53 | Le bind local empêche l’accès direct par l’IP de la VM à ces sockets. La route publique de l’app passe par Caddy. |
| Autres listeners | Ops Agent TCP 20201 et 20202, résolveur local TCP/UDP 5355, DHCP sur l’interface | Vérifier règles ingress et cibles avant de conclure à une exposition Internet. Aucune nécessité applicative d’ouvrir ces ports au jury. |
| Règles effectives | Tags d’instance relevés : http-server, https-server, instance-27028-codex, lb-health-check | La lecture des règles Compute a renvoyé ACCESS_TOKEN_SCOPE_INSUFFICIENT depuis la VM. Nom, priorité, sens, source/destination, action, protocoles, cible, journalisation et politique héritée restent à confirmer au niveau projet. |
| Sorties | Navigateur vers STUN/son pair ; VM vers push HTTPS, services de maintenance et éventuellement télémétrie | Des essais applicatifs prouvent un flux à un instant donné. Le périmètre des autorisations egress dépend des règles effectives. |

**Surface minimale pour ce service.** Le jury a besoin du frontal HTTPS ; garder le port HTTP uniquement si la redirection ou le mécanisme ACME retenu l’exige. Une règle Ops séparée peut limiter SSH aux sources d’administration ou à un chemin IAP testé. L’UDP 443 sert à HTTP/3 si ce protocole est retenu. Le port 27028 et les endpoints de l’agent ne sont requis par aucun parcours utilisateur observé. Comparer ces besoins aux règles effectives avant de proposer une modification avec l’équipe chargée de la VM.

## Données, résidences et reprise

| Donnée | Relations et emplacement | Conséquence pour l’équipe |
|---|---|---|
| Identités, sessions et autorisations | users.id → sessions.userId ; users.id et conversations.id → members. Le rôle appartient au couple utilisateur/conversation. JSON sur disque racine en europe-west4-a. | La session résulte d’un cookie HTTP-only et doit rester active. La sortie du groupe renseigne leftAt. Les mots de passe sont dérivés, les sessions persistées sous forme d’empreinte. |
| Messages et pièces | messages.conversationId et senderId rattachent fil et auteur, seq ordonne le fil. Les pièces préexistantes sont lues par attachment.conversationId. Même disque et même copie mémoire Node. | Contrôle du membre à la lecture. L’endpoint de téléchargement existant n’établit pas un parcours d’upload sur ce profil. |
| Appels et abonnements | calls référence le direct, les deux utilisateurs et leurs sessions. pushSubscriptions lie utilisateur et session à un endpoint et aux clés publiques/de chiffrement nécessaires à Push. | SDP/ICE et média sont transitoires. Le JSON persiste les métadonnées d’appel. L’envoi Push contient des identifiants et le nom affiché ; le texte du message est absent du payload. |
| Hors VM | Navigateurs et notifications sur les appareils des participants ; DNS, STUN et fournisseurs Web Push externes ; télémétrie Google si collectée | La zone néerlandaise localise le disque applicatif. Localisation finale des postes, du traitement par les prestataires, des logs et des copies à documenter avant toute conclusion RGPD. |
| Sauvegardes et continuité | Fichier local et configuration sur un hôte, lecture au démarrage et réécriture en place. Snapshot/backup, rétention, chiffrement avec clé gérée par le client et restauration vérifiée à confirmer | Une interruption durant l’écriture peut affecter le document. Pour une copie cohérente, prévoir une fenêtre de maintenance, restaurer sur hôte isolé, vérifier comptes synthétiques, groupes et historique, mesurer RPO/RTO. |

Pour le dossier RGPD, relever responsable, finalités, durées de conservation réellement configurées, localisation des copies et des journaux, sous-traitants et procédure d’effacement. Une suppression applicative, la révocation d’une session et l’expiration d’une sauvegarde sont trois opérations différentes. [Relations et code de persistance](../../apps/standalone/server.mjs) · [Contenu transmis en Push](../../apps/standalone/push.mjs)

## Calcul du coût

| Poste | Quantité à prendre | Calcul et source à associer |
|---|---|---|
| Compute Engine E2 custom | 4 vCPU et 6 Gio en europe-west4 ; H = heures facturables | H × (4 × prix vCPU/h + 6 × prix Gio RAM/h) en prenant les SKU custom et la devise du compte, ou H × prix complet de la VM. Une seule de ces deux méthodes. |
| Disque | Un disque de démarrage provisionné à 10 Gio vue invité ; vérifier taille et type tarifaires dans Compute | Taille facturée × prix unitaire du type par mois, proratisé ; ajouter les données de snapshots selon taille réellement stockée et région des copies. |
| IPv4 publique | Une IPv4 attachée observée ; nature de la réservation à confirmer | Heures d’adresse facturables × tarif de la catégorie d’adresse. Distinguer adresse attachée et éventuelle réservation inutilisée. |
| Trafic | Octets sortants facturables de la VM, ventilés par destination ; HTTPS/WS, Push et signalisation | Somme des Gio par tranche et destination × tarif correspondant. Le média P2P circule entre les postes ; un futur relais média changerait le calcul. |
| Télémétrie, DNS, reprise | Logs ingérés/conservés, séries payantes, DNS éventuellement facturé au gestionnaire de zone, snapshots et copies | Quantités facturées × tarifs applicables. Aucun forfait de LB, SFU, Cloud SQL ou seconde VM à imputer au service web sans ressource attribuée à ChatISEN. |
| Exploitation et total | Heures de maintenance et de restauration, tarif interne ; période et devise communes | TCO = infrastructure + coûts d’exploitation. Présenter brut, remises, crédits, taxes et net séparément. Les consommations réelles viennent de Billing. |

Exemple de dimensionnement **pour un mois hypothétique de 730 h continues** : 2 920 vCPU·h, 4 380 Gio RAM·h, un disque provisionné pour le mois et jusqu’à 730 h d’IPv4 attachée. Ce calcul fournit les quantités à tarif régional ; il ne constitue pas une facture. Laisser les prix et l’egress inconnus en cases à renseigner. [Prix Compute Engine](https://cloud.google.com/compute/vm-instance-pricing) · [Disques et adresses](https://cloud.google.com/compute/disks-image-pricing) · [Prix réseau](https://cloud.google.com/vpc/network-pricing) · [Calculatrice Google Cloud](https://cloud.google.com/products/calculator)

## Reproduire sur un environnement isolé

1. Relever les paramètres du plan de contrôle ci-dessous. Pour une réplique physique, recréer le type machine, la région, la zone, le subnet, la classe de disque, l’image Debian, la stratégie IP, les routes et les règles ciblées. Utiliser un environnement isolé avec ses propres adresses, domaine et secrets. Ne réutiliser aucune clé privée de l’environnement en service. Pour une reproduction au bit près de l’hôte, il faut en plus l’image/disque source et les versions des paquets.
2. Installer Debian 13, le runtime Node 24.14.1 au chemin attendu de l’unité et Caddy (version observée 2.6.2). Vérifier la somme publiée du runtime, disposer du checkout du SHA indiqué ci-dessus dans `/opt/chatisen/app` et des prérequis listés dans le runbook. Configurer le DNS du domaine de test vers l’IP de la réplique et les accès TCP/TLS correspondants. [Installation GCP](../../ops/gcp/README.md)
3. Sur cette réplique, exécuter `sudo bash /opt/chatisen/app/ops/gcp/install.sh <domaine-de-test>`. Le script installe la dépendance Web Push depuis le lockfile, prépare le compte et l’environnement, installe l’unité et Caddy. Ajouter séparément une redirection de domaine historique si elle fait partie du périmètre. Noter aussi la configuration de l’agent Ops et la politique de sauvegarde du projet. [Installateur](../../ops/gcp/install.sh) · [Unité](../../ops/gcp/chatisen.service) · [Caddy](../../ops/gcp/Caddyfile.template)
4. Tester DNS, redirection, certificat, `/healthz`, `/readyz`, lecteur et fichiers servis. Examiner `ss -lntu` sur la réplique pour distinguer loopback et entrée publique. Avec trois comptes synthétiques, créer le groupe depuis l’interface, envoyer puis relire l’historique après redémarrage de la réplique, retirer un membre. À deux, relever les octets audio et les images décodées dans les deux navigateurs. Avec consentement Push, fermer l’onglet et constater la notification. [Parcours UI](../../tests/e2e/standalone.spec.ts) · [Recette des autorisations](../../tests/security/standalone-realtime.test.mjs) · [Recette Web Push](../../tests/security/push-api.test.mjs)
5. Une réplique d’architecture peut repartir à vide. Reproduire aussi l’état métier requiert une sauvegarde autorisée et un essai de restauration. Relever le statut de chaque contrôle, le SHA et la date plutôt que d’utiliser des données personnelles pour la recette.

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
gcloud compute disks describe "$VM" --zone="$Z" --project="$P" --format='yaml(type,sizeGb,sourceImage,resourcePolicies,diskEncryptionKey.kmsKeyName)'
gcloud compute snapshots list --project="$P" --format='table(name,sourceDisk.basename(),storageLocations,status)'
```

Une commande sans permission reçoit le statut « non vérifié ». Une liste terminée sans erreur et vide permet de consigner l’absence dans son périmètre. Pour l’exposition réseau, comparer les règles aux besoins F02/F12 et aux sockets réellement liées, puis vérifier en préproduction les accès effectifs depuis les origines prévues.

### Prompt à transmettre à la conversation qui a accès à la console

> Vérifie en lecture seule le projet Google Cloud `project-fd23d3d9-a7e8-4002-a7a` (VM ChatISEN `instance-20261123-141011`, zone `europe-west4-a`, NIC `nic0`, IP `35.214.178.128`). Si tu n’as pas accès à la console, donne-moi un bloc Cloud Shell en lecture seule à exécuter. Retourne du texte copiable et daté en UTC. Pour chaque résultat, donne la commande ou l’écran source et indique « observé », « absent après vérification » ou « non vérifié ».
>
> 1. Compte les VM du projet, précise celles affectées à ChatISEN et le nom du sous-réseau de la NIC. Donne CIDR, routes applicables, type et taille du disque, image source, modèle de provisionnement et caractère réservé/éphémère de l’IP.
> 2. Relève **les règles effectives pour nic0**, y compris les règles VPC, les politiques héritées et les règles implicites pertinentes. Pour chaque ligne, donne nom, priorité, sens, action, protocoles/ports, CIDR source/destination, cibles, état et journalisation. Explique qui peut atteindre 22, 80, 443 (TCP/UDP), 27028 et les ports de l’agent. Précise si IAP ou OS Login est configuré et si SSH direct est aussi autorisé.
> 3. Quels forwarding rules, backend services, health checks, Cloud NAT, Cloud SQL, buckets, snapshots et politiques de sauvegarde sont réellement associés à ChatISEN ? Où résident le disque, les copies et les logs ? Vérifie la région du bucket de logs, sa rétention et l’ingestion de l’Ops Agent.
> 4. Si Billing est accessible, donne pour une période datée et une devise explicite le coût par poste (VM, disque, IPv4, sorties réseau, logs, sauvegardes), les quantités, les crédits et le total. Sinon, donne les quantités connues et le type de disque pour compléter la calculatrice régionale. Aucun changement de configuration et aucune transmission de clé privée, jeton, cookie, identité nominative, extrait de message ou secret.
