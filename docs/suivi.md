# Suivi de révision R01

Base : `v1.0.0` / `a3241a92f4efe2781213914df29794e2513d1a23`. La branche `rev/01-socle-j1` et sa PR portent les travaux intermédiaires ; le jalon J1 et la version 1.1.0 restent non reçus.

| Lot | État | Preuve et reste à faire |
|---|---|---|
| A confidentialité | Partiel | Tests WS/SSE standalone et WS Fastify sur source mémoire ; contrôle des sessions et appartenances PostgreSQL, origine/expiration et révocation média à compléter. |
| B construction | Partiel | Verrou pnpm, builds et typecheck Node 24 ; syntaxe Compose validée sur CI. Démarrage, seed, certificats et cookie navigateur restent à tester. |
| C identité et chat PostgreSQL | Ouvert | Migration PostgreSQL 17 testée deux fois en CI ; routes contractuelles, stockage métier, transactions et reprise restent à réaliser. |
| D média | Ouvert | Admission LiveKit et réception audio/vidéo encore absentes. |
| E parcours/CI | Partiel | Workflow et recette qui échoue si les preuves manquent ; Playwright, métriques et démonstration restent à réaliser. |

Résultats et SHA : [rapport R01](report/r01.md). Le [mandat](revisions/R01-socle-j1.md) définit la réception et les travaux restants.
