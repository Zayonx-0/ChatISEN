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

built=0
if [[ ${CHATISEN_REBUILD:-} != 1 ]] && docker pull --quiet "$tag" >/dev/null 2>&1; then
  echo "$name : sources inchangées, image reprise" >&2
else
  docker build --file "$dockerfile" --tag "$tag" --tag "$REGISTRY/$name:$RELEASE" . >&2
  built=1
fi
if [[ ${CHATISEN_SCAN_IMAGES:-} == 1 ]]; then bash "$(dirname "$0")/scan.sh" "$tag"; fi
if [[ $built == 1 ]]; then docker push --quiet "$tag" >&2; fi
# L'étiquette de la version désigne toujours l'image retenue.
docker tag "$tag" "$REGISTRY/$name:$RELEASE"
docker push --quiet "$REGISTRY/$name:$RELEASE" >&2
digest=$(docker inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$tag" | grep -F "$REGISTRY/$name@" | head -1)
[[ -n $digest ]] || { echo "Digest introuvable pour $name." >&2; exit 1; }
printf '%s\n' "$digest"
