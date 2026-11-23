# Journal chronologique des preuves

Ce journal conserve les observations, y compris les échecs et les essais ignorés. Les dates sont en UTC ; lorsqu'un document source ne donne que le jour, l'heure reste inconnue. Un SHA indique le code examiné ou testé, pas nécessairement le commit contenant ce journal. Les liens de run concernent le dépôt privé et exigent ses droits d'accès. Les extraits sont volontairement limités aux lignes utiles, sans jeton, cookie ni données personnelles.

## E00 — Initialisation, V1.0 publiée et ouverture de R01

- **Date UTC :** 2026-11-23, entre 10:14 et 11:26 UTC d'après les commits. **Lot / IDs :** dépôt initial, lot 0, puis ouverture de R01 ; O01, D01.
- **SHA / environnement :** dépôt initial `9e0cc6357d80f77bd68455e0c69b930ae970dd96`, contrats et migration `87835b0ed9f6b71da68ddfdecf0bcc9baeeb5f14`, application et déploiement initial `861fa808d0d5ff46d8c52cdb71e3835938fbf2f2`, tag publié `v1.0.0` sur `a3241a92f4efe2781213914df29794e2513d1a23`.
- **Protocole et attendu :** partir du cahier et du PDF, créer le dossier `Projet`, initialiser Git, geler les contrats, migrations et fixtures, puis publier le socle sur le dépôt privé GitHub.
- **Observé :** dépôt privé `Zayonx-0/ChatISEN`, branche `main`, tag `v1.0.0`, puis branche `rev/01-socle-j1` et PR nº 1 depuis le SHA V1.0. Le mandat et l'audit R01 ont été committés dans `83f425f68b1af0d3a4326a6348f806fee5b2ec59`.
- **Limite :** la publication V1.0 ne constituait pas une réception J1 ; l'audit a ensuite confirmé les écarts de confidentialité, de persistance et de média. La branche R01 reste le lieu de travail ; aucun `v1.1.0` n'est publié.
- **Sources :** [dépôt privé](https://github.com/Zayonx-0/ChatISEN), [tag v1.0.0](https://github.com/Zayonx-0/ChatISEN/releases/tag/v1.0.0), [mandat R01](../revisions/R01-socle-j1.md), [audit V1.0](audit-livraison.md).

## E01 — Choix de départ : identité locale et architecture

- **Date UTC :** 2026-11-23, heure non conservée. **Lot / IDs :** architecture initiale ; F01, S01–S03, F04–F08, O04.
- **SHA / environnement :** `9e0cc6357d80f77bd68455e0c69b930ae970dd96`, architecture documentée ; comparaison de conception, aucune mesure d'exploitation.
- **Protocole et attendu :** examiner les options présentées dans le cahier et justifier un service qui couvre identité, chat et appels.
- **Observé :** l'équipe retient une session locale dans Fastify et une SFU LiveKit, avec PostgreSQL comme cible de persistance. Keycloak est écarté en raison de l'administration, de la configuration et de la prise en main supplémentaires.
- **Limite :** choix de conception, sans mesure comparative de temps ou de ressources ; son bon fonctionnement reste à prouver par les recettes associées.
- **Sources :** [cahier d'architecture](../../ARCHITECTURE-ChatISEN.md#2-architecture-retenue), [ADR 001](../adr/001-choix.md), [briefing, pages 4 à 17](../../ChatISEN%20-%20Project%20Briefing.pdf).

## E02 — Vérification initiale partielle et essai PostgreSQL ignoré

- **Date UTC :** 2026-11-23, heure non conservée. **Lot / IDs :** lot 0 et socle initial ; F01, F03–F04, O01, contrats HTTP/WS.
- **SHA / environnement :** `861fa808d0d5ff46d8c52cdb71e3835938fbf2f2` selon le manifeste ; poste macOS arm64. Le manifeste indique Node 24 au shell et Node 21 pour les commandes npm/tests.
- **Commande et attendu :** `npm run typecheck`, `node --test tests/standalone.test.mjs`, `node --test tests/contract/contract.test.mjs` ; compilation, parcours court et contrats conformes.
- **Observé :** le manifeste rapporte le parcours standalone réussi, sept tests de contrat réussis et un test PostgreSQL ignoré faute de `DATABASE_URL`. Le contrôle nommé `typecheck` vérifiait alors la présence de contenu dans des fichiers et ne constituait pas une compilation TypeScript ; l'audit E04 l'a établi.
- **Limite :** aucun test de migration réelle dans ce run, aucun parcours navigateur ni appel réel ; le manifeste synthétique ne contient pas les journaux bruts. Correction et nouveau contrôle : E05 et E06.
- **Sources :** [manifeste initial](../../artifacts/verification-20261123.json), [validation initiale](validation.md), [audit V1.0](audit-livraison.md).

## E03 — Expériences initiales ouvertes

- **Date UTC :** 2026-11-23, heure non conservée. **Lot / IDs :** essais techniques, média et étude ; F05–F07, A01–A03.
- **SHA / environnement :** `a3241a92f4efe2781213914df29794e2513d1a23` pour les essais techniques ; poste local, sans pile média opérationnelle. L'artefact d'étude est rattaché à la campagne initiale.
- **Protocole et attendu :** essai `LISTEN/NOTIFY` avec commit, rollback et rattrapage ; appel avec pistes reçues ; étude sur export `getStats`.
- **Observé :** ces essais ne sont pas exécutés dans le relevé initial ; l'étude signale l'absence d'export `getStats`.
- **Limite :** aucune mesure de qualité, performance ou réception média n'en résulte. E06–E07 prouvent le test du runner de migration, pas cet essai de notification.
- **Sources :** [essais techniques](../technical-spikes.md), [résultat de l'étude](../../artifacts/study-20261123.json), [protocole dans le cahier](../../ARCHITECTURE-ChatISEN.md#5-recette-commune-à-tous-les-agents).

## E04 — Audit de la V1.0 : J1 refusé

- **Date UTC :** 2026-11-23, heure non conservée. **Lot / IDs :** audit V1.0 ; S01–S03, F01–F07, O01–O02.
- **SHA / environnement :** `a3241a92f4efe2781213914df29794e2513d1a23` ; audit sur macOS arm64 et PostgreSQL 16.15 jetable, compilation et injections Fastify sous Node 24.
- **Protocole et attendu :** revue de code et de configuration, compilation réelle, tests de contrats et migration, injections HTTP ; vérifier le socle et l'isolement.
- **Observé :** souscriptions WS sans contrôle de session ou d'appartenance dans les deux serveurs ; écritures Fastify en mémoire ; jetons d'appel de démonstration et absence de réception média ; échec de compilation API et contrôle TypeScript web ; YAML Compose invalide. L'audit rapporte huit tests de contrat/migration réussis sur PostgreSQL 16.15, dont deux passages du runner. Une lecture anonyme du profil effectif a rendu 401, mais la route contractuelle `/api/v1/me` a rendu 404.
- **Limite :** constat d'audit, pas de parcours média ou d'installation complète ; la version PostgreSQL de l'essai diffère de la cible 17. Les résultats numériques viennent du rapport d'audit, sans copie des logs détaillés. Corrections partielles : E05 et E06.
- **Sources :** [audit V1.0](audit-livraison.md), [code V1.0 identifié](https://github.com/Zayonx-0/ChatISEN/tree/a3241a92f4efe2781213914df29794e2513d1a23).

## E05 — R01 : correctifs de souscription et builds locaux

- **Date UTC :** 2026-11-23, avant 10:54 UTC ; heure exacte des essais non conservée. **Lot / IDs :** A et B ; S01–S02, O01.
- **SHA / environnement :** `088714e6c5478182011e35f080874b3b6021976f` ; macOS arm64, Node 24.14.1, pnpm 10.20.0. Correctifs introduits par `60d1c20014eba0016a3f580bab33c896cfb64674` et `d045f6ce49f7a3f7cd660d486940f6099a31bd32` après l'incident E04.
- **Protocole et attendu :** typecheck et builds réels, puis `make verify LEVEL=core` avec contrôles des abonnements autorisés et révoqués.
- **Observé :** builds et typechecks réussis ; dix tests réussis, un ignoré sans `DATABASE_URL` ; la commande core termine en échec explicite car les parcours exigés ne sont pas implémentés.
- **Limite :** serveur Fastify encore en mémoire ; test local sans PostgreSQL ; pas de pile Compose complète, ni test navigateur/média. L'absence de log brut local empêche de détailler les horodatages ou effectifs autrement que par le relevé synthétique. Suite : E06, E07.
- **Sources :** [relevé R01](r01.md), [comparaison du correctif standalone](https://github.com/Zayonx-0/ChatISEN/commit/60d1c20014eba0016a3f580bab33c896cfb64674), [correctif Fastify](https://github.com/Zayonx-0/ChatISEN/commit/d045f6ce49f7a3f7cd660d486940f6099a31bd32).

## E06 — CI 45160291783 : configuration Compose et migration PostgreSQL 17

- **Date UTC :** 2026-11-23, 10:54:23–10:55:07. **Lot / IDs :** A–C et E ; S01–S02, O01 et contrat de migration.
- **SHA / environnement :** tête PR `2841f832788e5362804d566771b1f841344db4b1`, fusion temporaire testée `4122ce7b4001b4d41b1e60353b857d299cf9f2f2` avec la base `a3241a92f4efe2781213914df29794e2513d1a23` ; runner GitHub Actions Ubuntu, Node 24, pnpm 10.20.0 et service `postgres:17`.
- **Commande et attendu :** installation depuis le verrou, `docker compose -f infra/compose/docker-compose.yml config --quiet`, puis `make verify LEVEL=core` ; la migration est appelée deux fois sur la base de test et le second passage ne doit rien appliquer.
- **Observé :** validation de configuration réussie ; builds et onze tests réussis, aucun ignoré ; le test de migration à deux passages réussit. La recette core échoue ensuite délibérément, les parcours intégrés n'étant pas automatisés. L'échec du job est conservé dans l'extrait.
- **Limite :** le test appelle bien le runner deux fois et vérifie que la seconde liste est vide ; son assertion sur la première liste (`length >= 0`) ne prouve pas à elle seule qu'une migration a été appliquée. Le service PostgreSQL du runner n'est pas la pile Compose applicative. `config --quiet` vérifie la configuration, ne démarre pas la pile et ne prouve aucune écriture métier ni persistance après redémarrage. Le test Fastify à ce SHA emploie des sessions/membres en mémoire ; il ne vérifie pas encore la continuité d'un autre membre après révocation.
- **Sources :** [run GitHub](https://github.com/Zayonx-0/ChatISEN/actions/runs/45160291783), [extrait expurgé](preuves/45160291783/extrait.txt), [test de migration à ce SHA](https://github.com/Zayonx-0/ChatISEN/blob/2841f832788e5362804d566771b1f841344db4b1/tests/contract/contract.test.mjs).

## E07 — CI 45160656434 : nouveau contrôle de R01

- **Date UTC :** 2026-11-23, 10:56:48–10:57:29. **Lot / IDs :** A–C et E ; S01–S02, O01 et contrat de migration.
- **SHA / environnement :** tête PR `8bd6ec3d4556c0ef890110ed1dd16bedcd29cad6`, fusion temporaire testée `a1804a601c9b60e87eaf9ac5556b53f7ed856826` avec la base `a3241a92f4efe2781213914df29794e2513d1a23` ; runner GitHub Actions Ubuntu, Node 24, pnpm 10.20.0 et service `postgres:17`.
- **Commande et attendu :** mêmes étapes que E06, sur un SHA comprenant en plus un arrêt des hooks après refus d'authentification et un test de continuité pour un autre membre autorisé.
- **Observé :** configuration Compose valide, builds et onze tests réussis, aucun ignoré, test de migration à deux passages réussi ; `make verify LEVEL=core` échoue explicitement et le job est en échec. Le test Fastify en mémoire vérifie la réception persistante par un membre autorisé après retrait d'un autre et révocation d'une session.
- **Limite :** E06 demeure le constat sur son propre SHA ; E07 ne prouve pas l'application complète, la persistance des messages, les médias, Playwright ou Grafana. L'assertion faible sur le premier passage du runner signalée en E06 est toujours présente à ce SHA. R01 et la réception J1 restent ouverts.
- **Sources :** [run GitHub](https://github.com/Zayonx-0/ChatISEN/actions/runs/45160656434), [extrait expurgé](preuves/45160656434/extrait.txt), [test Fastify à ce SHA](https://github.com/Zayonx-0/ChatISEN/blob/8bd6ec3d4556c0ef890110ed1dd16bedcd29cad6/tests/security/fastify-realtime.test.ts), [rapport R01](r01.md).

## E08 — Workflow CI corrigé et run vert

- **Date UTC :** 2026-11-23, 12:39:11–12:40:04. **Lot / IDs :** B et E ; O01, contrôles de construction et tests disponibles.
- **SHA / environnement :** `b703eb1d8a54b229080d741617aaeaaf562281f4` sur la PR nº 1 ; GitHub Actions Ubuntu, Node 24, pnpm 10.20.0 et PostgreSQL 17 de service.
- **Incident précédent :** les runs [45174892301](https://github.com/Zayonx-0/ChatISEN/actions/runs/45174892301) et [45174904541](https://github.com/Zayonx-0/ChatISEN/actions/runs/45174904541), sur `00527ad2095b269a43e782b0011827cd8240c599`, échouaient à l'étape `make verify LEVEL=core` après les contrôles disponibles. Le script de réception est volontairement non nul tant que J1 est incomplet ; le workflow mélangeait donc contrôle technique et décision de réception, et le push et la PR provoquaient deux notifications.
- **Correction et attendu :** le commit `b703eb1` remplace ce chemin par un job de contrôles disponibles : installation verrouillée, `docker compose ... config --quiet`, typecheck, build et tests. Le résumé doit expliciter que la recette J1 n'est pas encore prouvée.
- **Observé :** le run [45176334218](https://github.com/Zayonx-0/ChatISEN/actions/runs/45176334218) est vert ; toutes les étapes du job `Builds, tests et configuration Compose` réussissent. Les tests rapportent 11 réussis, 0 échec et 0 ignoré. La configuration Compose est interprétée et le job termine sans erreur.
- **Limite :** ce run ne démarre pas la pile Compose, ne vérifie pas les écritures métier PostgreSQL, les appels audio/vidéo, le parcours Playwright ou Grafana. Le run vert signifie que les contrôles automatisés disponibles passent ; J1 reste soumis à `make verify LEVEL=core` et aux critères R01.
- **Sources :** [workflow à la tête b703eb1](https://github.com/Zayonx-0/ChatISEN/blob/b703eb1d8a54b229080d741617aaeaaf562281f4/.github/workflows/r01.yml), [extrait expurgé](preuves/45176334218/extrait.txt), [suivi de rédaction](../suivi.md).

Le même workflow a été rejoué après le commit documentaire `304c2cdfdb52c5d0f24d841b9928c91d2a48ec7f` : le run [45178224595](https://github.com/Zayonx-0/ChatISEN/actions/runs/45178224595) est également vert. Il porte sur la même portée de contrôles et confirme que la mise à jour du rapport n'a pas introduit de régression. GitHub signale seulement une annotation de dépréciation concernant le runtime Node 20 interne de certaines actions officielles, forcé vers Node 24 par le runner ; ce n'est pas un échec du job.


## E09 — Première tranche C : repository PostgreSQL transactionnel

- **Date UTC :** 2026-11-23, heure du commit non conservée dans le journal local. **Lot / IDs :** C ; F01–F05, S01–S02, O04–O06.
- **SHA / environnement :** `2bb0a9b136e0ba3352e12625fb11265f3285b014`, branche `rev/01-socle-j1`, runner GitHub avec PostgreSQL de service ; le run associé est vert.
- **Protocole et attendu :** fournir une couche SQL explicite pour utilisateurs, sessions, conversations, membres et messages ; verrouiller la séquence, écrire l'événement et le message dans une transaction, puis rendre un retry par `clientId` idempotent.
- **Observé :** `PostgresRepository` ajoute le pool, les transactions, les sessions avec hash et révocation, les directs/groupes, l'appartenance, la pagination et `appendMessage` avec `FOR UPDATE`, événement `conversation_events` et retry idempotent. Le test d'intégration vise migration, utilisateurs, session, direct, message, retry et révocation ; il n'était pas inclus dans la suite exécutée par ce premier run. Le run [45179423750](https://github.com/Zayonx-0/ChatISEN/actions/runs/45179423750) est vert.
- **Limite :** le test d'intégration était ignoré localement sans `DATABASE_URL` et n'était pas inclus dans le run CI 45179423750 malgré la présence de PostgreSQL ; ce run ne prouve que la compilation du repository. Son inclusion dans la suite est en cours ; le repository ne suffit pas à démontrer le parcours métier. `server.ts` n'utilise pas encore ce repository, les routes `/api/v1` ne sont pas alignées et le redémarrage de l'API n'est pas prouvé.
- **Sources :** [commit C](https://github.com/Zayonx-0/ChatISEN/commit/2bb0a9b136e0ba3352e12625fb11265f3285b014), [repository](../../apps/api/src/repositories/postgres.ts), [test d'intégration](../../tests/integration/c/postgres-repository.test.ts), [run CI](https://github.com/Zayonx-0/ChatISEN/actions/runs/45179423750).
