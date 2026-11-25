# Réception Mandatory du 25 novembre 2026

**Décision à 12 h 28 UTC sur le main `e2ae3537f122b0408216809f0432d1ba0f51911b`, complétée par le rejeu local. Réception ouverte.** Le site HTTPS fournit le direct, l’historique et les appels à deux. Pour démarrer une discussion de groupe depuis ce même site, le jury aurait besoin d’un appel HTTP manuel. Le profil React permet de créer le groupe depuis l’interface. Ses appels LiveKit et sa supervision intégrée restent à éprouver. Les six capacités du PDF doivent pouvoir se montrer sur une même installation. [Briefing, p. 12](../../ChatISEN%20-%20Project%20Briefing.pdf) · [Code audité](https://github.com/Zayonx-0/ChatISEN/tree/e2ae3537f122b0408216809f0432d1ba0f51911b)

La création de groupe sur le site a été ajoutée et vérifiée après cet audit ; voir [E30](journal-des-preuves.md#e30--recette-de-groupe-sur-le-site-déployé). Le tableau ci-dessous conserve le constat historique du commit audité.

## Ce que le jury peut faire

| Critère du PDF | Ce qui a été vérifié | État de réception |
|---|---|---|
| M1 · Authentification et gestion des utilisateurs | Sur standalone, deux sessions indépendantes créent leur compte, retrouvent un contact, se déconnectent et se reconnectent. Sur l’API v1, les tests PostgreSQL couvrent profils et sessions. | Parcours de base démontré. |
| M2 · Messages privés et de groupe | Le direct fonctionne sur les deux clients. Sur React, Alice crée le groupe depuis l’écran. Sur le client de GCP, seule la création d’un direct est câblée. Le test local supplémentaire a créé le groupe par API et confirmé sa lecture et son utilisation dans trois navigateurs. | **Écart fonctionnel sur le site du jury** à la création du groupe. |
| M3 · Temps réel et historique | Alice et Bob voient les réponses puis les retrouvent après rechargement. Sur React et PostgreSQL, Bob retrouve aussi les 20 envois effectués pendant sa déconnexion et l’historique survit au redémarrage du processus API. | Livré sur les parcours testés. Le test de redémarrage porte sur PostgreSQL. |
| M4 · Appel vocal à deux | Sur standalone, invitation, acceptation, octets RTP audio reçus des deux côtés, commande micro, fin d’appel et refus ont été exercés. Le tiers est refusé. | Démontré entre deux contextes Chromium, périphériques synthétiques. La réception à travers la SFU du profil cible reste ouverte. |
| M5 · Appel vidéo à deux | Sur standalone, les deux participants décodent des images distantes, la caméra locale peut être désactivée/réactivée, les deux interfaces constatent le raccrochage. | Démontré sur le même banc. Un appel entre réseaux distincts reste à mesurer. |
| M6 · Déploiement et supervision de base | Domaine ISEN en HTTPS, page, santé, disponibilité et deux séries de métriques accessibles. Le dépôt contient la configuration Caddy/systemd pour reproduire la démo. Sur Compose, la CI valide la configuration. | Déploiement et sondes de base observés. L’évolution du tableau Grafana pendant le parcours Compose prévu par R01 reste à démontrer. |

Les exigences propres à notre mandat R01 incluent le démarrage d’un clone neuf sur Compose/HTTPS, le seed PostgreSQL rejouable, le média reçu via LiveKit et la lecture du tableau de bord. La page 12 du briefing demande un déploiement et une supervision de base. Le choix de PostgreSQL, de la SFU et de Grafana appartient à l’équipe. [Mandat R01](../revisions/R01-socle-j1.md) · [Parcours React](../../tests/e2e/chat.spec.ts) · [Parcours standalone](../../tests/e2e/standalone.spec.ts)

## Éléments de preuve et reproduction

**GitHub.** Les PR 1 (R01), 2 (GCP), 3 (messagerie) et 4 (architecture) sont fusionnées. Le tag distant annoté `v1.0.0` se résout en `a3241a92f4efe2781213914df29794e2513d1a23`. La consultation `gh release list` ne renvoie aucune release au moment du contrôle. Le champ `version` du package racine vaut déjà `1.1.0`. Conserver le tag historique et vérifier de nouveau les références distantes à la prochaine réception. [PR 1](https://github.com/Zayonx-0/ChatISEN/pull/1) · [Écart entre le tag et le main audité](https://github.com/Zayonx-0/ChatISEN/compare/v1.0.0...e2ae3537f122b0408216809f0432d1ba0f51911b)

**CI GitHub Actions.** Le run `45611568525` porte sur ce SHA. Ubuntu 24.04, Node 24, pnpm 10.20.0 et PostgreSQL 17. Installation depuis le verrou, validation de la configuration Compose, typecheck, build, **17 tests réussis, aucun ignoré, 3 parcours Chromium réussis en 31,5 s**. Le workflow fait tourner les serveurs de test. Il exécute `docker compose … config --quiet` et omet le démarrage de la pile et `make verify LEVEL=core`. [Run et logs](https://github.com/Zayonx-0/ChatISEN/actions/runs/45611568525) · [Workflow](../../.github/workflows/r01.yml)

**Rejeu indépendant du SHA.** Worktree neuf sur macOS, Node 24.14.1, pnpm 10.20.0, PostgreSQL **16.15** jetable sur loopback, Chrome de la machine avec les périphériques synthétiques du projet. Pour rejouer, fournir dans `DATABASE_URL` une base de test vide, installer Chromium pour Playwright ou fournir `CHATISEN_CHROMIUM_PATH`. Le plugin Docker Compose est absent du poste.

```sh
pnpm install --frozen-lockfile
make verify LEVEL=core
# Reprendre dans le shell après le code 2 de make observé sur ce SHA.
node db/migrate.mjs
pnpm test:e2e
```

```text
make verify LEVEL=core → typecheck et build réussis
tests 17   pass 17   fail 0   skipped 0
Recette core incomplète : les scénarios R01 sur Compose, PostgreSQL, navigateurs et média ne sont pas encore automatisés.
pnpm verify → 1 ; make → 2
pnpm test:e2e → 3 passed (48.6s), exit 0
```

**Contre-épreuve du groupe.** Sur une instance standalone neuve avec JSON temporaire, inscrire Alice, Bob et Chloé dans trois contextes isolés. Examiner les actions à l’accueil, dans les résultats de recherche de Bob puis dans le direct. Le client ne propose aucune action de création de groupe. Avec la session et le CSRF d’Alice, envoyer `POST /api/conversations` avec `type=group`, `title` et `memberIds=[Bob, Chloé]`. Chaque compte recharge, ouvre le groupe, Alice envoie un texte depuis le champ Message. Résultat brut du contrôle ciblé ci-dessous. L’unique création câblée dans le client envoie `type: 'direct'`. [Client standalone](../../apps/web/public/app.js) · [Serveur standalone](../../apps/standalone/server.mjs)

```text
Boutons groupe (accueil, recherche, fil direct) 0 0 0
Groupe créé par API HTTP 201 puis message visible une fois dans chacun des trois fils navigateur.
```

**Sondes GCP en lecture seule le 25 novembre à 12 h 28 UTC, empreinte du client contrôlée ensuite.** Aucun compte de recette créé sur le site public. L’empreinte permet de rattacher la contre-épreuve au JavaScript réellement servi. Elle identifie cet asset, pas la totalité de la VM. [Démo](https://ia-pple.isen.fedyna.fr/) · [Déploiement versionné](../../ops/gcp/README.md)

```text
GET /           HTTP 200, vérification TLS 0 (succès)
GET /healthz    HTTP 200, status=ok, service=chatisen-standalone
GET /readyz     HTTP 200, status=ready, persistence=json-demo
GET /metrics    HTTP 200, chatisen_users_total et chatisen_messages_total
SHA-256 /app.js distant et apps/web/public/app.js du SHA audité
0e605c33bd45114cfdca52262f2e17e1bfc3aa8e6a429ace14249eb34cae9b34
```

## Ce qui permet de prononcer la réception

1. Sur l’URL candidate, trois comptes neufs créent leur groupe entièrement à l’écran, échangent dans le groupe et en direct, rechargent l’historique et vérifient l’exclusion d’un tiers. Sur **cette même version**, deux d’entre eux passent un appel audio puis vidéo avec réception mesurée.
2. Pour clôturer R01, démarrer la pile cible depuis volumes vides. Rejouer les migrations et le seed deux fois. Vérifier session HTTPS, reprise, confidentialité, médias bidirectionnels et tableau Grafana associé à la fenêtre du test. Le garde `core` doit refléter ces résultats et échouer si un test requis est ignoré. [Script de vérification](../../scripts/verify.mjs)
3. Consigner SHA, profil, environnement, nombre de cas exécutés et liens vers preuves. Après validation de ce SHA sur `main`, le prochain tag prévu par R01 est `v1.1.0` s’il est disponible. Le millésime produit « première version fonctionnelle » et le nom du tag Git historique ont ici deux références distinctes. [Mandat Advanced et transmission à SOL](../revisions/R02-advanced-luna.md)
