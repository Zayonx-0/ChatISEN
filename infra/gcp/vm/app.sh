# VM applicative : Nginx, API, Cloud SQL Auth Proxy et node-exporter par Docker Compose.
export API_IMAGE EDGE_IMAGE SQL_CONNECTION PUBLIC_HOST LB_PUBLIC_IP PROXY_CIDR ACME_UPSTREAM TURN_HOST SFU_1_HOST SFU_2_HOST FILES_BUCKET
export OPERATIONS_RESTARTS_ENABLED OPERATIONS_ZONE_A OPERATIONS_ZONE_B OPERATIONS_PROJECT OPERATIONS_SQL_INSTANCE
SFU_1_HOST=$(meta instance/attributes/sfu-1-host)
SFU_2_HOST=$(meta instance/attributes/sfu-2-host)
API_IMAGE=$(meta instance/attributes/api-image)
EDGE_IMAGE=$(meta instance/attributes/edge-image)
SQL_CONNECTION=$(meta instance/attributes/sql-connection)
PUBLIC_HOST=$(meta instance/attributes/public-host)
LB_PUBLIC_IP=$(meta instance/attributes/lb-public-ip)
PROXY_CIDR=$(meta instance/attributes/proxy-cidr)
ACME_UPSTREAM=$(meta instance/attributes/acme-upstream)
TURN_HOST=$(meta instance/attributes/turn-host)
FILES_BUCKET=$(meta instance/attributes/files-bucket)
OPERATIONS_RESTARTS_ENABLED=$(meta instance/attributes/operations-enabled)
OPERATIONS_ZONE_A=$(meta instance/attributes/operations-zone-a)
OPERATIONS_ZONE_B=$(meta instance/attributes/operations-zone-b)
OPERATIONS_PROJECT=$(meta project/project-id)
OPERATIONS_SQL_INSTANCE=$(meta instance/attributes/operations-sql-instance)
db_user=$(meta instance/attributes/app-db-user)
db_secret=db-password
if [[ $db_user == chatisen_api ]]; then db_secret=db-api-password; fi

umask 077
{
  db_password=$(secret "$db_secret")
  printf 'DATABASE_URL=postgres://%s:%s@cloud-sql-proxy:5432/chatisen\n' "$db_user"     "$(printf '%s' "$db_password" | python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.stdin.read(),safe=""))')"
  printf 'CSRF_SECRET=%s\n' "$(secret csrf-secret)"
  printf 'LIVEKIT_API_KEY=%s\n' "$(secret livekit-api-key)"
  printf 'LIVEKIT_API_SECRET=%s\n' "$(secret livekit-api-secret)"
  printf 'TURN_SECRET=%s\n' "$(secret turn-secret)"
  printf 'VAPID_PUBLIC_KEY=%s\n' "$(secret vapid-public-key)"
  printf 'VAPID_PRIVATE_KEY=%s\n' "$(secret vapid-private-key)"
} >/opt/chatisen/secrets/api.env
install -d -m 755 /opt/chatisen/tls
secret nginx-tls-cert >/opt/chatisen/tls/tls.crt
secret nginx-tls-key >/opt/chatisen/tls/tls.key
chmod 644 /opt/chatisen/tls/tls.crt
chmod 640 /opt/chatisen/tls/tls.key
umask 022

cat >/opt/chatisen/compose.yml <<'EOC'
name: chatisen
services:
  cloud-sql-proxy:
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
        labels: "com.docker.compose.service"
    image: gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.14.3
    restart: always
    command: ["--private-ip", "--structured-logs", "--address=0.0.0.0", "--port=5432", "${SQL_CONNECTION}"]
  api:
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
        labels: "com.docker.compose.service"
    image: ${API_IMAGE}
    restart: always
    env_file: [/opt/chatisen/secrets/api.env]
    environment:
      PORT: "3000"
      METRICS_PORT: "9091"
      CORS_ORIGIN: https://${PUBLIC_HOST}
      COOKIE_SECURE: "true"
      TRUST_PROXY: "true"
      LIVEKIT_URL: wss://${PUBLIC_HOST}/livekit
      LIVEKIT_API_URL: http://${SFU_1_HOST}:7880,http://${SFU_2_HOST}:7880
      FILES_BUCKET: ${FILES_BUCKET}
      TURN_HOST: ${TURN_HOST}
      VAPID_SUBJECT: https://${PUBLIC_HOST}
      OPERATIONS_RESTARTS_ENABLED: ${OPERATIONS_RESTARTS_ENABLED}
      OPERATIONS_ZONE_A: ${OPERATIONS_ZONE_A}
      OPERATIONS_ZONE_B: ${OPERATIONS_ZONE_B}
      OPERATIONS_PROJECT: ${OPERATIONS_PROJECT}
      OPERATIONS_SQL_INSTANCE: ${OPERATIONS_SQL_INSTANCE}
      OPERATIONS_WEB_HOST: ${PUBLIC_HOST}
      OPERATIONS_PROMETHEUS_URL: http://${ACME_UPSTREAM}:9090
    ports: ["9091:9091"]
    depends_on: [cloud-sql-proxy]
  nginx:
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
        labels: "com.docker.compose.service"
    image: ${EDGE_IMAGE}
    restart: always
    environment:
      ACME_UPSTREAM: ${ACME_UPSTREAM}
      LB_PUBLIC_IP: ${LB_PUBLIC_IP}
      PROXY_CIDR: ${PROXY_CIDR}
      PUBLIC_HOST: ${PUBLIC_HOST}
      SFU_1_HOST: ${SFU_1_HOST}
      SFU_2_HOST: ${SFU_2_HOST}
    ports: ["8443:8443"]
    volumes: ["/opt/chatisen/tls:/etc/nginx/tls:ro"]
    depends_on: [api]
  node-exporter:
    logging: {driver: json-file, options: {max-size: "10m", max-file: "3"}}
    image: prom/node-exporter:v1.8.2
    network_mode: host
    pid: host
    restart: always
    volumes: ["/:/host:ro,rslave"]
    command: ["--path.rootfs=/host", "--collector.textfile.directory=/host/var/lib/node_exporter/textfile_collector"]
