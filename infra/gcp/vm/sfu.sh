# SFU LiveKit auto-hébergé pour les conférences (flux T13, règle FW6).
redis_address=$(meta instance/attributes/redis-address)
public_media=$(meta instance/attributes/public-media)

install -d -m 700 /opt/chatisen/livekit
umask 077
secret redis-ca >/opt/chatisen/livekit/redis-ca.pem
cat >/opt/chatisen/livekit/livekit.yaml <<EOF
port: 7880
bind_addresses: ["0.0.0.0"]
rtc:
  tcp_port: 7881
  udp_port: 7882
  use_external_ip: $public_media
redis:
  address: $redis_address
  password: "$(secret redis-auth)"
  use_tls: true
keys:
  "$(secret livekit-api-key)": "$(secret livekit-api-secret)"
prometheus_port: 6789
logging:
  json: true
  level: info
EOF
umask 022

cat >/opt/chatisen/compose.yml <<'EOF'
name: chatisen-sfu
services:
  livekit:
    image: livekit/livekit-server:v1.8.4
    network_mode: host
    restart: always
    environment:
      # Autorité du certificat TLS de Memorystore.
      SSL_CERT_FILE: /etc/livekit/redis-ca.pem
    volumes: ["/opt/chatisen/livekit:/etc/livekit:ro"]
    command: ["--config", "/etc/livekit/livekit.yaml"]
  node-exporter:
    image: prom/node-exporter:v1.8.2
    network_mode: host
    pid: host
    restart: always
    volumes: ["/:/host:ro,rslave"]
    command: ["--path.rootfs=/host"]
EOF
docker compose -f /opt/chatisen/compose.yml up -d --remove-orphans
