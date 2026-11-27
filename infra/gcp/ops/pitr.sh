#!/usr/bin/env bash
set -euo pipefail

PROJECT=${CHATISEN_PROJECT:-project-fd23d3d9-a7e8-4002-a7a}
SOURCE=chatisen-pg
CLONE="chatisen-pitr-$(date -u +%Y%m%d%H%M%S)-$RANDOM"
work=$(mktemp -d)
created=false
gc() { gcloud "$@" --project "$PROJECT" --quiet; }
describe() { gc sql instances describe "$1" --format=json; }
private_ip() {
  jq -er 'select(.settings.ipConfiguration.ipv4Enabled == false) | .ipAddresses[] | select(.type == "PRIVATE") | .ipAddress'
}
cleanup() {
  local status=$? answer
  rm -rf -- "$work"
  if $created; then
    printf 'Saisir %s pour supprimer ce clone, ou Entrée pour le conserver : ' "$CLONE" >&2
    if read -r answer </dev/tty && [[ $answer == "$CLONE" ]]; then
      if ! gc sql instances delete "$CLONE"; then
        printf 'Suppression à reprendre pour %s\n' "$CLONE" >&2
        status=1
      fi
    else
      printf 'Clone conservé : %s\n' "$CLONE" >&2
    fi
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

export PGUSER=${PGUSER:-chatisen_api} PGDATABASE=chatisen PGSSLMODE=verify-ca PGCONNECT_TIMEOUT=5
export PGOPTIONS='-c default_transaction_read_only=on -c timezone=UTC -c statement_timeout=120s'
if [[ ! ${PGPASSWORD+x} ]]; then
  read -rs -p 'Mot de passe PostgreSQL de lecture : ' PGPASSWORD </dev/tty
  printf '\n' >&2
fi
export PGPASSWORD

sql() {
  local ip=$1 ca=$2
  shift 2
  PGHOST="$ip" PGPORT=5432 PGSSLROOTCERT="$ca" psql -XAtq -v ON_ERROR_STOP=1 "$@"
}
fingerprint() {
  sql "$1" "$2" -v cutoff="$cutoff" <<'SQL' | shasum -a 256 | cut -d' ' -f1
SELECT payload FROM (
  SELECT 'messages' AS kind, id::text AS key, to_jsonb(m)::text AS payload
    FROM messaging.messages m WHERE created_at < :'cutoff'
  UNION ALL
  SELECT 'events', stream_id::text || '/' || seq, to_jsonb(e)::text
    FROM realtime.events e WHERE occurred_at < :'cutoff'
  UNION ALL
  SELECT 'users', id::text, jsonb_build_array(id, created_at)::text
    FROM identity.users WHERE created_at < :'cutoff'
  UNION ALL
  SELECT 'conversations', id::text, jsonb_build_array(id, type, created_at)::text
    FROM groups.conversations WHERE created_at < :'cutoff'
) contents ORDER BY kind, key;
SQL
}
latest_message() {
  sql "$1" "$2" -c 'SELECT COALESCE(floor(extract(epoch FROM max(created_at)))::bigint, 0) FROM messaging.messages'
}

source=$(describe "$SOURCE")
source_ip=$(private_ip <<<"$source")
jq -er '.serverCaCert.cert' <<<"$source" >"$work/source.pem"
# Un point légèrement ancien laisse les journaux PITR devenir disponibles avant la demande de clone.
cutoff=$(sql "$source_ip" "$work/source.pem" -c \
  "SELECT to_char(clock_timestamp()-interval '2 minutes','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')")
[[ -n $cutoff ]]
expected=$(fingerprint "$source_ip" "$work/source.pem")
incident=$(sql "$source_ip" "$work/source.pem" -v cutoff="$cutoff" -F ' ' <<'SQL'
SELECT COALESCE(floor(extract(epoch FROM max(created_at)))::bigint, 0),
       floor(extract(epoch FROM (statement_timestamp() - :'cutoff'::timestamptz)))::bigint,
       COALESCE(max(created_at) >= :'cutoff'::timestamptz, false)
FROM messaging.messages;
SQL
)
read -r before gap traffic <<<"$incident"
[[ $before =~ ^[0-9]+$ && $gap =~ ^[0-9]+$ ]] || exit 1

printf 'Restauration de %s à %s dans %s.\n' "$SOURCE" "$cutoff" "$CLONE"
started=$SECONDS
# Le nom aléatoire est propre à cet essai. En cas d'interruption, le clone peut continuer à se créer.
created=true
gc sql instances clone "$SOURCE" "$CLONE" --point-in-time="$cutoff"
clone=$(describe "$CLONE")
clone_ip=$(private_ip <<<"$clone")
[[ $clone_ip != "$source_ip" ]]
jq -er '.serverCaCert.cert' <<<"$clone" >"$work/clone.pem"
restored=$(fingerprint "$clone_ip" "$work/clone.pem")
after=$(latest_message "$clone_ip" "$work/clone.pem")
[[ $after =~ ^[0-9]+$ ]] || exit 1
printf 'Écart entre le point PITR demandé et l’incident simulé : %s s.\n' "$gap"
if [[ $traffic == t ]] && (( before > 0 && after > 0 )); then
  loss=$((before-after))
  if ((loss<0)); then loss=0; fi
  printf 'RPO observé sur les messages (écart entre les dernières écritures visibles) : %s s.\n' "$loss"
else
  printf 'RPO sur les messages : à mesurer sur une fenêtre avec écritures.\n'
fi
if [[ $expected != "$restored" ]]; then
  printf 'Empreintes différentes pour le contenu comparé au point PITR.\n' >&2
  exit 1
fi
printf 'Empreintes identiques pour le contenu comparé au point PITR.\n'
printf 'RTO (demande de clone jusqu’aux lectures vérifiées) : %s s.\n' "$((SECONDS-started))"
