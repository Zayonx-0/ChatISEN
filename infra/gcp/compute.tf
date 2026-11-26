# VM à cœur partagé et 2 vCPU : elles tiennent dans le quota global de 12 vCPU.
data "google_compute_image" "debian" {
  family  = "debian-13"
  project = "debian-cloud"
}

locals {
  base_script = file("${path.module}/vm/base.sh")
  # Adresse fixe de la supervision : écrite ici pour que le modèle des VM applicatives
  # (créé avant destruction) n'impose pas ce même ordre à la VM de supervision.
  ops_ip = "10.40.30.2"
}

# --- coturn : STUN et TURN, sous-réseau média, adresse publique réservée --------
resource "google_compute_instance" "turn" {
  name                      = "chatisen-turn"
  zone                      = local.zones[0]
  machine_type              = "e2-small"
  tags                      = ["turn"]
  labels                    = merge(local.labels, { role = "turn" })
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
    access_config {
      nat_ip       = google_compute_address.turn.address
      network_tier = "STANDARD"
    }
  }

  metadata = {
    enable-oslogin = "TRUE"
    turn-host      = local.turn_host
    startup-script = "#!/usr/bin/env bash\n${local.base_script}\n${file("${path.module}/vm/turn.sh")}"
  }

  service_account {
    email  = local.sa.turn
    scopes = ["cloud-platform"]
  }
  shielded_instance_config {
    enable_secure_boot = true
  }

  depends_on = [google_secret_manager_secret_version.v, google_secret_manager_secret_iam_member.lecture,
  google_compute_firewall.fw4_turn_acme]
}

# --- Supervision : sans adresse publique, accès par IAP --------------------------
resource "google_compute_instance" "ops" {
  name                      = "chatisen-ops"
  zone                      = local.zones[0]
  machine_type              = "e2-medium"
  tags                      = ["ops"]
  labels                    = merge(local.labels, { role = "ops" })
  allow_stopping_for_update = true

  boot_disk {
    initialize_params {
      image = data.google_compute_image.debian.self_link
      size  = 20
      type  = "pd-balanced"
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.ops.id
    network_ip = local.ops_ip # Nginx y relaie le défi ACME
  }

  metadata = {
    enable-oslogin = "TRUE"
    startup-script = "#!/usr/bin/env bash\n${local.base_script}\n${file("${path.module}/vm/ops.sh")}"
  }

  service_account {
    email  = local.sa.ops
    scopes = ["cloud-platform"]
  }
  shielded_instance_config {
    enable_secure_boot = true
  }

  depends_on = [google_secret_manager_secret_version.v, google_secret_manager_secret_iam_member.lecture,
  google_compute_router_nat.cible]
}

output "web_host" { value = local.web_host }
output "sslip_host" { value = local.sslip_host }
output "turn_host" { value = local.turn_host }
output "registry" { value = "${var.region}-docker.pkg.dev/${var.project}/${google_artifact_registry_repository.images.repository_id}" }
