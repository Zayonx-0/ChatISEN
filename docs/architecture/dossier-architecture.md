# ChatISEN · Dossier d'architecture

**Version 2, 26 novembre 2026, après la seconde revue.** Ce document est le *Software Design Description* de ChatISEN. Il décrit une **architecture cible**. Chaque tableau distingue ce qui tourne, ce qui est codé mais non déployé et ce qui reste à faire (section « État réel et écarts »).

La version précédente (4 microservices) reste disponible : tag Git `archi-microservices-v1` (commit `5b81b48`) et planche [svg/26-cible-microservices.svg](svg/26-cible-microservices.svg). Elle sert maintenant de trajectoire d'évolution.

## Retours de la deuxième revue

| Remarque du professeur | Décision | Où la voir |
|---|---|---|
| Le schéma unique mélange déploiement, composants, données et flux | La planche globale reste. Des vues dédiées traitent chaque sujet : infrastructure, modules, MCD, contrats. | Vues 5 à 9 |
| Faire un bon monolithe modulaire, les microservices plus tard | Une application Fastify, une image, des modules isolés sans cycle. Les microservices deviennent une trajectoire V3. | Vue 7, section 3 |
| Ajouter la gestion de groupes | Module `groups` : conversations, membres, rôles et contrôle d'accès. | Vue 7 |
| Montrer le découpage : packages, couches ou hexagonal | Graphe de dépendances et anatomie hexagonale d'un module. | Vue 7 |
| Isoler les données par module (*database per service*) | Un schéma SQL par module, aucune FK entre schémas, accès par ports et événements. | Vues 4 et 8 |
| Fournir un MCD Merise séparé | MCD avec entités, associations et cardinalités. | Vue 8 |
| Écrire l'API avant le code, en OpenAPI, orientée ressources | `openapi.yaml` 3.1 : ressources au pluriel, verbes HTTP, schémas dans `components`. Vue UML générée. | Vue 9 |
| Décrire les topics et les messages de la WebSocket | `asyncapi.yaml` 3.0 : topics, sens, schéma de chaque message. | Vue 9 |
| WebSocket ou SSE | WebSocket conservée, SSE étudié et écarté avec ses raisons. | Section 5 |
| Authentification au niveau de Nginx | Session vérifiée à la passerelle par `auth_request`. Les droits restent dans le module `groups`. | Section 4 |
| Ne pas laisser passer en clair entre proxy et application | TLS rétabli du load balancer à Nginx. Nginx et l'API partagent le réseau Docker d'une même VM. | Vue 6, section 9 |
| TLS, certificats X.509, CSR, autorité de certification | Chaîne TLS et PKI documentées, avec les commandes. | Section 9 |
| Identifier les SPOF et la haute disponibilité (Kubernetes) | Tableau des points de défaillance. MIG autoréparant maintenant, GKE en évolution. | Section 10 |
| Prévoir le stockage des fichiers (Object Storage) | Cloud Storage en V2, envoi direct par URL signée. | Vues 5 et 6, section 7 |
| Faire apparaître Grafana, Prometheus et les journaux | VM de supervision et Cloud Logging pour la centralisation. | Vue 6, section 11 |
| Conteneurs et déploiement automatisé | Docker Compose sur chaque VM, images par digest, CD GitHub Actions. | Vue 6, section 12 |
| Placer les fonctions futures dès maintenant, en les marquant | Tout le périmètre est dessiné. Orange pointillé : V2. | Toutes les vues |
| Justifier chaque choix | Tableau des choix, alternatives et limites. | Choix techniques justifiés |

## Réponses aux retours de présentation

| Retour (première revue) | Décision visible | Preuve attendue |
|---|---|---|
| VPC, zone et VM | Projet GCP → VPC → sous-réseaux app, média et ops → VM zonales. Services managés hors sous-réseaux. | Inventaire IaC des sous-réseaux, tags et zones. |
| Client statique | React/Vite produit HTML, CSS, JS et sw.js, servis par Nginx sur les deux VM. | Même digest d'image dans les deux zones, deux sessions distinctes. |
| Sens du CD | GitHub Actions pousse les images puis déclenche migration et déploiement. La VM lit son image. | Exécution CD avec SHA, digest et migration. |
| STUN auto-hébergé | coturn en europe-west4, plus de STUN Google dans la cible. | Candidats srflx et relay obtenus avec coturn seul. |
| Stockage relationnel | PostgreSQL à la place du fichier JSON. | Écritures concurrentes puis restauration. |
| Web Push et service workers | Fournisseurs nommés, un même /sw.js installé dans chaque navigateur. | Remise onglet fermé et abonnement révoqué. |

## 1. Contexte et périmètre

ChatISEN est une messagerie web avec comptes, conversations privées et de groupe, temps réel, historique, appels audio et vidéo. Le périmètre attendu vient de la diapositive « Expected Project Scope » : un socle obligatoire, des extensions (toutes ne sont pas attendues) et des travaux d'investigation. L'architecture couvre **tous** ces points. Le développement, lui, se concentre sur le socle.

## Couverture du sujet attendu

