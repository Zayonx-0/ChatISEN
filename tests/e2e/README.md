# Parcours navigateur R01

Ce scénario utilise deux contextes Chromium distincts sur le profil Compose PostgreSQL : inscription, cookie sécurisé, direct, messages dans les deux sens, 20 messages récupérés après 15 secondes sans page ouverte, groupe, navigation à 390 px, puis redémarrage de l'API et vérification de l'historique. Il vérifie les marqueurs dans PostgreSQL avant et après le redémarrage. Les contextes sont enregistrés dans deux traces Playwright ; le test ne couvre pas les appels média ni les autres critères de réception R01.

Prérequis : Node 24, pnpm, Docker Compose v2 et démon fonctionnel, mkcert, certificats `infra/edge/certs/localhost.crt` et `.key`, CA mkcert approuvée par le système et Chromium, et dépendance de développement racine `@playwright/test` avec Chromium installé (`pnpm exec playwright install chromium`). Le test ne désactive pas la vérification TLS. La pile doit être construite à partir du code à tester et libre sur les ports publiés. Employer **uniquement une base et des volumes jetables** : les comptes et messages créés restent présents jusqu'à la suppression des volumes.

Depuis la racine du dépôt, après `make bootstrap` :

```sh
export R01_COMPOSE_PROJECT=r01-e2e-local
export R01_BASE_URL=https://localhost
docker compose -p "$R01_COMPOSE_PROJECT" -f infra/compose/docker-compose.yml up -d --build
pnpm exec playwright test -c tests/e2e/playwright.config.mjs
# Après avoir conservé les preuves :
docker compose -p "$R01_COMPOSE_PROJECT" -f infra/compose/docker-compose.yml down -v
```

Le test exige le préfixe `r01-e2e-` pour le projet ciblé par `docker compose restart api`. Il vérifie avant ce redémarrage que les comptes et un message du navigateur existent dans la base de ce projet, afin de détecter un mauvais ciblage. Ne pas le diriger vers un environnement partagé. Les traces, captures et observations figurent sous `artifacts/playwright-results/` et le rapport HTML sous `artifacts/playwright-report/`. Elles peuvent contenir les données synthétiques et les cookies de test : les traiter comme des artefacts sensibles et les conserver selon la politique du projet.

La seule découverte des tests se fait avec `pnpm exec playwright test -c tests/e2e/playwright.config.mjs --list` ; elle ne constitue pas une exécution de recette. Un échec, une absence de Docker ou de CA, ou une erreur de navigateur garde le scénario ouvert.


## Contrôle automatisé local et CI

`pnpm test:e2e` lance `tests/e2e/chat.spec.ts` sur une base PostgreSQL déjà migrée, avec une API Fastify et le proxy Vite sur des ports temporaires. Il utilise des contextes Chromium séparés, vérifie les cookies, le refus d'un tiers, les échanges, un groupe, une coupure de 15 secondes, la récupération de 20 messages et l'historique après redémarrage de l'API. Ce contrôle HTTP sur loopback ne remplace pas le parcours Compose HTTPS décrit ci-dessus ni les appels audio/vidéo. Les traces de comptes synthétiques sont enregistrées dans `artifacts/playwright-results/` et peuvent contenir leurs cookies : elles ne sont pas versionnées et leur accès doit rester limité.
