#!/bin/sh
# Produit la configuration Nginx à partir des adresses connues au démarrage.
set -eu
: "${ACME_UPSTREAM:?}" "${LB_PUBLIC_IP:?}" "${PROXY_CIDR:?}" "${PUBLIC_HOST:?}" "${SFU_1_HOST:?}" "${SFU_2_HOST:?}"
conf=/etc/nginx/nginx.conf
envsubst '${ACME_UPSTREAM} ${LB_PUBLIC_IP} ${PROXY_CIDR} ${PUBLIC_HOST} ${SFU_1_HOST} ${SFU_2_HOST}' \
  < /etc/nginx/templates-chatisen/nginx.conf.template > "$conf"
nginx -t
exec nginx -g 'daemon off;'