| Attendu | Niveau | Conception retenue | État au 26/11 | Critère de recette |
|---|---|---|---|---|
| Authentication and user management | Socle | Module identity : comptes, Argon2id, sessions opaques, profils. Rôle admin en V2. | Démo en ligne (scrypt). apps/api : Argon2id. | Inscription, connexion, déconnexion, session révoquée refusée. |
| Private and group messaging | Socle | Modules groups et messaging. | Démo : privé, création de groupe, retrait. apps/api : gestion de groupe complète. | Un tiers ne lit aucun message. |
| Real-time delivery and history | Socle | WebSocket, journal numéroté, historique paginé. | Démo en ligne. apps/api : reprise par afterSeq. | Après coupure, aucun message perdu ni doublé. |
| One-to-one voice call | Socle | WebRTC pair-à-pair, signalisation par le serveur, ICE avec coturn. | Démo en ligne avec STUN Google, sans TURN. | Son reçu entre deux réseaux, y compris en relais forcé. |
| One-to-one video call | Socle | Même chemin que la voix, piste vidéo en plus. | Démo en ligne avec STUN Google, sans TURN. | Images décodées des deux côtés. |
| Basic deployment and monitoring | Socle | Docker Compose, CD, Prometheus, Grafana, Cloud Logging. | Démo : VM GCP, sondes et deux compteurs. Compose local avec Grafana. CD automatique après CI verte. | Déploiement reproductible, alerte visible sur panne. |
| Multi-participant video conferences | Extension V2 | SFU LiveKit auto-hébergé, jeton de salle court. | Admission expérimentale dans apps/api, désactivée par défaut. | Conférence à quatre, pistes reçues. |
| File sharing | Extension V2 | Cloud Storage, URL signées, métadonnées en SQL. | À faire. Table attachments présente. | Envoi et lecture réservés aux membres. |
| Screen sharing | Extension V2 | getDisplayMedia, remplacement de piste (à deux) ou piste publiée (SFU). | À faire. | L'écran partagé est reçu, l'arrêt rend la caméra. |
| Connection recovery | Extension | Reprise WebSocket par afterSeq. ICE restart pour les appels. | Reprise WebSocket codée. ICE restart à faire. | Changer de réseau pendant un appel et un échange. |
| Communication quality indicators | Extension V2 | getStats() toutes les 5 s, indicateur dans l'appel, envoi par lot. | Table quality_samples seule. | L'indicateur se dégrade sur réseau bridé. |
| More advanced access control | Extension | Rôles de groupe, rôle moderator et admin global, journal d'audit. | owner et member codés. Le reste à faire. | Matrice des droits testée route par route. |
| Improved scalability and availability | Extension | 2 VM sur 2 zones, API sans état durable, SQL HA, MIG autoréparant. | Cible. La démo a une seule VM. | Arrêt d'une VM : le service continue. |
| Performance and load testing | Investigation | k6 pour REST et WebSocket, lk load-test pour le SFU. | À faire. | Rapport avec p95, erreurs et ressources par palier. |
| Communication quality analysis | Investigation | Mesures getStats() comparées entre direct et relais, réseau bridé. | À faire. | Graphiques perte, gigue et RTT par scénario. |
| Infrastructure and resource optimisation | Investigation | Mesure CPU, mémoire, trafic TURN, puis dimensionnement et coût. | À faire. | Tableau coût et capacité avant et après. |
| Security testing | Investigation | Tests d'accès, pnpm audit, Trivy, OWASP ZAP sur banc. | Tests de sécurité partiels dans le dépôt. | Constats classés, corrigés ou assumés. |
| Data analysis | Investigation | Mesures anonymisées de qualité et d'usage, sans contenu. | Script d'amorce analysis/study.py, sans données. | Jeu de données décrit et analyse rejouable. |
| AI-based feature or proof of concept | Investigation | Détection d'anomalies de qualité d'appel (proposition). | Proposé. | Comparaison avec de simples seuils sur des pannes provoquées. |

### Priorités proposées

La diapositive demande un périmètre réaliste. Ordre conseillé après le socle : **1.** coturn à la place du STUN Google (corrige les appels entre réseaux fermés) ; **2.** reprise d'appel (ICE restart) et partage d'écran, peu coûteux en pair-à-pair ; **3.** indicateurs getStats(), qui alimentent aussi l'analyse de qualité, l'analyse de données et la preuve de concept IA ; **4.** fichiers ; **5.** conférences. Les tests de charge et de sécurité se mènent en parallèle.

## 2. Les vues de l'architecture

| Vue du lecteur | Question à laquelle elle répond |
|---|---|
| 1 à 3 · C4 contexte, conteneurs, composants | Qui utilise le système, quels exécutables, quelles responsabilités ? |
| 4 · MLD | Quelles tables, dans quel schéma, avec quelles clés ? |
| 5 · Architecture globale | La synthèse à présenter en une planche, avec la couverture du sujet. |
| 6 · Infrastructure et déploiement | Où tourne chaque conteneur, par quels ports, avec quel TLS ? |
| 7 · Modules et dépendances | Comment le code est découpé, et pourquoi sans cycle ? |
| 8 · MCD Merise | Quels objets métier et quelles cardinalités ? |
| 9 · Contrats REST et temps réel | Quelles ressources, quels messages, quelle séquence ? |

## 3. Architecture applicative : un monolithe modulaire

**Une seule application** Node.js 24, TypeScript et Fastify 5, une image Docker, un processus par VM. Le découpage est **logique** : chaque module est un package avec une façade publique.

Pourquoi pas des microservices maintenant : le projet dure trois semaines, l'équipe est petite, et quatre services ajouteraient quatre déploiements, des appels réseau, des pannes partielles et des transactions réparties sans gain mesuré. La décision d'origine du dépôt le disait déjà ([ADR 001](../adr/001-choix.md)). Pourquoi des modules stricts : chacun pourra devenir un service en gardant son contrat et son schéma.

### Anatomie d'un module

`modules/<nom>/` contient `domain` (règles, sans Fastify ni SQL), `application` (cas d'usage), `ports` (interfaces), `adapters/in` (routes, handlers, consommateurs d'événements) et `adapters/out` (SQL du module, services externes). C'est une architecture hexagonale : le domaine ne dépend de rien d'extérieur.

### Règles de dépendance

1. Un module n'importe que la façade `index.ts` d'un module plus bas dans le graphe.
2. Aucune requête SQL sur le schéma d'un autre module.
3. Pour informer un module situé plus haut, publier un événement dans l'outbox.
4. Le noyau `platform/` (HTTP, WebSocket, journal, outbox, pool, logs) ne contient aucune règle métier.
5. À ajouter en CI : un contrôle des imports (cycles interdits) et des schémas SQL cités par chaque module.

## Modules et propriété des données

