# Suivi pilote

| Lot | État | Preuve | Dépendance |
|---|---|---|---|
| 0 contrats/migrations/fixtures | livré | `tests/contract`, commit `acf425d` | PostgreSQL réel requis pour l’essai DB |
| I/C/X J1 API, UI, exécution locale | livré en profil standalone, Compose préparé | `tests/standalone`, `docs/report/validation.md` | daemon Docker et navigateur pour parcours UI |
| M appels | API d’invitation livrée, adaptateur LiveKit Compose préparé | routes `/api/conversations/:id/calls` | accès LiveKit et deux navigateurs |
| E collaboration | route/affichage de base livrés | limite 5 MiB dans API TypeScript | test multipart sur Compose |
| Q qualité/données | scaffold `analysis/study.py` et métriques | run `make study` | export `getStats` humain |
| R fiabilité/sécurité | contrôles et scripts livrés | `docs/security`, `tests/security` | VM/réseaux pour validation complète |
| P performance | protocole documenté, aucune valeur inventée | `ARCHITECTURE-ChatISEN.md` P01–P04 | fenêtre dédiée et k6 |
| V/T remise | README, spécification, rapport, conducteur livrés | `docs/` | répétition média et ACME |

## Écarts justifiés

Le mode standalone est ajouté pour rendre J1 exécutable sans registre npm ni daemon PostgreSQL. Il conserve l’API métier et la sécurité de session/CSRF mais remplace PostgreSQL/Argon2id par JSON/`crypto.scrypt`. Le profil Compose reste la cible architecturelle. Toute valeur non mesurée est marquée à exécuter.
