# Suivi du lot 0 — contrats, migrations et fixtures

Ce lot fige la version `v1` consommée par l’API et le client. Les identifiants sont des UUID opaques, les séquences sont des chaînes décimales, les dates sont en UTC (`Z`) et les erreurs utilisent toujours `{code,message,requestId}`.

| Élément | Chemin | État |
|---|---|---|
| Schémas HTTP et DTO | `packages/contracts/schemas/http.json` | livré |
| Enveloppes WebSocket | `packages/contracts/schemas/ws.json` | livré |
| Catalogue OpenAPI | `packages/contracts/schemas/openapi.json` | livré |
| Export runtime et types | `packages/contracts/src/index.mjs`, `index.d.ts` | livré |
| Migration SQL v1 | `db/migrations/001_initial.sql` | livré |
| Runner idempotent | `db/migrate.mjs` et `db/node-pg-migrate/001_initial.cjs` | livré |
| Fixtures démo et exemples | `fixtures/` | livré |
| Tests de compatibilité | `tests/contract/` | livré |

Commande locale sans dépendance externe :

```sh
node --test tests/contract/contract.test.mjs
```

Le test applique les contrôles statiques de la migration et valide les exemples de réussite/erreur. Avec une base PostgreSQL de test et `DATABASE_URL`, il exécute deux passes du runner et vérifie que la seconde n’ajoute aucune migration. Le test PostgreSQL est marqué ignoré quand cette variable n’est pas fournie ; aucun serveur n’était disponible dans l’environnement de préparation.

Le runner direct utilise le paquet `pg` fourni par l’application. Le fichier `db/node-pg-migrate/001_initial.cjs` garde une entrée compatible avec la CLI `node-pg-migrate`; il délègue au même SQL versionné afin d’éviter une divergence entre les deux chemins.
