#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ $# != 1 || ! ${ZAP_BENCH_URL:-} =~ ^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?/?$ ]]; then
  echo 'Usage : ZAP_BENCH_URL=https://hote-du-banc bash tests/security/bench/run.sh /chemin/prive/execution' >&2
  exit 2
fi
root=$(cd "$(dirname "$0")/../../.." && pwd -P)
parent=$(cd "$(dirname "$1")" && pwd -P)
out="$parent/$(basename "$1")"
case "$out/" in
  "$root/"*) echo 'Choisir un répertoire de sortie privé hors du dépôt.' >&2; exit 2 ;;
esac
mkdir "$out"
snapshot=$(mktemp -d "$out/source.XXXXXX")
trap 'rm -rf -- "$snapshot"' EXIT

# Le même arbre suivi sert aux deux audits locaux, sans les fichiers du poste.
revision=$(git -C "$root" rev-parse HEAD)
git -C "$root" archive "$revision" | tar -x -C "$snapshot"
printf '%s\n' "$revision" > "$out/revision.txt"
printf 'outil\tcode_sortie\n' > "$out/statuts.tsv"

run() {
  local name=$1 status=0
  shift
  "$@" > "$out/$name.json" 2> "$out/$name.stderr.log" || status=$?
  printf '%s\t%s\n' "$name" "$status" >> "$out/statuts.tsv"
  if (( status != 0 )); then
    any_failure=1
  fi
}

audit() (
  cd "$snapshot" || exit
  if command -v pnpm >/dev/null; then
    pnpm audit --json
  else
    corepack pnpm audit --json
  fi
)

any_failure=0
run pnpm-audit audit
run trivy docker run --rm \
  --mount "type=bind,src=$snapshot,dst=/repo,readonly" \
  "${TRIVY_IMAGE:-aquasec/trivy:latest}" \
  fs --scanners vuln,misconfig --include-dev-deps --format json --exit-code 1 /repo

mkdir "$out/zap"
# Le conteneur écrit avec son propre UID, dans un dossier protégé par le parent privé.
chmod 1777 "$out/zap"
zap_status=0
docker run --rm \
  --mount "type=bind,src=$out/zap,dst=/zap/wrk" \
  "${ZAP_IMAGE:-ghcr.io/zaproxy/zaproxy:stable}" \
  zap-baseline.py -t "$ZAP_BENCH_URL" -m 1 -J baseline.json -r baseline.html \
  > "$out/zap.stdout.log" 2> "$out/zap.stderr.log" || zap_status=$?
printf 'zap-baseline\t%s\n' "$zap_status" >> "$out/statuts.tsv"
if (( zap_status != 0 )); then
  any_failure=1
fi
exit "$any_failure"