| Module | Responsabilité | Importe | Schéma et tables | Port public | Périmètre |
|---|---|---|---|---|---|
| identity | Comptes, profils, mots de passe, sessions, rôle global. | Aucun | identity : users, sessions | SessionVerifier, UserDirectory | MVP |
| groups | Conversations privées et de groupe, membres, rôles, contrôle d'accès. | identity | groups : conversations, members, creation_commands | AccessPolicy, ConversationDirectory | MVP |
| files | Métadonnées, droits, URL signées. | groups | files : files | FileCatalog | V2 |
| messaging | Messages, ordre, historique, rattrapage. | groups, files | messaging : messages | MessageTimeline | MVP |
| calls | Cycle d'appel, signaux, identifiants ICE, jeton de salle. | groups | calls : calls, participants, media_jobs, webhook_receipts | CallRegistry | MVP, conférence V2 |
| quality | Mesures getStats(), indicateurs, export. | calls | quality : samples | QualityReport | V2 et investigation |
| notifications | Abonnements Web Push, envoi, retries. | groups, identity | notifications : push_subscriptions, push_deliveries | PushSubscriptions | MVP+ |

Le journal d'événements et l'outbox (schéma `realtime` : streams, events, outbox) appartiennent au noyau. `groups` et `messaging` y écrivent dans leur propre transaction. `notifications` y lit `message.created` et `call.invitation` : `messaging` et `calls` ne le connaissent pas.

**Dette actuelle à rembourser** : `apps/api` est organisé en `identity/`, `chat/` et `calls/`, mais il partage un seul `PostgresRepository`, `calls/` lit directement les tables des conversations, membres et sessions, et les migrations utilisent un schéma unique avec des FK entre domaines. Le passage à la cible : extraire `groups` de `chat/`, créer les ports, puis déplacer les tables par migrations rétrocompatibles.

