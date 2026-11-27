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
| Jeton de salle de 60 secondes au lieu de 5 minutes | Un jeton LiveKit déjà émis reste valable jusqu’à son expiration. Une durée plus courte et une seconde éviction à l’expiration bornent la réadmission après le retrait d’un membre (T13, FW6). Les identifiants TURN durent au plus une heure, bornée par la session, pour permettre les rafraîchissements d’allocation (T12). |
| Nom TURN en `sslip.io` | L’équipe ne peut pas ajouter un nom TURN au DNS de l’école. Le nom résout l’IP réservée et permet la preuve ACME (T01, T12, FW4). |

## Domaine public

La cible sert `ia-pple.isen.fedyna.fr`. Le DNS appartient à l’école. Le load balancer reprend l’adresse réservée `isenchatprojectt` de la démo (`domaine.tf`, protégée contre la suppression). Les certificats publics sont posés sur le proxy HTTPS avec `gcloud`, pour que leurs clés restent hors de l'état Terraform. Celui du domaine est le certificat Let's Encrypt qu'utilisait la démo ; il expire le 23 février 2027 et ne se renouvelle pas automatiquement. Le CD sonde le domaine du site. Le nom web en `sslip.io` peut servir pendant un essai avant raccordement du DNS.

La VM de démo est conservée, service arrêté, avec ses données. Le retour arrière rend l'adresse à la démo ; les messages écrits sur la cible depuis la bascule n'y apparaîtraient pas.

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

## Déploiement continu (E36, §12, T18 à T20, FW1)

Le workflow vérifie la dernière CI de type `push` sur le SHA exact de `main`, y compris pour une relance manuelle. Le job `cible-images` utilise `sa-images` pour publier les images par digest dans le seul dépôt Artifact Registry `chatisen`. Le job `cible` est soumis à approbation manuelle et utilise `sa-deploy`. Les VM lisent le registre avec leur compte lecteur. Une version dont les deux digests sont déjà attestés évite une migration et un redémarrage.

Le Job Cloud Run migre la base. Le CD pose les digests dans `all-instances-config` et demande au MIG opportuniste de mettre à jour APP-A (zone a) seule. Une fois APP-A saine, il compare les digests au rapport récent de ce démarrage, puis traite APP-B (zone b). Le rapport T20 est produit depuis l’ID de l’image de chaque conteneur actif et ses `RepoDigests`. Il passe par les guest attributes et la lecture Compute existante. Sur échec en A, seule A est remise à la version précédente. Sur échec en B, B revient d’abord à l’ancienne version et A attend que B soit saine. Un déploiement ou un retour arrière garde une VM saine avant de demander le redémarrage de l’autre. Une panne indépendante du seul réplica sain pendant ce redémarrage demeure possible.

Terraform reste propriétaire du modèle d’instance. Donner le modèle au CD ferait gérer la même ressource par deux auteurs. Le CD écrit donc les deux digests dans la configuration commune et Terraform ignore ce champ. Un changement du modèle, distinct d’une livraison d’images, se propage par le même ordre de zones via `--bootstrap`.

Les droits existants de `sa-deploy` comprennent `compute.instanceAdmin.v1`, `run.developer` et le rôle personnalisé `compute.healthChecks.use` nécessaire au MIG autoréparant. Terraform lui accorde `iam.serviceAccountUser` sur le seul compte du Job `sa-migration` pour mettre à jour l’image. Le rôle de publication historique est retiré à la fin de la transition.

### Premier déploiement avec le nouveau CD

