# Supervision : Prometheus et Grafana (flux T17), accès par IAP seulement (T16).
project=$(meta project/project-id)

install -d -m 755 /opt/chatisen/monitoring /opt/chatisen/monitoring/provisioning/datasources \
  /opt/chatisen/monitoring/provisioning/dashboards /opt/chatisen/monitoring/dashboards

# Les cibles sont découvertes par étiquette : une VM remplacée par le MIG est suivie sans réglage.
job() {  # nom, rôle, port
  cat <<EOF
  - job_name: $1
    gce_sd_configs:
$(for zone in europe-west4-a europe-west4-b; do
  printf '      - {project: %s, zone: %s, port: %s, filter: "labels.role=%s"}\n' "$project" "$zone" "$3" "$2"
done)
    relabel_configs:
      - {source_labels: [__meta_gce_instance_name], target_label: instance}
      - {source_labels: [__meta_gce_zone], regex: ".*/(.+)", target_label: zone}
EOF
}
{
  cat <<'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s
rule_files: [/etc/prometheus/alerts.yml]
scrape_configs:
  - job_name: prometheus
    static_configs: [{targets: ["localhost:9090"]}]
EOF
  job api app 9091
  job noeud-app app 9100
  job noeud-turn turn 9100
  job coturn turn 9641
  # coturn ne précise pas le type de contenu : Prometheus 3 doit le supposer.
  printf '    fallback_scrape_protocol: PrometheusText0.0.4\n'
  job livekit sfu 6789
  job noeud-sfu sfu 9100
} >/opt/chatisen/monitoring/prometheus.yml

cat >/opt/chatisen/monitoring/alerts.yml <<'EOF'
groups:
  - name: disponibilite
    rules:
      - alert: ApiIndisponible
        expr: up{job="api"} == 0
        for: 1m
        labels: {gravite: critique}
        annotations: {resume: "API injoignable sur {{ $labels.instance }}"}
      - alert: AucuneApi
        expr: (count(up{job="api"} == 1) or vector(0)) == 0
        for: 1m
        labels: {gravite: critique}
        annotations: {resume: "Plus aucune API disponible"}
      - alert: CoturnIndisponible
        expr: up{job="coturn"} == 0
        for: 2m
        labels: {gravite: majeure}
        annotations: {resume: "coturn injoignable"}
EOF

cat >/opt/chatisen/monitoring/provisioning/datasources/prometheus.yml <<'EOF'
apiVersion: 1
datasources:
  - {name: Prometheus, uid: prometheus, type: prometheus, access: proxy, url: "http://prometheus:9090", isDefault: true}
EOF
cat >/opt/chatisen/monitoring/provisioning/dashboards/chatisen.yml <<'EOF'
apiVersion: 1
providers:
  - {name: chatisen, type: file, options: {path: /var/lib/grafana/dashboards}}
EOF
python3 - >/opt/chatisen/monitoring/dashboards/chatisen.json <<'EOF'
import json
panels = [("Cibles disponibles", "up", "{{job}} {{instance}}"),
          ("Requêtes API par seconde", 'sum by (instance) (rate({__name__=~".*http.*requests.*total"}[5m]))', "{{instance}}"),
          ("CPU utilisé (%)", '100 * (1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])))', "{{instance}}"),
          ("Mémoire disponible (octets)", "node_memory_MemAvailable_bytes", "{{instance}}")]
print(json.dumps({"uid": "chatisen", "title": "ChatISEN · cible", "schemaVersion": 39, "refresh": "30s",
    "time": {"from": "now-3h", "to": "now"},
    "panels": [{"id": i + 1, "type": "timeseries", "title": title,
                "gridPos": {"x": 12 * (i % 2), "y": 8 * (i // 2), "w": 12, "h": 8},
                "datasource": {"type": "prometheus", "uid": "prometheus"},
                "targets": [{"expr": expr, "legendFormat": legend, "refId": "A"}]}
               for i, (title, expr, legend) in enumerate(panels)]}, ensure_ascii=False))
EOF

umask 077
printf '%s' "$(secret grafana-admin-password)" >/opt/chatisen/secrets/grafana-admin
chown 472:472 /opt/chatisen/secrets/grafana-admin
chmod 711 /opt/chatisen/secrets
umask 022

cat >/opt/chatisen/compose.yml <<'EOF'
name: chatisen-supervision
services:
  prometheus:
    image: prom/prometheus:v3.1.0
    restart: always
    volumes:
      - /opt/chatisen/monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - /opt/chatisen/monitoring/alerts.yml:/etc/prometheus/alerts.yml:ro
      - prometheus:/prometheus
    command: ["--config.file=/etc/prometheus/prometheus.yml", "--storage.tsdb.retention.time=15d"]
    ports: ["127.0.0.1:9090:9090"]
  grafana:
    image: grafana/grafana:12.0.0
    restart: always
    environment:
      GF_SECURITY_ADMIN_PASSWORD__FILE: /run/grafana-admin
      GF_USERS_ALLOW_SIGN_UP: "false"
      GF_AUTH_ANONYMOUS_ENABLED: "false"
    volumes:
      - /opt/chatisen/secrets/grafana-admin:/run/grafana-admin:ro
      - /opt/chatisen/monitoring/provisioning:/etc/grafana/provisioning:ro
      - /opt/chatisen/monitoring/dashboards:/var/lib/grafana/dashboards:ro
      - grafana:/var/lib/grafana
    ports: ["3000:3000"]
volumes: {prometheus: {}, grafana: {}}
EOF
# La configuration est montée depuis des fichiers : les conteneurs sont recréés pour la relire.
docker compose -f /opt/chatisen/compose.yml up -d --force-recreate --remove-orphans
