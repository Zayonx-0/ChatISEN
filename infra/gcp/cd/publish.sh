#!/usr/bin/env bash
# Publie une image (flux T18) et écrit son digest. L'image est étiquetée par l'empreinte des
# sources qu'elle contient : si ces sources n'ont pas changé, l'image existante est reprise,
# et le déploiement ne remplace alors aucune VM.
#
#   publish.sh <nom> <Dockerfile>     avec REGISTRY et RELEASE dans l'environnement
#   CHATISEN_REBUILD=1 force la reconstruction, par exemple après une mise à jour de l'image de base.
set -euo pipefail
name=${1:?usage: publish.sh <nom> <Dockerfile>}
dockerfile=${2:?usage: publish.sh <nom> <Dockerfile>}
: "${REGISTRY:?}" "${RELEASE:?}"

# Tout ce que les deux Dockerfile copient. Un fichier ajouté ailleurs doit être ajouté ici.
sources=(apps packages db infra/gcp/edge package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json
  docs/architecture/index.html docs/architecture/lecteur.js docs/architecture/svg)
content=$(git ls-tree -r HEAD -- "${sources[@]}" | { sha256sum 2>/dev/null || shasum -a 256; } | cut -c1-40)
tag=$REGISTRY/$name:src-$content

scan() (
  scan_dir=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/chatisen-trivy.XXXXXX")
  trap 'rm -rf "$scan_dir"' EXIT
  cache=${RUNNER_TEMP:-${TMPDIR:-/tmp}}/chatisen-trivy-cache
  mkdir -p "$cache"
  docker save --output "$scan_dir/image.tar" "$tag"
  docker run --rm -v "$scan_dir:/scan:ro" -v "$cache:/cache" aquasec/trivy:0.74.0@sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969 image \
    --cache-dir /cache --input /scan/image.tar --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 >&2
)

built=0
if [[ ${CHATISEN_REBUILD:-} != 1 ]] && docker pull --quiet "$tag" >/dev/null 2>&1; then
  echo "$name : sources inchangées, image reprise" >&2
else
  docker build --file "$dockerfile" --tag "$tag" --tag "$REGISTRY/$name:$RELEASE" . >&2
  built=1
fi
if [[ ${CHATISEN_SCAN_IMAGES:-} == 1 ]]; then scan; fi
if [[ $built == 1 ]]; then docker push --quiet "$tag" >&2; fi
# L'étiquette de la version désigne toujours l'image retenue.
docker tag "$tag" "$REGISTRY/$name:$RELEASE"
docker push --quiet "$REGISTRY/$name:$RELEASE" >&2
digest=$(docker inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$tag" | grep -F "$REGISTRY/$name@" | head -1)
[[ -n $digest ]] || { echo "Digest introuvable pour $name." >&2; exit 1; }
printf '%s\n' "$digest"
