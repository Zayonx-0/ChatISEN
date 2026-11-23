# Menaces et contrôles

| Menace | Contrôle | Validation |
|---|---|---|
| Vol de session | cookie HttpOnly, hash de token en base, expiration/révocation | S01 |
| CSRF/origine étrangère | HMAC lié au token et vérification Origin | S01 |
| Lecture d’un fil tiers | appartenance vérifiée sur chaque route et socket | S02 |
| Accès média après retrait | admission API, token limité, job de révocation/webhook signé | S03 |
| Fichier malveillant | limite taille/type, SHA-256, Content-Disposition attachment | S05 |
| Fuite d’informations | logs JSON sans secret, métriques à labels bornés, export sans IP | S04 |
| Dépendance vulnérable | lockfile, SBOM/Trivy au pipeline Compose | S05 |

La défense ne remplace pas TLS : le profil public doit utiliser Certbot ou une CA de démo, des ports minimaux et des secrets hors du dépôt.
