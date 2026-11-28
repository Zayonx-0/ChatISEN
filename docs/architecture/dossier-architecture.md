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

| Attendu | Niveau | Conception retenue | État documenté | Critère de recette |
|---|---|---|---|---|
| Authentication and user management | Socle | Module identity : comptes, Argon2id, sessions opaques, profils. Rôle admin en V2. | En ligne : Argon2id, sessions révocables, auth_request, rôle admin. Accès vérifiés le 27/11 ([relevé](../etudes/recette-cible.md)). L’ancienne démo utilisait scrypt. | Inscription, connexion, déconnexion, session révoquée refusée. |
| Private and group messaging | Socle | Modules groups et messaging. | En ligne : conversations privées et groupes ; un tiers ne lit rien ([relevé](../etudes/recette-cible.md)). | Un tiers ne lit aucun message. |
| Real-time delivery and history | Socle | WebSocket, journal numéroté, historique paginé. | En ligne : livraison à 6 WebSocket derrière le load balancer ([relevé](../etudes/recette-cible.md)). Reprise `afterSeq` testée en CI. | Après coupure, aucun message perdu ni doublé. |
| One-to-one voice call | Socle | WebRTC pair-à-pair, signalisation par le serveur, ICE avec coturn. | En ligne : son reçu en direct et par coturn ([relevé](../etudes/recette-cible.md)). Reste : deux réseaux distincts. | Son reçu entre deux réseaux, y compris en relais forcé. |
| One-to-one video call | Socle | Même chemin que la voix, piste vidéo en plus. | En ligne : images décodées en direct et par coturn ([relevé](../etudes/recette-cible.md)). Reste : deux réseaux distincts. | Images décodées des deux côtés. |
| Basic deployment and monitoring | Socle | Docker Compose, CD, Prometheus, Grafana, Cloud Logging. | En ligne : Terraform, CD, Prometheus, Grafana et alerte externe avec destinataire ([relevé](../etudes/recette-cible.md)). Livraison approuvée et journaux Cloud Logging : à vérifier après leur application. | Déploiement reproductible, alerte visible sur panne. |
| Multi-participant video conferences | Extension V2 | SFU LiveKit auto-hébergé, jeton de salle court. | En ligne : conférence à trois, y compris par le relais, avec retrait d’un membre ([relevé](../etudes/recette-cible.md)). Reste : à quatre. | Conférence à quatre, pistes reçues. |
| File sharing | Extension V2 | Cloud Storage, URL signées, métadonnées en SQL. | En ligne : envoi vérifié par le serveur, téléchargement à l’identique, refus attendus ([relevé](../etudes/recette-cible.md)). | Envoi et lecture réservés aux membres. |
| Screen sharing | Extension V2 | getDisplayMedia, remplacement de piste (à deux) ou piste publiée (SFU). | Implémenté. Test navigateur à deux avec un écran simulé. Reste : écran réel et conférence. | L'écran partagé est reçu, l'arrêt rend la caméra. |
| Connection recovery | Extension | Reprise WebSocket par afterSeq. ICE restart pour les appels. | Reprise WebSocket testée en CI. ICE restart codé, pas encore éprouvé par un changement de réseau. | Changer de réseau pendant un appel et un échange. |
| Communication quality indicators | Extension V2 | getStats() toutes les 5 s, indicateur dans l'appel, envoi par lot. | En ligne : indicateur affiché, mesures enregistrées et suivies dans Prometheus ([relevé](../etudes/recette-cible.md)). Reste : essai sur réseau bridé. | L'indicateur se dégrade sur réseau bridé. |
| More advanced access control | Extension | Rôles de groupe, rôle moderator et admin global, journal d'audit. | Rôles de groupe et administrateur en ligne ; matrice des droits testée en CI. | Matrice des droits testée route par route. |
| Improved scalability and availability | Extension | 2 VM sur 2 zones, API sans état durable, SQL HA, MIG autoréparant. | Arrêt d’une VM applicative et d’un SFU essayés ([relevé](../etudes/recette-cible.md)). Livraison zone par zone à vérifier en ligne. | Arrêt d'une VM : le service continue. |
| Performance and load testing | Investigation | k6 pour REST et WebSocket, lk load-test pour le SFU. | À faire. | Rapport avec p95, erreurs et ressources par palier. |
| Communication quality analysis | Investigation | Mesures getStats() comparées entre direct et relais, réseau bridé. | À faire. | Graphiques perte, gigue et RTT par scénario. |
| Infrastructure and resource optimisation | Investigation | Mesure CPU, mémoire, trafic TURN, puis dimensionnement et coût. | À faire. | Tableau coût et capacité avant et après. |
| Security testing | Investigation | Tests d'accès, pnpm audit, Trivy, OWASP ZAP sur banc. | Tests d’accès, de passerelle et de contrat, audit de dépendances et Trivy en CI. ZAP sur banc à faire. | Constats classés, corrigés ou assumés. |
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
| identity | Comptes, profils, mots de passe, sessions, rôle global, audit. | Aucun | identity : users, sessions, audit_log | SessionVerifier, UserDirectory, AuditTrail | MVP et lot D |
| groups | Conversations privées et de groupe, membres, rôles, contrôle d'accès. | identity | groups : conversations, members, creation_commands | AccessPolicy, ConversationDirectory | MVP |
| files | Métadonnées, droits, URL signées. | groups | files : files | FileCatalog | V2 |
| messaging | Messages, ordre, historique, rattrapage. | groups, files | messaging : messages | MessageTimeline | MVP |
| calls | Cycle d'appel, signaux, identifiants ICE, jeton de salle. | groups | calls : calls, participants, media_jobs, webhook_receipts | CallRegistry | MVP, conférence V2 |
| quality | Mesures getStats(), indicateurs, export. | calls | quality : samples | QualityReport | V2 et investigation |
| notifications | Abonnements Web Push, envoi, retries. | groups, identity | notifications : push_subscriptions, push_deliveries | PushSubscriptions | MVP+ |
| operations | Vue d’ensemble du webmaster et redémarrages bornés. | identity | operations : restart_gate | OperationsService | Lot D |

