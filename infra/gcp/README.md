# Architecture cible sur Google Cloud

Terraform décrit toute la cible de `docs/architecture/`. La démo (branche `standalone`) n'est pas gérée ici.

## Ressources

| Rôle | Ressource | Type | Réseau |
|---|---|---|---|
| Application ×2 | groupe régional `chatisen-app`, zones a et b | `e2-small` | `app` 10.40.10.0/24, sans IP publique |
| STUN et TURN | `chatisen-turn` | `e2-small` | `media` 10.40.20.0/24, IP publique réservée |
| Supervision | `chatisen-ops` (10.40.30.2) | `e2-medium` | `ops` 10.40.30.0/24, accès par IAP |
| Conférence ×2 (V2) | `chatisen-sfu-1`, `chatisen-sfu-2` | `e2-highcpu-2` | `media`, une IP publique chacun |
| Base | Cloud SQL PostgreSQL 17 régional (HA), PITR | `db-custom-1-3840` | IP privée (10.40.32.0/20) |
| Redis (V2) | Memorystore Standard HA, TLS et AUTH | 1 Go | IP privée |
| Entrée web | load balancer applicatif externe **régional** | | proxys 10.40.50.0/24 |
| Fichiers (V2) | bucket Cloud Storage privé | | |
| Images, secrets, migration | Artifact Registry, Secret Manager, job Cloud Run `chatisen-migration` | | |

## Écarts avec la première version du schéma

| Écart | Raison |
|---|---|
| Load balancer **régional** au lieu de global | Il doit reprendre l'adresse régionale de la démo, car le DNS ne peut pas changer. |
| Certificat Let's Encrypt posé sur le load balancer | Un certificat géré régional exige une validation DNS. |
| Sous-réseau de proxys en 10.40.50.0/24 ; FW1 depuis ces proxys et les sondes GCP | Propre au load balancer régional. |
| Port 80 ouvert sur coturn et flux 8080 des applications vers la supervision | Preuve ACME des deux certificats. |
| Jeton de salle de 60 secondes au lieu de 5 minutes | Un membre retiré ne peut pas revenir dans la conférence avec un ancien jeton. |
| Noms publics en `sslip.io` | Aucun enregistrement DNS à gérer avant la bascule. |

## Utilisation

L'accès passe par le compte de service limité ; aucun fichier de clé.

```sh
export CLOUDSDK_CONFIG="$HOME/.config/gcloud-chatisen"
export GOOGLE_OAUTH_ACCESS_TOKEN="$(gcloud auth print-access-token)"
terraform init
terraform plan -out=plan.tfplan
terraform apply plan.tfplan
```

L'état contient des secrets : il vit dans le bucket privé et versionné du backend et n'est jamais commité.

## Déploiement continu (flux T18 et T19)

Une fusion sur `main` lance la CI. Si elle réussit, le workflow « Cible — images et déploiement » construit les deux images, les publie par digest puis lance `cd/deploy.sh` avec une identité fédérée, sans clé stockée :

1. la tâche Cloud Run `chatisen-migration` reçoit la nouvelle image et migre la base ;
2. la « configuration commune » du groupe reçoit les deux digests, et le groupe remplace ses VM sans retirer les anciennes avant que les nouvelles soient saines ;
3. le script vérifie que toutes les VM saines portent les digests demandés et que le point de santé public répond ;
4. sinon il remet les digests précédents, vérifie, et le workflow échoue. La base garde la migration.

Conséquence : **toute migration doit rester compatible avec la version encore en service** (ajouter d'abord, retirer dans une version ultérieure). La migration 004, qui déplaçait les tables, a été la dernière exception, avant la mise en service. L'environnement GitHub `cible` est limité à `main`, sans approbation manuelle.

**Droits de `sa-deploy`**, accordés par un propriétaire hors Terraform : `artifactregistry.writer`, `compute.instanceAdmin.v1`, `run.developer`, l'usage de `sa-app`, et un rôle personnalisé réduit à `compute.healthChecks.use`. Sans ce dernier, Google refuse toute mise à jour d'un groupe de VM doté de la réparation automatique. Un essai du script avec un compte plus large ne le montre pas.

Terraform ignore la configuration commune du groupe et l'image de la tâche de migration : il gère l'infrastructure, la CI gère les versions. `images.auto.tfvars.json` ne sert qu'à la création. La région limite à 8 VM : tant que la démo existe, une seule VM de renfort est créée à la fois, d'où des erreurs `QUOTA_EXCEEDED` sans gravité et 10 à 15 minutes par déploiement.

**Mesurer la disponibilité** se fait depuis une VM qui a sa propre adresse publique, comme `chatisen-turn`. Depuis une VM sortant par Cloud NAT, une sonde d'une requête par seconde épuise les 64 ports réservés à la VM et rapporte de fausses coupures.

## Premier administrateur

Aucune route ne permet de se donner ce rôle. L'exploitant exécute `db/promote-admin.mjs <identifiant>` avec la tâche de migration :

```sh
gcloud run jobs execute chatisen-migration --region europe-west4 --args=db/promote-admin.mjs,<identifiant> --wait
```

## Alertes et restauration

- Google interroge `/healthz-edge` chaque minute depuis plusieurs régions ; l'alerte « service public indisponible » se déclenche après 2 minutes d'échec dans au moins deux régions. Pour recevoir un courriel : créer `alertes.auto.tfvars` (non versionné) avec `alert_email = "..."`, puis appliquer.
- Les alertes Prometheus (API, coturn, SFU) se lisent dans l'interface de supervision.
- Sauvegardes Cloud SQL quotidiennes (7 conservées) et restauration à un instant donné. Restauration d'essai : `gcloud sql instances clone chatisen-pg chatisen-pg-restauration --point-in-time <date UTC>`, comparer, puis supprimer la copie. Une restauration réelle clone vers une nouvelle instance puis change le secret `db-password` et la connexion.

**Certificat du site.** Émis sur la supervision avec `certbot certonly --standalone --http-01-port 8080 -d <nom>`, puis déposé comme certificat SSL régional et rattaché au proxy `chatisen-https`. Il n'est pas renouvelé automatiquement (expiration en février 2027, après la fin du projet).

**Administration.** `gcloud compute ssh <vm> --zone <zone> --tunnel-through-iap`. Grafana : tunnel IAP vers le port 3000 de `chatisen-ops` ; le mot de passe est dans le secret `grafana-admin-password`.

## Fin du projet

La base a une protection contre la suppression, à désactiver avant `terraform destroy`. Détruire l'infrastructure efface les données de la base, du bucket et des disques.
