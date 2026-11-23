# Validation et écarts

Run de préparation : **2026-11-23 UTC**, poste macOS arm64, Node 24.14.1 (le binaire npm disponible est Node 21.6.0), Docker CLI 29.8.0 sans daemon accessible, aucun PostgreSQL local, aucun domaine public ni second réseau.

## Résultats réels

- Contrats HTTP/WS, fixtures et migration statiquement contrôlés : **7 tests passés, 1 essai PostgreSQL ignoré** sans `DATABASE_URL` (`node --test tests/contract/contract.test.mjs`).
- Recette API standalone comptes → groupe → message → historique : **1 test passé** (`node --test tests/standalone.test.mjs` avec permission de socket locale).
- Vérification syntaxique du serveur, du runner de migration et des scripts : **OK** (`node --check`, `make typecheck`).
- Le serveur standalone démarre et sert l’interface responsive ; l’échange WebSocket et la reprise via journal JSON sont implémentés.

## Essais dépendants d’un accès externe ou humain

PostgreSQL réel et double application du runner ; LiveKit avec deux pistes audio/vidéo reçues ; conférence à quatre ; ICE relay TURN/TLS ; partage de fenêtre natif ; Firefox ; deux réseaux ; TLS ACME ; IaC Hetzner ; backup `pg_dump` chiffré restauré ; paliers k6 P01–P04 ; collecte `getStats` et étude A01–A03 ; démonstration avec casques/caméras. Ces essais ont une commande et un résultat attendu dans `docs/runbooks/` et restent explicitement `à exécuter`.

Écart justifié : le mode standalone utilise `crypto.scrypt` et JSON afin de fournir une installation sans registre npm ni daemon DB. Le mode Compose conserve Argon2id/PostgreSQL/LiveKit, mais n’a pas pu être démarré sur ce poste. Aucun résultat média ou de capacité n’est inventé.
