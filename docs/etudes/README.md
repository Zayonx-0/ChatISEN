# Études ChatISEN

Exécuter depuis la racine du dépôt. Conserver les sorties brutes et les manifestes dans un répertoire privé hors du dépôt. Les gabarits [charge et ressources](charge-ressources.md), [sécurité](securite.md) et [qualité, données et IA](qualite-donnees-ia.md) sont à renseigner après les essais. Les zones à mesurer portent la mention « non mesuré ».

| Investigation | Ancrage dans le dossier d’architecture |
|---|---|
| Charge REST et WSS | §4, §5, §8, §13 · T02, T03, T05–T09 · FW1 |
| Charge SFU et dimensionnement | §8, §11, §13 · T09, T12, T13, T16, T17 · FW2–FW6 |
| Audit des dépendances, des configurations et de l’entrée web | §4, §8, §12, §13 · T02, T03, T05, T06 · FW1 pour le parcours ZAP. Les audits du dépôt n’exercent aucun flux de l’application. |
| Qualité en direct et sous TURN | §6, §8, §13 · T10–T12 · FW1 pour la signalisation, FW4 et FW5 pour le relais |
| Export, analyse et preuve de concept IA | §3, §7, §13 · T09 pour le stockage des fenêtres de qualité. Analyse et IA hors ligne. |

