#!/usr/bin/env bash
set -euo pipefail

PROJECT=${CHATISEN_PROJECT:-project-fd23d3d9-a7e8-4002-a7a}
REGION=${CHATISEN_REGION:-europe-west4}
NUMBER=424540770012
REPOSITORY=Zayonx-0/ChatISEN
REPO_ID=1468601062
# GitHub signe les sujets avec les identifiants fixes du propriétaire et du dépôt.
SUBJECT="repo:Zayonx-0@61589082/ChatISEN@$REPO_ID"
POOL=iam.googleapis.com/projects/$NUMBER/locations/global/workloadIdentityPools/github
DEPLOY=sa-deploy@$PROJECT.iam.gserviceaccount.com
IMAGES=sa-images@$PROJECT.iam.gserviceaccount.com
OLD_MEMBER=principalSet://$POOL/attribute.repository_id/$REPO_ID
DEPLOY_MEMBER=principal://$POOL/subject/$SUBJECT:environment:cible
IMAGES_MEMBER=principal://$POOL/subject/$SUBJECT:environment:cible-images
# Première écriture, avec les seuls noms : aucun jeton ne lui correspond. Elle est remplacée puis retirée.
NAMED_DEPLOY_MEMBER=principal://$POOL/subject/repo:$REPOSITORY:environment:cible
NAMED_IMAGES_MEMBER=principal://$POOL/subject/repo:$REPOSITORY:environment:cible-images
BASE="assertion.repository_id=='$REPO_ID' && assertion.ref=='refs/heads/main'"
OLD_CONDITION="$BASE && assertion.environment=='cible'"
separated() {
  printf '%s' "$BASE && ((assertion.environment=='cible' && assertion.sub=='$1:environment:cible') || (assertion.environment=='cible-images' && assertion.sub=='$1:environment:cible-images'))"
}
NEW_CONDITION=$(separated "$SUBJECT")
NAMED_CONDITION=$(separated "repo:$REPOSITORY")
OLD_MAPPING='assertion.repository_id'
NEW_MAPPING="assertion.environment=='cible' ? assertion.repository_id : 'cible-images-$REPO_ID'"
WIF_ROLE=roles/iam.workloadIdentityUser
WRITER=roles/artifactregistry.writer

gc() { gcloud "$@" --project "$PROJECT" --quiet; }
provider() { gc iam workload-identity-pools providers "$1" chatisen --location=global --workload-identity-pool=github "${@:2}"; }
repo_policy() { gc artifacts repositories get-iam-policy chatisen --location="$REGION" --format=json; }
get_policy() { gc iam service-accounts get-iam-policy "$1" --format=json; }
add() { gc iam service-accounts add-iam-policy-binding "$1" --member="$2" --role="$WIF_ROLE" --condition=None >/dev/null; }
remove() { gc iam service-accounts remove-iam-policy-binding "$1" --member="$2" --role="$WIF_ROLE" --condition=None >/dev/null; }
has() {
  jq -e --arg member "$2" --arg role "$WIF_ROLE" '
    any(.bindings[]?; .role == $role and .condition == null and any(.members[]; . == $member))' <<<"$1" >/dev/null
}
restrict_pool() {
  jq -e --arg pool "$POOL" --arg a "$2" --arg b "${3:-}" --arg role "$WIF_ROLE" '
    all(.bindings[]?; . as $binding | all(.members[];
      if contains($pool) then ($binding.role == $role and $binding.condition == null and (. == $a or . == $b)) else true end))' <<<"$1" >/dev/null
}
condition() {
  provider update-oidc --attribute-condition="$1" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository_id=$2" >/dev/null
}

die() { echo "$*" >&2; exit 1; }
mode=${1:-}
case $mode in prepare|finalize|rollback) ;; *) die "Usage : wif.sh prepare | finalize <run-deploy-réussi> | rollback" ;; esac
[[ $(gc projects describe "$PROJECT" --format='value(projectNumber)') == "$NUMBER" ]] || die "Projet inattendu."
[[ $(gh api "repos/$REPOSITORY/actions/oidc/customization/sub" --jq .sub_claim_prefix) == "$SUBJECT" ]] ||
  die "GitHub annonce un autre format de sujet que celui attendu."
providers=$(gc iam workload-identity-pools providers list --location=global --workload-identity-pool=github --format=json)
jq -e 'all(.[]; .state != "ACTIVE" or (.name | endswith("/providers/chatisen")))' <<<"$providers" >/dev/null ||
  die "Le pool contient un autre fournisseur actif."
project_policy=$(gc projects get-iam-policy "$PROJECT" --format=json)
jq -e --arg pool "$POOL" '
  all(.bindings[]?.members[]; contains($pool) | not)' <<<"$project_policy" >/dev/null ||
  die "Droit projet inattendu pour le pool."
jq -e --arg member "serviceAccount:$IMAGES" '
  all(.bindings[]?.members[]; . != $member)' <<<"$project_policy" >/dev/null ||
  die "sa-images dispose d’un droit au niveau du projet."
