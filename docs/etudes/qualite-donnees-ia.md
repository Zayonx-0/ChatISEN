# Qualité, données et preuve de concept IA

Gabarit à renseigner après exécution. Architecture §3, §6–§8, §13 · T09–T12 · FW1, FW4 et FW5.

## CSV d’analyse

L’export utilise exclusivement `quality.samples` et les appels de banc inscrits au manifeste. Les HMAC et la chronologie relative constituent une pseudonymisation. Garder l’export brut et le sel en privé. Aucun message, média, SDP, sous-réseau, adresse IP ni horodatage absolu n’entre dans le CSV.

| Colonne | Format et provenance |
|---|---|
| `source` | `mesure` pour une ligne extraite de la base, `synthetique` pour une ligne générée. Un fichier contient une seule origine. |
| `scenario` | Code générique issu du manifeste, 1 à 32 caractères parmi a–z, 0–9, tiret et soulignement, commençant par a–z. |
| `call_key`, `participant_key` | HMAC-SHA-256 hexadécimal, 64 caractères. L’identifiant du participant est pseudonymisé dans le périmètre de l’appel. |
| `elapsed_us` | Entier, microsecondes depuis le début du premier intervalle de cet appel inscrit au manifeste. |
| `packets_received`, `packets_lost` | Entiers sur la dernière fenêtre, la cadence du client étant d’environ 5 s. |
| `jitter_ms`, `rtt_ms` | Gigue et aller-retour en millisecondes. Le client transmet zéro lorsque la valeur manque. |
| `bitrate_kbps` | Débit reçu en kbit/s sur la dernière fenêtre. |
| `candidate_type` | `host`, `srflx`, `prflx` (direct), `relay` (TURN). |
| `label` | Vide pour la qualité descriptive, obligatoirement `0` (contrôle) ou `1` (anomalie provoquée) pour une fenêtre utilisée en IA. |

Les pertes sont calculées en pourcentage des paquets perdus et reçus sur la fenêtre. Le ratio est indéfini lorsque leur somme vaut zéro. Les statistiques par scénario et chemin agrègent d’abord les fenêtres au niveau de l’appel et donnent le même poids à chaque appel. Les courbes sont les distributions cumulées de ces moyennes. L’écart relais moins direct est descriptif. Pour comparer les chemins, consigner le nombre d’appels et les conditions communes, dont le profil réseau et le média. Un changement de candidat au cours d’un appel peut faire apparaître cet appel dans les deux groupes.

Pearson est calculé par paire de métriques sur les moyennes par appel dans chaque groupe. L’IC à 95 % utilise un bootstrap par appel avec remise et une graine consignée. Moins de trois appels exploitables ou une variance nulle rendent Pearson indéfini. Si moins de 90 % des tirages donnent un coefficient défini, l’IC reste vide (`null` dans le JSON). Documenter aussi les trous de télémétrie, les zéros substitués par le client et l’absence de fenêtres quand un appel échoue.

## Tableau de qualité

| Scénario | Chemin ICE observé | Appels / fenêtres | Pertes | Gigue | RTT | Débit | Corrélations et IC 95 % |
|---|---|---|---|---|---|---|---|
| non mesuré | direct | non mesuré | non mesuré | non mesuré | non mesuré | non mesuré | non mesuré |
| non mesuré | relais | non mesuré | non mesuré | non mesuré | non mesuré | non mesuré | non mesuré |

Courbes direct/relais, évolution de l’indicateur et comparaison des conditions de collecte · **non mesuré**.

## Comparaison IA

La référence à seuils reprend les conditions « faible » de l’indicateur client, soit plus de 8 % de pertes, plus de 400 ms de RTT ou aucun paquet reçu. La régression logistique utilise pertes, gigue, RTT, log(1 + débit) et absence de paquets reçus. La normalisation et l’apprentissage utilisent les appels d’entraînement. Les deux méthodes sont comparées sur les mêmes appels tenus à part, environ 30 % des appels étiquetés, avec les deux classes présentes dans chacun des lots. Fixer la graine avant l’évaluation et relever la répartition des étiquettes. Les fenêtres d’un même appel restent dans le même lot.

| Méthode | Appels / fenêtres du test | Précision | Rappel | F1 | TP / FP / FN / TN |
|---|---|---|---|---|---|
| Seuils | non mesuré | non mesuré | non mesuré | non mesuré | non mesuré |
| Régression logistique | non mesuré | non mesuré | non mesuré | non mesuré | non mesuré |

Décision appuyée par des mesures étiquetées · **non mesuré**. Les sorties marquées « SYNTHÉTIQUE » servent à vérifier le pipeline.
