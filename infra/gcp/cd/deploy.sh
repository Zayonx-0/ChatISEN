#!/usr/bin/env bash
# Déploiement continu de la cible (flux T19) : migration, puis remplacement des VM sans
# retirer les anciennes avant que les nouvelles soient prêtes, et retour arrière sinon.
#
# Les images sont posées par la « configuration commune » du groupe de VM : Terraform garde
# le modèle et l'infrastructure, la CI ne change que les deux digests.
#
#   deploy.sh <image api par digest> <image edge par digest>
set -euo pipefail

API_IMAGE=${1:?usage: deploy.sh API_IMAGE EDGE_IMAGE}
EDGE_IMAGE=${2:?usage: deploy.sh API_IMAGE EDGE_IMAGE}
PROJECT=${CHATISEN_PROJECT:-project-fd23d3d9-a7e8-4002-a7a}
REGION=${CHATISEN_REGION:-europe-west4}
GROUP=chatisen-app
JOB=chatisen-migration
HEALTH_URL=${CHATISEN_HEALTH_URL:-https://35-214-232-101.sslip.io/healthz-edge}
TIMEOUT=${CHATISEN_ROLL_TIMEOUT:-1500}
POLL=${CHATISEN_ROLL_POLL:-20}
REGISTRY=$REGION-docker.pkg.dev/$PROJECT/chatisen

log() { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*"; }
gc() { gcloud "$@" --project "$PROJECT" --quiet; }
group_json() { gc compute instance-groups managed describe "$GROUP" --region "$REGION" --format=json; }

for pair in "api $API_IMAGE" "edge $EDGE_IMAGE"; do
  read -r name image <<<"$pair"
  [[ $image =~ ^$REGISTRY/$name@sha256:[0-9a-f]{64}$ ]] || { echo "Image $name refusée : un digest du registre du projet est attendu." >&2; exit 2; }
done

# Images réellement en service : la configuration commune du groupe, sinon son modèle.
current_image() {
  local key=$1 value template
  value=$(jq -r --arg key "$key" '.allInstancesConfig.properties.metadata[$key] // empty' <<<"$GROUP_STATE")
  if [[ -z $value ]]; then
    template=$(jq -r '.versions[0].instanceTemplate | split("/") | last' <<<"$GROUP_STATE")
    value=$(gc compute instance-templates describe "$template" --format=json |
      jq -r --arg key "$key" '.properties.metadata.items[] | select(.key == $key) | .value')
  fi
  printf '%s' "$value"
}

# Vrai quand le groupe est stable et que toutes ses VM saines portent les images demandées.
converged() {
  local api=$1 edge=$2 state instances
  state=$(group_json) || return 1
  jq -e '.status.isStable and .status.versionTarget.isReached and .status.allInstancesConfig.effective' <<<"$state" >/dev/null || return 1
  instances=$(gc compute instances list --filter="labels.role=app AND labels.application=chatisen" --format=json) || return 1
  jq -e --arg api "$api" --arg edge "$edge" 'length >= 2 and all(.[];
    .status == "RUNNING" and ([.metadata.items[] | {(.key): .value}] | add | .["api-image"] == $api and .["edge-image"] == $edge))' <<<"$instances" >/dev/null || return 1
  gc compute instance-groups managed list-instances "$GROUP" --region "$REGION" --format=json |
    jq -e 'length >= 2 and all(.[]; .currentAction == "NONE" and .instanceHealth[0].detailedHealthState == "HEALTHY")' >/dev/null
}

healthy() {
  local attempt
  for attempt in 1 2 3 4 5; do
    curl --silent --show-error --fail --max-time 10 --output /dev/null "$HEALTH_URL" || return 1
  done
}

roll() {
  local api=$1 edge=$2 deadline
  gc compute instance-groups managed all-instances-config update "$GROUP" --region "$REGION" --metadata "api-image=$api,edge-image=$edge" >/dev/null
  deadline=$(($(date +%s) + TIMEOUT))
  while (($(date +%s) < deadline)); do
    sleep "$POLL"
    if converged "$api" "$edge" && healthy; then return 0; fi
  done
  return 1
}

GROUP_STATE=$(group_json)
PREVIOUS_API=$(current_image api-image)
PREVIOUS_EDGE=$(current_image edge-image)
[[ -n $PREVIOUS_API && -n $PREVIOUS_EDGE ]] || { echo "Images en service introuvables : déploiement refusé." >&2; exit 1; }

if [[ $PREVIOUS_API == "$API_IMAGE" && $PREVIOUS_EDGE == "$EDGE_IMAGE" && ${CHATISEN_FORCE:-} != 1 ]]; then
  log "Ces images sont déjà en service."
  healthy
  exit 0
fi

# La migration précède les VM : elle doit rester compatible avec la version encore en service.
log "Migration de la base avec la nouvelle image"
gc run jobs update "$JOB" --region "$REGION" --image "$API_IMAGE" >/dev/null
gc run jobs execute "$JOB" --region "$REGION" --wait >/dev/null

log "Remplacement des VM applicatives"
if roll "$API_IMAGE" "$EDGE_IMAGE"; then
  log "Déploiement vérifié : les VM saines servent les nouvelles images."
  exit 0
fi

log "Échec du déploiement : retour aux images précédentes" >&2
if roll "$PREVIOUS_API" "$PREVIOUS_EDGE"; then
  log "Retour arrière vérifié. La base garde la nouvelle migration." >&2
else
  log "RETOUR ARRIÈRE NON VÉRIFIÉ : intervention nécessaire." >&2
fi
exit 1
