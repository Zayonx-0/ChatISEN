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

Le lecteur C4 est accessible sous `/architecture/`. Caddy sert le lecteur, son script et ses SVG depuis `docs/architecture/`. Les liens vers le guide et les fichiers sources s’ouvrent dans le dépôt.

Le serveur installe ses dépendances verrouillées et crée une paire de clés VAPID dans son fichier d’environnement protégé lors de la première installation. Cette paire doit rester stable pour conserver les abonnements des navigateurs. Les notifications après fermeture de l’onglet dépendent du service push du navigateur et de l’autorisation de l’utilisateur.
