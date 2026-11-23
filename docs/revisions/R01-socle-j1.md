# ChatISEN · R01 — rendre le socle J1 démontrable

| Point de départ vérifié sur GitHub le 23 novembre 2026 | Livraison visée | Critère de réception |
|---|---|---|
| Dépôt `Zayonx-0/ChatISEN`, tag annoté `v1.0.0` et branche `main` au commit `a3241a92f4efe2781213914df29794e2513d1a23` | **v1.1.0**. Cette version mineure apporte les appels utilisables et la messagerie durable prévus par le contrat v1. | Sur une installation vierge, Alice et Bob se connectent, discutent en privé, retrouvent leur historique après redémarrage et reçoivent le son puis l’image de l’autre. Un compte tiers reste exclu. |

**Mandat de Terra.** Construire R01 dans le dépôt existant, tester l’application assemblée, publier le travail sur GitHub et remettre les preuves au prochain audit. Le numéro R01 identifie ce mandat. Le tag identifie le code livré. L’audit initial précède la publication du tag V1.0 et porte bien sur le même code. Pour les règles métier et la définition des scénarios, lire le [cahier d’architecture](../../ARCHITECTURE-ChatISEN.md) et le [rapport d’audit](../report/audit-livraison.md).

## 1. Ce que l’équipe verra

Alice et Bob ouvrent chacun un navigateur et se connectent une fois à ChatISEN. Alice ouvre un direct avec Bob, échange des messages et crée un groupe. Quand l’API redémarre, leurs comptes, leurs droits et leurs messages sont toujours là. Bob reçoit un appel même s’il consulte un autre fil. Il accepte, entend Alice, active sa caméra et peut raccrocher. Pendant la démonstration, l’équipe voit les requêtes, les connexions et l’appel sur le tableau de bord.

La V1.0 fournit déjà des schémas HTTP/WS, une migration et un parcours de messagerie standalone. Les huit tests de contrats et de migration ont réussi sur PostgreSQL 16.15. La cible de R01 est **le profil Compose avec PostgreSQL 17, l’API Fastify, l’interface React et LiveKit**. La confidentialité doit aussi être corrigée dans le serveur standalone livré aux utilisateurs.

## 2. Lots à construire et tests de réception

**A · Fermer l’accès indu aux conversations — S01, S02.** Dans `apps/api/src/server.ts`, `apps/api/src/ws.ts` et `apps/standalone/server.mjs`, appliquer la même règle aux transports privés disponibles. Vérifier la session et l’origine à l’ouverture, l’appartenance lors de l’abonnement et les droits lors de la diffusion. Prendre en compte le flux SSE du standalone, les abonnements déjà ouverts, le retrait d’un membre, l’expiration et le logout. Une session valide donne accès aux seules conversations de son utilisateur.  
**Réception.** Sur chaque profil, deux membres autorisés reçoivent un événement témoin. Un tiers et un utilisateur anonyme restent exclus. Après retrait ou révocation, un nouvel événement arrive au membre autorisé et zéro événement privé arrive à la session révoquée. Sur le profil cible, exercer aussi expiration de session, CSRF, contrôle d’origine et limitation des tentatives de connexion (réponse `429`). Utiliser des comptes synthétiques, borner le délai d’observation et conserver les résultats par profil.

**B · Rendre la construction et le démarrage reproductibles — O01.** Corriger le YAML Compose, les types WebSocket, React et React DOM, ainsi que le type du mode d’appel. Faire compiler les vrais workspaces avec Node 24. Aligner le gestionnaire de paquets sur le choix pnpm du cahier, versionner son verrou et utiliser la même installation figée en CI et dans les Dockerfiles. Relier les commandes racine aux vrais compilateurs et suites. Configurer Nginx, HTTPS/WSS, la confiance de la CA locale et la signalisation LiveKit. Garder une commande de démarrage claire pour le profil de démo.  
**Réception.** Sur clone neuf et volumes jetables, faire passer `make doctor`, `make bootstrap`, la validation `docker compose -f infra/compose/docker-compose.yml config --quiet`, les builds API/web, `make up`, puis deux `make seed-demo`. Valider le cookie sécurisé dans Chromium après rechargement, la création unique des fixtures et l’échec explicite d’un contrôle quand un prérequis manque. Utiliser des données isolées pour le standalone également.

