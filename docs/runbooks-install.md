# Runbook installation et reprise

1. Installer Node 24 et Docker Compose v2. 2. `cp .env.example .env`, modifier les secrets. 3. `make up`; vérifier `curl http://localhost/healthz`. 4. `docker compose exec api node db/migrate.mjs` si les migrations sont montées dans l’image. 5. Exécuter `make verify`. 6. Pour une reprise : `docker compose restart api`, contrôler `/readyz`, puis vérifier la séquence des messages. 7. Pour une restauration : arrêter l’API, restaurer le dump PostgreSQL dans une base vierge, relancer les migrations compatibles et archiver le RPO/RTO.

Le profil standalone se lance avec `PORT=3000 make dev` et peut être supprimé avec `rm -f data/chatisen.json`.
