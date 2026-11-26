# Socle commun des VM de la cible (inclus en tête de chaque script de démarrage).
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

meta() {
  curl -fsS -H 'Metadata-Flavor: Google' "http://metadata.google.internal/computeMetadata/v1/$1"
}

# Lit un secret avec l'identité de la VM. La valeur n'est jamais écrite dans les journaux.
secret() {
  local project token
  project=$(meta project/project-id)
  token=$(meta instance/service-accounts/default/token | python3 -c 'import json,sys;print(json.load(sys.stdin)["access_token"])')
  curl -fsS --retry 5 --retry-all-errors -H @<(printf 'Authorization: Bearer %s' "$token") \
    "https://secretmanager.googleapis.com/v1/projects/$project/secrets/$1/versions/latest:access" |
    python3 -c 'import base64,json,sys;sys.stdout.write(base64.b64decode(json.load(sys.stdin)["payload"]["data"]).decode())'
}

registry_login() {
  meta instance/service-accounts/default/token |
    python3 -c 'import json,sys;print(json.load(sys.stdin)["access_token"])' |
    docker login -u oauth2accesstoken --password-stdin https://europe-west4-docker.pkg.dev >/dev/null
}

if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq docker.io docker-compose >/dev/null
  systemctl enable --now docker
fi

# Journaux et métriques système vers Cloud Logging et Cloud Monitoring.
if ! systemctl list-unit-files | grep -q '^google-cloud-ops-agent'; then
  curl -fsSo /tmp/ops-agent.sh https://dl.google.com/cloudagents/add-google-cloud-ops-agent-repo.sh
  bash /tmp/ops-agent.sh --also-install >/var/log/ops-agent-install.log 2>&1 || echo "Ops Agent non installé"
fi

install -d -m 750 /opt/chatisen
install -d -m 700 /opt/chatisen/secrets
