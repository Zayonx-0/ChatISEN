# Charge et dimensionnement

Gabarit à renseigner après exécution. Architecture §8, §11, §13 · T02, T03, T05–T09, T12, T13, T16, T17 · FW1 à FW6.

| Exécution | Révision et versions | Origine de banc et heure UTC | Configuration et seuils |
|---|---|---|---|
| REST et WebSocket | non mesuré | non mesuré | non mesuré |
| SFU | non mesuré | non mesuré | non mesuré |

Insérer le tableau produit par `synthese.mjs`. Relever les ressources sur les mêmes intervalles UTC avec la supervision du banc. Retenir le maximum par VM et indiquer les compteurs et unités utilisés. Pour SQL, reprendre les connexions totales et, si disponible, actives depuis l’observabilité de la base. À défaut, échantillonner `pg_stat_activity` depuis le banc avec un rôle autorisé, en excluant la connexion de mesure.

| Palier | VU | p95 REST / livraison (ms) | Erreurs REST / WSS / livraison | CPU app / média | Mémoire app / média | Connexions SQL | Trafic TURN |
|---|---|---|---|---|---|---|---|
| non mesuré | non mesuré | non mesuré | non mesuré | non mesuré | non mesuré | non mesuré | non mesuré |

| Palier SFU | Éditeurs et abonnés | Pistes attendues / reçues | Erreurs | CPU / mémoire SFU | Trafic sortant |
|---|---|---|---|---|---|
| non mesuré | non mesuré | non mesuré | non mesuré | non mesuré | non mesuré |

| Analyse | Résultat |
|---|---|
| Dernier palier satisfaisant les seuils | non mesuré |
| Premier palier franchissant un seuil | non mesuré |
| Ressource limitante et éléments observés | non mesuré |
| Point de saturation établi | non mesuré |

Rejouer les mêmes paliers et médias après un seul changement de dimensionnement dans le banc. Rapporter le débit de messages livrés au dernier palier satisfaisant les seuils au total de vCPU des VM applicatives. Calculer le coût mensuel estimé à partir de tarifs datés, des heures, de la taille des VM et du trafic relayé projeté. Consigner la période d’observation et les hypothèses de projection avec l’estimation.

| Variante | Paramètre, taille de VM | vCPU | Livraisons/s/vCPU | Trafic relayé | Coût mensuel estimé | Décision de dimensionnement |
|---|---|---|---|---|---|---|
| Avant | non mesuré | non mesuré | non mesuré | non mesuré | non mesuré | non mesuré |
| Après | non mesuré | non mesuré | non mesuré | non mesuré | non mesuré | non mesuré |