**C · Raccorder l’identité, les conversations et l’historique à PostgreSQL — F01–F05, S01–S02.** Les routes Fastify écrivent aujourd’hui dans des collections en mémoire. Brancher les modules sur PostgreSQL 17, appliquer les migrations avant disponibilité et tester les routes réellement servies sous `/api/v1`. Réutiliser schémas, contraintes et exemples de `packages/contracts`. Aligner le client React, les réponses, la pagination et les enveloppes WS. Faire fonctionner inscription, profil, recherche par handle, direct unique, groupe et gestion de base des membres. Écrire message, événement et séquence dans une transaction, puis diffuser et rattraper par curseur. Maintenir les parcours déjà livrés pendant la transition.  
**Réception.** Vérifier statuts, corps et refus sur l’API démarrée. Le profil anonyme sur la route contractuelle rend `401`. Alice et Bob créent un seul direct en concurrence. Parcourir 125 messages par pages de 50. Une même commande rejouée garde son ID, un contenu différent avec la même clé rend `409`. Après redémarrage de l’API, les comptes, sessions valides, appartenances et messages demeurent. Après 15 s hors ligne et 20 envois, Bob récupère exactement les messages manqués. Lorsque la base s’arrête, la sonde de disponibilité reflète la panne et l’API ne confirme aucune écriture non persistée.

**D · Remplacer les appels simulés par du média reçu — F06, F07 et admission de S03.** Sur le profil Compose, relier les SDK serveur et navigateur à LiveKit. L’API émet une admission signée, limitée à la salle et à la session, après contrôle d’appartenance. Relier sonnerie, acceptation, refus, expiration, micro, caméra et raccrochage aux états réels. Un appel actif par conversation. Empêcher une nouvelle admission après révocation et prendre en charge le retrait d’une connexion média établie.  
**Réception.** Dans deux contextes navigateur indépendants, montrer séparément un appel audio puis un appel vidéo. Capturer les statistiques de réception des deux côtés, l’énergie audio d’une tonalité avant/après coupure du micro et le nombre d’images distantes décodées avant/après bascule caméra. Vérifier refus, invitation expirée, tentative simultanée et fermeture chez les deux participants. Un tiers reste exclu et la révocation coupe l’accès prévu par S03. Les pistes synthétiques sont acceptées en CI. Indiquer l’environnement de chaque essai.

**E · Vérifier le parcours complet et publier la preuve — F13 de base, O01–O02, J1.** Corriger le format des membres d’une conversation entre React et l’API. Rendre la navigation entre les fils utilisable à 390 et 1280 px. Exposer dans Grafana les indicateurs du parcours (requêtes, messages, connexions et appels). Ajouter un workflow GitHub Actions qui installe depuis le verrou, compile les workspaces et exécute les contrôles de R01 sur le profil cible.  
**Réception.** `make verify LEVEL=core` doit jouer A à E et renvoyer un code non nul si un cas obligatoire échoue, manque ou est ignoré. Joindre la trace Playwright du parcours à deux comptes, les résultats SQL, les observations média et la fenêtre Grafana correspondante. Le résultat de `LEVEL=full` doit indiquer quels scénarios J2/J3 restent ouverts.

## 3. Organisation du pilote et des sous-agents

Le pilote peut lancer plusieurs sous-agents **GPT‑6.1 Terra**. Il tient les dépendances communes, le contrat et l’intégration. La V1.0 concentre plusieurs domaines dans `server.ts` et `main.tsx`. Le pilote réserve ces deux fichiers ou en extrait d’abord les modules avec un test de comportement. Chaque sous-agent reçoit une liste exclusive de chemins, son lot et sa preuve attendue.

| Ordre | Travaux qui peuvent avancer ensemble | Point d’intégration |
|---|---|---|
| 1 | Terra A corrige les autorisations temps réel. Terra B répare builds et Compose. Terra C prépare stockage SQL, migrations et tests de routes. | Le pilote intègre A en priorité, puis B et C. Il vérifie que l’autorisation utilise bien la nouvelle source de sessions et de membres. |
| 2 | Terra D branche les SDK et les appels. Un autre Terra adapte les parcours React. Un troisième prépare les scénarios navigateur, la CI et les métriques de E. | Le pilote raccorde le tout sur le même profil Compose, puis rejoue A à E après intégration. |

Les preuves des lots doivent identifier le commit testé. Si la machine de Terra manque de Docker, utiliser un runner Linux GitHub disponible pour la recette automatisée. Un obstacle d’environnement, un test ignoré ou une simple présence de fichier gardent le scénario ouvert.

## 4. Versionner le travail sur GitHub

