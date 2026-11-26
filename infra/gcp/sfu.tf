# --- SFU LiveKit (V2) : une VM par zone, 2 vCPU non partagés ---------------------
variable "sfu_count" {
  type        = number
  default     = 2
  description = "Nombre de SFU à créer (0 à 2)."
  validation {
    condition     = var.sfu_count >= 0 && var.sfu_count <= 2
    error_message = "L'architecture prévoit au plus 2 SFU."
  }
}

# La région autorise 4 adresses publiques en service : démo, coturn et les 2 SFU.
# L'adresse du load balancer n'entre pas dans ce décompte (constaté à la création).
variable "sfu_public_ips" {
  type        = number
  default     = 2
  description = "Nombre de SFU, dans l'ordre, qui reçoivent une adresse publique."
}

resource "google_compute_instance" "sfu" {
  count                     = var.sfu_count
  name                      = "chatisen-sfu-${count.index + 1}"
  zone                      = local.zones[count.index]
  machine_type              = "e2-highcpu-2"
  tags                      = ["sfu"]
  labels                    = merge(local.labels, { role = "sfu" })
  allow_stopping_for_update = true

  boot_disk {
    initialize_params {
      image = data.google_compute_image.debian.self_link
      size  = 15
      type  = "pd-balanced"
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.media.id
    dynamic "access_config" {
      for_each = count.index < var.sfu_public_ips ? [1] : []
      content {
        network_tier = "STANDARD"
      }
    }
  }

  metadata = {
    enable-oslogin = "TRUE"
    redis-address  = "${google_redis_instance.sfu.host}:${google_redis_instance.sfu.port}"
    public-media   = tostring(count.index < var.sfu_public_ips)
    startup-script = "#!/usr/bin/env bash\n${local.base_script}\n${file("${path.module}/vm/sfu.sh")}"
  }

  # Même rôle média que coturn : journaux, métriques et lecture de ses seuls secrets.
  service_account {
    email  = local.sa.turn
    scopes = ["cloud-platform"]
  }
  shielded_instance_config {
    enable_secure_boot = true
  }

  depends_on = [google_secret_manager_secret_version.v, google_secret_manager_secret_iam_member.lecture,
  google_compute_router_nat.cible]
}
