# Reconstruire ChatISEN depuis ses diagrammes

**[Ouvrir la visionneuse](index.html#07-profils)**. La première vue montre quel client, quelle API et quel stockage démarrent ensemble. Chaque dessin a une fiche avec le comportement à reproduire, un contrôle observable et les sources qui fixent les détails. Les vues SQL permettent de lire les deux migrations exécutables dans la même page.

**Référence R01** · 25 novembre 2026 · `bf1cd6029de69598c9d0c035b5abeb6dedc06fbd` sur `rev/01-socle-j1`. Ce repère comprend les appels locaux de `91add83` et la correction du banc Chromium de `4bbbbcb`. La dernière livraison taguée du projet est `v1.0.0`. [Code du repère](https://github.com/Zayonx-0/ChatISEN/tree/bf1cd6029de69598c9d0c035b5abeb6dedc06fbd) · [Preuve CI du banc corrigé](../report/preuves/45583168142/extrait.txt)

Pour rejouer la reconstruction, garder ce dossier de diagrammes ouvert à côté du clone de référence. La révision documentaire est postérieure au SHA de l’application qu’elle décrit. [Contrôles de la reconstruction](../report/journal-des-preuves.md#e25--reconstruction-depuis-les-diagrammes)

## Quelle application obtient-on ?

- **Avec `pnpm dev`**, Alice ouvre le client JavaScript servi par le processus Node. Elle écrit à Bob, reçoit des notifications et peut lui passer un appel. Le serveur écrit les comptes, les conversations et les métadonnées d’appel dans un fichier JSON. Le son et l’image circulent directement entre les deux navigateurs. [Profil local](svg/16-standalone.svg) · [Appel à deux](svg/17-appel-direct.svg)
- **Avec le profil R01**, le navigateur charge React, Nginx achemine les requêtes à Fastify et PostgreSQL conserve l’identité, les messages et leur journal ordonné. Une reconnexion relit ce journal. L’API prépare une admission LiveKit sous drapeau expérimental. L’intégration du client média React, la révocation à la SFU et la réception sur Compose restent ouvertes. [Services](svg/02-conteneurs.svg) · [Admission](svg/18-admission-livekit.svg)
- **Dans le processus Fastify**, les anciennes routes `/api` coexistent avec les handlers `/api/v1`. Elles conservent leurs propres Maps et certaines proposent un jeton de démonstration ou un upload volatil. Le préfixe et le processus de destination déterminent le traitement réel. [Comparaison des handlers](svg/20-api-locales.svg)

Le sujet classe les comptes, la messagerie privée et de groupe, l’historique, les appels audio et vidéo à deux, le déploiement et la supervision dans le socle. La vue de recette rattache chaque parcours à sa preuve et identifie l’étape à éprouver pour le jury. [Sujet, p. 12 et 17](../../ChatISEN%20-%20Project%20Briefing.pdf) · [Couverture et recette](svg/22-recette.svg)

## Lire les vues dans l’ordre d’une reconstruction

| Étape | Décision à reproduire | Dessins |
|---|---|---|
| 1. Choisir le point d’entrée | Acteurs, profil, source de vérité, domaine et clients | [07 Profils](svg/07-profils.svg) · [01 Contexte](svg/01-contexte.svg) |
| 2. Assembler les exécutables | Navigateurs, Nginx frontal, serveur statique, Fastify, services privés, volumes, images et dépendances de démarrage | [02 Services](svg/02-conteneurs.svg) · [03 API](svg/03-composants-api.svg) · [08 Compose local](svg/08-compose.svg) |
| 3. Recréer le stockage | Types, colonnes, clés étrangères, cardinalités et unicité. Le DDL de la fiche fournit contraintes, index partiels, valeurs par défaut, actions de suppression et trigger | [12 Identité et messages](svg/12-donnees-chat.svg) · [13 Média et fichiers](svg/13-donnees-media.svg) |
| 4. Implémenter les frontières v1 | Cookie et CSRF, rôles, entrées, formats de réponse, pagination, clés de retry et erreurs | [10 Session](svg/10-identite.svg) · [11 Groupes](svg/11-groupes.svg) · [14 HTTP comptes et groupes](svg/14-http-identite-groupes.svg) · [15 Messages, WS et appels](svg/15-http-flux-appels.svg) |
| 5. Refaire les écrans et le temps réel | Formulaire, recherche, fil actif, brouillon, ordre des écritures et curseur de reprise | [09 Client React](svg/09-interface-react.svg) · [21 Écrans](svg/21-ecrans.svg) · [05 Envoi](svg/05-message-prive.svg) · [06 Reconnexion](svg/06-reconnexion.svg) |
| 6. Reproduire les appels et la compatibilité | Choisir le protocole du client, distinguer la persistance d’appel de la transmission des pistes | [16 Serveur local](svg/16-standalone.svg) · [20 API locales](svg/20-api-locales.svg) · [17 WebRTC direct](svg/17-appel-direct.svg) · [18 Admission LiveKit](svg/18-admission-livekit.svg) |
| 7. Contrôler le résultat | Sondes, métriques, comportement du port public et recette utilisateur | [19 Supervision](svg/19-exploitation.svg) · [04 Cible GCP](svg/04-deploiement-gcp.svg) · [22 Recette](svg/22-recette.svg) |

Les premières vues C4 situent les responsabilités. En bleu figurent les composants applicatifs, en gris la configuration, en ambre l’admission expérimentale et en violet la cible réseau ou média à éprouver. Les vues de séquence se lisent de haut en bas. Sur les schémas physiques, `PK` indique la clé primaire, `FK` la clé étrangère et `UQ` l’unicité. Le lecteur fonctionne hors ligne. La molette zoome, le glisser déplace, `F` ajuste, les touches `1` à `9` ouvrent les vues numérotées correspondantes et le sélecteur mobile dessert toutes les vues.

## Reconstruire le snapshot

### Base commune

Depuis un dossier neuf avec accès au dépôt privé, utiliser **Node.js 24** et **pnpm 10.20.0**. Les versions effectivement résolues sont dans le verrou. Elles incluent **React 19.3.1**, **Vite 6.4.6**, **Fastify 5.12.8**, **pg 8.23.1**, **argon2 0.41.1**, **ws 8.23.0** et **prom-client 15.1.3**. Les handlers v1 valident leurs entrées en TypeScript. Le catalogue HTTP/WS est en JSON Schema. Le brouillon d’architecture proposait TypeBox. [Manifeste](../../package.json) · [Verrou](../../pnpm-lock.yaml) · [Contrats](../../packages/contracts/src/index.mjs)

```sh
git clone https://github.com/Zayonx-0/ChatISEN.git ChatISEN
cd ChatISEN
git checkout --detach bf1cd6029de69598c9d0c035b5abeb6dedc06fbd
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
```

**Contrôle** · Le build produit `apps/api/dist/server.js` et `apps/web/dist/index.html` avec les ressources compilées sous `assets/`. Les HTML/CSS de l’interface standalone sont dans `apps/web/public/`. Les Dockerfiles fixent les familles d’images et les chemins copiés. Une reconstruction binaire identique exigerait également les digests d’images et l’environnement de build, qui ne sont pas figés au repère. [Dockerfile de l’API](../../apps/api/Dockerfile) · [Dockerfile web](../../apps/web/Dockerfile)

### Profil standalone sur loopback

Depuis la racine du clone, ces commandes alignent le chemin lu par le serveur avec celui écrit par le seed.

```sh
pnpm db:seed
HOST=127.0.0.1 PORT=3000 COOKIE_SECURE=false CHATISEN_DATA_FILE=./data/chatisen.json pnpm dev
```

Ouvrir `http://127.0.0.1:3000/`. Sans variable de chemin, le serveur résout `../../data/chatisen.json` depuis `apps/`, soit **un dossier au-dessus du dépôt**. Le seed, lui, écrit `data/chatisen.json` depuis le répertoire de travail. L’option explicite évite de créer deux jeux de comptes. Les données JSON sont chargées au démarrage et réécrites en bloc. `PUBLIC_ORIGIN` sert à valider l’origine WS/SSE derrière un éventuel frontal TLS. [Serveur et chemins effectifs](../../apps/standalone/server.mjs) · [Seed JSON](../../scripts/seed.mjs)

**Contrôle** · Créer deux comptes dans deux contextes de navigateur. Vérifier un nouveau direct, puis une notification hors du fil actif. Accepter un appel audio puis vidéo et observer `inbound-rtp` chez Alice et Bob. La suite isolée démarre son propre serveur avec un fichier temporaire et des périphériques synthétiques. [Scénarios Chromium](../../tests/e2e/standalone.spec.ts) · [Preuve locale E22 et CI E24](../report/journal-des-preuves.md#e22--notifications-et-appels-directs-sur-le-profil-local)

### Profil React et PostgreSQL sans Docker

Employer une base PostgreSQL 17 jetable appartenant au compte de test. Dans le shell du laboratoire, `DATABASE_URL` désigne cette base. Le runner applique les fichiers SQL par ordre de nom, chacun dans une transaction qui inscrit son nom dans `_chatisen_migrations`. L’adaptateur `node-pg-migrate` du dépôt enveloppe uniquement `001_initial.sql`. Le chemin de démarrage et de test appelle **`node db/migrate.mjs`**. [Runner](../../db/migrate.mjs) · [Adaptateur 001](../../db/node-pg-migrate/001_initial.cjs)

```sh
# Exemple pour une base chatisen_test déjà créée sur loopback
export DATABASE_URL='postgres://chatisen:chatisen@127.0.0.1:5432/chatisen_test'
pnpm db:migrate
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
```

Le test React démarre Fastify et le proxy Vite sur deux ports libres, fixe `CORS_ORIGIN` à l’origine du proxy et vérifie le cookie dans Chromium sur loopback. Pour ouvrir l’application à la main, conserver le même `DATABASE_URL` dans le terminal de l’API et utiliser un secret CSRF local stable. Les deux commandes suivantes se lancent dans deux terminaux depuis la racine du dépôt.

```sh
# Terminal API
HOST=127.0.0.1 PORT=3000 CORS_ORIGIN=http://localhost:5173 CSRF_SECRET=secret-de-test-local pnpm --filter @chatisen/api dev
# Terminal web
CHATISEN_WEB_PORT=5173 CHATISEN_API_TARGET=http://127.0.0.1:3000 pnpm --filter @chatisen/web exec vite --host 127.0.0.1
```

Ouvrir **`http://localhost:5173`** pour conserver la valeur exacte de l’origine, y compris son port. Le test du profil v1 couvre le refus d’Ève, une coupure de 15 s, 20 messages rattrapés et la relecture après redémarrage du processus API. Les essais de repository couvrent les commandes concurrentes, le rollback et 125 messages paginés dans les tests HTTP. Sur le banc E24, 17 tests ont réussi sans aucun ignoré et trois parcours Chromium ont réussi. [Configuration Vite](../../apps/web/vite.config.ts) · [Intégration chat](../../tests/integration/chat/postgres-chat.test.ts) · [Protocole navigateur](../../tests/e2e/chat.spec.ts) · [Extrait E24](../report/preuves/45583168142/extrait.txt)

### Pile Compose HTTPS locale

Sur un **hôte de recette** avec Docker Engine, Compose v2, mkcert et Chromium, `make bootstrap` prépare le certificat de `localhost` et la confiance locale. La commande d’initialisation installe l’autorité locale sur cet hôte. Le seed PostgreSQL de démonstration reste à réaliser. Les scénarios de test créent leurs propres utilisateurs. [Bootstrap](../../scripts/bootstrap.mjs) · [Compose effectif](../../infra/compose/docker-compose.yml)

```sh
make bootstrap
export R01_COMPOSE_PROJECT=r01-e2e-architecture
export R01_BASE_URL=https://localhost
docker compose -p "$R01_COMPOSE_PROJECT" -f infra/compose/docker-compose.yml config --quiet
docker compose -p "$R01_COMPOSE_PROJECT" -f infra/compose/docker-compose.yml up -d --build
docker compose -p "$R01_COMPOSE_PROJECT" -f infra/compose/docker-compose.yml ps -a
pnpm exec playwright test -c tests/e2e/playwright.config.mjs
```

**Contrôle** · Attendre PostgreSQL sain et `migrate` sorti avec 0. L’API doit indiquer `database: postgres` sur son endpoint interne `/readyz`. Le test vérifie le certificat et la persistance dans la base du projet nommé avant et après redémarrage de l’API. Un démarrage Compose intégral réussi et la recette média sur cette pile restent à établir. [Protocole HTTPS](../../tests/e2e/README.md) · [Sondes et supervision](svg/19-exploitation.svg)

### Cible de démonstration Google Cloud

L’entrée attendue pour l’enseignant est **`https://ia-pple.isen.fedyna.fr:27028/`** depuis Internet. La cible associe l’enregistrement A à une IPv4 externe statique, un certificat valide pour le domaine, un frontal TLS publié sur **TCP 27028 seul** et une administration via Tailscale. Pour ce profil, l’origine attendue par Fastify doit inclure `:27028` et l’URL de signalisation doit utiliser `wss://ia-pple.isen.fedyna.fr:27028/livekit/`. Le Compose de développement publie aussi 80, 443, des ports LiveKit et les outils de supervision. La configuration dédiée à la VM, la remise du certificat, les secrets et le chemin ICE compatible avec le port unique restent à finaliser. OpenTofu ne définit aucune ressource GCP au repère. [Vue cible](svg/04-deploiement-gcp.svg) · [Ébauche OpenTofu](../../infra/tofu/main.tf) · [Playbook actuel](../../infra/ansible/site.yml)

**Contrôle** · Depuis deux réseaux extérieurs, conserver la résolution DNS, le certificat accepté, l’Upgrade WSS, le couple de candidats ICE sélectionné et les compteurs entrants audio/vidéo aux deux extrémités. Le signal WebSocket et les paquets WebRTC sont deux trajets distincts. La réception de J1 inclut aussi le tableau Grafana pendant ce parcours. [Mandat J1](../revisions/R01-socle-j1.md)

## Mettre à jour les diagrammes

Le workspace **Structurizr** ouvre les 22 vues. Il étend le modèle C4 avec 11 vues d’implémentation rattachées au composant concerné, dont les deux schémas de données rattachés à PostgreSQL. Les détails se dessinent en **PlantUML**. Le rendu des deux vues de données lit directement les migrations SQL. Le catalogue du lecteur contient pour chaque vue la fiche, le contrôle attendu et les liens. [Workspace à ouvrir dans Structurizr](workspace.dsl) · [Modèle C4](c4.dsl) · [Sources des détails](details/) · [Catalogue des fiches](vues.json)

Depuis la racine du dépôt, exécuter la commande suivante avec Python 3.9+, Java, Structurizr CLI `v2025.11.09` et PlantUML `1.2025.10`. Les rendus de ce dossier utilisent Java 25.

```sh
python3 docs/architecture/render.py /chemin/structurizr.sh /chemin/plantuml-1.2025.10.jar
```

Le rendu valide le DSL, contrôle la liste des tables, compare les méthodes et chemins des planches HTTP v1 aux handlers Fastify et calcule l’écart avec OpenAPI. Il vérifie aussi que chaque source du catalogue existe et que l’export JSON du workspace complet contient les mêmes clés de vues que le lecteur. Versionner ensemble les sources du dessin, `vues.json`, les SVG et le fichier généré `lecteur.js`. Pour la lecture, ouvrir `index.html` dans la copie locale. [Générateur](render.py) · [CLI Structurizr](https://github.com/structurizr/cli/releases/tag/v2025.11.09) · [PlantUML](https://repo.maven.apache.org/maven2/net/sourceforge/plantuml/plantuml/1.2025.10/)