1. Finir toute livraison en cours. Suspendre les fusions et les relances durant l’amorçage. Relever les deux digests en service dans la configuration du MIG et confirmer leur correspondance avec les deux hôtes. Si le groupe n’a pas encore d’override, conserver les deux digests actuels en entrée Terraform.
2. Créer l’environnement GitHub `cible-images`, limité à `main`, sans relecteur. Préparer `cible` sur `main` avec relecteurs requis. Depuis la racine, lancer `bash infra/gcp/cd/wif.sh prepare` avec le compte d’exploitation. Le script vérifie le fournisseur et les liaisons du projet et des comptes. Le mappage laisse l’ancienne liaison opérationnelle pour `cible` seule. Vérifier aussi les éventuels droits IAM hérités, en particulier tout droit accordé à l’échelle du pool et les droits de `sa-images`.
3. Créer le secret avec l’application Terraform ciblée, puis préparer le rôle depuis le conteneur en service selon la procédure ci-dessous. Examiner et appliquer ensuite Terraform depuis cette version du dépôt, avec `-var=legacy_api_sql_access=true`. Le plan doit mettre le MIG en mode opportuniste, conserver les deux digests, laisser les VM actuelles en service et mettre à jour le Job, son AC et le nouveau modèle. Tester le Job existant avec `gcloud run jobs execute chatisen-migration --region europe-west4 --wait` avant la fusion.
4. Depuis la racine, lancer `bash infra/gcp/cd/deploy.sh --bootstrap` avec le compte d’exploitation. Cela adopte le nouveau modèle sur APP-A puis APP-B avec les digests déjà en service, y compris si aucun guest attribute n’existait avant la mise à jour. Contrôler les deux rapports et les parcours de connexion et d’écriture avec le rôle restreint. En cas d’échec, laisser en service la VM saine et réappliquer le paramètre SQL précédent ou le modèle précédent avant de ne mettre à jour que la VM en échec.
5. Fusionner et approuver une seule fois le job `cible` après la CI réussie. Contrôler les digests actifs, le Job et les journaux. Avant cette première réussite, le retour à l’ancien workflow reste possible avec `bash infra/gcp/cd/wif.sh rollback` et `terraform apply -var=ordered_app_rollout=false -var=legacy_api_sql_access=true`. Réactiver le mode opportuniste et refaire `prepare` avant de retenter la transition.
6. Après une livraison effectivement vérifiée, lancer `bash infra/gcp/cd/wif.sh finalize <id-du-run>`. Le script exige le succès de l’étape de déploiement et retire l’ancienne liaison puis le writer historique. Appliquer ensuite Terraform avec `legacy_api_sql_access=false` pour couper l’ancien accès SQL des VM.

Pour activer T17 sur les VM média déjà en service après Terraform, relancer le script de démarrage par IAP sur chaque SFU à tour de rôle, puis sur coturn dans un créneau prévu. Le redémarrage du SFU peut reconnecter ses salles. Celui de coturn interrompt ses allocations en cours.

```sh
gcloud compute ssh <vm> --zone <zone> --tunnel-through-iap \
  --command='sudo google_metadata_script_runner startup'
```

### Transition SQL (E37, §12.5, T09 et T19)

Le rôle `chatisen` reste propriétaire du schéma et sert de rôle de migration. Il prépare le rôle API depuis le conteneur en service. Le script utilise `CREATEROLE` directement si le propriétaire l’a. Sinon il passe par `SET ROLE cloudsqlsuperuser` le temps de créer ou d’activer le rôle, puis utilise le propriétaire pour les droits sur les données. Terraform génère `db-api-password` et sa version. Seul `sa-app` lit ce secret.

1. Depuis la racine du dépôt, appliquer les ressources du secret seules. Les VM restent sur leur configuration actuelle.

   ```sh
   terraform -chdir=infra/gcp apply \
     -target='google_secret_manager_secret_version.v["db-api-password"]' \
     -target='google_secret_manager_secret_iam_member.lecture["db-api-password:app"]'
   ```

2. Copier `db/ops/prepare-api-role.mjs` et `db/ops/api-grants.sql` sur une VM applicative, en conservant ces chemins relatifs. Depuis le répertoire qui les contient, exécuter le script dans le conteneur API en service. Son `DATABASE_URL` doit encore utiliser le propriétaire `chatisen`. Le script lit Secret Manager via l’identité de la VM, applique les droits dans une transaction et transmet à PostgreSQL un vérificateur SCRAM. On peut le relancer avec le même secret. Si `chatisen_api` a déjà été créé par un autre administrateur, celui-ci doit accorder l’option d’administration au rôle qui exécute ces opérations avant la relance (`GRANT chatisen_api TO chatisen WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;` si `chatisen` a directement `CREATEROLE`, ou la même commande avec `cloudsqlsuperuser` dans l’autre cas).

   ```sh
   api=$(sudo docker ps --filter label=com.docker.compose.project=chatisen \
     --filter label=com.docker.compose.service=api --format '{{.ID}}')
   sudo docker exec -i -e "API_ROLE_GRANTS_SQL=$(cat db/ops/api-grants.sql)" "$api" \
     node --input-type=module < db/ops/prepare-api-role.mjs
   ```

   Avant l’amorçage des VM, l’administrateur de `chatisen_api` peut le désactiver avec `ALTER ROLE chatisen_api NOLOGIN;`. Relancer le script pour réactiver le rôle avec le secret courant.

