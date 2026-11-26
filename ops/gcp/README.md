# Installation de démonstration sur une VM Debian

Ce profil sert le client et le serveur **standalone** sous HTTPS. Les comptes et messages sont conservés dans `/var/lib/chatisen/chatisen.json`, hors du clone Git. Il utilise PostgreSQL/React/LiveKit uniquement dans le profil Compose séparé, non démarré ici. La réception R01 ne découle pas de cette installation.

Prérequis : Debian, `git`, `curl`, `openssl`, `xz-utils`, Caddy, un nom DNS public pointant vers la VM et les ports TCP 80 et 443 ouverts. Le service Node 24.14.1 doit être installé dans `/opt/chatisen/runtime/node-v24.14.1-linux-x64` après vérification du SHA-256 publié sur nodejs.org. Cloner le dépôt dans `/opt/chatisen/app`, extraire le commit voulu puis exécuter :

```sh
sudo bash /opt/chatisen/app/ops/gcp/install.sh chat.example.org
sudo systemctl status chatisen caddy
curl -fsS https://chat.example.org/readyz
```

Le script crée un compte système dédié, un secret CSRF local et un fichier d'environnement protégé par root, puis configure systemd et Caddy. Il conserve les données et le secret lors des réexécutions ; un domaine différent exige une modification explicite de la configuration. Caddy renouvelle le certificat automatiquement.

La signalisation WebRTC utilise HTTPS/WSS et, dans ce profil, un serveur STUN public configurable via `CHATISEN_STUN_URL` dans `/etc/chatisen/chatisen.env`. Cette valeur est communiquée aux navigateurs : ne pas y placer de secrets. Il n'y a pas de relais TURN ; certains réseaux empêcheront les appels. Un certificat valide et les autorisations navigateur sont requis pour le microphone et la caméra. Le mode standalone est destiné à la démonstration : limitation de connexion, sauvegardes et exploitation sécurisée restent à compléter avant une utilisation de production.

## Déploiement continu

Une fois l'agent installé, tout commit fusionné dans `main` est mis en production sans action manuelle.

1. GitHub Actions lance les contrôles (`Builds, tests et configuration Compose`).
2. Chaque minute, la VM compare son commit à la tête de `main`. Si elle diffère, l'agent lit le résultat de ce contrôle par l'API publique de GitHub.
3. CI verte : l'agent avance le dépôt du serveur sur ce commit. Si le serveur de démonstration change, il copie d'abord le fichier de données puis redémarre le service.
4. Contrôle de santé en échec : retour automatique au commit précédent. Ce commit n'est plus retenté.
5. Le résultat est publié dans `/version.json`. Le job `Déploiement en production` l'attend : il est vert seulement si le site annonce le commit.

GitHub ne détient aucune clé du serveur et le job de déploiement n'a aucun droit sur le dépôt. L'agent n'exécute aucun fichier du dépôt en root. La contrepartie : toute personne autorisée à pousser sur `main` déclenche une mise en production dès que la CI est verte.

L'agent ne déploie pas, et signale `blocked`, si la CI a échoué, si l'historique a été réécrit, si le dépôt du serveur a été modifié à la main, ou si changent `ops/gcp/Caddyfile.template`, `ops/gcp/chatisen.service` ou les dépendances de production de `package.json`. Une mise à jour limitée à `pnpm-lock.yaml` est déployée sans réinstallation : relancer `install.sh` si elle concerne une dépendance de production.

Installation de l'agent (à refaire après toute modification de `ops/gcp/cd/`, qu'il ne s'applique pas lui-même) :

```sh
sudo bash /opt/chatisen/app/ops/gcp/cd/install-cd.sh chat.example.org
```

Après un blocage pour installation manuelle, relire le changement, puis :

```sh
sudo git -C /opt/chatisen/app fetch origin main
sudo git -C /opt/chatisen/app checkout --detach origin/main
sudo bash /opt/chatisen/app/ops/gcp/install.sh chat.example.org
```

Exploitation courante :

```sh
journalctl -u chatisen-deploy -n 50          # journal
sudo touch /etc/chatisen/deploy.pause        # suspendre le CD
sudo rm /etc/chatisen/deploy.pause           # le reprendre
sudo systemctl start chatisen-deploy         # forcer un passage
```

Pour retenter un commit en échec, supprimer `/var/lib/chatisen-deploy/state.json`. Pour revenir en arrière durablement, annuler le commit sur `main` (`git revert`) : l'agent déploie cette annulation. Les copies de données sont conservées dans `/var/backups/chatisen/` (dix au plus, lisibles par root seul).

Le lecteur C4 est accessible sous `/architecture/`. Caddy sert le lecteur, son script et ses SVG depuis `docs/architecture/`. Les liens vers le guide et les fichiers sources s’ouvrent dans le dépôt.

Le serveur installe ses dépendances verrouillées et crée une paire de clés VAPID dans son fichier d’environnement protégé lors de la première installation. Cette paire doit rester stable pour conserver les abonnements des navigateurs. Les notifications après fermeture de l’onglet dépendent du service push du navigateur et de l’autorisation de l’utilisateur.
