# coturn : STUN et TURN auto-hébergés (flux T12, règles FW4 et FW5).
host=$(meta instance/attributes/turn-host)
public_ip=$(meta instance/network-interfaces/0/access-configs/0/external-ip)
private_ip=$(meta instance/network-interfaces/0/ip)

if ! command -v certbot >/dev/null; then
  apt-get update -qq && apt-get install -y -qq certbot >/dev/null
fi
# Certificat public par ACME (HTTP-01 sur le port 80, ouvert pour cette seule preuve).
if [[ ! -f /etc/letsencrypt/live/$host/fullchain.pem ]]; then
  certbot certonly --standalone --non-interactive --agree-tos --register-unsafely-without-email \
    --preferred-challenges http -d "$host" || echo "Certificat TURN non obtenu : TLS 5349 indisponible"
fi

install -d -m 750 -o 65534 -g 65534 /opt/chatisen/turn
tls_lines="no-tls"
if [[ -f /etc/letsencrypt/live/$host/fullchain.pem ]]; then
  install -m 640 -o 65534 -g 65534 "/etc/letsencrypt/live/$host/fullchain.pem" /opt/chatisen/turn/cert.pem
  install -m 640 -o 65534 -g 65534 "/etc/letsencrypt/live/$host/privkey.pem" /opt/chatisen/turn/key.pem
  tls_lines=$'tls-listening-port=5349\ncert=/etc/coturn/cert.pem\npkey=/etc/coturn/key.pem\nno-tlsv1\nno-tlsv1_1'
fi

umask 027
cat >/opt/chatisen/turn/turnserver.conf <<EOF
listening-port=3478
$tls_lines
listening-ip=$private_ip
relay-ip=$private_ip
external-ip=$public_ip/$private_ip
min-port=49160
max-port=49200
realm=$host
use-auth-secret
static-auth-secret=$(secret turn-secret)
fingerprint
no-cli
no-multicast-peers
# Le relais ne doit jamais atteindre le réseau privé ni les métadonnées.
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=100.64.0.0-100.127.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.0.0.0-192.0.0.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=198.18.0.0-198.19.255.255
denied-peer-ip=224.0.0.0-255.255.255.255
denied-peer-ip=::1
denied-peer-ip=fc00::-fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff
denied-peer-ip=fe80::-febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff
user-quota=12
total-quota=40
prometheus
simple-log
log-file=stdout
EOF
chown 65534:65534 /opt/chatisen/turn/turnserver.conf

cat >/opt/chatisen/compose.yml <<'EOF'
name: chatisen-turn
services:
  coturn:
    image: coturn/coturn:4.6.3-alpine
    network_mode: host
    restart: always
    user: "65534:65534"
    volumes: ["/opt/chatisen/turn:/etc/coturn:ro"]
    command: ["-c", "/etc/coturn/turnserver.conf"]
  node-exporter:
    image: prom/node-exporter:v1.8.2
    network_mode: host
    pid: host
    restart: always
    volumes: ["/:/host:ro,rslave"]
    command: ["--path.rootfs=/host"]
EOF
# La configuration est montée depuis des fichiers : les conteneurs sont recréés pour la relire.
docker compose -f /opt/chatisen/compose.yml up -d --force-recreate --remove-orphans

hooks=/etc/letsencrypt/renewal-hooks/deploy
install -d -m 755 "$hooks"
{
  printf '#!/usr/bin/env bash\nset -euo pipefail\nlineage=%q\n' "/etc/letsencrypt/live/$host"
  cat <<'EOF'
[[ "${RENEWED_LINEAGE:-}" == "$lineage" ]] || exit 0
install -m 640 -o 65534 -g 65534 "$lineage/fullchain.pem" /opt/chatisen/turn/cert.pem
install -m 640 -o 65534 -g 65534 "$lineage/privkey.pem" /opt/chatisen/turn/key.pem
docker compose -f /opt/chatisen/compose.yml restart coturn
EOF
} >"$hooks/chatisen-turn"
chmod 755 "$hooks/chatisen-turn"
