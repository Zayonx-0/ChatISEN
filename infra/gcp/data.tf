# --- PostgreSQL : régional (haute disponibilité), adresse privée seulement -------
resource "google_sql_database_instance" "pg" {
  name                = "chatisen-pg"
  database_version    = "POSTGRES_17"
  region              = var.region
  deletion_protection = true

  settings {
    edition           = "ENTERPRISE"
    tier              = "db-custom-1-3840"
    availability_type = "REGIONAL"
    disk_type         = "PD_SSD"
    disk_size         = 10
    disk_autoresize   = true
    user_labels       = local.labels

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "02:00"
    }

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.cible.id
      ssl_mode        = "ENCRYPTED_ONLY"
    }
  }

  depends_on = [google_service_networking_connection.psa]
}

resource "google_sql_database" "chatisen" {
  name     = "chatisen"
  instance = google_sql_database_instance.pg.name
}

resource "random_password" "db" {
  length  = 32
  special = false
}

resource "google_sql_user" "chatisen" {
  name     = "chatisen"
  instance = google_sql_database_instance.pg.name
  password = random_password.db.result
}

# --- Redis : coordination des SFU (V2), TLS et AUTH ----------------------------
resource "google_redis_instance" "sfu" {
  name                    = "chatisen-redis"
  tier                    = "STANDARD_HA"
  memory_size_gb          = 1
  region                  = var.region
  redis_version           = "REDIS_7_2"
  authorized_network      = google_compute_network.cible.id
  connect_mode            = "PRIVATE_SERVICE_ACCESS"
  auth_enabled            = true
  transit_encryption_mode = "SERVER_AUTHENTICATION"
  labels                  = local.labels

  depends_on = [google_service_networking_connection.psa]
}

# --- Fichiers (V2) : bucket privé, accès par URL signées ------------------------
resource "google_storage_bucket" "files" {
  name                        = "chatisen-cible-fichiers-424540770012"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  labels                      = local.labels

  cors {
    origin          = distinct(["https://ia-pple.isen.fedyna.fr", "https://${local.web_host}", "https://${local.sslip_host}"])
    method          = ["GET", "PUT", "HEAD"]
    response_header = ["Content-Type", "Content-Length", "x-goog-content-length-range"]
    max_age_seconds = 3600
  }
}

resource "google_storage_bucket_iam_member" "app_files" {
  bucket = google_storage_bucket.files.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${local.sa.app}"
}

# --- Registre d'images ----------------------------------------------------------
resource "google_artifact_registry_repository" "images" {
  repository_id = "chatisen"
  location      = var.region
  format        = "DOCKER"
  labels        = local.labels
}