EOC

install -d -m 755 /var/lib/node_exporter/textfile_collector
rm -f /var/lib/node_exporter/textfile_collector/chatisen-release.prom
registry_login
docker compose -f /opt/chatisen/compose.yml pull -q
docker compose -f /opt/chatisen/compose.yml up -d --remove-orphans
docker logout https://europe-west4-docker.pkg.dev >/dev/null

# Une nouvelle mesure n'est valable qu'après la fin du démarrage Compose de ce boot.
cat >/opt/chatisen/report-release <<'EOC'
#!/usr/bin/env bash
set -euo pipefail
[[ -f /run/chatisen-compose-ready ]] || exit 0
active() {
  local container id reference
  container=$(docker ps --filter label=com.docker.compose.project=chatisen --filter "label=com.docker.compose.service=$1" --quiet)
  [[ -n $container && $container != *$'\n'* ]] || return 1
  read -r id reference < <(docker inspect --type container --format '{{.Image}} {{.Config.Image}}' "$container")
  [[ $reference =~ @sha256:[0-9a-f]{64}$ ]] || return 1
  docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$id" | grep -Fx -- "$reference"
}
api=$(active api || true)
edge=$(active nginx || true)
ready=false
if curl -fksS --max-time 5 -o /dev/null https://127.0.0.1:8443/healthz-edge; then ready=true; fi
now=$(date +%s)
stats=/var/lib/node_exporter/textfile_collector
tmp=$(mktemp "$stats/chatisen-release.XXXXXX")
trap 'rm -f "$tmp"' EXIT
{
  printf 'chatisen_release_timestamp_seconds %s\n' "$now"
  if $ready; then printf 'chatisen_release_ready 1\n'; else printf 'chatisen_release_ready 0\n'; fi
  if [[ -n $api ]]; then printf 'chatisen_release_info{container="api",digest="%s"} 1\n' "${api##*@}"; fi
  if [[ -n $edge ]]; then printf 'chatisen_release_info{container="edge",digest="%s"} 1\n' "${edge##*@}"; fi
} >"$tmp"
chmod 644 "$tmp"
mv "$tmp" "$stats/chatisen-release.prom"
printf '{"api":"%s","edge":"%s","boot":"%s","time":%s,"ready":%s}' \
  "$api" "$edge" "$(cat /proc/sys/kernel/random/boot_id)" "$now" "$ready" |
  curl -fsS --max-time 5 -H 'Metadata-Flavor: Google' -X PUT --data-binary @- \
    http://metadata.google.internal/computeMetadata/v1/instance/guest-attributes/chatisen/release
EOC
chmod 750 /opt/chatisen/report-release
cat >/etc/systemd/system/chatisen-release.service <<'EOC'
[Unit]
Description=Digests actifs sur la VM ChatISEN
After=docker.service
[Service]
Type=oneshot
ExecStart=/opt/chatisen/report-release
EOC
cat >/etc/systemd/system/chatisen-release.timer <<'EOC'
[Unit]
Description=Publication de l'état de la VM ChatISEN
[Timer]
OnActiveSec=1
OnUnitInactiveSec=20s
AccuracySec=1s
[Install]
WantedBy=timers.target
EOC
touch /run/chatisen-compose-ready
systemctl daemon-reload
systemctl enable --now chatisen-release.timer
