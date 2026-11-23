# Essais techniques initiaux

## SQL — commit/rollback + NOTIFY

**Statut : préparé, non exécuté sur PostgreSQL dans cet environnement.** Le runner `db/migrate.mjs` encapsule chaque migration dans une transaction et la migration v1 crée le trigger `pg_notify('chatisen_conversation_events', ...)`. Le test contract vérifie la présence du trigger, des contraintes et l’idempotence statique. L’essai réel attendu est : deux connexions, `LISTEN chatisen_conversation_events`, insertion dans une transaction, observation après commit, absence après rollback, réabonnement puis rattrapage par curseur. Dépendance : `DATABASE_URL` et daemon PostgreSQL.

## Média — deux navigateurs derrière proxy

**Statut : préparé, non exécuté avec média réel.** Le profil Compose contient LiveKit, Nginx et le jeton d’appel API ; le profil standalone vérifie l’invitation et l’acceptation d’appel ainsi que le WebSocket de conversation. L’essai réel attendu est : deux contextes Chromium, cookie de session, première admission audio puis vidéo, reconnexion et test ICE relay/TURN. Dépendance : daemon Docker, image LiveKit, permissions micro/caméra et idéalement deux réseaux.

Aucune piste média reçue, latence, qualité ou résultat TURN n’est déclaré comme mesuré tant que cet essai n’a pas été exécuté.
