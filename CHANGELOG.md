# Changelog

## 1.1.0 — en cours, non publiée

- Les transports WS et SSE du profil standalone contrôlent les sessions, origines et appartenances ; les abonnements sont revalidés à la diffusion.
- Fastify vérifie l'origine, la session et l'appartenance au moment de l'abonnement, puis à la diffusion, sur son stockage actuel en mémoire.
- Node 24 et pnpm 10.20.0, verrou des dépendances, compilation TypeScript/Vite et configuration HTTPS locale préparée.
- `make verify LEVEL=core` échoue explicitement tant que les parcours obligatoires de R01 ne sont pas prouvés.

Ces changements ne constituent pas encore une livraison J1 : la persistance PostgreSQL, le transport média LiveKit, les parcours intégrés et la validation Compose restent ouverts. Voir `docs/report/r01.md`.
