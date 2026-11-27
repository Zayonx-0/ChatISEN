#!/usr/bin/env bash
set -euo pipefail

PROJECT=${CHATISEN_PROJECT:-project-fd23d3d9-a7e8-4002-a7a}
REGION=${CHATISEN_REGION:-europe-west4}
GROUP=chatisen-app
JOB=chatisen-migration
HEALTH_URL=${CHATISEN_HEALTH_URL:-https://ia-pple.isen.fedyna.fr/healthz-edge}
TIMEOUT=${CHATISEN_ROLL_TIMEOUT:-720}
POLL=${CHATISEN_ROLL_POLL:-10}
REGISTRY=$REGION-docker.pkg.dev/$PROJECT/chatisen
BOOTSTRAP=false
if [[ ${1:-} == --bootstrap ]]; then
  BOOTSTRAP=true
  TIMEOUT=${CHATISEN_ROLL_TIMEOUT:-900}
  shift
fi

log() { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*"; }
gc() { gcloud "$@" --project "$PROJECT" --quiet; }
mig() { local action=$1; shift; gc compute instance-groups managed "$action" "$GROUP" --region "$REGION" "$@"; }
group_json() { mig describe --format=json; }
member() {
  mig list-instances --format=json |
    jq -ce --arg zone "$1" '[.[] | select(.instance | contains("/zones/"+$zone+"/"))] | if length == 1 then .[0] else empty end'
}
alive() {
  jq -e '.currentAction == "NONE" and .instanceStatus == "RUNNING" and
    any(.instanceHealth[]?; .detailedHealthState == "HEALTHY")' <<<"$1" >/dev/null
}
report() {
  gc compute instances get-guest-attributes "${2##*/}" --zone "$1" --query-path=chatisen/release --format=json |
    jq -ce '(if type == "array" then . else .queryValue.items end)[] | select(.key == "release") | .value | fromjson'
}
matches() {
  local sample
  alive "$2" && sample=$(report "$1" "$(jq -r '.instance' <<<"$2")") &&
    jq -e --arg api "$3" --arg edge "$4" --arg boot "${5:-}" --argjson now "$(date +%s)" '
      .api == $api and .edge == $edge and (.boot | type == "string" and length > 0) and
      .boot != $boot and .ready == true and
      ($now - .time >= -10 and $now - .time < 90)' <<<"$sample" >/dev/null
}
public_health() { curl --silent --show-error --fail --max-time 10 --output /dev/null "$HEALTH_URL"; }
wait_for() {
  local zone=$1 api=$2 edge=$3 before=$4 info deadline=$((SECONDS + TIMEOUT))
  while ((SECONDS < deadline)); do
    if info=$(member "$zone") && matches "$zone" "$info" "$api" "$edge" "$before" && public_health; then return 0; fi
    sleep "$POLL"
  done
  return 1
}
validate() {
  local prefix="$REGISTRY/$1@sha256:"
  [[ $2 == "$prefix"* && ${2#"$prefix"} =~ ^[0-9a-f]{64}$ ]] ||
    { echo "Image $1 refusée : digest du registre attendu." >&2; exit 2; }
}
configured() {
  jq -r --arg key "$1" '.allInstancesConfig.properties.metadata[$key] // empty' <<<"$2"
}
set_images() {
  gc compute instance-groups managed all-instances-config update "$GROUP" --region "$REGION" --metadata="api-image=$1,edge-image=$2" >/dev/null
}
restart_zone() {
  local zone=$1 peer=$2 action=$3 info other name
  info=$(member "$zone") && other=$(member "$peer") && alive "$other" && public_health || return 1
  jq -e '.currentAction == "NONE"' <<<"$info" >/dev/null || return 1
  name=$(jq -r '.instance | split("/") | last' <<<"$info")
  mig update-instances --instances="$name" --minimal-action="$action" --most-disruptive-allowed-action="$action" >/dev/null
}

if ! $BOOTSTRAP; then
  API_IMAGE=${1:?usage: deploy.sh API_IMAGE EDGE_IMAGE}
  EDGE_IMAGE=${2:?usage: deploy.sh API_IMAGE EDGE_IMAGE}
  validate api "$API_IMAGE"
  validate edge "$EDGE_IMAGE"
fi

state=$(group_json)
jq -e '.updatePolicy.type == "OPPORTUNISTIC" and .targetSize == 2' <<<"$state" >/dev/null ||
  { log "Le MIG doit avoir deux VM et une politique OPPORTUNISTIC." >&2; exit 1; }
A=$REGION-a
B=$REGION-b
a=$(member "$A")
b=$(member "$B")
alive "$a" && alive "$b" && public_health || { log "Les deux VM doivent être saines au départ." >&2; exit 1; }

previous_api=$(configured api-image "$state")
previous_edge=$(configured edge-image "$state")
if [[ -z $previous_api || -z $previous_edge ]]; then
  template=$(jq -r '.versions[0].instanceTemplate | split("/") | last' <<<"$state")
  metadata=$(gc compute instance-templates describe "$template" --format=json | jq -c '.properties.metadata.items | map({(.key):.value}) | add')
  previous_api=${previous_api:-$(jq -r '.["api-image"] // empty' <<<"$metadata")}
  previous_edge=${previous_edge:-$(jq -r '.["edge-image"] // empty' <<<"$metadata")}
fi
validate api "$previous_api"
validate edge "$previous_edge"

if $BOOTSTRAP; then
  # Avant le premier CD, le modèle doit démarrer les digests déjà en service.
  for zone in "$A" "$B"; do
    peer=$B; [[ $zone != "$B" ]] || peer=$A
    info=$(member "$zone")
    if matches "$zone" "$info" "$previous_api" "$previous_edge"; then
      # Une VM déjà amorcée peut encore devoir adopter une nouvelle version du modèle.
      if jq -e --arg target "$(jq -r '.versions[0].instanceTemplate | split("/") | last' <<<"$state")" '
        .version.instanceTemplate | split("/") | last == $target' <<<"$info" >/dev/null; then continue; fi
    fi
    boot=$(report "$zone" "$(jq -r '.instance' <<<"$info")" 2>/dev/null | jq -r '.boot' || true)
    log "Amorçage de $zone"
    restart_zone "$zone" "$peer" replace && wait_for "$zone" "$previous_api" "$previous_edge" "$boot" ||
      { log "Amorçage arrêté sur $zone. Vérifier le modèle et les digests avant de reprendre." >&2; exit 1; }
  done
  exit 0
fi

# Les digests du groupe ne sont qu'une consigne : chaque VM confirme l'état avant et après.
matches "$A" "$a" "$previous_api" "$previous_edge" && matches "$B" "$b" "$previous_api" "$previous_edge" ||
  { log "Digests actifs initiaux non vérifiés sur les deux VM." >&2; exit 1; }
boot_a=$(report "$A" "$(jq -r '.instance' <<<"$a")" | jq -er '.boot')
boot_b=$(report "$B" "$(jq -r '.instance' <<<"$b")" | jq -er '.boot')
if [[ $previous_api == "$API_IMAGE" && $previous_edge == "$EDGE_IMAGE" ]]; then
  log "Digests déjà vérifiés sur APP-A et APP-B."
  exit 0
fi

log "Migration de la base"
gc run jobs update "$JOB" --region "$REGION" --image "$API_IMAGE" >/dev/null
gc run jobs execute "$JOB" --region "$REGION" --wait >/dev/null

if ! set_images "$API_IMAGE" "$EDGE_IMAGE"; then
  if ! state=$(group_json); then
    set_images "$previous_api" "$previous_edge" || log "Consigne du groupe à vérifier." >&2
    log "Mise à jour du groupe non confirmée : aucune VM n’a été touchée." >&2
    exit 1
  fi
  if [[ $(configured api-image "$state") != "$API_IMAGE" || $(configured edge-image "$state") != "$EDGE_IMAGE" ]]; then
    log "Mise à jour du groupe refusée : aucune VM n’a été touchée." >&2
    exit 1
  fi
fi

rollback_zone() {
  local zone=$1 peer=$2 info boot deadline=$((SECONDS + TIMEOUT))
  # Un remplacement ou une réparation encore en cours doit finir avant une nouvelle demande.
  while ((SECONDS < deadline)); do
    if info=$(member "$zone") && jq -e '.currentAction == "NONE"' <<<"$info" >/dev/null; then
      boot=$(report "$zone" "$(jq -r '.instance' <<<"$info")" 2>/dev/null | jq -r '.boot' || true)
      restart_zone "$zone" "$peer" restart && wait_for "$zone" "$previous_api" "$previous_edge" "$boot"
      return $?
    fi
    sleep "$POLL"
  done
  return 1
}
rollback() {
  log "Échec sur $1 : retour aux digests précédents." >&2
  if set_images "$previous_api" "$previous_edge" &&
     { [[ $1 == "$A" ]] || rollback_zone "$B" "$A"; } &&
     rollback_zone "$A" "$B" &&
     matches "$B" "$(member "$B")" "$previous_api" "$previous_edge"; then
    log "Retour arrière vérifié. La base garde les migrations compatibles." >&2
  else
    log "Retour arrière non vérifié : intervention nécessaire, conserver la VM saine." >&2
  fi
  exit 1
}

phase=$A
trap 'rollback "$phase"' INT TERM
log "Canari APP-A ($A)"
restart_zone "$A" "$B" restart && wait_for "$A" "$API_IMAGE" "$EDGE_IMAGE" "$boot_a" || rollback "$A"
phase=$B
log "Mise à jour APP-B ($B)"
restart_zone "$B" "$A" restart && wait_for "$B" "$API_IMAGE" "$EDGE_IMAGE" "$boot_b" || rollback "$B"
matches "$A" "$(member "$A")" "$API_IMAGE" "$EDGE_IMAGE" "$boot_a" || rollback "$B"
log "Digests actifs vérifiés sur APP-A et APP-B."
