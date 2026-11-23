# ADR 001 — monolithe modulaire et SFU auto-hébergée

**Statut : accepté.** Fastify/TypeScript porte identity, chat, calls, files et telemetry ; PostgreSQL est la source durable ; LiveKit transporte les pistes ; Nginx termine TLS. Cette combinaison limite les déploiements tout en isolant la panne média du chat et permet un journal `LISTEN/NOTIFY` vérifiable.

Alternatives écartées : microservices métier (contrats et pannes distribuées sans gain mesuré), Redis Pub/Sub (broker critique et non durable), maillage WebRTC (débit client qui croît avec le nombre de participants), stockage objet (seconde cohérence inutile sous 5 MiB).

Validation : F04–F08, O04, P01–P03. Les valeurs réelles et les limites sont dans `docs/report/validation.md`.
