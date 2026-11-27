# --- Load balancer applicatif externe RÉGIONAL ----------------------------------
# Régional car il reprendra l'adresse régionale de la démo (aucun changement DNS).
resource "tls_private_key" "lb_initial" {
  algorithm = "RSA"
  rsa_bits  = 2048
}

# Certificat d'amorçage, remplacé par un certificat Let's Encrypt une fois le site joignable.
resource "tls_self_signed_cert" "lb_initial" {
  private_key_pem       = tls_private_key.lb_initial.private_key_pem
  validity_period_hours = 24 * 30
  dns_names             = [local.sslip_host]
  allowed_uses          = ["key_encipherment", "digital_signature", "server_auth"]
  subject {
    common_name = local.sslip_host
  }
}

resource "google_compute_region_ssl_certificate" "initial" {
  name_prefix = "chatisen-amorce-"
  certificate = tls_self_signed_cert.lb_initial.cert_pem
  private_key = tls_private_key.lb_initial.private_key_pem
  lifecycle {
    create_before_destroy = true
  }
}

resource "google_compute_region_health_check" "app" {
  name                = "chatisen-app-lb"
  check_interval_sec  = 10
  timeout_sec         = 5
  healthy_threshold   = 2
  unhealthy_threshold = 3
  https_health_check {
    port         = 8443
    request_path = "/healthz-edge"
  }
}

resource "google_compute_region_backend_service" "app" {
  count                           = local.app_enabled ? 1 : 0
  name                            = "chatisen-app"
  load_balancing_scheme           = "EXTERNAL_MANAGED"
  protocol                        = "HTTPS"
  port_name                       = "https"
  timeout_sec                     = 3600 # durée maximale d'une WebSocket
  connection_draining_timeout_sec = 30
  health_checks                   = [google_compute_region_health_check.app.id]
  backend {
    group           = google_compute_region_instance_group_manager.app[0].instance_group
    balancing_mode  = "UTILIZATION"
    capacity_scaler = 1.0
  }
  log_config {
    enable      = true
    sample_rate = 1.0
  }
}

resource "google_compute_region_url_map" "https" {
  count           = local.app_enabled ? 1 : 0
  name            = "chatisen-https"
  default_service = google_compute_region_backend_service.app[0].id
}

resource "google_compute_region_url_map" "redirect" {
  count = local.app_enabled ? 1 : 0
  name  = "chatisen-redirection"
  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "PERMANENT_REDIRECT"
    strip_query            = false
  }
}

resource "google_compute_region_target_https_proxy" "web" {
  count            = local.app_enabled ? 1 : 0
  name             = "chatisen-https"
  url_map          = google_compute_region_url_map.https[0].id
  ssl_certificates = [google_compute_region_ssl_certificate.initial.id]
  lifecycle {
    # Les certificats publics sont posés hors Terraform : leurs clés restent hors de l'état.
    ignore_changes = [ssl_certificates]
  }
}

resource "google_compute_region_target_http_proxy" "web" {
  count   = local.app_enabled ? 1 : 0
  name    = "chatisen-http"
  url_map = google_compute_region_url_map.redirect[0].id
}

resource "google_compute_forwarding_rule" "https" {
  count                 = local.app_enabled ? 1 : 0
  name                  = "chatisen-https"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  network               = google_compute_network.cible.id
  ip_address            = google_compute_address.web.id
  ip_protocol           = "TCP"
  port_range            = "443"
  target                = google_compute_region_target_https_proxy.web[0].id
  network_tier          = "STANDARD"
  depends_on            = [google_compute_subnetwork.proxy]
}

resource "google_compute_forwarding_rule" "http" {
  count                 = local.app_enabled ? 1 : 0
  name                  = "chatisen-http"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  network               = google_compute_network.cible.id
  ip_address            = google_compute_address.web.id
  ip_protocol           = "TCP"
  port_range            = "80"
  target                = google_compute_region_target_http_proxy.web[0].id
  network_tier          = "STANDARD"
  depends_on            = [google_compute_subnetwork.proxy]
}

# --- Migration SQL : Cloud Run Job dans le VPC (flux T19) ------------------------
resource "google_secret_manager_secret" "migration_url" {
  secret_id = "migration-database-url"
  labels    = local.labels
  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

resource "google_secret_manager_secret_version" "migration_url" {
  secret = google_secret_manager_secret.migration_url.id
  # L'AC est propre à l'instance ; son certificat serveur ne cible pas son IP privée.
  secret_data = "postgres://chatisen:${random_password.db.result}@${google_sql_database_instance.pg.private_ip_address}:5432/chatisen?sslmode=verify-ca&uselibpqcompat=true&sslrootcert=/etc/chatisen/sql/ca.pem"
}

resource "google_service_account" "migration" {
  account_id   = "sa-migration"
  display_name = "Migration SQL"
}

resource "google_service_account_iam_member" "deploy_migration" {
  service_account_id = google_service_account.migration.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${local.sa.deploy}"
}

resource "google_secret_manager_secret" "migration_ca" {
  secret_id = "migration-database-ca"
  labels    = local.labels
  replication {
    user_managed {
      replicas { location = var.region }
    }
  }
}

resource "google_secret_manager_secret_version" "migration_ca" {
  secret      = google_secret_manager_secret.migration_ca.id
  secret_data = google_sql_database_instance.pg.server_ca_cert[0].cert
}

resource "google_secret_manager_secret_iam_member" "migration_ca" {
  secret_id = google_secret_manager_secret.migration_ca.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.migration.email}"
}

resource "google_secret_manager_secret_iam_member" "migration_url" {
  secret_id = google_secret_manager_secret.migration_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.migration.email}"
}

resource "google_cloud_run_v2_job" "migrate" {
  count               = local.app_enabled ? 1 : 0
  name                = "chatisen-migration"
  location            = var.region
  deletion_protection = false
  labels              = local.labels

  template {
    template {
      service_account = google_service_account.migration.email
      max_retries     = 0
      timeout         = "300s"
      vpc_access {
        egress = "PRIVATE_RANGES_ONLY"
        network_interfaces {
          network    = google_compute_network.cible.id
          subnetwork = google_compute_subnetwork.app.id
        }
      }
      volumes {
        name = "sql-ca"
        secret {
          secret = google_secret_manager_secret.migration_ca.secret_id
          items {
            path    = "ca.pem"
            version = google_secret_manager_secret_version.migration_ca.version
          }
        }
      }
      containers {
        volume_mounts {
          name       = "sql-ca"
          mount_path = "/etc/chatisen/sql"
        }
        image = var.api_image
        # Les arguments sont remplaçables à l'exécution, par exemple pour nommer un administrateur.
        command = ["node"]
        args    = ["db/migrate.mjs"]
        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.migration_url.secret_id
              version = google_secret_manager_secret_version.migration_url.version
            }
          }
        }
      }
    }
  }
  # Après sa création, l'image de la tâche suit le déploiement continu.
  lifecycle {
    ignore_changes = [template[0].template[0].containers[0].image, client, client_version]
  }
  depends_on = [google_secret_manager_secret_iam_member.migration_url, google_secret_manager_secret_iam_member.migration_ca]
}
