# Secrets générés par Terraform et lus au démarrage par les machines autorisées.
resource "random_password" "api_db" {
  length  = 40
  special = false
}

resource "random_password" "csrf" {
  length  = 48
  special = false
}

resource "random_password" "turn" {
  length  = 48
  special = false
}

resource "random_password" "livekit_key" {
  length  = 20
  special = false
  upper   = false
}

resource "random_password" "livekit_secret" {
  length  = 48
  special = false
}

resource "random_password" "grafana" {
  length  = 24
  special = false
}

# Certificat interne entre le load balancer et Nginx (chiffrement vers les backends).
resource "tls_private_key" "interne" {
  algorithm   = "ECDSA"
  ecdsa_curve = "P256"
}

resource "tls_self_signed_cert" "interne" {
  private_key_pem       = tls_private_key.interne.private_key_pem
  validity_period_hours = 24 * 90
  dns_names             = ["nginx.cible.internal"]
  allowed_uses          = ["key_encipherment", "digital_signature", "server_auth"]
  subject {
    common_name = "nginx.cible.internal"
  }
}

locals {
  # nom du secret => { valeur, comptes de service autorisés à le lire }
  secrets = {
    "csrf-secret"            = { value = random_password.csrf.result, readers = ["app"] }
    "db-api-password"        = { value = random_password.api_db.result, readers = ["app"] }
    "db-password"            = { value = random_password.db.result, readers = var.legacy_api_sql_access ? ["app"] : [] }
    "turn-secret"            = { value = random_password.turn.result, readers = ["app", "turn"] }
    "livekit-api-key"        = { value = random_password.livekit_key.result, readers = ["app", "turn"] }
    "livekit-api-secret"     = { value = random_password.livekit_secret.result, readers = ["app", "turn"] }
    "grafana-admin-password" = { value = random_password.grafana.result, readers = ["ops"] }
    "nginx-tls-cert"         = { value = tls_self_signed_cert.interne.cert_pem, readers = ["app"] }
    "nginx-tls-key"          = { value = tls_private_key.interne.private_key_pem, readers = ["app"] }
    "redis-auth"             = { value = google_redis_instance.sfu.auth_string, readers = ["turn"] }
    "redis-ca"               = { value = google_redis_instance.sfu.server_ca_certs[0].cert, readers = ["turn"] }
  }
  secret_grants = merge([
    for name, secret in local.secrets : {
      for reader in secret.readers : "${name}:${reader}" => { secret = name, reader = reader }
    }
  ]...)
}

resource "google_secret_manager_secret" "s" {
  for_each  = toset(keys(local.secrets))
  secret_id = each.key
  labels    = local.labels
  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

resource "google_secret_manager_secret_version" "v" {
  for_each    = toset(keys(local.secrets))
  secret      = google_secret_manager_secret.s[each.key].id
  secret_data = local.secrets[each.key].value
}

resource "google_secret_manager_secret_iam_member" "lecture" {
  for_each  = local.secret_grants
  secret_id = google_secret_manager_secret.s[each.value.secret].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${local.sa[each.value.reader]}"
}

# Clés VAPID des notifications Web Push : Terraform crée les secrets et les droits ; les
# valeurs sont ajoutées hors Terraform, pour ne figurer ni dans Git ni dans l'état.
resource "google_secret_manager_secret" "vapid" {
  for_each  = toset(["vapid-public-key", "vapid-private-key"])
  secret_id = each.key
  labels    = local.labels
  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

resource "google_secret_manager_secret_iam_member" "vapid" {
  for_each  = google_secret_manager_secret.vapid
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${local.sa.app}"
}

variable "api_restricted_sql" {
  type    = bool
  default = true
}

variable "legacy_api_sql_access" {
  type    = bool
  default = false
}
