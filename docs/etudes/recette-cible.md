# Relevé des vérifications en ligne

Vérifications faites sur la cible avec des comptes de test, masqués ensuite. Les scripts d'essai et leurs sorties brutes ne sont pas versionnés : ce relevé en donne le résultat et les limites. Ce n'est pas une campagne de mesures ; les essais de charge, de sécurité sur banc et de qualité réseau restent à faire (section 13 du dossier).

## 27 novembre 2026, après la livraison de 12 h 32 (heure de Paris)

| Domaine | Résultat observé | Limite de l'essai |
|---|---|---|
| Accès et sessions | Cookie HttpOnly, Secure et SameSite=Lax ; session reconnue sur 12 requêtes réparties entre les deux VM ; écriture sans jeton CSRF refusée ; session révoquée refusée sur les deux VM ; identité forgée par en-tête refusée ; métriques et contrôle interne non publiés. | Comptes de test. |
| Frein des connexions répétées | 57 refus sur 120 tentatives envoyées en rafale. | La limite est comptée par adresse et par VM ; le réseau d'essai sort par plusieurs adresses. |
| Messages | Conversation privée et groupe créés ; message livré à 6 WebSocket réparties derrière le load balancer en 316 ms ; renvoi sans doublon ; un tiers ne lit pas la conversation. | Une seule mesure de délai. |
| Appels à deux | Audio et vidéo reçus en connexion directe et par le relais coturn ; indicateur de qualité à 506 kbit/s en direct et 496 kbit/s par le relais. | Deux navigateurs d'un même poste, micro et caméra simulés. Deux réseaux distincts non essayés. |
| Conférence | Trois participants, deux flux vidéo reçus par chacun, en direct et par le relais ; un membre retiré sort de la salle ; débits de 885 à 1 415 kbit/s affichés et mesures enregistrées. | Trois participants au lieu de quatre. |
| Fichiers | Envoi puis téléchargement à l'identique ; tiers, objet sans signature, signature modifiée, contenu mensonger, taille dépassée et réutilisation de l'URL d'envoi refusés. | Types et tailles d'essai. |
| Web Push | Notification reçue par un abonnement réel du service Push de Chrome. | Un seul navigateur ; Firefox non essayé. |
| Supervision | 11 cibles Prometheus sur 11, 4 règles d'alerte chargées, aucune alerte active ; appels directs et relayés, délai de livraison, âge de l'outbox et échecs Push relevés. | La réception d'une alerte externe n'a pas été provoquée. |

## 26 et 27 novembre 2026, avant et autour de la mise en service

| Domaine | Résultat observé | Limite de l'essai |
|---|---|---|
| Arrêt d'une VM applicative | 4 échecs sur 295 requêtes ; VM recréée en 7 minutes. | Un seul essai. |
| Mise à jour du groupe | Aucun échec du point de santé sur 775 requêtes. | Fait avec l'ancienne mise à jour progressive, avant la livraison zone par zone. |
| Arrêt du SFU 1 | La conférence s'établit sur le SFU 2, retrait d'un membre compris. | Salle ouverte après l'arrêt. |
| Restauration Cloud SQL | Copie restaurée à un instant donné : 14 contrôles de contenu identiques sur 14. | RPO et RTO non mesurés. |
| Reprise des données de la démo | 13 comptes, 10 conversations et 150 messages importés ; domaine basculé le 27 à 00 h 20 UTC sans changement DNS. | Les 36 fichiers de la page d'architecture comparés à l'identique. |
