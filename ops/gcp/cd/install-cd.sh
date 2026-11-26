#!/usr/bin/env bash
# Installe ou met à jour l'agent de déploiement continu sur la VM.
# À lancer à la main, après relecture : l'agent ne se met jamais à jour tout seul.
set -euo pipefail
if [[ ${EUID} -ne 0 || $# -ne 1 ]]; then
  printf 'Usage : sudo bash ops/gcp/cd/install-cd.sh domaine\n' >&2
  exit 2
fi
domain=$1
if [[ ! $domain =~ ^[A-Za-z0-9.-]+$ || $domain == -* || $domain == *..* ]]; then
  printf 'Nom de domaine invalide\n' >&2
  exit 2
fi
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
for tool in git python3 caddy systemctl; do
  command -v "$tool" >/dev/null || { printf '%s manquant\n' "$tool" >&2; exit 1; }
done

install -d -o root -g root -m 755 /var/lib/chatisen-deploy /var/lib/chatisen-deploy/public
install -d -o root -g root -m 700 /var/backups/chatisen /etc/chatisen
install -o root -g root -m 755 "$here/chatisen_deploy.py" /usr/local/sbin/chatisen-deploy
install -o root -g root -m 644 "$here/chatisen-deploy.service" /etc/systemd/system/chatisen-deploy.service
install -o root -g root -m 644 "$here/chatisen-deploy.timer" /etc/systemd/system/chatisen-deploy.timer
printf 'CHATISEN_CD_BRANCH=standalone\nCHATISEN_CD_VIEWER_URL=https://%s/architecture/\n' "$domain" > /etc/chatisen/deploy.env
chmod 600 /etc/chatisen/deploy.env

# Seul le bloc HTTPS du domaine est remplacé ; les autres blocs sont conservés.
config=$(mktemp)
trap 'rm -f "$config"' EXIT
python3 -I - "$here/../Caddyfile.template" "$config" "$domain" <<'PY'
import re
import sys
from pathlib import Path
template, output, domain = sys.argv[1:]
current = Path('/etc/caddy/Caddyfile').read_text()
block = re.compile(r'^' + re.escape(domain) + r' \{\n.*?^\}', re.M | re.S)
if len(block.findall(current)) != 1:
    raise SystemExit('Bloc HTTPS du domaine introuvable ou ambigu.')
updated = Path(template).read_text().replace('CHATISEN_DOMAIN', domain).rstrip()
Path(output).write_text(block.sub(lambda _: updated, current, count=1))
PY
caddy validate --config "$config" --adapter caddyfile >/dev/null
if ! cmp -s "$config" /etc/caddy/Caddyfile; then
  backup="/etc/caddy/Caddyfile.before-cd-$(date -u +%Y%m%dT%H%M%SZ)"
  cp -p /etc/caddy/Caddyfile "$backup"
  install -m 644 "$config" /etc/caddy/Caddyfile
  if ! systemctl reload caddy; then
    cp -p "$backup" /etc/caddy/Caddyfile
    systemctl reload caddy
    printf 'Rechargement de Caddy refusé : ancienne configuration rétablie\n' >&2
    exit 1
  fi
  printf 'Caddy rechargé (sauvegarde : %s)\n' "$backup"
fi

systemctl daemon-reload
systemctl enable --now chatisen-deploy.timer
printf 'Agent installé. Journal : journalctl -u chatisen-deploy -f\n'