3. Appliquer Terraform et amorcer les VM une par une selon l’ordre ci-dessus. À ce stade les deux accès SQL sont en état de fonctionner. Pour revenir au rôle historique, appliquer `-var=api_restricted_sql=false -var=legacy_api_sql_access=true`, puis amorcer de nouveau zone par zone avec les digests en service.
4. Après vérification du déploiement, retirer l’ancien accès aux secrets des VM. Au besoin, restaurer d’abord `legacy_api_sql_access=true`, puis appliquer le retour du point 3. Dans chaque migration future, octroyer les droits sur les nouveaux objets à `chatisen_api` dans le même SQL versionné. Reporter les droits dans `db/ops/api-grants.sql` pour que la préparation puisse s’exécuter sur une base déjà migrée.

Le Job joint l’IP privée en TLS `verify-ca` avec l’AC Google propre à l’instance, montée depuis une version de secret explicite. La vérification de la chaîne et de la date est obligatoire. Ce mode convient à l’AC dédiée et au certificat serveur qui ne porte pas l’IP privée comme nom. En cas de rotation d’AC, réappliquer Terraform et retester le Job avant livraison. L’API passe toujours par le proxy Cloud SQL authentifié (T09).

Le test local `node --import tsx --test tests/integration/migration/api-role.test.ts` attend un PostgreSQL jetable et une `DATABASE_URL` locale dont le nom de base se termine par `_test`. Le test utilise `API_ROLE_PASSWORD` sur un PostgreSQL jetable. Il prépare deux fois le rôle depuis un propriétaire sans `SUPERUSER`, membre d’un rôle local doté de `CREATEROLE`, vérifie la lecture de toutes les tables applicatives, puis teste l’API et le refus du DDL. La CI l’exécute avec la suite de contrats après migration. Le digest exact en service dépend des approbations et des retours arrière. La CI de PR ne dispose ni d’un registre des versions effectivement déployées, ni d’une lecture de la production. Le test automatique de l’image précédente exacte reste à faire si cette provenance devient disponible. L’amorçage avec les digests encore en service permet de vérifier cette version avec le rôle restreint avant fusion.

## Premier administrateur

Aucune route ne permet de se donner ce rôle. L'exploitant exécute `db/promote-admin.mjs <identifiant>` avec la tâche de migration :

```sh
gcloud run jobs execute chatisen-migration --region europe-west4 --args=db/promote-admin.mjs,<identifiant> --wait
```

## Alertes et restauration

- Google interroge `/healthz-edge` chaque minute depuis plusieurs régions ; l'alerte « service public indisponible » se déclenche après 2 minutes d'échec dans au moins deux régions. Pour recevoir un courriel : créer `alertes.auto.tfvars` (non versionné) avec `alert_email = "..."`, puis appliquer.
- Les alertes Prometheus (API, coturn, SFU) se lisent dans l'interface de supervision.
### Journaux (E25, §11, T17, FW2 et FW3)

Le récepteur Ops Agent `chatisen_containers` décode les enveloppes JSON Docker et extrait des champs bornés de Nginx, de l’API, de Cloud SQL Proxy, de coturn et de LiveKit. La sortie native de coturn est textuelle et l’agent la structure. Les champs collectés sont filtrés avant leur expédition. Pour l’API, le sérialiseur conserve le type, le code, les cadres de pile et un message borné et masqué, y compris au démarrage. Nginx écrit ses erreurs critiques et de démarrage sur stderr. L’Ops Agent conserve leur niveau et écarte le texte natif. Les tampons Docker contiennent les sorties natives des images tierces. Les journaux Docker locaux sont limités à trois fichiers de 10 Mio par conteneur. Pour le LB géré, le routeur écarte les entrées avec chaîne de requête afin d’éviter de stocker des jetons. Les journaux de la cible sont routés vers le bucket `chatisen-cible`, `europe-west4`, rétention 30 jours. Les buckets d’audit existants gardent leurs réglages GCP.