**Limite assumée** : dans le monolithe, un contrôle d'accès peut participer à la même transaction que l'écriture (verrou sur le membre pendant l'envoi). Après un découpage en services, ce contrôle deviendrait un appel réseau et la cohérence serait à terme. Il faudrait alors revoir la révocation d'un membre.

## 4. Interfaces, écrites avant le code

- **REST** : [api/openapi.yaml](api/openapi.yaml), OpenAPI 3.1. Ressources au pluriel, identifiants dans le chemin, verbes HTTP, schémas dans `components`, erreurs `{code, message, requestId}`.
- **Temps réel** : [api/asyncapi.yaml](api/asyncapi.yaml), AsyncAPI 3.0. OpenAPI ne décrit pas les messages d'une WebSocket ; AsyncAPI est le format prévu pour cela.
- **Lecture** : la vue 9 montre l'UML des ressources et des schémas, générés depuis `openapi.yaml`.
- **Usage prévu** : générer les types du front et du back, importer dans Bruno ou Postman, ajouter en CI un contrôle des réponses réelles.

Écarts voulus avec les routes actuelles : `POST /sessions` au lieu de `/auth/login`, `POST /users` au lieu de `/auth/register`, `/groups/{groupId}/members/{userId}` avec `PUT` et `DELETE` (le transfert de propriété et le départ deviennent des opérations sur la ressource membre), `PATCH /calls/{callId}` au lieu de `/end`. La colonne `x-today` du contrat donne la correspondance. Le contrat testé aujourd'hui reste [packages/contracts](../../packages/contracts/schemas/openapi.json) : la bascule se fera route par route.

## Authentification d'un utilisateur

L'identité est locale à ChatISEN, sans fournisseur externe.

1. Le navigateur envoie l'identifiant et le mot de passe à `POST /api/v1/sessions` en HTTPS.
2. Le module `identity` compare le mot de passe au hash **Argon2id** (19 456 Kio, 2 passes, parallélisme 1).
3. Il crée un jeton aléatoire de **24 h**. La table `identity.sessions` n'en garde que l'empreinte **SHA-256**.
4. Il renvoie le cookie `__Host-chatisen` (`Secure`, `HttpOnly`, `SameSite=Lax`, chemin `/`) et un jeton **CSRF** (HMAC) exigé sur les écritures.
5. À chaque requête suivante, **Nginx** interroge `/internal/auth/verify` (`auth_request`). Une session invalide est refusée avant d'atteindre le métier.
6. Nginx transmet `X-User-Id` à l'API en **écrasant** toute valeur envoyée par le client. L'API n'est joignable que depuis Nginx sur le réseau Docker.
7. L'autorisation sur l'objet (membre de la conversation, rôle) reste dans le module `groups`.
8. La déconnexion révoque la session en base et efface le cookie. Une WebSocket ouverte est revérifiée avant chaque livraison (déjà le cas dans apps/api).

```nginx
location /api/ {
    auth_request     /_auth;
    auth_request_set $chat_user $upstream_http_x_user_id;
    proxy_set_header X-User-Id  $chat_user;   # remplace la valeur du client
    proxy_pass       http://api:3000;
}
location = /_auth {
    internal;
    proxy_pass              http://api:3000/internal/auth/verify;
    proxy_pass_request_body off;
    proxy_set_header        Content-Length "";
    proxy_set_header        X-Original-Method $request_method;  # inscription et connexion restent publiques
    proxy_set_header        X-Original-URI    $request_uri;
}
```

Extrait de principe, à compléter avec l'`Upgrade` WebSocket et à tester. Avant de limiter le débit des connexions, Nginx doit retrouver l'adresse du client dans `X-Forwarded-For`, sinon il ne voit que le load balancer. Aucune limite de débit n'existe aujourd'hui dans le code.

Pourquoi garder Nginx plutôt qu'ajouter Kong ou APISIX : il est déjà là et `auth_request` suffit. Dans le monolithe, le gain est surtout la préparation du découpage ; le coût est une sous-requête par appel. Keycloak ou OAuth2 se justifieraient avec un SSO d'école ou plusieurs applications.

## Contrôle d'accès

| Action | member | moderator (V2) | owner | admin global (V2) |
|---|---|---|---|---|
| Lire, écrire, appeler dans la conversation | Oui | Oui | Oui | Non, sauf s'il est membre |
| Retirer un membre simple | Non | Oui | Oui | Non |
| Ajouter un membre, renommer le groupe | Non | Non | Oui | Non |
| Nommer un moderator, transférer la propriété | Non | Non | Oui | Non |
| Désactiver un compte, lire le journal d'audit | Non | Non | Non | Oui |

Aujourd'hui : `owner` et `member` dans apps/api. L'administrateur ne lit pas les conversations par son rôle. Un accès direct à la base reste possible pour qui administre le projet GCP : il est à limiter par IAM et à journaliser. Il n'y a pas de chiffrement de bout en bout des messages.

## 5. Temps réel

**Une seule WebSocket par onglet**, découpée en topics : `conversation:{id}` (abonnement explicite) et `user:{id}` (appels et changements de liste). Les écritures passent par REST.

Mécanismes **déjà codés** dans apps/api : numéro `seq` croissant par conversation, `subscribe` avec `afterSeq` pour reprendre après une coupure, `ready` annonçant un heartbeat de 30 s, `ping` et `pong`, `resync_required` quand un client est trop lent, revérification de la session et du membre. Les deux réplicas sont réveillés par `LISTEN/NOTIFY` de PostgreSQL : aucun broker n'est nécessaire.

**WebSocket ou SSE.** SSE serait possible : les écritures sont déjà en REST, il est plus léger et reste du HTTP simple. La WebSocket est conservée car elle est déjà codée et testée avec reprise, et le client s'abonne, acquitte et se désabonne sur la même connexion. SSE deviendrait intéressant si le client n'envoyait plus rien sur ce canal. La démo expose d'ailleurs les deux ; son interface utilise la WebSocket.

**Deux canaux à ne pas confondre.** La WebSocket sert quand l'onglet est ouvert. **Web Push** sert quand il est fermé ou en arrière-plan : il passe par le service Push du navigateur, pas par la WebSocket.

## Service worker /sw.js

**Les service workers « A » et « B » désignent le même fichier `/sw.js`**, installé séparément dans chaque navigateur. Chacun possède son abonnement, son endpoint et ses clés.

| Dans `/sw.js` | Ce qui s'exécute |
|---|---|
| `install` et `activate` | `skipWaiting()` puis `clients.claim()` pour prendre la main sans rechargement. |
| `push` | Lit `type`, `conversationId`, `messageId` et `senderName`. Reste muet si une fenêtre du chat est visible, sinon appelle `showNotification()`. |
| `notificationclick` | Met au premier plan la fenêtre existante ou en ouvre une sur la conversation. |
| `pushsubscriptionchange` | Se réabonne avec la même clé VAPID et envoie le nouvel abonnement au serveur. |

**À reprendre pour la cible :** le worker actuel appelle `/api/auth/me` et `/api/push/subscriptions`. Il doit passer à `/api/v1/users/me` et `/api/v1/push-subscriptions`. Le champ `senderName` est une donnée transmise (chiffrée) : à retirer ou à assumer.

## Web Push dans les deux navigateurs

Le serveur utilise la bibliothèque **web-push** : il signe l'envoi avec **VAPID**, chiffre le contenu, fixe un TTL de 120 s et supprime l'abonnement sur réponse 404 ou 410. [Code de référence](../../apps/standalone/push.mjs) · [Worker](../../apps/web/public/sw.js)

| Fournisseur | Endpoint accepté dans le code de référence | Portée |
|---|---|---|
| Google Firebase Cloud Messaging (FCM) | fcm.googleapis.com | Dépend du navigateur et de l'abonnement. |
| Mozilla Push Service | updates.push.services.mozilla.com | Dépend du navigateur et de l'abonnement. |
| Apple Web Push | web.push.apple.com et sous-domaines de push.apple.com | Dépend de la plateforme et de ses autorisations. |
| Windows Push Notification Service | Sous-domaines de notify.windows.com | Accepté par le code. Vérifier le navigateur en recette. |

## 6. Appels et média

- **À deux : pair-à-pair.** Le média va d'un navigateur à l'autre, ou par le relais TURN quand le direct échoue. Le serveur ne fait que la signalisation : `POST /calls/{callId}/signals` à l'aller, topic `user:{id}` au retour. Les VM applicatives ne portent aucun flux audio ou vidéo.
- **ICE** est la méthode suivie par les navigateurs pour trouver un chemin (candidats host, srflx, relay). **STUN** donne l'adresse vue de l'extérieur. **TURN** relaie. **coturn** est le serveur qui assure STUN et TURN. **LiveKit** est le serveur média (SFU).
- **Conférence (V2) : SFU.** En pair-à-pair à plusieurs, chaque navigateur enverrait un flux à chaque autre. Le SFU reçoit un flux par émetteur et le redistribue.
- **Chiffrement.** WebRTC chiffre en DTLS-SRTP. À deux, les clés restent chez les navigateurs, et le relais TURN ne peut pas déchiffrer. Cela suppose une signalisation honnête, puisque le serveur transporte les empreintes. Avec un SFU, le serveur média termine le chiffrement : l'E2EE de LiveKit serait une option à activer.
- **Partage d'écran (V2)** : `getDisplayMedia()`, puis `replaceTrack()` à deux, ou publication d'une piste vers le SFU.
- **Reprise (V2)** : sur état `disconnected` ou `failed`, `restartIce()` puis nouvelle offre par la signalisation.
- **Qualité (V2)** : `getStats()` toutes les 5 s (pertes, gigue, RTT, débit, type de candidat), indicateur à l'écran, envoi par lot.

## STUN, TURN et résidence

- La démo annonce `stun:stun.l.google.com:19302` et **aucun TURN** : un appel entre deux réseaux fermés peut échouer. La région de traitement et le niveau de service de ce point public n'ont pas été établis.
- La cible utilise **coturn auto-hébergé** en europe-west4-a : région connue, données et journaux maîtrisés. Le coût est celui d'une VM, d'une IPv4, du disque, du trafic relayé et de l'exploitation. Il est à chiffrer ; un relais coûte du trafic sortant en proportion des appels relayés. [Tarifs réseau](https://cloud.google.com/vpc/network-pricing)
- **Identifiants courts** : mécanisme `use-auth-secret` de coturn. L'API calcule un nom d'utilisateur daté et un HMAC ; le secret ne quitte pas le serveur.
- **Protection du relais** : interdire les pairs en adresses privées, locales et de lien local (`denied-peer-ip`, dont `169.254.0.0/16` qui contient le service de métadonnées des VM), interdire le multicast, fixer des quotas. Sans cela, un relais TURN permet d'atteindre le réseau interne.
- Le port 5349 suppose que le réseau du client le laisse sortir. Un second nom DNS est à demander à l'ISEN.
- RGPD : l'auto-hébergement ne suffit pas à lui seul. DNS, load balancer global, GitHub et fournisseurs Push ont leurs propres traitements à documenter.

## 7. Données

Le **MCD** (vue 8) décrit les objets métier. Le **MLD** (vue 4) les répartit dans un schéma par module. Au niveau conceptuel les associations traversent les modules ; au niveau logique elles deviennent des **références par UUID sans clé étrangère**. L'intégrité passe par le module propriétaire (port, puis événement comme `member_removed`). C'est le prix payé pour pouvoir donner un jour sa base à chaque service.

- **PostgreSQL** : données relationnelles, transactions (numéro, message, événement et outbox ensemble), contraintes d'unicité contre les doublons, `LISTEN/NOTIFY` pour le temps réel.
- **Pas de base NoSQL** : aucun besoin de schéma libre, et les transactions comptent plus que la souplesse. Le contenu des événements utilise déjà `jsonb`.
- **Fichiers (V2) dans un Object Storage** (Cloud Storage, équivalent de S3 ou Blob Storage) : 1. `POST /conversations/{id}/files` vérifie le membre, le type et la taille ; 2. l'API rend une **URL signée** courte ; 3. le navigateur envoie les octets **directement** au bucket ; 4. `PATCH /files/{id}` confirme, et le serveur contrôle l'objet ; 5. un message référence `fileId`. Les gros envois ne passent pas par les VM applicatives. Le bucket est privé. Un transfert pair-à-pair ne conserverait pas d'historique et exigerait les deux personnes en ligne. Le plafond de 25 Mio du contrat est une proposition.
- **Aujourd'hui** : le schéma SQL garde les pièces jointes en `bytea` (5 Mio au plus), et seule une ancienne route d'apps/api accepte un envoi, en mémoire.

## 8. Infrastructure et déploiement

La vue 6 montre les machines et les conteneurs. Le sous-réseau média existe pour isoler des machines qui ont une **IPv4 publique** et un profil réseau différent : coturn et, en V2, les SFU. Il ne sert pas au stockage des fichiers.

## Composants et placement

| Composant | Implantation | Rôle et critère de sortie |
|---|---|---|
| Load balancer | External Application Load Balancer global, certificat géré. | HTTPS et WSS 443, redirection 80, backends en HTTPS 8443. Retrait d'un backend défaillant. |
| Réseau | VPC chatisen-cible : app 10.40.10.0/24, média 10.40.20.0/24, ops 10.40.30.0/24. PSA 10.40.32.0/20 proposée. | VM app sans IP publique, sortie par Cloud NAT. |
| VM applicatives | MIG régional de 2 VM Debian 13, zones a et b. Docker Compose : nginx, api, cloud-sql-proxy, node-exporter. | Mêmes digests sur les deux VM. Une VM en échec est recréée. |
| API | Monolithe modulaire Fastify, port 3000 non publié, /metrics sur 9091. | Aucun état durable local : reprise sur l'autre VM par session SQL et curseur. |
| PostgreSQL | Cloud SQL PostgreSQL 17 régional HA, IP privée. | Sauvegardes et PITR vérifiés par une restauration. |
| coturn | VM dédiée, IPv4 réservée, certificat public. | STUN et TURN UDP 3478, TLS 5349. Candidats srflx et relay observés. |
| Supervision | VM ops : Prometheus et Grafana par Compose, accès IAP. | Tableau et alerte sur API indisponible. |
| Journaux | Ops Agent vers Cloud Logging. | Recherche par requestId, rétention et région vérifiées. |
| SFU (V2) | 2 VM LiveKit, une par zone. | Une salle sur un nœud à la fois. Reconnexion si un nœud tombe. |
| Redis (V2) | Memorystore Standard, IP privée, TLS et AUTH. | Coordination des SFU. Inutile pour le MVP. |
| Fichiers (V2) | Bucket Cloud Storage privé europe-west4. | URL signées courtes, droits revérifiés. |
| Livraison | GitHub Actions, OIDC et Workload Identity Federation, Artifact Registry. | Aucune clé JSON stockée. |

## Pare-feu de la cible

| Règle | Sources et cible | Ports et contrôle | Recette |
|---|---|---|---|
| Entrée LB (hors VPC) | Internet → frontend géré. | TCP 443, TCP 80 redirigé. | TLS, WSS et redirection. |
| FW1 | Proxys et sondes GCP 35.191.0.0/16 et 130.211.0.0/22 → VM app. | TCP 8443 seulement. | Backends sains, accès direct refusé. |
| FW2 | IAP 35.235.240.0/20 → VM ; vers la VM de supervision pour Grafana. | TCP 22, et 3000 sur la supervision. | Accès par IAP, refus depuis Internet. |
| FW3 | VM de supervision → VM app et média. | TCP 9091, 9100, 9641 (coturn), 6789 (LiveKit, V2). | Cibles Prometheus à l'état up. |
| FW4 | Internet → coturn. | UDP 3478 et TCP 5349, allocations authentifiées. | Identifiant expiré refusé. |
| FW5 | Internet → coturn, relais. Les pairs sont des navigateurs. | UDP 49160–49200, pairs privés interdits dans coturn. | Appel en relais forcé réussi ; relais vers 10.0.0.0/8 refusé. |
| FW6 (V2) | Internet → SFU ; sous-réseau app → SFU. | UDP 7882, TCP 7881 ; TCP 7880 depuis l'app seulement. | API du SFU injoignable depuis Internet. |
| Tout autre entrant | Toute source → toutes les VM. | Refusé. Ni SSH public, ni 5432, ni 3000, ni 9090. | Balayage de ports externe. |

Pour la signalisation des conférences, le client passe par Nginx (`/livekit/`) vers le port 7880 privé. [Filtres GCP](https://cloud.google.com/load-balancing/docs/https) · [Ports LiveKit](https://docs.livekit.io/transport/self-hosting/ports-firewall/)

## Flux de la cible

| Flux | Origine → destination | Protocole, données et responsabilité | Vérification |
|---|---|---|---|
| T01 · DNS | Navigateurs → DNS de l'ISEN | Nom web vers le LB, nom TURN vers coturn. | Résolution depuis deux réseaux. |
| T02 · Entrée | Navigateurs → load balancer | HTTPS et WSS TCP 443, 80 redirigé. | Certificat et handshake WSS. |
| T03 · Distribution | Load balancer → Nginx a et b | HTTPS 8443 sur le réseau privé, sondes /healthz-edge. | Backend arrêté retiré. |
| T04 · Statique | Nginx → navigateurs | Build React et /sw.js. | Même build sur les deux VM. |
| T05 · Routage | Nginx → API | REST /api/v1 et upgrade WebSocket sur le réseau Docker. | Port 3000 injoignable hors de la VM. |
| T06 · Authentification | Navigateur → identity, puis Nginx → identity | Argon2id, session opaque, cookie, CSRF, puis auth_request. | Session reconnue sur l'autre VM, refusée après déconnexion. |
| T07 · Écriture | messaging → PostgreSQL | Clé client, droit, numéro, message, événement et outbox en une transaction. | Envois concurrents sans doublon. |
| T08 · Temps réel | API a et b → navigateurs | LISTEN/NOTIFY, lecture du journal, WSS par topics, reprise afterSeq. | Deux clients sur deux VM, coupure sans trou. |
| T09 · Données | API → Cloud SQL | cloud-sql-proxy, mTLS, IP privée. | Base injoignable depuis Internet. |
| T10 · Signalisation | Navigateur → calls → correspondant | Offre, réponse et candidats : REST à l'aller, topic user au retour. | Seuls les deux participants reçoivent les signaux. |
| T11 · Média direct | Navigateur A ↔ navigateur B | WebRTC, ICE, DTLS-SRTP, sans passer par les VM applicatives. | Paire ICE sélectionnée de type host ou srflx. |
| T12 · STUN et TURN | Navigateurs ↔ coturn | STUN et TURN UDP 3478, TLS 5349, relais UDP 49160–49200. | srflx obtenu, puis appel en relais forcé. |
| T13 · Conférence (V2) | API → SFU ; navigateurs ↔ SFU ; SFU ↔ Redis | Jeton de salle court, média UDP 7882 ou TCP 7881, coordination Redis. | Conférence à quatre. |
| T14 · Envoi Push | notifications → fournisseur | HTTPS 443 via Cloud NAT, VAPID, contenu chiffré, TTL 120 s. | Droits, expiration et retries. |
| T15 · Remise Push | Fournisseur → service worker | Réveil de /sw.js, showNotification, clic vers le fil. | Notification onglet fermé. |
| T16 · Exploitation | Ops et Admin → GCP | IAP et OS Login pour SSH et Grafana, console avec MFA. | Refus hors IAM. |
| T17 · Observabilité | VM → Prometheus et Cloud Logging | Métriques collectées toutes les 15 s, journaux centralisés. | Alerte sur API arrêtée. |
| T18 · Images | GitHub Actions CI → Artifact Registry | HTTPS, identité fédérée, images par digest. | Commit relié au digest. |
| T19 · Déploiement | GitHub Actions CD → API GCP | Migration par Cloud Run Job, puis mise à jour progressive du MIG. | Retour au digest précédent. |
| T20 · Lecture d'image | VM → Artifact Registry | Pull par digest avec un compte de service lecteur. | Digest effectif comparé. |
| T21 · Reprise | Cloud SQL → sauvegardes et restauration | PITR, restauration isolée. | RPO et RTO mesurés. |
| T22 · Fichiers (V2) | Navigateur ↔ Cloud Storage | URL signée par l'API, octets envoyés et lus directement en HTTPS. | URL expirée et non-membre refusés. |

## 9. TLS et PKI

Un certificat **X.509** lie un nom (`CN`, surtout `subjectAltName`) à une clé publique, et il est signé par une **autorité de certification (AC)**. Pendant le handshake TLS, le serveur présente le certificat et **prouve qu'il détient la clé privée** par une signature. Le navigateur vérifie la chaîne jusqu'à une AC qu'il connaît, le nom et les dates. Les deux côtés établissent ensuite des clés **symétriques** (échange ECDHE) qui chiffrent les données.

- **Démo en ligne** : Caddy obtient son certificat de **Let's Encrypt** par le protocole ACME. Relevé du 26/11 : `CN=ia-pple.isen.fedyna.fr`, émetteur Let's Encrypt, valide jusqu'au 23/02/2027. Ce n'est **pas** un certificat auto-signé.
- **Banc Compose local** : certificat auto-signé pour `localhost`.
- **Cible** : certificat public géré par GCP sur le load balancer ; certificat public ACME sur coturn ; certificat interne auto-signé entre le load balancer et Nginx. Ce load balancer chiffre vers ses backends sans vérifier leur certificat par défaut. [Chiffrement vers les backends](https://cloud.google.com/load-balancing/docs/ssl-certificates/encryption-to-the-backends)

Demande manuelle à une AC (OpenSSL 3). ACME automatise ces mêmes étapes, avec en plus la preuve que l'on contrôle le nom.

```bash
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out turn.key
```

```bash
openssl req -new -key turn.key -subj "/CN=turn.example.test" -addext "subjectAltName=DNS:turn.example.test" -out turn.csr
```

Le fichier `turn.csr` est la **CSR au format PKCS#10** : elle contient la clé publique et le nom, signés avec la clé privée. L'AC renvoie le certificat X.509. La clé privée ne quitte jamais le serveur et ne va pas dans Git. Pour un essai sans AC, on signe soi-même :

```bash
printf 'subjectAltName=DNS:turn.example.test\n' > san.ext && openssl x509 -req -in turn.csr -signkey turn.key -days 30 -extfile san.ext -out turn.crt
```

PKCS#12 est autre chose : un conteneur protégé qui regroupe une clé privée et ses certificats.

## 10. Disponibilité et montée en charge

Un **SPOF** est un élément dont la panne arrête une fonction. La démo actuelle en est un à elle seule : une VM, un processus, un fichier.

## Points de défaillance uniques

| Élément | Démo aujourd'hui | Cible | Effet d'une panne dans la cible | Parade ou évolution |
|---|---|---|---|---|
| Serveur applicatif | SPOF : une VM, un processus | 2 VM sur 2 zones | Les sockets de la VM se reconnectent sur l'autre. | MIG autoréparant, autoscaling possible. |
| Base de données | SPOF : fichier JSON sur un disque | Cloud SQL HA | Bascule automatique, courte interruption. | PITR contre l'erreur humaine. Panne de région non couverte. |
| STUN et TURN | STUN Google, aucun TURN | Une VM coturn : **SPOF restant** | Les nouveaux appels qui ont besoin de STUN ou du relais échouent. | Deuxième coturn en zone b, les deux dans iceServers. |
| Entrée web | IP de la VM | Load balancer géré | Service géré réparti. | Aucune action propre au projet. |
| DNS de l'ISEN | SPOF externe | SPOF externe | Nom introuvable. | Assumé et documenté. |
| SFU (V2) | Absent | 2 nœuds | La salle du nœud perdu doit se reconnecter. | Redis réattribue les nouvelles salles. |
| Redis (V2) | Absent | Memorystore Standard | Courte coupure de coordination. | Réplica géré. |
| Supervision | Sans objet | Une VM : SPOF sans effet métier | Plus de tableaux, le service continue. | Sonde externe sur /readyz. |
| GitHub | Sans objet | SPOF de livraison seulement | Aucun déploiement possible. | Images précédentes conservées dans le registre. |

Pendant une panne du serveur, un appel **direct déjà établi** peut continuer à transporter le média, mais la messagerie et la signalisation s'arrêtent, et la démo marque les appels terminés à son redémarrage.

**Kubernetes (GKE).** Il gérerait des pods, leurs sondes, leur remplacement et leur autoscaling. Le **MIG** apporte déjà au niveau des VM le remplacement d'une instance en échec et la répartition sur deux zones, sans cluster à apprendre. GKE devient pertinent avec plusieurs services à déployer séparément : c'est la trajectoire V3, avec une passerelle d'API (Kong ou APISIX) et une base par service. La planche de la version précédente en montre le découpage en services.

## 11. Observabilité

- **Métriques** : Prometheus collecte l'API, les VM (node-exporter), coturn et, en V2, LiveKit. Grafana affiche et alerte. Le dépôt contient déjà cette configuration pour le banc local.
- **À instrumenter** : latence et erreurs HTTP, connexions WebSocket, délai entre envoi et livraison, âge de l'outbox, échecs Push, appels établis directs ou relayés.
- **Journaux** : logs JSON avec `requestId`, centralisés dans Cloud Logging par l'Ops Agent. Cela joue le rôle d'un serveur Syslog central. Ni mot de passe, ni cookie, ni contenu de message dans les logs.
- **Sondes** : `/healthz` (processus) et `/readyz` (base). `/metrics` ne doit pas être public.

## 12. CI/CD

1. **CI** sur chaque pull request : types, build, tests, Playwright (en place) ; à ajouter : contrôle des dépendances entre modules, validation des deux contrats, `pnpm audit`, Trivy.
2. **Images** construites une fois, poussées dans Artifact Registry et désignées par digest.
3. **CD de la démo** (en place) : chaque minute, la VM compare son commit à la tête de `main` et ne le déploie que si la CI a réussi. Copie des données avant redémarrage, contrôle de santé, retour arrière automatique, résultat publié dans `/version.json` et repris par le job GitHub « Déploiement en production ». Aucun secret côté GitHub. Détails dans `ops/gcp/README.md`.
4. **CD de la cible** (à faire) sur environnement protégé avec approbation : OIDC sans clé stockée, migration par Cloud Run Job, nouveau modèle d'instance, mise à jour d'une VM puis de l'autre, retour arrière sur le digest précédent. Chaque VM démarre ses conteneurs avec Docker Compose.
5. Les migrations restent rétrocompatibles le temps que deux versions cohabitent.

## 13. Travail d'investigation

| Sujet | Méthode et outil | Mesures | Preuve attendue |
|---|---|---|---|
| Charge et performance | k6 : connexions, messages et WebSocket par paliers. lk load-test pour le SFU. | p95 d'envoi à livraison, erreurs, CPU, mémoire, connexions SQL. | Rapport par palier avec le point de saturation. |
| Qualité des communications | getStats() en direct puis en relais forcé, réseau dégradé avec tc netem. | Pertes, gigue, RTT, débit, type de candidat. | Courbes comparées par scénario. |
| Optimisation des ressources | Mesures sous charge, puis changement d'un paramètre à la fois. | Capacité par vCPU, trafic relayé, coût mensuel estimé. | Tableau avant et après, taille de VM retenue. |
| Sécurité | Tests d'accès entre comptes, OWASP ZAP sur banc, pnpm audit, Trivy. | Constats par gravité. | Liste des corrections et risques assumés. Premiers constats : /metrics public sur la démo, aucune limite de débit. |
| Analyse de données | Export anonymisé des mesures et de l'usage, script Python rejouable. | Répartition, corrélations, intervalles de confiance. | Jeu de données décrit et résultats reproductibles. |
| Preuve de concept IA | Détection d'anomalies sur des fenêtres de mesures (par exemple Isolation Forest) contre une référence à seuils. | Précision et rappel sur des dégradations provoquées et étiquetées. | Décision argumentée : le modèle fait mieux que les seuils, ou non. |

L'IA proposée n'utilise **ni message ni média** : seulement des mesures réseau. Les essais de charge et de sécurité se font sur un banc isolé, jamais sur la démo du jury sans accord.

## Choix techniques justifiés

| Choix | Alternatives étudiées | Raison | Limite ou moment de revoir |
|---|---|---|---|
| Monolithe modulaire | Microservices, Kubernetes | Un déploiement, des transactions simples, adapté à trois semaines. | Équipes ou charges différentes par module. |
| React et Vite | Preact, JavaScript sans framework | Écosystème large, client TypeScript déjà écrit (apps/web/src). Build statique. | Preact si le poids du bundle devient mesurable. La démo en ligne utilise encore un client sans framework. |
| TypeScript et Node.js | Java et Spring | Même langage au front et au back, types partageables, E/S asynchrones adaptées à de nombreuses sockets. | Calcul intensif : à sortir de la boucle d'événements. |
| Fastify | Express, NestJS | Validation par schémas, plugins pour isoler les modules, déjà en place. | NestJS imposerait plus de structure. |
| PostgreSQL | MongoDB, fichier JSON | Relations, transactions, contraintes, LISTEN/NOTIFY. | Partitionnement ou cache si l'historique grossit beaucoup. |
| Object Storage pour les fichiers | bytea en base, base documentaire, pair-à-pair | Adapté aux gros objets, envoi direct, base légère. Remplace le choix bytea de l'ADR 001, limité à 5 Mio. | Ajoute une cohérence base et objet à nettoyer. |
| WebSocket multiplexée | SSE, polling | Bidirectionnelle, reprise codée et testée. | SSE si le client n'envoie plus rien sur le canal. |
| REST et OpenAPI | gRPC, SOAP | Orienté ressources, natif pour le navigateur, outillage. | gRPC entre services en V3 si utile. |
| AsyncAPI | Documentation libre | Décrit topics et messages dans un format outillé. | Validation en CI à ajouter. |
| Sessions opaques en base | JWT | Révocation immédiate, rien d'exploitable stocké en clair. | Une lecture par requête, à mettre en cache si mesuré. |
| Nginx avec auth_request | Auth dans chaque module, Kong, APISIX, Keycloak | Fonction transverse en un point sans nouvelle brique. | Passerelle dédiée avec plusieurs services, Keycloak avec un SSO. |
| Pair-à-pair à deux, SFU à plusieurs | Tout par SFU, maillage, MCU | Aucun média sur les VM à deux ; débit maîtrisé en conférence. | Qualité côté serveur et enregistrement demanderaient le SFU. |
| LiveKit | mediasoup, Jitsi | SFU prêt à héberger, SDK web, jetons par salle. | Dépendance à son protocole. |
| coturn auto-hébergé | STUN Google, TURN managé | Région et données maîtrisées, STUN et TURN ensemble. | Exploitation à notre charge, SPOF tant qu'unique. |
| MIG et Docker Compose | GKE, Cloud Run | Simple à comprendre, autoréparation, proche du banc local. | GKE avec les microservices. |
| Prometheus, Grafana et Cloud Logging | Cloud Monitoring seul, serveur Syslog | Déjà configurés dans le dépôt ; journaux centralisés gérés. | Une VM à maintenir. |
| GitHub Actions | Jenkins, Cloud Build | Au plus près du dépôt, OIDC vers GCP. | Dépendance à GitHub. |

## 14. État réel et écarts

Trois choses existent et ne doivent pas être confondues.

| | Démo en ligne | `apps/api` et `apps/web/src` (dépôt) | Cible |
|---|---|---|---|
| Serveur | Node sans framework, un fichier (standalone) | Fastify et PostgreSQL, testés en CI, non déployés | Monolithe modulaire sur 2 VM |
| Interface | HTML et JavaScript sans framework | React 19 et Vite | React servi par Nginx |
| Données | Fichier JSON | PostgreSQL, schéma unique | Cloud SQL HA, un schéma par module |
| Authentification | scrypt, session 24 h | Argon2id, session 24 h | Argon2id et auth_request |
| Appels | Pair-à-pair, STUN Google, sans TURN | Jeton LiveKit expérimental, désactivé | Pair-à-pair et coturn ; SFU en V2 |
| Notifications Push | Oui | Non | Module notifications |
| TLS | Caddy et Let's Encrypt | Nginx auto-signé en local | LB, Nginx et coturn |
| Supervision | /healthz, /readyz, /metrics | Prometheus et Grafana en Compose | VM de supervision et Cloud Logging |
| Déploiement | Automatique après CI verte : la VM tire le commit | CI GitHub Actions | CD GitHub Actions |

Constats à traiter : `/metrics` de la démo répond publiquement (nombre de comptes et de messages) ; aucune limite de débit sur la connexion ; un arrêt pendant l'écriture du JSON peut le corrompre.

## Migration, CD et reprise

1. Décrire l'infrastructure en code et la créer d'abord en environnement de test. Secrets dans Secret Manager.
2. Reprendre le code d'apps/api, extraire les modules, ajouter les notifications portées par la démo, puis brancher le client React.
3. Importer les données de la démo sur un banc isolé et comparer comptes, groupes, droits et historique. Les anciens hash scrypt sont vérifiés puis recalculés en Argon2id à la connexion, ou les comptes sont réinitialisés. Les anciennes sessions sont invalidées.
4. Basculer : suspendre les écritures, importer, contrôler, puis changer le DNS. Un retour arrière demande de réconcilier les nouvelles écritures.
5. Budget : à chiffrer avant toute création (VM app, coturn, supervision, Cloud SQL HA, load balancer, NAT, trafic ; en V2, SFU, Redis et stockage). **Repli MVP** : une VM app, SQL zonal, supervision sur la même VM, sans SFU ni Redis. Ce repli réintroduit des SPOF, à annoncer.
