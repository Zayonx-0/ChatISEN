#!/usr/bin/env bash
# Analyse une image locale avec Trivy. Échec sur une vulnérabilité élevée ou critique
# qui dispose d'un correctif. La CI l'applique à chaque pull request, puis avant tout envoi.
#
#   scan.sh <image>
set -euo pipefail
image=${1:?usage: scan.sh <image>}
scan_dir=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/chatisen-trivy.XXXXXX")
trap 'rm -rf "$scan_dir"' EXIT
cache=${RUNNER_TEMP:-${TMPDIR:-/tmp}}/chatisen-trivy-cache
mkdir -p "$cache"
docker save --output "$scan_dir/image.tar" "$image"
docker run --rm -v "$scan_dir:/scan:ro" -v "$cache:/cache" aquasec/trivy:0.74.0@sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969 image \
  --cache-dir /cache --input /scan/image.tar --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 >&2