wif=$(provider describe --format=json)
drop_named() {
  local current_policy
  current_policy=$(get_policy "$1")
  if has "$current_policy" "$2"; then remove "$1" "$2"; fi
}
if [[ $mode == prepare ]]; then drop_named "$DEPLOY" "$NAMED_DEPLOY_MEMBER"; fi
policy=$(get_policy "$DEPLOY")
restrict_pool "$policy" "$OLD_MEMBER" "$DEPLOY_MEMBER" || die "Liaison du pool inattendue sur sa-deploy."
current=$(jq -r .attributeCondition <<<"$wif")
mapping=$(jq -r '.attributeMapping["attribute.repository_id"]' <<<"$wif")
jq -e '.attributeMapping | length == 2 and .["google.subject"] == "assertion.sub"' <<<"$wif" >/dev/null ||
  die "Mappage WIF inattendu."
if [[ $current == "$OLD_CONDITION" && $mapping == "$OLD_MAPPING" ]]; then
  has "$policy" "$OLD_MEMBER" || die "Ancienne liaison introuvable."
elif [[ $current == "$NEW_CONDITION" && $mapping == "$NEW_MAPPING" ]]; then
  has "$policy" "$DEPLOY_MEMBER" || die "Liaison cible introuvable."
elif [[ $current == "$NAMED_CONDITION" && $mapping == "$NEW_MAPPING" && $mode != finalize ]]; then
  has "$policy" "$OLD_MEMBER" || die "Ancienne liaison introuvable."
else
  die "Condition ou mappage WIF inattendu."
fi

case $mode in
  prepare)
    accounts=$(gc iam service-accounts list --filter="email=$IMAGES" --format='value(email)')
    if [[ -z $accounts ]]; then
      gc iam service-accounts create sa-images --display-name="Publication Artifact Registry"
    fi
    drop_named "$IMAGES" "$NAMED_IMAGES_MEMBER"
    restrict_pool "$(get_policy "$IMAGES")" "$IMAGES_MEMBER" || die "Liaison du pool inattendue sur sa-images."
    registry_policy=$(repo_policy)
    jq -e --arg member "serviceAccount:$IMAGES" --arg role "$WRITER" '
      all(.bindings[]?; . as $binding | all(.members[];
        . != $member or ($binding.role == $role and $binding.condition == null)))' <<<"$registry_policy" >/dev/null ||
      die "Droit inattendu de sa-images sur le dépôt."
    gc artifacts repositories add-iam-policy-binding chatisen --location="$REGION" \
      --role="$WRITER" --member="serviceAccount:$IMAGES" --condition=None >/dev/null
    add "$IMAGES" "$IMAGES_MEMBER"
    add "$DEPLOY" "$DEPLOY_MEMBER"
    # L'ancien principalSet continue à sélectionner uniquement l'environnement cible.
    if [[ $current != "$NEW_CONDITION" ]]; then condition "$NEW_CONDITION" "$NEW_MAPPING"; fi
    ;;
  finalize)
    run=${2:?indiquer le run GitHub réussi}
    [[ $run =~ ^[0-9]+$ && $current == "$NEW_CONDITION" ]] || die "Run ou fournisseur inattendu."
    gh api "repos/$REPOSITORY/actions/runs/$run" |
      jq -e '.head_branch == "main" and .conclusion == "success" and (.path | split("@")[0]) == ".github/workflows/images.yml"' >/dev/null ||
      die "Livraison cible réussie introuvable."
    gh api --paginate "repos/$REPOSITORY/actions/runs/$run/jobs?filter=latest" |
      jq -es 'any(.[].jobs[]; .name == "Déployer sur la cible" and .conclusion == "success" and
        any(.steps[]; .name == "Migrer, déployer par zone et vérifier" and .conclusion == "success"))' >/dev/null ||
      die "Le déploiement vérifié doit avoir réellement tourné."
    if has "$policy" "$OLD_MEMBER"; then remove "$DEPLOY" "$OLD_MEMBER"; fi
    registry_policy=$(repo_policy)
    if jq -e --arg member "serviceAccount:$DEPLOY" --arg role "$WRITER" '
      any(.bindings[]?; .role == $role and .condition == null and any(.members[]; . == $member))' <<<"$registry_policy" >/dev/null; then
      gc artifacts repositories remove-iam-policy-binding chatisen --location="$REGION" \
        --role="$WRITER" --member="serviceAccount:$DEPLOY" --condition=None >/dev/null
    fi
    # L'ancien writer a aussi pu être posé au niveau projet.
    if jq -e --arg member "serviceAccount:$DEPLOY" --arg role "$WRITER" '
      any(.bindings[]?; .role == $role and .condition == null and any(.members[]; . == $member))' <<<"$project_policy" >/dev/null; then
      gc projects remove-iam-policy-binding "$PROJECT" --role="$WRITER" --member="serviceAccount:$DEPLOY" --condition=None >/dev/null
    fi
    ;;
  rollback)
    # Avant finalize : l'ancien workflow garde son writer et peut reprendre sur « cible ».
    has "$policy" "$OLD_MEMBER" || die "Ancienne liaison retirée : restaurer la livraison avec le workflow actuel."
    if [[ $current != "$OLD_CONDITION" ]]; then condition "$OLD_CONDITION" "$OLD_MAPPING"; fi
    ;;
esac
