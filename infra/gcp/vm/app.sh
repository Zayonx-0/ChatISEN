# VM applicative : Nginx, API, Cloud SQL Auth Proxy et node-exporter par Docker Compose.
export API_IMAGE EDGE_IMAGE SQL_CONNECTION PUBLIC_HOST LB_PUBLIC_IP PROXY_CIDR ACME_UPSTREAM CALLS_ENABLED
API_IMAGE=$(meta instance/attributes/api-image)
EDGE_IMAGE=$(meta instance/attributes/edge-image)
SQL_CONNECTION=$(meta instance/attributes/sql-connection)
PUBLIC_HOST=$(meta instance/attributes/public-host)
LB_PUBLIC_IP=$(meta instance/attributes/lb-public-ip)
PROXY_CIDR=$(meta instance/attributes/proxy-cidr)
ACME_UPSTREAM=$(meta instance/attributes/acme-upstream)
CALLS_ENABLED=$(meta instance/attributes/calls-enabled)

umask 077
{
  printf 'DATABASE_URL=postgres://chatisen:%s@cloud-sql-proxy:5432/chatisen\n' "$(secret db-password)"
  printf 'CSRF_SECRET=%s\n' "$(secret csrf-secret)"
  printf 'LIVEKIT_API_KEY=%s\n' "$(secret livekit-api-key)"
  printf 'LIVEKIT_API_SECRET=%s\n' "$(secret livekit-api-secret)"
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
    image: gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.14.3
    restart: always
    command: ["--private-ip", "--structured-logs", "--address=0.0.0.0", "--port=5432", "${SQL_CONNECTION}"]
  api:
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
      CHATISEN_EXPERIMENTAL_CALLS: "${CALLS_ENABLED}"
    ports: ["9091:9091"]
    depends_on: [cloud-sql-proxy]
  nginx:
    image: ${EDGE_IMAGE}
    restart: always
    environment:
      ACME_UPSTREAM: ${ACME_UPSTREAM}
      LB_PUBLIC_IP: ${LB_PUBLIC_IP}
      PROXY_CIDR: ${PROXY_CIDR}
      PUBLIC_HOST: ${PUBLIC_HOST}
    ports: ["8443:8443"]
    volumes: ["/opt/chatisen/tls:/etc/nginx/tls:ro"]
    depends_on: [api]
  node-exporter:
    image: prom/node-exporter:v1.8.2
    network_mode: host
    pid: host
    restart: always
    volumes: ["/:/host:ro,rslave"]
    command: ["--path.rootfs=/host"]
EOC

registry_login
docker compose -f /opt/chatisen/compose.yml pull -q
docker compose -f /opt/chatisen/compose.yml up -d --remove-orphans
docker logout https://europe-west4-docker.pkg.dev >/dev/null
