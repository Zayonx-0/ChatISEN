#!/usr/bin/env bash
set -euo pipefail
if [[ ${EUID} -ne 0 || $# -ne 1 ]]; then
  printf 'Usage : sudo bash ops/gcp/install.sh domaine\n' >&2
  exit 2
fi
domain=$1
if [[ ! $domain =~ ^[A-Za-z0-9.-]+$ || $domain == -* || $domain == *..* ]]; then
  printf 'Nom de domaine invalide\n' >&2
  exit 2
fi
if [[ ! -f /opt/chatisen/app/apps/standalone/server.mjs || ! -x /opt/chatisen/runtime/node-v24.14.1-linux-x64/bin/node ]]; then
  printf 'Clone ou runtime Node 24.14.1 manquant dans /opt/chatisen\n' >&2
  exit 1
fi
command -v caddy >/dev/null || { printf 'Caddy manquant\n' >&2; exit 1; }
id chatisen >/dev/null 2>&1 || useradd --system --user-group --home-dir /var/lib/chatisen --shell /usr/sbin/nologin chatisen
install -d -o chatisen -g chatisen -m 700 /var/lib/chatisen
install -d -o root -g root -m 700 /etc/chatisen
if [[ ! -f /etc/chatisen/chatisen.env ]]; then
  secret=$(openssl rand -hex 32)
  umask 077
  printf 'PUBLIC_ORIGIN=https://%s\nCSRF_SECRET=%s\nCHATISEN_STUN_URL=stun:stun.l.google.com:19302\n' "$domain" "$secret" > /etc/chatisen/chatisen.env
else
  configured=$(sed -n 's/^PUBLIC_ORIGIN=https:\/\///p' /etc/chatisen/chatisen.env)
  [[ $configured == "$domain" ]] || { printf 'Domaine différent de la configuration existante ; vérifier /etc/chatisen/chatisen.env\n' >&2; exit 1; }
fi
chmod 600 /etc/chatisen/chatisen.env
install -m 644 /opt/chatisen/app/ops/gcp/chatisen.service /etc/systemd/system/chatisen.service
config=$(mktemp)
trap 'rm -f "$config"' EXIT
sed "s/CHATISEN_DOMAIN/$domain/g" /opt/chatisen/app/ops/gcp/Caddyfile.template > "$config"
caddy validate --config "$config" --adapter caddyfile >/dev/null
install -m 644 "$config" /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable --now chatisen
systemctl restart chatisen
systemctl enable --now caddy
systemctl reload caddy || systemctl restart caddy
systemctl is-active --quiet chatisen
systemctl is-active --quiet caddy
printf 'Service et frontal démarrés pour https://%s\n' "$domain"
