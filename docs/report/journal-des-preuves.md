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


## E10 — Test PostgreSQL exécuté et concurrence corrigée

- **Date UTC :** 2026-11-23, 14:04–14:07. **Lot / IDs :** C ; F02, F04, S02.
- **SHA / environnement :** `0653795c56908a5dd20bbdfeaad0b6fa55e0b98b`, puis `dc2cf21f85123dbe6a2db02b4d25382651017491` ; runner GitHub Actions Linux avec PostgreSQL 17.
- **Protocole et attendu :** inclure le test repository dans `scripts/test.mjs` et vérifier réellement sur PostgreSQL les retries, les conflits, le rollback et le retrait concurrent.
- **Observé :** le run [45190081857](https://github.com/Zayonx-0/ChatISEN/actions/runs/45190081857) a exécuté le premier test repository ; le run [45190512565](https://github.com/Zayonx-0/ChatISEN/actions/runs/45190512565) a passé le test renforcé de concurrence et révocation. La suite du second run rapporte 12 tests réussis, aucun échec et aucun ignoré. La correction sérialise les écritures par conversation et protège l'appartenance pendant la transaction ; une clé identique avec contenu différent est refusée.
- **Limite :** ces tests portent sur le repository directement, pas sur les routes HTTP ou l'API assemblée ; le raccordement Fastify et les parcours de redémarrage/reprise restent à réaliser. Les runs GitHub sont déclenchés par la PR et peuvent utiliser un commit de fusion temporaire ; les SHA ci-dessus sont ceux des têtes de branche communiqués par Actions.
- **Sources :** [test CI initial](https://github.com/Zayonx-0/ChatISEN/actions/runs/45190081857), [test CI renforcé](https://github.com/Zayonx-0/ChatISEN/actions/runs/45190512565), [test repository](../../tests/integration/c/postgres-repository.test.ts).


## E11 — Identité v1 raccordée à PostgreSQL

- **Date UTC :** 2026-11-23, 14:13. **Lot / IDs :** C ; F01, S01 (partiels).
- **SHA / environnement :** tête PR `3007b999a4544b82516d21f8eab387fb6288d2fb` ; test local sur PostgreSQL 16 et run GitHub [45191807962](https://github.com/Zayonx-0/ChatISEN/actions/runs/45191807962) sur PostgreSQL 17, Node 24 et pnpm 10.20.0.
- **Protocole et attendu :** migration sur base jetable, inscription et profil v1, refus d'origine étrangère et d'une mutation sans CSRF, recréation de l'application et reconnexion à la même base, puis déconnexion et refus de l'ancienne session.
- **Observé :** le test ciblé passe en PostgreSQL local puis en CI PostgreSQL 17 ; le run CI compte 13 tests réussis, aucun ignoré. L'API enregistre et recherche l'empreinte de session en base et le profil reste accessible après recréation de l'application avec un nouveau pool.
- **Limite :** il s'agit d'injections HTTP, pas d'un redémarrage complet de conteneur ou d'un navigateur. Les anciennes routes `/api` et les conversations restent en mémoire, le WebSocket n'utilise pas encore les sessions PostgreSQL, et limitation de tentatives, profil modifiable et parcours complet restent ouverts. Ce résultat n'établit pas la réception F01/S01.
- **Sources :** [commit](https://github.com/Zayonx-0/ChatISEN/commit/3007b999a4544b82516d21f8eab387fb6288d2fb), [extrait CI](preuves/45191807962/extrait.txt), [test](../../tests/integration/identity/postgres-identity.test.ts).


## E12 — Routes v1 de direct et historique PostgreSQL

- **Date UTC :** 2026-11-23, 14:21. **Lot / IDs :** C ; F02, F04 et S02 (partiels).
- **SHA / environnement :** tête PR `1b631bc8ffd9ca0986144bc23c7441a7eb466129` ; test local PostgreSQL 16 jetable puis [run GitHub 45193174450](https://github.com/Zayonx-0/ChatISEN/actions/runs/45193174450) sur Linux et PostgreSQL 17.
- **Protocole et attendu :** deux comptes créent simultanément le même direct, un tiers tente d'en lire les messages ; envoyer 125 messages, rejouer une commande, vérifier un conflit de contenu et lire l'historique en pages de 50. Les objets de réponse sont confrontés aux schémas du contrat.
- **Observé :** un seul direct, accès tiers refusé, retry avec même ID et conflit 409 pour un contenu différent ; 125 IDs distincts répartis en trois pages. Le run GitHub a passé 14 tests, aucun ignoré, incluant ce parcours d'injection HTTP.
- **Limite :** ces routes sont testées par injection HTTP : ni navigateur, ni socket v1, ni redémarrage complet, ni groupes ou rattrapage d'événements ne sont encore vérifiés. Les anciennes routes restent en mémoire.
- **Sources :** [commit](https://github.com/Zayonx-0/ChatISEN/commit/1b631bc8ffd9ca0986144bc23c7441a7eb466129), [extrait expurgé](preuves/45193174450/extrait.txt), [test](../../tests/integration/chat/postgres-chat.test.ts).


## E13 — Rattrapage des événements et test de migration renforcé

- **Date UTC :** 2026-11-23, après 14:21. **Lot / IDs :** C ; F05, O01 (partiels).
- **SHA / environnement :** commits `0030f0a873430608a7c1eb1713242ff5ffe60f90` et `1e0a6a3932a96b77ac84e672d902e68e78e9f9b4` ; test local PostgreSQL 16 et [run GitHub 45194051994](https://github.com/Zayonx-0/ChatISEN/actions/runs/45194051994) sur PostgreSQL 17.
- **Protocole et attendu :** lire les événements après un curseur exclusif par pages, refuser un tiers ; vérifier que la migration initiale est enregistrée et que `users` existe, puis que le deuxième passage n'applique rien.
- **Observé :** la route v1 relit le journal durable et renvoie les événements en ordre croissant ; le test HTTP couvre 125 événements en deux pages, ainsi qu'un refus tiers. Le test de migration renforcé réussit ; le run GitHub est vert. Cette correction répond à la faiblesse d'assertion documentée en E06–E07.
- **Limite :** le rattrapage est exercé par injection HTTP, sans coupure de socket réelle ni redémarrage de l'API ; le flux temps réel PostgreSQL et la reprise intégrée restent à faire.
- **Sources :** [commit événements](https://github.com/Zayonx-0/ChatISEN/commit/0030f0a873430608a7c1eb1713242ff5ffe60f90), [commit test migration](https://github.com/Zayonx-0/ChatISEN/commit/1e0a6a3932a96b77ac84e672d902e68e78e9f9b4), [extrait CI](preuves/45194051994/extrait.txt).


## E14 — WebSocket v1 sur journal PostgreSQL

- **Date UTC :** 2026-11-23, 14:34. **Lot / IDs :** A et C ; F05, S01–S02 (partiels).
- **SHA / environnement :** tête PR `b5fbe967b9ee5a64e96c96fe74f699310b958d18` ; PostgreSQL 16 local et [run GitHub 45195526535](https://github.com/Zayonx-0/ChatISEN/actions/runs/45195526535) sur Linux et PostgreSQL 17.
- **Protocole et attendu :** ouvrir la socket v1 avec origine et session contrôlées ; s'abonner à un direct, publier des messages, déconnecter puis réabonner Bob après 20 messages manqués ; tenter l'accès tiers, l'ouverture anonyme et d'origine étrangère, puis révoquer une session et publier à nouveau.
- **Observé :** notification et lecture dans le journal, rattrapage ordonné de 20 événements, refus d'accès et absence de nouvelle livraison après déconnexion. Le run GitHub a passé 15 tests, aucun ignoré. Le relais de notifications `LISTEN/NOTIFY` réveille le lecteur, qui dispose également d'une vérification périodique ; Nginx possède un routage d'upgrade pour `/api/v1/ws`.
- **Limite :** les abonnements de test sont injectés dans une instance Fastify, sauf les refus d'ouverture essayés sur socket locale. Il n'y a pas encore de preuve sur deux processus API, de coupure pendant 15 secondes, de proxy HTTPS assemblé ou de parcours navigateur. Aucun résultat de média.
- **Sources :** [commit](https://github.com/Zayonx-0/ChatISEN/commit/b5fbe967b9ee5a64e96c96fe74f699310b958d18), [test](../../tests/integration/chat/postgres-websocket.test.ts), [extrait CI](preuves/45195526535/extrait.txt).


## E15 — Groupes et ordre de migration Compose

- **Date UTC :** 2026-11-23, après 14:34. **Lot / IDs :** B et C ; F03, O01 (partiels).
- **SHA / environnement :** commits `39317c280f840d986cd5a5e5e3414ef20d540232` et `b9cb431eaacfefbf637f8f8a20ee785e1873d198` ; PostgreSQL 16 local puis [run GitHub 45196890463](https://github.com/Zayonx-0/ChatISEN/actions/runs/45196890463) sur PostgreSQL 17.
- **Protocole et attendu :** créer deux fois le même groupe avec la même commande en concurrence, tenter un conflit de contenu, consulter la liste et le détail comme membre et comme tiers ; valider la configuration Compose.
- **Observé :** une seule création, retry convergent, conflit 409, liste paginée, détail accessible aux membres et refus au tiers dans les tests d'injection. Une migration ajoute les clés d'idempotence des groupes. La configuration Compose attend désormais la migration après la disponibilité de PostgreSQL et avant le lancement de l'API. La CI est verte.
- **Limite :** la configuration Compose a été validée sans démarrage complet de la pile ; changement de membres, transfert et sortie de groupe restent à réaliser et éprouver. Le parcours navigateur n'est pas couvert.
- **Sources :** [commit groupes](https://github.com/Zayonx-0/ChatISEN/commit/39317c280f840d986cd5a5e5e3414ef20d540232), [commit Compose](https://github.com/Zayonx-0/ChatISEN/commit/b9cb431eaacfefbf637f8f8a20ee785e1873d198), [extrait CI](preuves/45196890463/extrait.txt), [test](../../tests/integration/chat/postgres-chat.test.ts).


## E16 — Gestion transactionnelle des groupes

- **Date UTC :** 2026-11-23, après 14:34. **Lot / IDs :** C ; F03 et S02 (partiels).
- **SHA / environnement :** tête PR `fd1f8bd46768b03c39324d4062a23928a00ea089` ; PostgreSQL 16 local puis [run GitHub 45197678830](https://github.com/Zayonx-0/ChatISEN/actions/runs/45197678830) sur PostgreSQL 17.
- **Protocole et attendu :** renommer, ajouter et retirer un membre, transférer la propriété, refuser les actions d'un membre ordinaire, puis quitter et fermer le groupe lorsque le dernier propriétaire part.
- **Observé :** tests HTTP par injection réussis ; les changements de groupe et leurs événements sont écrits transactionnellement, et un propriétaire actif est maintenu pendant le transfert. Un propriétaire ne peut pas quitter si d'autres membres restent. Le tiers retiré ne peut plus lire le détail. La CI est verte.
- **Limite :** tests sur API et base, sans interface navigateur ni retrait pendant un appel média ; les courses entre toutes les opérations de gestion et les transferts de données restent à éprouver.
- **Sources :** [commit](https://github.com/Zayonx-0/ChatISEN/commit/fd1f8bd46768b03c39324d4062a23928a00ea089), [test](../../tests/integration/chat/postgres-chat.test.ts), [extrait CI](preuves/45197678830/extrait.txt).


## E17 — Parcours navigateur réel sur PostgreSQL

- **Date UTC :** 2026-11-23, 15:11–15:13. **Lot / IDs :** E et V ; F01–F05, F13, O01 (profil local CI).
- **SHA / environnement :** `b1067771f96e4e4155232511c497c2eca877c83b` ; run [GitHub 45202274116](https://github.com/Zayonx-0/ChatISEN/actions/runs/45202274116), Ubuntu 24.04, PostgreSQL 17, Node 24, pnpm 10.20.0 et Chromium Playwright. Le commit précédent avait échoué sur Ubuntu 26.04 non supporté ; le runner a été épinglé sur Ubuntu 24.04.
- **Protocole et attendu :** trois comptes et contextes Chromium, dont un tiers ; cookies sécurisés pour les deux participants, direct, échanges, groupe, viewport mobile 390 px, mise hors ligne du contexte de Bob pendant au moins 15 secondes, envoi de 20 messages, reprise, redémarrage de l'API et lecture de l'historique. Le tiers tente de lire l'historique par l'API.
- **Observé :** le scénario `F01 F02 F03 F04 F05 F13` passe ; Playwright rapporte **1 passed**. La CI installe Chromium, exécute le parcours puis conserve les traces synthétiques pour trois jours. Le test local équivalent a aussi passé en 48,7 s avec des ports et une base jetables.
- **Limite :** le run automatise l'API Fastify et le proxy Vite sur des ports locaux du runner, pas la pile Docker Compose HTTPS publique. Il ne couvre pas les pistes audio/vidéo, le partage d'écran, Firefox ni Grafana ; les traces sont des artefacts de test potentiellement sensibles et ne sont pas versionnées.
- **Sources :** [commit e2e](https://github.com/Zayonx-0/ChatISEN/commit/40a1dd5), [correction Ubuntu](https://github.com/Zayonx-0/ChatISEN/commit/b1067771f96e4e4155232511c497c2eca877c83b), [extrait CI](preuves/45202274116/extrait.txt), [test](../../tests/e2e/chat.spec.ts).


## E18 — Contrôle de la tête documentaire b56ac97

- **Date UTC :** 2026-11-23, 15:17:38–15:19:49. **Lot / IDs :** B, C et E ; contrôles disponibles O01, F01–F05 et F13 partiels.
- **SHA / environnement :** tête PR `b56ac973b6cbe9cf72a625daac87b872da1e25fc`, fusion temporaire testée `76dc80218401a303c46694f56d80ee9b6e410371` avec `a3241a92f4efe2781213914df29794e2513d1a23` ; GitHub Actions Ubuntu 24.04, Node 24, pnpm 10.20.0, PostgreSQL 17 et Chromium.
- **Protocole et attendu :** installation verrouillée, validation de configuration Compose, types, builds, tests disponibles et `pnpm test:e2e` sur la tête courante ; attendre leur succès.
- **Observé :** le job est vert ; 15 tests réussis, aucun échec ni ignoré, puis un scénario Chromium réussi. Il confirme la correction Ubuntu relatée en E17 après l'échec du run 45201816405.
- **Limite :** le test navigateur utilise Fastify et Vite sur loopback avec une base de service, et non le démarrage complet Compose HTTPS ; il ne démontre ni les médias reçus ni Grafana. Le job vert ne vaut pas réception J1.
- **Sources :** [run GitHub](https://github.com/Zayonx-0/ChatISEN/actions/runs/45203593069), [extrait expurgé](preuves/45203593069/extrait.txt), [test navigateur](../../tests/e2e/chat.spec.ts), [E17](#e17--parcours-navigateur-réel-sur-postgresql).


## E19 — Admission média expérimentale et contrôles associés

- **Date UTC :** 2026-11-23, essais locaux à partir de 15:27 ; CI 15:34:24–15:36:24. **Lot / IDs :** D ; F06–F07 et S03, partiels.
- **SHA / environnement :** tête PR `c88aa7e677dedb554de574d3cd4e1c82c638fc87`, fusion temporaire testée `5ee31d2359765dec41f019fcf29021490e4b9300` avec `a3241a92f4efe2781213914df29794e2513d1a23` ; macOS arm64, Node 21.6 et PostgreSQL 16.15 jetable, puis GitHub Actions Ubuntu 24.04, Node 24 et PostgreSQL 17.
- **Incident et correction :** le premier essai local par le pilote échoue dans le sandbox : `initdb` ne peut créer la mémoire partagée et les tests réseau ne peuvent ouvrir leurs sockets ; la suite donne 9 succès et 8 échecs. Une base jetable et les ports locaux ont ensuite été autorisés hors sandbox, puis la suite a été rejouée sur le même code avant commit : 17 succès, 0 échec, 0 ignoré.
- **Protocole et attendu :** créer un appel sous verrou, rejouer la même commande, refuser tiers et absence de CSRF, émettre une admission bornée à une salle et à une session, contrôler sa signature, refuser une nouvelle admission après logout et terminer l'enregistrement. Vérifier que les routes restent désactivées sans activation explicite. Les tests sont inclus dans `node scripts/test.mjs` ; CI exécute aussi typecheck, builds, validation Compose et `pnpm test:e2e`.
- **Observé :** le run [45206726364](https://github.com/Zayonx-0/ChatISEN/actions/runs/45206726364) réussit : **17 tests, aucun échec ni ignoré**, dont les deux nouveaux tests média, puis un scénario Chromium de messagerie réussi. Les jetons de test sont signés HS256 et limités à la salle et à cinq minutes au maximum ; les routes renvoient 503 par défaut.
- **Limite :** le jeton est produit avec `node:crypto`, sans SDK LiveKit et sans essai contre le serveur LiveKit. La fin, le retrait ou le logout ne coupent pas une connexion déjà établie et n'invalident pas immédiatement un jeton déjà émis ; sa durée de validité peut atteindre cinq minutes. Les routes expérimentales ne doivent pas être activées en exploitation. Invitations, client navigateur, révocation média et pistes audio/vidéo restent à réaliser ; aucune réception D ou J1 ne peut être déclarée. Le retry de création renvoie 200 alors que l'OpenAPI ne documente que 201 : écart à résoudre.
- **Sources :** [commit](https://github.com/Zayonx-0/ChatISEN/commit/c88aa7e677dedb554de574d3cd4e1c82c638fc87), [run GitHub](https://github.com/Zayonx-0/ChatISEN/actions/runs/45206726364), [extrait expurgé](preuves/45206726364/extrait.txt), [test HTTP](../../tests/integration/calls/postgres-calls.test.ts), [test signature](../../tests/security/livekit-token.test.ts).


## E20 — Messagerie locale et parcours des deux interfaces

- **Date UTC :** 2026-11-25, 08:33–08:46. **Lots / IDs :** A, B, C et E ; F01, F02, F04, F05 et F13 partiels.
- **SHA / environnement :** base `77fdaf7926b2156b751a67967bfb00a0dc45be8f`, correctif `f7ed13505ece4f7d7e18889242c3a97c3656f00d` ; macOS arm64, Node 24.14.1, Chromium Chrome local et PostgreSQL 16.15 jetable.
- **Incident :** l'interface servie sur le port 3000 utilise le serveur standalone et n'était pas couverte par le précédent test navigateur React. Le premier essai Chromium isolé sur la base échoue dès l'inscription : le cookie `__Host-chatisen` sans attribut `Secure` est rejeté et la session ne permet pas de charger les conversations. L'ancien serveur renvoyait aussi un direct existant sans sa liste de membres ; le nom affiché au destinataire utilisait le titre de l'émetteur.
- **Correction et protocole :** le cookie local HTTP utilise `chatisen`, le cookie sécurisé conserve le préfixe `__Host-` ; le serveur renvoie les membres lors de la réouverture d'un direct. Le client affiche les erreurs, protège l'envoi, présente le bon correspondant et garde les conversations accessibles sur mobile. Deux contextes navigateur isolés créent des comptes, ouvrent puis rouvrent un direct, échangent, rechargent la page, se déconnectent et se reconnectent ; le second contexte utilise un écran de 390 px. Les boutons d'appel simulés ont été remplacés par une indication d'indisponibilité.
- **Observé :** en local, la suite `node scripts/test.mjs` a passé 17 tests sans échec ni ignoré ; Playwright a passé le parcours React/PostgreSQL et le nouveau parcours standalone. Après ajout de l'assertion de reconnexion, le parcours standalone a été rejoué avec succès. Typecheck API et web et build Vite réussissent. Le scénario d'échec initial est conservé ci-dessus.
- **Limites :** base jetable, serveur et navigateur locaux ; ces essais ne prouvent pas Compose HTTPS, les appels réels, les autres navigateurs ni tous les scénarios de panne. Le serveur déjà lancé par l'utilisateur doit être redémarré pour charger le nouveau code. Le run GitHub 45579250011 est vert sur le commit f7ed135 : 17 tests réussis, aucun échec ni ignoré, et deux parcours Chromium réussis ; il teste la fusion temporaire 3efe5589d65ce07e9d48b41dfa586fde6bc95e47.
- **Sources :** [commit](https://github.com/Zayonx-0/ChatISEN/commit/f7ed13505ece4f7d7e18889242c3a97c3656f00d), [test standalone](../../tests/e2e/standalone.spec.ts), [test React](../../tests/e2e/chat.spec.ts), [run GitHub](https://github.com/Zayonx-0/ChatISEN/actions/runs/45579250011), [extrait expurgé](preuves/45579250011/extrait.txt).


## E21 — Découverte d'une nouvelle conversation sans rechargement

- **Date UTC :** 2026-11-25, après 08:46. **Lot / IDs :** C et E ; F02 et F05 partiels.
- **SHA / environnement :** `ec798c8462887626ddc050d78381af8a954ea996`, macOS arm64, Node 24.14.1, Chromium local, serveur standalone et fichier de données jetables.
- **Protocole et attendu :** laisser le destinataire sur sa liste vide, créer un direct et envoyer un message depuis un autre contexte ; observer la conversation et le message sans recharger la page.
- **Observé :** le test `tests/e2e/standalone.spec.ts` passe ; la liste est rafraîchie périodiquement et le destinataire peut ouvrir le fil. Cette entrée complète le scénario E20 qui nécessitait encore un rechargement.
- **Limite :** ce contrôle utilise un profil standalone sur une seule machine ; il ne démontre pas Compose, la réception média ou tous les scénarios de perte réseau. Le run GitHub 45579680330 est vert sur la fusion temporaire afae01c0bb3be4b557691cfe8bb8bc38f69da4d6 : 17 tests réussis, aucun échec ni ignoré, et deux parcours Chromium réussis.
- **Sources :** [commit](https://github.com/Zayonx-0/ChatISEN/commit/ec798c8462887626ddc050d78381af8a954ea996), [test](../../tests/e2e/standalone.spec.ts), [run GitHub](https://github.com/Zayonx-0/ChatISEN/actions/runs/45579680330), [extrait expurgé](preuves/45579680330/extrait.txt), [E20](#e20--messagerie-locale-et-parcours-des-deux-interfaces).


## E22 — Notifications et appels directs sur le profil local

- **Date UTC :** 2026-11-25, 08:55–09:07. **Lot / IDs :** D et E ; F06–F07, F13 et S03 partiels.
- **SHA / environnement :** `91add836cc81a3f68ebdbe3b2725d697e55d2ab1` ; macOS arm64, Node 24.14.1, Chromium local, PostgreSQL 16.15 jetable pour le parcours React, données standalone isolées et périphériques audio/vidéo synthétiques.
- **Incident :** le bouton historique d'acceptation appelait `/api/calls/{id}/answer`, route absente du serveur standalone ; l'ancienne fenêtre affichait un média simulé. Les appels avaient ensuite été désactivés dans l'interface.
- **Protocole et attendu :** créer trois comptes isolés, envoyer un message alors que le destinataire consulte un autre fil, vérifier la notification et le compteur, appeler depuis un direct, accepter dans l'autre contexte et mesurer les statistiques WebRTC entrantes audio puis vidéo des deux côtés. Vérifier micro et caméra activés/désactivés, raccrochage des deux côtés, refus et exclusion d'un tiers.
- **Observé :** la suite locale a réussi 17 tests sans échec ni ignoré ; les trois parcours Chromium ont réussi. Le test d'appels vérifie des octets audio reçus et des images vidéo décodées de chaque côté, ainsi que l'état des pistes synthétiques. La notification dans l'interface et la demande d'autorisation navigateur sont exercées.
- **Limites :** ce profil utilise WebRTC direct sans STUN/TURN ni LiveKit ; il n'est testé ici que sur une machine, avec périphériques synthétiques. Aucune preuve de qualité, de connexion entre réseaux, de supervision Grafana ou de révocation complète après retrait de membre n'est apportée. Ce résultat ne vaut pas réception du lot D sur Compose ni de J1. Les notifications système nécessitent l'autorisation de l'utilisateur et un onglet en arrière-plan.
- **Sources :** [commit](https://github.com/Zayonx-0/ChatISEN/commit/91add836cc81a3f68ebdbe3b2725d697e55d2ab1), [test navigateur](../../tests/e2e/standalone.spec.ts), [run GitHub](https://github.com/Zayonx-0/ChatISEN/actions/runs/45582451596).


## E23 — Échec du banc média GitHub et correction tentée

- **Date UTC :** 2026-11-25, 09:07–09:10. **Lot / IDs :** E ; F06–F07 partiels.
- **SHA / environnement :** tête `91add836cc81a3f68ebdbe3b2725d697e55d2ab1`, fusion temporaire `6ae4b6696c91fe0743f749fe63ef92b57171ae47` ; GitHub Actions Ubuntu 24.04, Node 24, Chromium headless.
- **Protocole et attendu :** suite de tests disponible et trois parcours Chromium incluant les appels à périphériques synthétiques.
- **Observé :** les 17 tests de la suite passent ; deux parcours navigateur passent, puis le test d'appel dépasse 60 secondes et le job échoue. Le journal Chromium indique `RequestMediaAccessPermission: Not supported`. La cause exacte reste à confirmer ; le navigateur local avait réussi le même parcours.
- **Correction tentée :** le commit `4bbbbcb73f638141b8d303d13ed56e177af5ee12` ajoute l'autorisation automatique de l'interface média factice dans les options Chromium. Le run suivant est vert : voir E24.
- **Limite :** l'échec est une preuve CI distincte des résultats locaux ; l'option de test ne représente pas l'autorisation d'un utilisateur réel.
- **Sources :** [run échoué](https://github.com/Zayonx-0/ChatISEN/actions/runs/45582451596), [extrait expurgé](preuves/45582451596/extrait.txt), [run de correction](https://github.com/Zayonx-0/ChatISEN/actions/runs/45583168142), [E22](#e22--notifications-et-appels-directs-sur-le-profil-local).


## E24 — Correction du banc média GitHub

- **Date UTC :** 2026-11-25, 09:12–09:14. **Lot / IDs :** E ; F06–F07 partiels.
- **SHA / environnement :** tête `4bbbbcb73f638141b8d303d13ed56e177af5ee12`, fusion temporaire `17aa54a7bc1653f7448659c46dfacd42e963da83` ; GitHub Actions Ubuntu 24.04, Node 24, PostgreSQL 17 et Chromium headless.
- **Protocole et attendu :** rejouer le parcours E23 avec l'autorisation automatique des périphériques synthétiques dans Chromium.
- **Observé :** le run 45583168142 est vert ; 17 tests réussis sans échec ni ignoré et trois parcours Chromium réussis, dont les appels. Le résultat corrige le banc de l'essai précédent E23.
- **Limite :** l'autorisation et les appareils sont synthétiques ; le test ne couvre ni périphérique physique, ni réseaux distincts, ni LiveKit/Compose.
- **Sources :** [run GitHub](https://github.com/Zayonx-0/ChatISEN/actions/runs/45583168142), [extrait expurgé](preuves/45583168142/extrait.txt), [échec précédent E23](#e23--échec-du-banc-média-github-et-correction-tentée).

## E25 — Reconstruction depuis les diagrammes

Le 25 novembre 2026, les vues ont été recalées sur le code `bf1cd6029de69598c9d0c035b5abeb6dedc06fbd`. Une copie vierge extraite de ce SHA a installé les 233 paquets du verrou depuis le cache local. Le contrôle de types, les deux builds et huit tests ciblés de contrat et de signature ont réussi. Les deux builds retrouvent le serveur compilé et les ressources React attendues. [Reconstruction du snapshot](../architecture/README.md#reconstruire-le-snapshot) · [Extrait des contrôles](preuves/architecture-bf1cd60/extrait.txt)

Les 22 vues sont présentes dans l’export du workspace Structurizr et dans le lecteur hors ligne. Le contrôle du SVG retrouve les 103 colonnes des 14 tables. Les planches HTTP correspondent aux 21 handlers v1, et les huit exemples de messages et de trames passent les schémas du dépôt. Une seconde génération donne les mêmes SHA-256 pour les 22 SVG et les données du lecteur. [Workspace](../architecture/workspace.dsl) · [Générateur](../architecture/render.py) · [Ouvrir le lecteur](../architecture/index.html#07-profils)

Le parcours du lecteur sur ordinateur a exercé les liens et le zoom dans Chromium. Après correction du comportement au changement de largeur, le JavaScript a également été exercé à 390 et 1 440 px avec un DOM simulé. La revue d’autorisation a bloqué la relance locale de PostgreSQL et la capture finale du navigateur mobile. Les preuves applicatives sur PostgreSQL 17 et les appels entre deux navigateurs synthétiques restent celles du run E24. [Preuve E24](#e24--correction-du-banc-média-github) · [Extrait des contrôles](preuves/architecture-bf1cd60/extrait.txt)

## E26 — Arrivée et navigation dans la messagerie

- **Date UTC** 2026-11-25. **Lots et IDs** F01, F02, F04, F06, F07 et F13 en partie.
- **Incident** sans fil sélectionné, la zone de saisie et le bouton d’envoi occupaient une part excessive de l’écran. La grille redistribuait l’espace quand la zone d’erreur était masquée et les actions restaient visibles sans destinataire.
- **Correction** l’accueil oriente vers la recherche d’un contact. Le fil dispose de sa propre zone de défilement et la saisie n’apparaît qu’une fois une conversation ouverte. Sur mobile, un retour donne accès à la liste et conserve le brouillon. Le client React propose aussi une action de recherche depuis l’accueil.
- **Vérification** typecheck et build du client React, 17 tests avec PostgreSQL 16.15 jetable et trois parcours Chromium sur macOS. Le scénario standalone vérifie l’état vide, la recherche, l’envoi et le retour mobile. Le scénario d’appels utilise des périphériques synthétiques. Le parcours React couvre les échanges, les groupes et le rattrapage.
- **Sources** [tests standalone](../../tests/e2e/standalone.spec.ts) et [test React](../../tests/e2e/chat.spec.ts).

## E27 — Notifications lorsque l’onglet est fermé

- **Date UTC :** 2026-11-25. **Lot / ID :** profil standalone ; notifications de message, complément à E22.
- **SHA / environnement :** modifications locales fondées sur `e2ae3537f122b0408216809f0432d1ba0f51911b` ; macOS, Node 24, Chromium et PostgreSQL 16 temporaire. Le commit contenant cette entrée constitue le code testé.
- **Incident et décision :** la notification liée au WebSocket de l’onglet ne pouvait pas fonctionner après sa fermeture. Un service worker et Web Push sont ajoutés ; les abonnements sont associés aux sessions et les messages ne sont envoyés qu’aux membres autorisés.
- **Protocole et attendu :** avec deux profils Chromium persistants et deux comptes synthétiques, autoriser les notifications, fermer l’onglet du destinataire, puis envoyer un message ; constater la notification enregistrée par le service worker. Tester aussi les contrôles d’accès, la persistance et la révocation des abonnements.
- **Observé :** abonnement réel créé et notification reçue après fermeture de l’onglet. Les quatre tests ciblés passent ; la suite complète avec PostgreSQL compte 21 tests réussis, aucun échec ni ignoré. Les builds et contrôles de types passent après installation des dépendances verrouillées.
- **Échecs et limites :** un contexte Chromium privé a refusé l’abonnement ; l’interface indique maintenant de vérifier les autorisations et d’utiliser une fenêtre normale. Une tentative d’essai en arrière-plan n’a pas pu rendre l’onglet masqué dans Chromium headless. L’affichage physique par le système et la réception après arrêt complet du navigateur ou de la machine ne sont pas démontrés. Une session expirée ou révoquée ne reçoit plus de push jusqu’à reconnexion.
- **Sources :** [tests du service](../../tests/security/push.test.mjs), [tests API](../../tests/security/push-api.test.mjs), [service worker](../../apps/web/public/sw.js), [E22](#e22--notifications-et-appels-directs-sur-le-profil-local).
- **Recette navigateur complémentaire :** un premier lancement a échoué faute de `DATABASE_URL` et parce que le sélecteur du test ne prévoyait pas le libellé « Réessayer » après restauration impossible ; le sélecteur a été corrigé. Un second lancement sur base vierge a réussi les deux parcours standalone, mais échoué sur React car les migrations n’avaient pas été appliquées ; le protocole est relancé avec migrations.
- **Reprise :** après application des deux migrations, les trois parcours Chromium passent, dont les deux profils standalone et le parcours React/PostgreSQL. Ce résultat corrige les échecs de préparation ci-dessus ; les appareils média restent synthétiques.

## E28 — Push sur le site déployé

- **Date UTC :** 2026-11-25, vers 13:08. **Lot / ID :** profil standalone ; notifications de message, suite de E27.
- **SHA / environnement :** `92af44146a5055902ce007b364f9a86ba4e1236a` ; site HTTPS déployé, Chromium sur macOS, deux profils persistants et deux comptes synthétiques.
- **Protocole et attendu :** enregistrer un abonnement, fermer l’onglet du destinataire, envoyer un message depuis l’autre compte et lire les notifications du service worker.
- **Observé :** configuration push disponible et notification reçue après fermeture de l’onglet. La sonde de disponibilité et le service worker répondent sur le site. Deux comptes synthétiques ont été créés pour cet essai.
- **Limite :** la notification enregistrée par le navigateur ne démontre pas son affichage physique par le système ; l’arrière-plan d’un onglet, l’arrêt complet du navigateur et d’autres navigateurs restent à vérifier. La livraison dépend des autorisations et de la session active.
- **Sources :** [PR de correction](https://github.com/Zayonx-0/ChatISEN/pull/5), [CI de la PR](https://github.com/Zayonx-0/ChatISEN/actions/runs/45619995036), [extrait expurgé](preuves/45619995036/extrait.txt), [E27](#e27--notifications-lorsque-longlet-est-fermé).

## E29 — Création de groupe depuis le site

- **Date UTC :** 2026-11-25. **Lot / ID :** profil standalone, F03–F04.
- **Constat :** le retour de recette signale que le site ne proposait pas de créer un groupe, alors que trois comptes pouvaient discuter dans un groupe créé par l’API. Cette observation ne constitue pas une réception complète du Mandatory.
- **SHA / environnement :** modifications locales fondées sur `8e9e3d3801649eda6f029f8da358aadcaec97931` ; macOS, Node 24 et Chromium. Le commit contenant cette entrée identifie le correctif testé.
- **Protocole et attendu :** trois comptes isolés ; Alice, sur écran de 390 px, crée un groupe nommé, recherche deux contacts, retire puis rajoute l’un d’eux ; chacun ouvre le groupe, envoie un message et reçoit ceux des autres ; Alice recharge la page.
- **Observé :** le scénario Playwright ciblé F03 réussit. La création est impossible dans le formulaire avant de saisir un nom et de sélectionner deux contacts. Les trois messages et l’historique après rechargement sont visibles.
- **Limite :** données et navigateurs synthétiques en local. La recette sur le site déployé et les autres critères de réception restent à vérifier séparément.
- **Sources :** [parcours F03](../../tests/e2e/standalone.spec.ts), [interface standalone](../../apps/web/public/app.js).

## E30 — Recette de groupe sur le site déployé

- **Date UTC :** 2026-11-25, vers 13:43. **Lot / IDs :** profil standalone, F03–F04 ; suite de E29.
- **SHA / environnement :** `9b08996060c52700b035d646bf6ac64075ef3ea6` déployé sur le site HTTPS ; Chromium sur macOS, trois contextes et comptes synthétiques, dont un écran de 390 px.
- **Protocole et attendu :** Alice crée depuis l’interface un groupe nommé avec Bob et Charlie ; les trois l’ouvrent et envoient chacun un message. Tous doivent recevoir les trois messages et Alice doit retrouver l’historique après rechargement.
- **Observé :** création et échanges réussis, historique retrouvé après rechargement. Trois comptes et un groupe synthétiques ont été créés pour cet essai. La CI de la PR a réussi 21 tests et quatre parcours navigateur.
- **Limite :** test synthétique limité au parcours de groupe du profil standalone. Il ne démontre pas à lui seul tous les critères du Mandatory ni ceux de R01.
- **Sources :** [PR](https://github.com/Zayonx-0/ChatISEN/pull/7), [run CI](https://github.com/Zayonx-0/ChatISEN/actions/runs/45625903511), [extrait expurgé](preuves/45625903511/extrait.txt), [E29](#e29--création-de-groupe-depuis-le-site).

## Réception Mandatory au 25 novembre 2026 avant correction du groupe

Sur le commit `e2ae3537f122b0408216809f0432d1ba0f51911b`, l'audit a observé que trois comptes pouvaient discuter dans un groupe créé par API, mais que la création manquait sur le site. Cette observation historique et les autres critères figurent dans la [fiche de réception](recette-mandatory-2026-11-25.md). Le parcours de création a ensuite été ajouté et rejoué sur le site : voir [E29](#e29--création-de-groupe-depuis-le-site) et [E30](#e30--recette-de-groupe-sur-le-site-déployé).

## Inventaire de la VM et du trajet public · 25 novembre 2026

Entre 13 h 43 et 13 h 46 UTC, le DNS A du domaine a rendu l’IPv4 externe de la VM. Une connexion SSH par clé d’hôte connue a permis de lire son nom, sa zone `europe-west4-a`, son VPC, son interface, ses services et le montage du fichier applicatif. Le checkout déployé est `9b08996` et l’empreinte du JavaScript servi a été comparée au dépôt. Le service Caddy relaie vers un unique processus Node sur loopback. Le site public conserve son état sur le disque de cette VM. L’inventaire distingue métadonnées d’instance, accès testés et observations du plan de contrôle, dont la lecture directe était refusée au compte de la VM. [Inventaire et contrôles reproductibles](../architecture/infrastructure-gcp.md) · [Quatre vues du lecteur](../architecture/index.html#01-contexte)

## Inventaire console et vérification DNS · 25 novembre 2026

Le relevé de console transmis par l’équipe vers 13 h 47 UTC compte une seule VM et un seul disque attaché, de type pd-balanced. Il recense huit règles VPC IPv4 ciblant son interface et deux snapshots planifiés en multi-région `eu`. La consultation des associations de politiques héritées a échoué faute du droit `compute.organizations.listAssociations`. Le tableau de l’inventaire conserve les noms, sources, cibles, priorités et limites du relevé. [Inventaire consolidé](../architecture/infrastructure-gcp.md#règles-vpc-visibles-sur-nic0)

Depuis le poste externe à 14 h 03 UTC, `dig +noall +answer ia-pple.isen.fedyna.fr A` a donné `900 IN A [adresse expurgée]` ; les requêtes AAAA et CNAME n’ont retourné aucune réponse dans la section ANSWER. La sonde HTTPS a retourné `HTTP 200, remote_ip=IPv4 publique réservée, ssl_verify_result=0, persistence=json-demo`. La réponse correspond à l’adresse régionale Standard réservée et attachée à nic0. Les ports d’écoute et le SHA identifiés précédemment par SSH complètent cette mesure. [Entrée et placement](../architecture/infrastructure-gcp.md#placement-et-points-dentrée)