La section 13 réserve les essais de charge et de sécurité au banc isolé. Utiliser le monolithe Fastify, son client React et la passerelle de la cible avec les contrats v1. Les chemins historiques de la démo sont répertoriés dans les contrats. [Dossier d’architecture](../architecture/dossier-architecture.md#13-travail-dinvestigation) · [OpenAPI](../architecture/api/openapi.yaml) · [AsyncAPI](../architecture/api/asyncapi.yaml)

## Charge REST et WebSocket

Prérequis du banc. L’origine HTTPS est accessible depuis Docker avec un certificat de confiance. L’application accepte cet en-tête `Origin`. Choisir un répertoire de travail privé hors dépôt.

```sh
umask 077
RUN_DIR=$(mktemp -d)
export BASE_URL=https://banc.example.test
docker run --rm --user "$(id -u):$(id -g)" \
  -e BASE_URL -e LOAD_STAGES -e REST_P95_MS -e DELIVERY_P95_MS -e ERROR_RATE \
  --mount "type=bind,src=$PWD/tests/load,dst=/scripts,readonly" \
  --mount "type=bind,src=$RUN_DIR,dst=/out" \
  grafana/k6 run --out json=/out/k6.jsonl /scripts/chatisen.js
node tests/load/synthese.mjs "$RUN_DIR/k6.jsonl" > "$RUN_DIR/charge.md"
```

- `LOAD_STAGES` se règle en couples `VU:secondes`. Les valeurs par défaut sont `1:45,2:45,3:45`, avec 20 s entre paliers pour finir les itérations en cours. Seuils par palier par défaut, strictement moins de 500 ms de p95 REST, de 1 000 ms de p95 de livraison et de 1 % d’erreurs par catégorie. Conserver le code de sortie k6. Un seuil franchi fait échouer la commande même si le JSON a été écrit.
- La préparation inscrit deux comptes `e2e_` et ouvre leur conversation privée. Les inscriptions ouvrent déjà leurs sessions. Il n’y a aucune authentification répétée pendant les paliers et aucune relance sur 429. Si la passerelle limite la préparation, attendre une minute avant une nouvelle exécution. Chaque exécution révoque les sessions à la fin dans la mesure où le serveur répond. Les comptes, la conversation et ses messages de banc restent dans la base du banc.
- Un VU lit le dernier message, ouvre une socket du destinataire, s’abonne, écrit un message REST avec un UUID unique et attend son événement `message.created`. La socket reste ouverte 12 s. La latence de livraison part du début du POST et se termine quand k6 traite l’événement. Le client du test traite les événements après le retour de son POST synchrone. La mesure inclut donc cette attente si le serveur livre avant la réponse REST.
- Le p95 REST regroupe historique et envoi ayant reçu une réponse HTTP. Le taux REST couvre toutes les tentatives REST pendant les paliers. Le taux WSS compte les ouvertures tentées avec échec d’admission, d’abonnement ou fermeture prématurée. Tout parcours sans événement attendu compte comme échec de livraison, y compris si une étape antérieure l’a bloqué. Le p95 de livraison porte sur les événements effectivement reçus. Les horodatages des points servent à recouper les compteurs infra. Vérifier la complétude des étapes après un arrêt ou un incident.

### SFU LiveKit

Utiliser les identifiants LiveKit du banc fournis à l’exécution et l’URL WSS de signalisation derrière Nginx. Fixer une salle dédiée à chaque essai. La commande génère un éditeur vidéo et trois abonnés pour charger le SFU à quatre participants. La recette d’admission de ChatISEN passe, elle, par les jetons du module `calls`.

```sh
SFU_URL=wss://banc.example.test/livekit/
lk load-test --url "$SFU_URL" --api-key "$LIVEKIT_API_KEY" \
  --api-secret "$LIVEKIT_API_SECRET" --room "e2e_sfu_$(date -u +%Y%m%dT%H%M%SZ)" \
  --video-publishers 1 --subscribers 3 --duration 45s
```

Relever la version de `lk`, la durée, les pistes reçues et les erreurs. Vérifier les chemins média UDP 7882 et secours TCP 7881 selon FW6.

## Sécurité

```sh
ZAP_BENCH_URL=https://banc.example.test bash tests/security/bench/run.sh "$RUN_DIR/securite"
```

`RUN_DIR` doit exister et la sous-sortie `securite` doit être nouvelle. Le script lance `pnpm audit`, Trivy avec `aquasec/trivy` et ZAP baseline avec `ghcr.io/zaproxy/zaproxy:stable`. Les deux audits locaux lisent l’arbre suivi de `HEAD`. Associer la révision du banc à celle des audits et consigner la date, les versions ou digests d’image et la date de la base Trivy. `TRIVY_IMAGE` et `ZAP_IMAGE` permettent de reprendre les mêmes images. ZAP parcourt le banc sans session et effectue des vérifications passives. Les rapports JSON, HTML et journaux restent privés. Lire `statuts.tsv` puis les sorties par outil pour distinguer constat, avertissement et erreur d’exécution.

Pour les contrôles d’accès authentifiés, utiliser la suite existante avec dépendances installées et `DATABASE_URL` de la base de tests. [Tests d’intégration et de sécurité](../../tests/)

```sh
node --import tsx --test --test-concurrency=1 \
  tests/integration/groups/access-matrix.test.ts \
  tests/integration/messaging/websocket.test.ts \
  tests/security/fastify-realtime.test.ts
```

## Qualité et qualification des fenêtres

1. Sur un banc Linux dédié, préparer un espace réseau nommé avec une interface dont le trafic du navigateur emprunte effectivement la sortie, et avec DNS et routage vers le banc. Lancer le navigateur dans cet espace avec un profil dédié et le compte de test. Faire appeler deux comptes de banc sur la cible. Prévoir deux réseaux pour la recette, en gardant les sources audio et vidéo et la durée d’appel comparables.
2. Pour chaque scénario, observer un appel en direct puis un autre en ouvrant la page avec `?relay=1` chez les deux participants avant de composer. Contrôler le candidat ICE effectivement choisi dans les statistiques de connexion ou l’export. Le chemin direct peut être `host`, `srflx` ou `prflx`, et le chemin relais porte `relay`.
3. Faire une référence sans qdisc ajouté. Répéter avec les profils `latence`, `perte`, `debit` et `mixte`, un seul changement à la fois. Consigner côté opérateur l’état netem, l’UUID d’appel et les heures UTC des phases. Le script touche uniquement la file de sortie de l’interface désignée. Pour un effet dans les deux sens, appliquer le profil à la sortie de chaque extrémité du chemin de banc. Les valeurs des profils sont des consignes de configuration.
4. Comparer à scénarios identiques, en utilisant le candidat observé et des appels indépendants. Vérifier réception audio et vidéo et évolution de l’indicateur. Consigner également les appels qui échouent avant d’émettre des fenêtres, ainsi que les minutes sans télémétrie. Un export vide reste « non mesuré ».

```sh
# NETNS et IFACE désignent l’espace et l’interface du banc Linux.
sudo ip netns exec "$NETNS" bash tests/load/netem.sh "$IFACE" add latence
sudo ip netns exec "$NETNS" bash tests/load/netem.sh "$IFACE" status
# Après chaque essai, y compris en cas d’arrêt anticipé.
sudo ip netns exec "$NETNS" bash tests/load/netem.sh "$IFACE" clear
sudo ip netns exec "$NETNS" bash tests/load/netem.sh "$IFACE" status
```

`add` prend un handle propre et échoue s’il ne peut l’ajouter sans remplacement. Tout usage sur une VM de production est interdit.

## Export et analyses Python

Créer le manifeste privé `appels.csv` avec l’en-tête ci-dessous. Utiliser les UUID des appels de banc sélectionnés, une ligne par intervalle UTC semi-ouvert `[début, fin[`, et des scénarios stables sans identifiant humain, par exemple `video_reference` et `video_latence`. Les intervalles d’un même appel peuvent se suivre. Attribuer `label=0` à une fenêtre de contrôle et `label=1` à une dégradation provoquée, à partir du journal des interventions, indépendamment des métriques et du modèle. Laisser vide les fenêtres d’état inconnu ou exclure les transitions du manifeste. Les compteurs couvrent environ les cinq secondes précédant `captured_at`. Garder une marge autour des changements pour éviter de labelliser une fenêtre à cheval sur deux états.

```csv
call_id,scenario,start_utc,end_utc,label
```

Configurer la connexion libpq du banc avec un rôle de lecture ayant `USAGE` sur `quality` et `SELECT` sur `quality.samples`. Utiliser un proxy privé existant si nécessaire. Le script exige un sel secret aléatoire de 32 octets en hexadécimal, fourni à l’exécution. Un même sel relie les fenêtres d’un même appel dans une campagne.

```sh
QUALITY_HMAC_SALT="$(openssl rand -hex 32)" \
  python3 -B analysis/export_quality.py "$RUN_DIR/appels.csv" > "$RUN_DIR/qualite.csv"
python3 -B analysis/study.py "$RUN_DIR/qualite.csv" --svg "$RUN_DIR/qualite.svg" > "$RUN_DIR/etude.json"
python3 -B analysis/anomaly.py "$RUN_DIR/qualite.csv" > "$RUN_DIR/ia.json"
```

Le format et les limites d’interprétation figurent dans le [gabarit de rapport données](qualite-donnees-ia.md). Pour un essai du pipeline hors ligne avec des données explicitement synthétiques, utiliser les commandes suivantes dans un répertoire de travail privé.

```sh
python3 -B analysis/generate_synthetic.py > "$RUN_DIR/synthetique.csv"
python3 -B analysis/study.py "$RUN_DIR/synthetique.csv" --svg "$RUN_DIR/synthetique.svg" > "$RUN_DIR/etude-synthetique.json"
python3 -B analysis/anomaly.py "$RUN_DIR/synthetique.csv" > "$RUN_DIR/ia-synthetique.json"
```

## Vérifications hors ligne

```sh
node --test tests/load/synthese.test.mjs
python3 -B -m unittest discover -s analysis -v
bash -n tests/load/netem.sh
bash -n tests/security/bench/run.sh
node scripts/check-boundaries.mjs
COREPACK_ENABLE_NETWORK=0 COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm typecheck
```

Le typecheck suppose la présence des dépendances du projet et de `pnpm` dans le PATH. Les tests unitaires des études utilisent la bibliothèque standard.