Dans Logs Explorer, choisir le bucket régional et rechercher `log_id("chatisen_containers") AND jsonPayload.requestId="<UUID>"`. Provoquer une erreur de l’API passant par Nginx et reprendre l’UUID du corps. Attendre une entrée Nginx et une entrée API. Vérifier `jsonPayload.status`, la présence des cinq noms de conteneurs et la région et la rétention effectives. Une erreur de limitation produite directement par Nginx intervient avant l’appel à l’API. Résultat de la recette en cible à mesurer.

### Fichiers (E40, §7, T22)

Le bucket annule les téléversements multiparties incomplets après un jour. Les envois HTTPS du navigateur utilisent un PUT signé. L’API nettoie les envois en attente ou refusés après une heure et les objets confirmés qui sont restés sans message après 24 h. Chaque décision de suppression prend un verrou SQL sur la fiche et vérifie la référence au message. Une fiche rejetée reste à nettoyer si Cloud Storage est temporairement indisponible. La taille maximale suit le contrat, 25 Mio. Aucun quota supplémentaire n’est posé.

### Reprise (E38 et E39, §10, T21, T16, FW2 et FW3)

Depuis un poste joignant les IP privées, lancer `bash infra/gcp/ops/pitr.sh` à la racine, avec `gcloud`, `psql`, `jq` et `shasum`. Utiliser un rôle présent au point choisi, capable de lire les messages. Le script crée un clone PITR sans le raccorder à l’application, vérifie l’AC du clone, compare les empreintes des messages, des événements et des identifiants stables des comptes et conversations antérieurs à la coupure et mesure le délai de validation. Le RPO observé porte sur les dernières écritures visibles dans les messages et dépend du trafic pendant l’essai. Répéter avec du trafic de recette si la fenêtre est restée inactive. Seule la saisie du nom exact du clone déclenche sa suppression. RPO, RTO et comparaison en cible à mesurer.

Pour remplacer la supervision depuis `infra/gcp` avec les réglages en service, examiner le plan, puis l’appliquer. La VM reprend l’IP privée 10.40.30.2. Prometheus et Grafana sont reprovisionnés et l’accès utilise IAP.

```sh
terraform plan -target=google_compute_instance.ops -replace=google_compute_instance.ops -out=ops-reprise.tfplan
terraform apply ops-reprise.tfplan
gcloud compute ssh chatisen-ops --zone europe-west4-a --tunnel-through-iap -- -L 3000:localhost:3000
```

Ouvrir Grafana sur `localhost:3000`, vérifier les cibles Prometheus et les alertes. Le disque de démarrage contient l’historique Prometheus, l’état local des alertes, les modifications Grafana hors provisioning et les fichiers Certbot locaux. Ils sont perdus avec ce disque. Le certificat déjà attaché au LB reste utilisable jusqu’à son expiration. Conserver de quoi renouveler ou réémettre avant l’échéance. Temps de remplacement et recette de supervision à mesurer.

**Certificat du site.** Émis sur la supervision avec `certbot certonly --standalone --http-01-port 8080 -d <nom>`, puis déposé comme certificat SSL régional et rattaché au proxy `chatisen-https`. Le renouvellement est manuel. Vérifier l’échéance sur le certificat effectivement servi.

**Administration.** `gcloud compute ssh <vm> --zone <zone> --tunnel-through-iap`. Grafana : tunnel IAP vers le port 3000 de `chatisen-ops` ; le mot de passe est dans le secret `grafana-admin-password`.

## Fin du projet

La base a une protection contre la suppression, à désactiver avant `terraform destroy`. Détruire l'infrastructure efface les données de la base, du bucket et des disques.
