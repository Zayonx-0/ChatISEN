# ChatISEN

ChatISEN est une plateforme académique de communication temps réel : comptes, conversations directes et de groupe, historique ordonné, appels audio/vidéo, partage de fichier et suivi opérationnel.

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

Créer deux comptes dans deux fenêtres privées, rechercher le handle de l’autre, créer la conversation et envoyer un message. Le serveur notifie les abonnés par WebSocket. Une invitation d’appel audio/vidéo affiche le contrôle d’acceptation ; le profil Compose fournit le service LiveKit pour le transport média réel.

```sh
make verify               # typecheck statique, contrats et recette API (un socket local est requis)
make up                   # profil Compose reproductible
make down
```

Les comptes de fixture sont `alice`, `bob`, `chloe`, `david` dans `fixtures/users.json`. Pour une instance publique, définir `CSRF_SECRET`, `COOKIE_SECURE=true`, un certificat TLS Nginx et les secrets LiveKit ; ne jamais publier `data/`.

## Contrats et données

Les schémas HTTP/WS v1, l’OpenAPI, les exemples valides/invalides et le catalogue d’erreurs sont dans [`packages/contracts`](packages/contracts). La migration PostgreSQL est idempotente dans [`db/migrations/001_initial.sql`](db/migrations/001_initial.sql) et le runner transactionnel dans [`db/migrate.mjs`](db/migrate.mjs). Les résultats de vérification sont archivés dans `artifacts/`.

## Limites connues

Le portable de préparation n’expose pas de daemon PostgreSQL, de DNS public, de second réseau ni de périphériques média. Le test de migration réelle, le relais TURN/TLS, le média LiveKit reçu, le renouvellement ACME, la sauvegarde chiffrée restaurée sur VM et les parcours Firefox restent à jouer sur le profil Compose/VM ; chaque dépendance est listée dans [`docs/report/validation.md`](docs/report/validation.md). Le profil standalone utilise `crypto.scrypt` pour ne pas dépendre d’un téléchargement npm ; le profil API TypeScript conserve l’implémentation Argon2id prévue.
