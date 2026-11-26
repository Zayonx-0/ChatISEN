# Architecture cible sur Google Cloud

Terraform décrit toute la cible de `docs/architecture/`. La démo (branche `standalone`) n'est pas gérée ici.

## Ressources

| Rôle | Ressource | Type | Réseau |
|---|---|---|---|
| Application ×2 | groupe régional `chatisen-app`, zones a et b | `e2-small` | `app` 10.40.10.0/24, sans IP publique |
| STUN et TURN | `chatisen-turn` | `e2-small` | `media` 10.40.20.0/24, IP publique réservée |
| Supervision | `chatisen-ops` (10.40.30.2) | `e2-medium` | `ops` 10.40.30.0/24, accès par IAP |
| Conférence ×2 (V2) | `chatisen-sfu-1`, `chatisen-sfu-2` | `e2-highcpu-2` | `media` |
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
| Une seule adresse publique sur les SFU | 4 adresses en service autorisées dans la région. `sfu_public_ips = 2` après la bascule. |
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

**Nouvelle version de l'application.** La fusion sur `main` publie les images (workflow « Cible — images »). Reporter leurs digests dans `images.auto.tfvars.json`, exécuter la migration (`gcloud run jobs execute chatisen-migration --region europe-west4 --wait`) quand le schéma change, puis appliquer : le groupe remplace les VM sans coupure. Pour une migration, mettre d'abord à jour l'image du job avec `terraform apply -target=google_cloud_run_v2_job.migrate`. Cette étape n'est pas encore automatisée.

**Certificat du site.** Émis sur la supervision avec `certbot certonly --standalone --http-01-port 8080 -d <nom>`, puis déposé comme certificat SSL régional et rattaché au proxy `chatisen-https`. Il n'est pas renouvelé automatiquement (expiration en février 2027, après la fin du projet).

**Administration.** `gcloud compute ssh <vm> --zone <zone> --tunnel-through-iap`. Grafana : tunnel IAP vers le port 3000 de `chatisen-ops` ; le mot de passe est dans le secret `grafana-admin-password`.

## Fin du projet

La base a une protection contre la suppression, à désactiver avant `terraform destroy`. Détruire l'infrastructure efface les données de la base, du bucket et des disques.
