# Sauvegarde

Le profil PostgreSQL se sauvegarde avec `pg_dump --format=custom`, puis chiffre le fichier avec `age` avant dépôt séparé. Conserver la clé hors hôte. Vérifier SHA-256, restaurer dans une base vierge et calculer RPO/RTO ; aucune sauvegarde réelle n’a été déclarée dans l’environnement sans PostgreSQL.