Le journal d'événements et l'outbox (schéma `realtime` : streams, events, outbox) appartiennent au noyau. `groups` et `messaging` y écrivent dans leur propre transaction. `notifications` y lit `message.created` et `call.invitation` : `messaging` et `calls` ne le connaissent pas.

**État du code le 26/11** : `apps/api` suit ce découpage (noyau `platform/`, sept modules, un schéma SQL par module, migration 004). Un test de la CI refuse les cycles, les imports qui contournent une façade et les requêtes sur le schéma d'un autre module (`scripts/check-boundaries.mjs`).

**Limite assumée** : dans le monolithe, un contrôle d'accès peut participer à la même transaction que l'écriture (verrou sur le membre pendant l'envoi). Après un découpage en services, ce contrôle deviendrait un appel réseau et la cohérence serait à terme. Il faudrait alors revoir la révocation d'un membre.

## 4. Interfaces, écrites avant le code

- **REST** : [api/openapi.yaml](api/openapi.yaml), OpenAPI 3.1. Ressources au pluriel, identifiants dans le chemin, verbes HTTP, schémas dans `components`, erreurs `{code, message, requestId}`.
- **Temps réel** : [api/asyncapi.yaml](api/asyncapi.yaml), AsyncAPI 3.0. OpenAPI ne décrit pas les messages d'une WebSocket ; AsyncAPI est le format prévu pour cela.
- **Lecture** : la vue 9 montre l'UML des ressources et des schémas, générés depuis `openapi.yaml`.
- **Usage prévu** : générer les types du front et du back, importer dans Bruno ou Postman, ajouter en CI un contrôle des réponses réelles.

`apps/api` sert les opérations d'`openapi.yaml`. La CI vérifie le document, l'inventaire des routes, les statuts et les corps des réponses testées, y compris les 401 et 429 de la passerelle. Elle vérifie aussi les trames WebSocket émises et reçues contre `asyncapi.yaml`. La colonne `x-today` garde la correspondance avec les routes antérieures. [packages/contracts](../../packages/contracts/schemas/openapi.json) est l'ancien contrat du laboratoire R01.

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

Le dépôt contient la matrice et un test des routes concernées. Le premier administrateur est nommé par l'exploitant (`db/promote-admin.mjs`). L'administrateur ne lit pas les conversations par son rôle. Un accès direct à la base reste possible pour qui administre le projet GCP : il est à limiter par IAM et à journaliser. Il n'y a pas de chiffrement de bout en bout des messages.

## 5. Temps réel

**Une seule WebSocket par onglet**, découpée en topics : `conversation:{id}` (abonnement explicite) et `user:{id}` (appels et changements de liste). Les écritures passent par REST.

Chaque conversation a un numéro `seq` croissant. `ready` annonce un heartbeat de 30 s. Le client envoie `ping` à cette cadence, se reconnecte si `pong` manque, puis reprend avec `subscribe` et `afterSeq`. Il acquitte le dernier événement appliqué avec `ack`. Le serveur revérifie la session et le membre, et signale `resync_required` quand un client est trop lent. PostgreSQL réveille les deux réplicas par `LISTEN/NOTIFY` et tient le rôle de coordination des réplicas.

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

**Cible** : `apps/web/sw/sw.js` appelle `/api/v1/users/me` et `/api/v1/push-subscriptions`. Le champ `senderName` est une donnée transmise (chiffrée) : à retirer ou à assumer.

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
- **Qualité (V2)**. Le navigateur mesure les pertes, la gigue, le RTT, le débit et le type de candidat toutes les 5 s, via WebRTC à deux et via les statistiques exposées par LiveKit en conférence. Il affiche l'indicateur, envoie les mesures par lots de six et transmet le reliquat à la fin de l'appel.

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
- **Vérification et cycle de vie (T22).** L’API vérifie taille, empreinte SHA-256 et signature du type à la confirmation. Le bucket annule les téléversements multiparties incomplets après un jour. Le nettoyage SQL et Cloud Storage vise les envois incomplets ou refusés après une heure et les fichiers confirmés sans message après 24 h. Le contrôle de la référence au message se fait sous verrou SQL. Recette en cible à mesurer.

## 8. Infrastructure et déploiement

La vue 6 montre les machines et les conteneurs. Le sous-réseau média existe pour isoler des machines qui ont une **IPv4 publique** et un profil réseau différent : coturn et, en V2, les SFU. Il ne sert pas au stockage des fichiers.

## Composants et placement

| Composant | Implantation | Rôle et critère de sortie |
|---|---|---|
| Load balancer | External Application Load Balancer global avec certificat géré dans la vue 6. Contraintes de la cible en §14. | HTTPS et WSS 443, redirection 80, backends en HTTPS 8443. Retrait d'un backend défaillant. |
| Réseau | VPC chatisen-cible : app 10.40.10.0/24, média 10.40.20.0/24, ops 10.40.30.0/24. PSA 10.40.32.0/20 proposée. | VM app sans IP publique, sortie par Cloud NAT. |
| VM applicatives | MIG régional de 2 VM Debian 13, zones a et b. Docker Compose : nginx, api, cloud-sql-proxy, node-exporter. | Mêmes digests sur les deux VM. Une VM en échec est recréée. |
| API | Monolithe modulaire Fastify, port 3000 non publié, /metrics sur 9091. | Aucun état durable local : reprise sur l'autre VM par session SQL et curseur. |
| PostgreSQL | Cloud SQL PostgreSQL 17 régional HA, IP privée. | Sauvegardes et PITR vérifiés par une restauration. |
| coturn | VM dédiée, IPv4 réservée, certificat public. | STUN et TURN UDP 3478, TLS 5349. Candidats srflx et relay observés. |
| Supervision | VM ops : Prometheus, node-exporter local et Grafana par Compose. | Collecte et alertes, Grafana par IAP (FW2), lecture Prometheus par la console (FW7). |
| Journaux | Ops Agent vers le bucket Cloud Logging de la cible en `europe-west4`, rétention 30 jours. | Recherche par requestId, rétention et région vérifiées. À mesurer. |
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
| FW7 (lot D) | VM app → VM de supervision. | TCP 9090 privé, étiquettes réseau `app` et `ops`. | Prometheus joignable depuis les VM app, refusé depuis Internet et les VM média. |
| Tout autre entrant | Toute source → toutes les VM. | Refusé. Ni SSH public, ni 5432, ni 3000 public, ni 9090 public. | Balayage de ports externe. |

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
| T09 · Données | API → Cloud SQL | cloud-sql-proxy, mTLS, IP privée, rôle SQL limité aux données. | Base injoignable depuis Internet et DDL refusé à l’API. |
| T10 · Signalisation | Navigateur → calls → correspondant | Offre, réponse et candidats : REST à l'aller, topic user au retour. | Seuls les deux participants reçoivent les signaux. |
| T11 · Média direct | Navigateur A ↔ navigateur B | WebRTC, ICE, DTLS-SRTP, sans passer par les VM applicatives. | Paire ICE sélectionnée de type host ou srflx. |
| T12 · STUN et TURN | Navigateurs ↔ coturn | STUN et TURN UDP 3478, TLS 5349, relais UDP 49160–49200. | srflx obtenu, puis appel en relais forcé. |
| T13 · Conférence (V2) | API → SFU ; navigateurs ↔ SFU ; SFU ↔ Redis | Jeton de salle court, média UDP 7882 ou TCP 7881, coordination Redis. | Conférence à quatre. |
| T14 · Envoi Push | notifications → fournisseur | HTTPS 443 via Cloud NAT, VAPID, contenu chiffré, TTL 120 s. | Droits, expiration et retries. |
| T15 · Remise Push | Fournisseur → service worker | Réveil de /sw.js, showNotification, clic vers le fil. | Notification onglet fermé. |
| T16 · Exploitation | Ops et Admin → GCP | IAP et OS Login pour SSH et Grafana, console avec MFA. | Refus hors IAM. |
| T17 · Observabilité | VM → Prometheus et Cloud Logging | Métriques collectées toutes les 15 s, journaux centralisés. | Alerte sur API arrêtée. |
| T18 · Images | GitHub Actions CI → Artifact Registry | HTTPS, identité fédérée, images par digest. | Commit relié au digest. |
| T19 · Déploiement | GitHub Actions CD → API GCP | Approbation manuelle, Cloud Run Job avec rôle SQL dédié, puis APP-A et APP-B. | Échec de migration arrêté et retour aux digests précédents. À mesurer en cible. |
| T20 · Lecture d'image | VM → Artifact Registry | Pull par digest avec un compte de service lecteur. Chaque VM publie les digests réellement actifs. | Digest effectif comparé. À mesurer en cible. |
| T21 · Reprise | Cloud SQL → sauvegardes et restauration | PITR, restauration isolée. | Comparaison du contenu, RPO et RTO à mesurer. |
| T22 · Fichiers (V2) | Navigateur ↔ Cloud Storage | URL signée par l'API, octets envoyés et lus directement en HTTPS, cycle de vie et plafond du contrat. | URL expirée et non-membre refusés, fichiers référencés conservés. |
| T23 · Console | Navigateur admin → Nginx → API | Page React chargée à la demande, API REST, session et CSRF sur les écritures. Agrégats SQL et coordination via T09. | Matrice du §15 et parcours Playwright sur mobile et ordinateur. |
| T24 · Métriques de la console | API → Prometheus de supervision | HTTP privé TCP 9090 (FW7), requêtes prédéfinies. Les collectes T17/FW3 incluent les digests actifs et la disponibilité de chaque hôte, avec une collecte locale de la VM de supervision. | Source manquante indiquée indépendamment, aucune adresse interne dans la réponse. |
| T25 · Exploitation bornée | API → métadonnées GCE, API Compute et Cloud SQL Admin | Jeton du compte de service de la VM, API GCP en HTTPS 443. Lecture de la dernière sauvegarde réussie et redémarrage d'une seule VM autorisée. | Vérifier en IAM les cibles exactes, y compris le refus sur l'ancienne VM de démo. |
| T26 · Échéances TLS | API → points TLS publics du LB et de coturn | Connexion TLS avec le nom public, TCP 443 et 5349 (T02, T12/FW4). Lecture du certificat effectivement présenté, alerte sous 30 jours. | Comparer les échéances au certificat servi par chaque point d’entrée. |

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

**Recette de reprise (T21).** Restaurer dans un clone PITR jetable, comparer l’empreinte du contenu et mesurer le RPO et le RTO. Pour la VM de supervision, remplacer la machine par Terraform, puis vérifier Grafana et les cibles Prometheus via IAP (T16, FW2 et FW3). RPO, RTO et durée de reprise de la supervision à mesurer. [Procédures GCP](../../infra/gcp/README.md#reprise-e38-et-e39-10-t21-t16-fw2-et-fw3)

**Kubernetes (GKE).** Il gérerait des pods, leurs sondes, leur remplacement et leur autoscaling. Le **MIG** apporte déjà au niveau des VM le remplacement d'une instance en échec et la répartition sur deux zones, sans cluster à apprendre. GKE devient pertinent avec plusieurs services à déployer séparément : c'est la trajectoire V3, avec une passerelle d'API (Kong ou APISIX) et une base par service. La planche de la version précédente en montre le découpage en services.

## 11. Observabilité

- **Métriques** : Prometheus collecte l'API, les VM (node-exporter), coturn et, en V2, LiveKit. Grafana affiche et alerte. Le dépôt contient déjà cette configuration pour le banc local.
- **Indicateurs des tableaux Grafana.** Latence et erreurs HTTP, connexions WebSocket, délai jusqu’à l’acquittement des messages, âge du plus ancien événement non traité, échecs, expirations et reprises Push, appels à deux par première route ICE observée et mesures de qualité. Alertes Prometheus, dont l'indisponibilité d'un SFU. Valeurs relevées dans Prometheus le 27/11 ([relevé](../etudes/recette-cible.md)) ; déclenchement d'une alerte à provoquer.
- **Journaux (T17).** L’Ops Agent centralise les journaux structurés Nginx, API, Cloud SQL Proxy, coturn et LiveKit dans Cloud Logging. Un même `requestId` relie Nginx, l’API et le corps d’erreur lorsque la requête atteint l’API. Le diagnostic API conserve le type, le code, les cadres de pile et la cause bornée et masquée, y compris au démarrage. Nginx conserve les erreurs critiques et de démarrage sur stderr. La collecte transmet leur niveau. Les champs collectés excluent les mots de passe, cookies, contenus de message, jetons et URL signées. Les fichiers de journaux locaux tournent et le bucket de cible conserve les entrées 30 jours en `europe-west4`. Recette à mesurer.
- **Sondes** : `/healthz` (processus) et `/readyz` (base). `/metrics` ne doit pas être public.

## 12. CI/CD

1. **CI** sur chaque pull request. Vérification des types, build, tests, Playwright, contrôle des frontières entre modules, validation des deux contrats, `pnpm audit` et Trivy. La publication analyse aussi chaque image retenue avant son envoi au registre. `pnpm audit` bloque sur les vulnérabilités élevées ou critiques ; Trivy bloque sur celles qui disposent d'un correctif. Les actions de la CI et l'image Trivy sont figées par leur empreinte.
2. **Images** construites une fois, poussées dans Artifact Registry et désignées par digest.
3. **CD de l’ancienne démo** (branche `standalone`) : chaque minute, la VM compare son commit à la tête de `main` et ne le déploie que si la CI a réussi. Copie des données avant redémarrage, contrôle de santé, retour arrière automatique, résultat publié dans `/version.json` et repris par le job GitHub « Déploiement en production ». Aucun secret côté GitHub. Détails dans `ops/gcp/README.md`.
4. **CD de la cible** sur environnement protégé avec approbation manuelle. Après une CI réussie sur le commit exact de `main`, GitHub utilise OIDC sans clé stockée. `cible-images` publie les images avec `sa-images`. Seul le job `cible`, avec `sa-deploy`, attend l’approbation. Il exécute la migration par Cloud Run Job, puis met à jour APP-A. Après contrôle de santé et comparaison des digests réellement actifs, il traite APP-B. En cas d’échec, le retour aux digests précédents suit le même principe, une VM saine à la fois. Chaque VM démarre ses conteneurs avec Docker Compose. La cible modélisée déploie un nouveau modèle d’instance. En exploitation, Terraform garde ce modèle et le CD applique les digests dans `all-instances-config` pour éviter deux auteurs du modèle. Le changement du modèle lui-même passe par Terraform et par la même recette ordonnée. [Procédure](../../infra/gcp/README.md#déploiement-continu-e36-12-t18-à-t20-fw1)
5. Les migrations restent rétrocompatibles le temps que deux versions cohabitent. Le Job utilise un rôle SQL dédié et vérifie l’AC propre à l’instance Cloud SQL sur l’IP privée. Le rôle de l’API dispose des droits de données nécessaires. Avant l’amorçage, Terraform génère son secret et le conteneur API en service lit ce secret pour préparer le rôle depuis le compte propriétaire. La CI vérifie la lecture de chaque table applicative et le refus du DDL. La migration 004 est antérieure à la mise en service de la cible.

## 13. Travail d'investigation

| Sujet | Méthode et outil | Mesures | Preuve attendue |
|---|---|---|---|
| Charge et performance | k6 : connexions, messages et WebSocket par paliers. lk load-test pour le SFU. | p95 d'envoi à livraison, erreurs, CPU, mémoire, connexions SQL. | Rapport par palier avec le point de saturation. |
| Qualité des communications | getStats() en direct puis en relais forcé, réseau dégradé avec tc netem. | Pertes, gigue, RTT, débit, type de candidat. | Courbes comparées par scénario. |
| Optimisation des ressources | Mesures sous charge, puis changement d'un paramètre à la fois. | Capacité par vCPU, trafic relayé, coût mensuel estimé. | Tableau avant et après, taille de VM retenue. |
| Sécurité | Tests d'accès entre comptes, OWASP ZAP sur banc, pnpm audit, Trivy. | Constats par gravité. | Liste des corrections et risques assumés. |
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

La cible réutilise l’adresse régionale de la démo, car le DNS de l’école reste fixe. Le load balancer est donc régional et FW1 inclut son sous-réseau de proxys. Le certificat du load balancer est géré par l’équipe, car le certificat géré régional exige une validation DNS. Le nom TURN utilise `sslip.io`, car l’équipe ne peut pas ajouter d’enregistrement au DNS de l’école. Les ports ACME servent aux preuves de contrôle du nom (T01, T02, T12, FW1 et FW4).

Le jeton de salle LiveKit expire en 60 secondes afin de borner la fenêtre de réadmission d’un membre retiré avec un jeton déjà émis. Les identifiants TURN durent au plus une heure, bornée par la durée restante de la session, pour permettre le rafraîchissement d’allocation (T12, T13, FW4 à FW6). [Écarts d’infrastructure](../../infra/gcp/README.md#écarts-avec-la-première-version-du-schéma)

| Élément | Ancienne démo (branche `standalone`, arrêtée) | En ligne sur ia-pple.isen.fedyna.fr depuis le 27/11 |
|---|---|---|
| Serveur et données | Node, fichier JSON | Fastify, deux VM, PostgreSQL HA et un schéma SQL par module |
| Interface et sessions | HTML et JavaScript, scrypt et session 24 h | React servi par Nginx, Argon2id, auth_request et session 24 h |
| Appels et notifications | Pair-à-pair avec STUN Google, Web Push | coturn pour le relais, deux SFU pour les conférences, module Web Push |
| Exploitation | Sondes et déploiement reçu par la VM | Prometheus, Grafana, Cloud Logging, déploiement approuvé et ordonné |

## Migration, CD et reprise

1. Décrire l'infrastructure en code et la créer d'abord en environnement de test. Secrets dans Secret Manager.
2. Reprendre le code d'apps/api, extraire les modules, ajouter les notifications portées par la démo, puis brancher le client React.
3. Importer les données de la démo sur un banc isolé et comparer comptes, groupes, droits et historique. Les anciens hash scrypt sont vérifiés puis recalculés en Argon2id à la connexion, ou les comptes sont réinitialisés. Les anciennes sessions sont invalidées.
4. Basculer : suspendre les écritures, importer, contrôler, puis changer le DNS. Un retour arrière demande de réconcilier les nouvelles écritures.
5. Budget : à chiffrer avant toute création (VM app, coturn, supervision, Cloud SQL HA, load balancer, NAT, trafic ; en V2, SFU, Redis et stockage). **Repli MVP** : une VM app, SQL zonal, supervision sur la même VM, sans SFU ni Redis. Ce repli réintroduit des SPOF, à annoncer.

## 15. Lot D · Console du webmaster

La page React `/administration` reprend le client sur ordinateur et téléphone. `operations` assemble des agrégats fournis par les façades du monolithe, la disponibilité et les alertes Prometheus, les séries courtes HTTP, WebSocket, messages, livraison, outbox, Push, appels et ressources des VM, les digests actifs, la dernière sauvegarde SQL réussie et les échéances TLS publiques. Chaque donnée manquante affiche « indisponible ». L’accès à Grafana reste par IAP (T16, FW2). L’équipe renouvelle manuellement le certificat du load balancer.

| Capacité | Rôle `user` (quel que soit le rôle de groupe) | Rôle global `admin` |
|---|---|---|
| Console, état, alertes et agrégats sans contenu | Non | Lecture |
| Comptes et audit paginés et filtrés | Non | Lecture des comptes et du journal |
| Désactiver, réactiver, révoquer les sessions, nommer ou retirer un administrateur | Non | Écriture avec CSRF. Le dernier admin actif est conservé. Un admin ne peut pas se désactiver. |
| Lire les conversations, les messages ou les noms de fichiers par la console | Non | Non |
| Redémarrer une VM app ou un SFU | Non | Une cible connue, avec son pair sain |
| Redémarrer coturn ou la supervision | Non | Une cible connue, avec avertissement sur la coupure des relais ou des métriques |
| Arrêter, supprimer, créer, redimensionner, modifier un gabarit, déployer, exécuter une commande, accéder à SQL ou aux secrets | Non | Non |

Les redémarrages exigent le rôle courant, le CSRF, le mot de passe et le nom exact de la VM. Un verrou durable en base coordonne les réplicas, avec au moins cinq minutes entre actions et un audit avant et après. La console attend une preuve de redémarrage avant de libérer une demande dont l’issue est incertaine. Un état de santé inconnu entraîne un refus. Terraform active les actions sur la cible et attribue à `sa-app` uniquement `compute.instances.get` et `compute.instances.reset` sur des noms exacts, ainsi que le droit de lister les sauvegardes de l’instance SQL cible. Les contrats et la mise en service ordonnée couvrent T23 à T26 et FW7. [Procédure de mise en service](../../infra/gcp/README.md#lot-d--console-du-webmaster-t23-à-t26-fw7)
