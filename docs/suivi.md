# Suivi de révision R01

Base : `v1.0.0` / `a3241a92f4efe2781213914df29794e2513d1a23`. La branche `rev/01-socle-j1` et sa PR portent les travaux intermédiaires ; le jalon J1 et la version 1.1.0 restent non reçus.

| Lot | État | Preuve et reste à faire |
|---|---|---|
| A confidentialité | Partiel | Tests WS/SSE standalone et WS Fastify sur source mémoire ; contrôle des sessions et appartenances PostgreSQL, origine/expiration et révocation média à compléter. |
| B construction | Partiel | Verrou pnpm, builds et typecheck Node 24 ; syntaxe Compose validée sur CI. Démarrage, seed, certificats et cookie navigateur restent à tester. |
| C identité et chat PostgreSQL | Partiel | Repository transactionnel, test de concurrence et identité, direct et historique `/api/v1` raccordés à PostgreSQL (`1b631bc`, CI 45193174450) ; rattrapage HTTP et WebSocket PostgreSQL (`b5fbe96`, CI 45195526535) ; groupes, interface, reprise après coupure réelle et redémarrage complet restent à réaliser. |
| D média | Ouvert | Admission LiveKit et réception audio/vidéo encore absentes. |
| E parcours/CI | Partiel | Workflow des contrôles disponibles vert sur le run 45176334218 ; la recette J1 reste séparée et bloquante, Playwright, métriques et démonstration restent à réaliser. |

Résultats et SHA : [rapport R01](report/r01.md). Le [mandat](revisions/R01-socle-j1.md) définit la réception et les travaux restants.

## Convention de rédaction et de preuves

Cette convention s'applique à R01 et aux révisions suivantes jusqu'à la remise. Lorsqu'un lot se termine ou se trouve bloqué, son sous-agent transmet au pilote les changements, le SHA testé, l'environnement, les commandes ou protocoles, les résultats observés (échecs et essais ignorés compris), les limites et les liens vers les preuves. Une simple présence de fichier ou un test avec mocks ne vaut pas réception du scénario intégré.

Le pilote vérifie les résultats sur le commit et le run correspondants, puis ajoute une entrée datée en UTC dans le [journal des preuves](report/journal-des-preuves.md), avec le lot, les IDs de recette, l'attendu, l'observé et sa portée. Il conserve par lien les artefacts existants et archive dans `docs/report/preuves/<id-du-run>/` un extrait CI court et expurgé des secrets, cookies et données personnelles. Une correction donne lieu à une nouvelle entrée qui renvoie à l'essai précédent ; le pilote distingue le SHA de tête de PR du SHA de fusion temporaire réellement testé par Actions.

Après chaque entrée, le pilote met à jour les paragraphes concernés du [rapport technique](report/rapport-technique.md) et rattache chaque résultat chiffré à son entrée. Si une expérience infirme un choix, il garde la décision initiale et l'essai dans le journal, puis explique dans le rapport les observations qui motivent l'évolution. Les essais non réalisés restent explicitement ouverts. La publication d'une version demeure soumise aux critères de réception du mandat applicable ; cette convention documentaire ne les remplace pas.

### Contrôles automatisés GitHub et réception

Le workflow de PR exécute les vérifications disponibles (installation figée, configuration Compose, types, builds et tests avec PostgreSQL). Il ne joue pas la recette intégrée encore incomplète. Son résultat vert signifie seulement que ces contrôles passent ; le résumé du run rappelle les preuves J1 manquantes. `make verify LEVEL=core` conserve son échec explicite tant que les critères ne sont pas implémentés, et reste une condition de réception avant la publication de `v1.1.0`. Le workflow ne se déclenche qu'une fois par mise à jour de PR, plutôt que sur le push de la branche et sur la PR à la fois.
