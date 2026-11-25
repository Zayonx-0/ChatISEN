# Reconstruire ChatISEN depuis ses diagrammes

**[Ouvrir la visionneuse en ligne](https://ia-pple.isen.fedyna.fr/architecture/)** · [Copie locale](index.html#01-contexte). Elle suit les quatre niveaux C4, du contexte jusqu’au code et aux données. Sous chaque diagramme, ouvrir **Détails, tests et sources** pour retrouver les valeurs exactes, les commandes de test et les schémas complémentaires. Les fiches SQL donnent accès aux deux migrations exécutables dans la page.

**Référence R01** · 25 novembre 2026 · `bf1cd6029de69598c9d0c035b5abeb6dedc06fbd` sur `rev/01-socle-j1`. Ce repère comprend les appels locaux de `91add83` et la correction du banc Chromium de `4bbbbcb`. La dernière livraison taguée du projet est `v1.0.0`. [Code du repère](https://github.com/Zayonx-0/ChatISEN/tree/bf1cd6029de69598c9d0c035b5abeb6dedc06fbd) · [Preuve CI du banc corrigé](../report/preuves/45583168142/extrait.txt)

**Démo Google Cloud** · système standalone documenté au déploiement `ab465a3`. Les niveaux Contexte et Composants montrent le domaine ISEN et le chemin jusqu’aux modules du serveur. La vue Code et données détaille la messagerie PostgreSQL du profil de recette R01. [Lot GCP](https://github.com/Zayonx-0/ChatISEN/pull/2) · [Sondes du domaine ISEN](https://ia-pple.isen.fedyna.fr/readyz)

Pour rejouer la reconstruction, garder ce dossier de diagrammes ouvert à côté du clone de référence. La révision documentaire est postérieure au SHA de l’application qu’elle décrit. [Contrôles de la reconstruction](../report/journal-des-preuves.md#e25--reconstruction-depuis-les-diagrammes)

## Quelle application obtient-on ?

- **Avec `pnpm dev`**, Alice ouvre le client JavaScript servi par le processus Node. Elle écrit à Bob, reçoit des notifications et peut lui passer un appel. Le serveur écrit les comptes, les conversations et les métadonnées d’appel dans un fichier JSON. Le son et l’image circulent directement entre les deux navigateurs. [Profil local](svg/16-standalone.svg) · [Appel à deux](svg/17-appel-direct.svg)
- **Avec le profil R01**, le navigateur charge React, Nginx achemine les requêtes à Fastify et PostgreSQL conserve l’identité, les messages et leur journal ordonné. Une reconnexion relit ce journal. L’API prépare une admission LiveKit sous drapeau expérimental. L’intégration du client média React, la révocation à la SFU et la réception sur Compose restent ouvertes. [Services](svg/02-conteneurs.svg) · [Admission](svg/18-admission-livekit.svg)
- **Dans le processus Fastify**, les anciennes routes `/api` coexistent avec les handlers `/api/v1`. Elles conservent leurs propres Maps et certaines proposent un jeton de démonstration ou un upload volatil. Le préfixe et le processus de destination déterminent le traitement réel. [Comparaison des handlers](svg/20-api-locales.svg)

Le sujet classe les comptes, la messagerie privée et de groupe, l’historique, les appels audio et vidéo à deux, le déploiement et la supervision dans le socle. La vue de recette rattache chaque parcours à sa preuve et identifie l’étape à éprouver pour le jury. [Sujet, p. 12 et 17](../../ChatISEN%20-%20Project%20Briefing.pdf) · [Couverture et recette](svg/22-recette.svg)

## Les quatre niveaux C4

| Niveau | Ce qu’il faut reproduire | Diagramme |
|---|---|---|
| 1. Contexte | Membres, enseignant, équipe, accès public et administration privée. | [Contexte](svg/01-contexte.svg) |
| 2. Conteneurs | Caddy, client et serveur standalone et stockage JSON pour la démo. React, Nginx, Fastify, PostgreSQL, LiveKit et supervision pour la recette R01. | [Conteneurs](svg/02-conteneurs.svg) |
| 3. Composants | Compute Engine et Debian 13, Caddy, Node.js sous systemd, identité, messagerie, JSON et signalisation WebRTC. Fastify est détaillé dans un volet de recette. | [Composants](svg/03-composants-api.svg) |
| 4. Code et données | Sur la pile de recette R01, du `clientId` de React à `appendMessage`, puis au commit PostgreSQL et à la livraison WebSocket. | [Code et données](svg/04-code.svg) |

En bleu figurent les composants applicatifs, en gris la configuration, en ambre l’admission expérimentale et en violet la cible réseau ou média à éprouver. Les séquences se lisent de haut en bas. Sur les schémas physiques, `PK` désigne la clé primaire, `FK` la clé étrangère et `UQ` l’unicité.

Le lecteur fonctionne hors ligne. Utiliser `1` à `4` pour changer de niveau, la molette pour zoomer et `F` pour ajuster. Déplier un sujet sous le diagramme, puis cliquer sur son aperçu pour l’agrandir dans le même lecteur. Les liens directs vers les diagrammes de détail restent utilisables.

## Plateformes par environnement

| Environnement | Plateforme et rôle des services | État au repère |
|---|---|---|
| Navigateur sur ordinateur ou mobile | React 19.3.1 pour R01, HTML et JavaScript natifs en standalone. Vite 6.4.6 compile le client React avant sa livraison par Nginx. | Chromium a exécuté la messagerie et une navigation à 390 px, ainsi que les appels directs du profil standalone. [Parcours Chromium](../report/journal-des-preuves.md#e17--parcours-navigateur-réel-sur-postgresql) · [CI avec les appels](../report/preuves/45583168142/extrait.txt) |
| Poste local standalone | Node.js 24 recommandé, lancé par `pnpm dev`. HTTP/WS sur 3000 par défaut, stockage sur fichier JSON. | Appels à deux et notifications exercés sur macOS arm64. [Essai local](../report/journal-des-preuves.md#e22--notifications-et-appels-directs-sur-le-profil-local) |
| Pile locale R01 | Docker Engine et Compose v2. Nginx et PostgreSQL 17 sur des images Alpine, API et migrations sur Node.js 24 et Debian Bookworm slim. LiveKit pour le média, Prometheus et Grafana pour la supervision. | Les huit services et le volume `pgdata` sont décrits dans Compose. La recette HTTPS intégrée reste ouverte. [Compose](../../infra/compose/docker-compose.yml) · [Dockerfile de l’API](../../apps/api/Dockerfile) |
| CI | GitHub Actions, Ubuntu 24.04, Node.js 24, pnpm 10.20.0, PostgreSQL 17 de test et Playwright/Chromium. | Le workflow valide la configuration Compose, compile et exécute les tests. [Workflow R01](../../.github/workflows/r01.yml) |
| Hébergement de démonstration | Compute Engine sur Debian 13, Caddy en ACME/HTTPS et Node.js 24.14.1 sous systemd. Socket publique WSS sur 443, service applicatif sur `127.0.0.1:3000`, fichier JSON sur disque. | Domaine ISEN sondé depuis l’extérieur. STUN observé. Essai média sur deux réseaux à produire. [Déploiement](svg/04-deploiement-gcp.svg) · [Preuve HTTP](https://ia-pple.isen.fedyna.fr/readyz) |

<details>
<summary>Détails du contexte</summary>

- [Profils et points d’entrée](svg/07-profils.svg)
- [Recette et couverture du sujet](svg/22-recette.svg)

</details>

<details>
<summary>Détails des conteneurs</summary>

- [Assemblage Compose local](svg/08-compose.svg)
- [Déploiement de démonstration sur Google Cloud](svg/04-deploiement-gcp.svg)
- [Sondes, métriques et Grafana](svg/19-exploitation.svg)

</details>

<details>
<summary>Détails des composants</summary>

- [Composants Fastify du profil Compose R01](svg/23-composants-fastify.svg)
- [Navigation et état React](svg/09-interface-react.svg)
- [Écrans ordinateur et mobile](svg/21-ecrans.svg)
- [Authentification et révocation](svg/10-identite.svg)
- [Propriété et membres d’un groupe](svg/11-groupes.svg)
- [Serveur standalone, JSON et notifications](svg/16-standalone.svg)
- [Appel WebRTC entre deux pairs](svg/17-appel-direct.svg)
- [Admission LiveKit expérimentale](svg/18-admission-livekit.svg)

</details>

<details>
<summary>Détails du code et des données</summary>

- [Envoi d’un message privé](svg/05-message-prive.svg)
- [Rattrapage après coupure](svg/06-reconnexion.svg)
- [HTTP des comptes et groupes](svg/14-http-identite-groupes.svg)
- [HTTP des messages, WebSocket et appels](svg/15-http-flux-appels.svg)
- [Schéma SQL de la messagerie](svg/12-donnees-chat.svg)
- [Schéma SQL du média et des fichiers](svg/13-donnees-media.svg)
- [API standalone et API historique](svg/20-api-locales.svg)

</details>

## Reconstruire le snapshot

### Base commune

Depuis un dossier neuf avec accès au dépôt, utiliser **Node.js 24** et **pnpm 10.20.0**. Les versions effectivement résolues sont dans le verrou. Elles incluent **React 19.3.1**, **Vite 6.4.6**, **Fastify 5.12.8**, **pg 8.23.1**, **argon2 0.41.1**, **ws 8.23.0** et **prom-client 15.1.3**. Les handlers v1 valident leurs entrées en TypeScript. Le catalogue HTTP/WS est en JSON Schema. Le brouillon d’architecture proposait TypeBox. [Manifeste](../../package.json) · [Verrou](../../pnpm-lock.yaml) · [Contrats](../../packages/contracts/src/index.mjs)

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

### Démonstration déployée sur Google Cloud

L’enseignant ouvre **`https://ia-pple.isen.fedyna.fr/`**. Le frontal redirige HTTP vers HTTPS. [Sondes publiques](https://ia-pple.isen.fedyna.fr/readyz)

Caddy termine le TLS sur la VM Debian 13 et transmet HTTP et l’Upgrade WebSocket vers `127.0.0.1:3000`. L’unité systemd `chatisen.service` lance `apps/standalone/server.mjs` sous Node.js 24.14.1 et écrit sous `/var/lib/chatisen/chatisen.json`. Les navigateurs découvrent des adresses candidates avec STUN et s’échangent directement les pistes. Le profil Compose associé à J1 garde React, Fastify, PostgreSQL et LiveKit. [Diagramme du déploiement](svg/04-deploiement-gcp.svg) · [Fichiers du lot GCP](https://github.com/Zayonx-0/ChatISEN/tree/ab465a31c4eda0ce9290d1168daebd39f29e8e44/ops/gcp) · [Mandat J1](../revisions/R01-socle-j1.md)

**Contrôle** · La sonde `GET /readyz` renvoie `json-demo` et `GET /api/config` renvoie `stun:stun.l.google.com:19302`. L’essai du lot GCP a reçu des pistes synthétiques dans deux contextes Chromium sur une même machine externe. Un essai sur deux réseaux doit encore relever les candidats ICE et les compteurs entrants de chaque côté. [Sondes ISEN](https://ia-pple.isen.fedyna.fr/readyz) · [Lot GCP](https://github.com/Zayonx-0/ChatISEN/pull/2)

## Mettre à jour les diagrammes

Le workspace **Structurizr** ouvre les quatre niveaux. Les trois premiers sont des vues natives du DSL. Le quatrième est un diagramme PlantUML rattaché à `PostgresRepository`. Les séquences et le déploiement utilisent le même modèle DSL. Les autres détails sont produits en PlantUML, dont les schémas de données tirés des migrations. Le lecteur rattache chaque détail à son niveau C4. [Workspace à ouvrir dans Structurizr](workspace.dsl) · [Modèle C4](c4.dsl) · [Sources des détails](details/) · [Catalogue des fiches](vues.json)

Depuis la racine du dépôt, exécuter la commande suivante avec Python 3.9+, Java, Structurizr CLI `v2025.11.09` et PlantUML `1.2025.10`. Les rendus de ce dossier utilisent Java 25.

```sh
python3 docs/architecture/render.py /chemin/structurizr.sh /chemin/plantuml-1.2025.10.jar
```

Le rendu valide le DSL, contrôle la liste des tables, compare les planches HTTP v1 aux handlers Fastify et calcule l’écart avec OpenAPI. Il vérifie les liens, les quatre clés du workspace et le rattachement de chaque SVG au catalogue. Versionner ensemble les sources du dessin, `vues.json`, les SVG et le fichier généré `lecteur.js`. Pour la lecture, ouvrir `index.html` dans la copie locale. [Générateur](render.py) · [CLI Structurizr](https://github.com/structurizr/cli/releases/tag/v2025.11.09) · [PlantUML](https://repo.maven.apache.org/maven2/net/sourceforge/plantuml/plantuml/1.2025.10/)