1. **Établir la base.** Depuis la racine de `Projet`, vérifier `git status --short`, le dépôt d’`origin`, puis `git fetch origin --tags`. Comparer `git rev-parse 'v1.0.0^{commit}'` au SHA en tête de ce mandat. Créer une branche `rev/01-socle-j1` à partir de `origin/main` contenant cette V1.0. Si cette branche existe déjà, la reprendre. Si `main` a avancé, intégrer ses changements et déclarer le SHA de départ effectif. Préserver l’historique publié et les changements locaux de l’équipe.
2. **Publier la révision dès le premier lot.** Versionner ce mandat et l’audit qui l’accompagne. Commiter chaque correction cohérente avec ses tests, par exemple `fix(auth): contrôler les abonnements privés` ou `feat(calls): connecter deux participants à LiveKit`. Pousser la branche sur `origin` et ouvrir une PR vers `main`. Après chaque lot terminé, pousser les commits suivants et mettre à jour la liste A–E de cette même PR. Le pilote coordonne les pushes des sous-agents.
3. **Préparer la release dans la PR.** Ajouter au `CHANGELOG.md` ce qui fonctionne, comment le tester et les limites restantes. Aligner la version applicative racine et les métadonnées de build sur `1.1.0`. Le contrat public conserve sa propre version tant qu’il reste compatible. Actualiser le README et `docs/suivi.md`. La PR relie les commits, le run CI et les rapports synthétiques expurgés. Placer les traces volumineuses dans les artefacts GitHub et conserver un bilan lisible dans Git.
4. **Intégrer et identifier le code reçu.** Après passage des contrôles requis, fusionner conformément aux règles du dépôt. Vérifier sur le SHA intégré la recette `core` ou son exécution CI correspondante. Créer sur **ce SHA** le tag annoté `v1.1.0`, pousser ce tag explicitement et publier une GitHub Release avec le changelog, les résultats et le lien de comparaison depuis `v1.0.0`. Contrôler côté distant que le tag résolu pointe sur ce SHA. Si le tag cible existe déjà, vérifier son SHA avant toute action et signaler une collision. Un tag publié reste immuable.
5. **Rendre aussi les travaux intermédiaires.** Si un blocage subsiste, publier les commits réalisables sur la branche et remettre la PR avec les contrôles concernés, leur erreur et la prochaine action. Si les droits GitHub empêchent une opération, indiquer la dernière opération confirmée et les commits encore locaux. Une release reçoit le statut « publiée » une fois son tag et sa page GitHub vérifiés.

## 5. Ce que Terra doit remettre pour la prochaine revue

Copier ce bloc dans la réponse à l’équipe et renseigner chaque ligne à partir de l’exécution. Ce retour suffit pour demander l’audit suivant.

```text
R01 — état : en cours / bloqué / PR prête / release publiée
Base v1.0.0 et SHA de départ effectif :
Branche distante et URL de la PR :
SHA candidat ou intégré et URL de comparaison :
Tag distant et URL de la release, si publiée :
URL des runs CI et du rapport de recette correspondant au SHA :
A confidentialité — résultat et preuve :
B clone neuf, builds et Compose — résultat et preuve :
C contrat v1, PostgreSQL 17, redémarrage et rattrapage — résultat et preuve :
D son et images reçus dans les deux sens — résultat et preuve :
E parcours utilisateur et supervision — résultat et preuve :
Échecs, cas ignorés et blocages externes :
```

**Boucle des révisions.** À chaque retour, le réviseur compare la base et le SHA livré, relit les changements et rejoue les critères annoncés. Si un critère R01 reste ouvert, il renvoie sa référence et le test à corriger. Après réception de J1, il rédige R02 depuis la nouvelle base. La suite prévue couvre les conférences, fichiers et partage d’écran, puis les exercices d’exploitation, la charge, la restauration et l’étude IA. Chaque révision reçoit sa branche, sa PR, ses preuves et, quand elle est reçue, sa version publiée.

### Message de lancement pour Terra

```text
Tu pilotes la réalisation de la révision R01 de ChatISEN. Lis ce mandat,
l’audit et le cahier d’architecture. Pars de la V1.0 publiée. Lance plusieurs
sous-agents GPT-6.1 Terra pour les lots indépendants et garde l’intégration.
Réalise les lots A à E, exécute leurs tests et pousse sur GitHub chaque lot
avec ses tests. Suis la procédure de branche, PR et release de la section 4.
À la fin, rends le bloc de la section 5 avec les SHA, liens et preuves réels.
```
