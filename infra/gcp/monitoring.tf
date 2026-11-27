# Surveillance externe : Google interroge l'adresse publique depuis plusieurs régions.
# Les alertes Prometheus restent internes ; celle-ci prévient même si la supervision tombe.
variable "alert_email" {
  type        = string
  default     = ""
  sensitive   = true
  description = "Destinataire des alertes. À fournir par un fichier *.tfvars non versionné ; vide, l'alerte reste visible dans la console."
}

resource "google_monitoring_uptime_check_config" "public" {
  display_name = "chatisen-point-de-sante"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path         = "/healthz-edge"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }
  monitored_resource {
    type   = "uptime_url"
    labels = { project_id = var.project, host = local.web_host }
  }
  content_matchers {
    content = "\"database\":\"postgres\""
    matcher = "CONTAINS_STRING"
  }
  # La règle d'alerte référence la surveillance : la nouvelle doit exister avant le retrait.
  lifecycle {
    create_before_destroy = true
  }
}

resource "google_monitoring_notification_channel" "email" {
  count        = nonsensitive(var.alert_email != "") ? 1 : 0
  display_name = "chatisen-alertes"
  type         = "email"
  labels       = { email_address = var.alert_email }
}

resource "google_monitoring_alert_policy" "public_down" {
  display_name = "ChatISEN : service public indisponible"
  combiner     = "OR"

  conditions {
    display_name = "Le point de santé échoue depuis au moins deux régions pendant 2 minutes"
    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.label.check_id=\"${google_monitoring_uptime_check_config.public.uptime_check_id}\" AND resource.type=\"uptime_url\""
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "120s"
      aggregations {
        alignment_period     = "120s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.host"]
      }
      trigger {
        count = 1
      }
    }
  }
  documentation {
    content = "Vérifier le groupe chatisen-app, Cloud SQL et Grafana (accès par IAP). Voir infra/gcp/README.md."
  }
  notification_channels = google_monitoring_notification_channel.email[*].id
  user_labels           = local.labels
}

locals {
  target_vm_logs = "resource.type=\"gce_instance\" AND (log_id(\"chatisen_containers\") OR (log_id(\"syslog\") AND labels.\"compute.googleapis.com/resource_name\"=~\"^chatisen-(app-.+|ops|turn|sfu-[12])$\"))"
  target_lb_logs = "resource.type=\"http_external_regional_lb_rule\" AND resource.labels.forwarding_rule_name=~\"^chatisen-(http|https)$\""
}

resource "google_logging_project_bucket_config" "target" {
  project        = var.project
  location       = var.region
  bucket_id      = "chatisen-cible"
  retention_days = 30
}

resource "google_logging_project_sink" "target" {
  name                   = "chatisen-cible-eu"
  destination            = "logging.googleapis.com/${google_logging_project_bucket_config.target.id}"
  unique_writer_identity = true
  filter                 = "(${local.target_vm_logs}) OR (${local.target_lb_logs} AND NOT httpRequest.requestUrl =~ \"[?]\")"
}

resource "google_logging_project_exclusion" "target_default" {
  name        = "chatisen-cible-hors-default"
  description = "Les journaux de cible sont routés vers la région européenne ; les URL avec requête sont écartées."
  filter      = "(${local.target_vm_logs}) OR (${local.target_lb_logs})"
  depends_on  = [google_logging_project_sink.target]
}

resource "google_project_iam_member" "vm_logging" {
  for_each = toset(["app", "turn", "ops"])
  project  = var.project
  role     = "roles/logging.logWriter"
  member   = "serviceAccount:${local.sa[each.key]}"
}
