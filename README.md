# ChatISEN

ChatISEN est un projet académique de communication temps réel en cours de révision. Le socle J1 n’est pas encore reçu : la messagerie du profil cible utilise PostgreSQL, mais les appels audio/vidéo réels et la recette complète restent à démontrer. Voir [le bilan R01](docs/report/r01.md).

Les diagrammes de reconstruction relient chaque profil aux écrans, aux contrats, aux données et aux tests attendus. [Ouvrir la visionneuse locale](docs/architecture/index.html#07-profils) · [Consulter les diagrammes sur GitHub](docs/architecture/README.md)

Le dépôt contient deux profils :

- **standalone** : serveur Node 24 sans dépendance réseau, prévu pour une installation vierge et la démonstration locale. Il persiste les données dans `data/chatisen.json`, expose HTTP, SSE et WebSocket natif, et sert le client responsive dans `apps/web/public/`.
- **compose** : profil cible de l’architecture, avec PostgreSQL 17, API Fastify/TypeScript, client React/Vite, LiveKit, Nginx, Prometheus et Grafana. Il se lance quand Docker et les images sont disponibles.

## Démarrage rapide

```sh
cd Projet
make doctor
make seed                 # facultatif : crée Alice/Bob avec password123
PORT=3000 make dev
# ouvrir http://localhost:3000
```

Créer deux comptes dans deux fenêtres privées, rechercher le handle de l’autre, créer la conversation et envoyer un message. Le serveur standalone notifie les abonnés autorisés par WebSocket. Sur `localhost`, les appels directs audio/vidéo utilisent WebRTC entre les navigateurs : les deux participants doivent autoriser le microphone et, pour la vidéo, la caméra. Les notifications apparaissent dans l'application ; utilisez « Activer les notifications » pour autoriser aussi les notifications du navigateur lorsque l'onglet est en arrière-plan. Ce mode local n'utilise ni LiveKit ni relais TURN : il ne garantit pas les appels entre réseaux différents. Pour appliquer une mise à jour du serveur, arrêtez-le avec `Ctrl+C`, relancez `PORT=3000 make dev`, puis rechargez la page. Les données locales restent dans `data/chatisen.json`.

```sh
make verify LEVEL=core    # échoue tant que les critères de recette R01 sont ouverts
make up                   # profil Compose reproductible
make down
```

Les comptes de fixture sont `alice`, `bob`, `chloe`, `david` dans `fixtures/users.json`. Pour une instance publique, définir `CSRF_SECRET`, `COOKIE_SECURE=true`, un certificat TLS Nginx et les secrets LiveKit ; ne jamais publier `data/`.

## Contrats et données

Les schémas HTTP/WS v1, l’OpenAPI, les exemples valides/invalides et le catalogue d’erreurs sont dans [`packages/contracts`](packages/contracts). La migration PostgreSQL est idempotente dans [`db/migrations/001_initial.sql`](db/migrations/001_initial.sql) et le runner transactionnel dans [`db/migrate.mjs`](db/migrate.mjs). Les résultats de vérification sont archivés dans `artifacts/`.

## Limites connues

Les migrations et les écritures métier ont été testées sur PostgreSQL, sans constituer une recette complète de la pile Compose. Le relais TURN/TLS, le média LiveKit reçu, le renouvellement ACME, la sauvegarde chiffrée restaurée sur VM et les parcours Firefox restent à jouer sur le profil Compose/VM ; chaque dépendance est listée dans [`docs/report/validation.md`](docs/report/validation.md). Le profil standalone utilise `crypto.scrypt` pour ne pas dépendre d’un téléchargement npm ; le profil API TypeScript conserve l’implémentation Argon2id prévue.
