# --- VM applicatives : groupe régional de 2 VM identiques, zones a et b ---------
# Les images sont désignées par digest (voir images.auto.tfvars.json).
variable "api_image" {
  type        = string
  default     = ""
  description = "Image de l'API, par digest. Vide : le groupe n'est pas créé."
}

variable "edge_image" {
  type    = string
  default = ""
}

locals {
  app_enabled = var.api_image != "" && var.edge_image != ""
}

resource "google_compute_instance_template" "app" {
  count        = local.app_enabled ? 1 : 0
  name_prefix  = "chatisen-app-"
  machine_type = "e2-small"
  tags         = ["app"]
  labels       = merge(local.labels, { role = "app" })

  disk {
    source_image = data.google_compute_image.debian.self_link
    boot         = true
    auto_delete  = true
    disk_size_gb = 15
    disk_type    = "pd-balanced"
  }

  network_interface {
    subnetwork = google_compute_subnetwork.app.id
  }

  metadata = {
    enable-oslogin = "TRUE"
    api-image      = var.api_image
    edge-image     = var.edge_image
    sql-connection = google_sql_database_instance.pg.connection_name
    public-host    = local.web_host
    lb-public-ip   = google_compute_address.web.address
    proxy-cidr     = google_compute_subnetwork.proxy.ip_cidr_range
    acme-upstream  = local.ops_ip
    turn-host      = local.turn_host
    files-bucket   = google_storage_bucket.files.name
    # Noms DNS internes, écrits sans référence aux VM pour garder les cycles de vie séparés.
    sfu-1-host     = "chatisen-sfu-1.${local.zones[0]}.c.${var.project}.internal"
    sfu-2-host     = "chatisen-sfu-2.${local.zones[1]}.c.${var.project}.internal"
    startup-script = "#!/usr/bin/env bash\n${local.base_script}\n${file("${path.module}/vm/app.sh")}"
  }

  service_account {
    email  = local.sa.app
    scopes = ["cloud-platform"]
  }
  shielded_instance_config {
    enable_secure_boot = true
  }

  lifecycle {
    create_before_destroy = true
  }
  depends_on = [google_secret_manager_secret_version.v, google_secret_manager_secret_iam_member.lecture,
    google_secret_manager_secret_iam_member.vapid, google_compute_router_nat.cible,
  google_artifact_registry_repository.images]
}

# Contrôle utilisé pour la réparation automatique, volontairement tolérant.
resource "google_compute_health_check" "autoheal" {
  name                = "chatisen-app-reparation"
  check_interval_sec  = 15
  timeout_sec         = 5
  healthy_threshold   = 2
  unhealthy_threshold = 5
  https_health_check {
    port         = 8443
    request_path = "/healthz-edge"
  }
}

resource "google_compute_region_instance_group_manager" "app" {
  count                     = local.app_enabled ? 1 : 0
  name                      = "chatisen-app"
  base_instance_name        = "chatisen-app"
  distribution_policy_zones = local.zones
  target_size               = 2

  version {
    instance_template = google_compute_instance_template.app[0].id
  }
  named_port {
    name = "https"
    port = 8443
  }
  auto_healing_policies {
    health_check      = google_compute_health_check.autoheal.id
    initial_delay_sec = 600
  }
  # Mise à jour sans coupure : les nouvelles VM sont créées avant de retirer les anciennes.
  update_policy {
    type                         = "PROACTIVE"
    minimal_action               = "REPLACE"
    max_surge_fixed              = 2
    max_unavailable_fixed        = 0
    instance_redistribution_type = "PROACTIVE"
  }
  # Les digests en service sont posés par le déploiement continu (cd/deploy.sh).
  lifecycle {
    ignore_changes = [all_instances_config]
  }
}
