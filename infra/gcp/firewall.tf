# Matrice FW1 à FW6 de l'architecture. Tout autre flux entrant est refusé par la
# règle implicite du VPC. Les cibles sont désignées par étiquette réseau.

locals {
  all_tags = ["app", "turn", "sfu", "ops"]
}

# FW1 : proxys du load balancer régional et sondes de santé vers les VM applicatives.
resource "google_compute_firewall" "fw1_lb_app" {
  name          = "fw1-lb-vers-app"
  network       = google_compute_network.cible.id
  source_ranges = [google_compute_subnetwork.proxy.ip_cidr_range, "35.191.0.0/16", "130.211.0.0/22"]
  target_tags   = ["app"]
  allow {
    protocol = "tcp"
    ports    = ["8443"]
  }
}

# FW2 : administration par IAP uniquement (SSH), et Grafana sur la supervision.
resource "google_compute_firewall" "fw2_iap_ssh" {
  name          = "fw2-iap-ssh"
  network       = google_compute_network.cible.id
  source_ranges = ["35.235.240.0/20"]
  target_tags   = local.all_tags
  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}

resource "google_compute_firewall" "fw2_iap_grafana" {
  name          = "fw2-iap-grafana"
  network       = google_compute_network.cible.id
  source_ranges = ["35.235.240.0/20"]
  target_tags   = ["ops"]
  allow {
    protocol = "tcp"
    ports    = ["3000"]
  }
}

# FW3 : collecte des métriques par Prometheus.
resource "google_compute_firewall" "fw3_metriques" {
  name        = "fw3-supervision-metriques"
  network     = google_compute_network.cible.id
  source_tags = ["ops"]
  target_tags = ["app", "turn", "sfu"]
  allow {
    protocol = "tcp"
    ports    = ["9091", "9100", "9641", "6789"]
  }
}

# FW4 : STUN et TURN, allocations authentifiées par coturn.
resource "google_compute_firewall" "fw4_turn" {
  name          = "fw4-internet-turn"
  network       = google_compute_network.cible.id
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["turn"]
  allow {
    protocol = "udp"
    ports    = ["3478"]
  }
  allow {
    protocol = "tcp"
    ports    = ["5349"]
  }
}

# Preuve de contrôle du nom pour le certificat ACME de coturn (HTTP-01).
resource "google_compute_firewall" "fw4_turn_acme" {
  name          = "fw4-internet-turn-acme"
  network       = google_compute_network.cible.id
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["turn"]
  allow {
    protocol = "tcp"
    ports    = ["80"]
  }
}

# FW5 : ports de relais. Les pairs privés sont refusés dans la configuration coturn.
resource "google_compute_firewall" "fw5_relais" {
  name          = "fw5-internet-relais"
  network       = google_compute_network.cible.id
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["turn"]
  allow {
    protocol = "udp"
    ports    = ["49160-49200"]
  }
}

# FW6 : média des conférences depuis Internet, API du SFU depuis l'application seule.
resource "google_compute_firewall" "fw6_sfu_media" {
  name          = "fw6-internet-sfu-media"
  network       = google_compute_network.cible.id
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["sfu"]
  allow {
    protocol = "udp"
    ports    = ["7882"]
  }
  allow {
    protocol = "tcp"
    ports    = ["7881"]
  }
}

resource "google_compute_firewall" "fw6_sfu_api" {
  name        = "fw6-app-sfu-api"
  network     = google_compute_network.cible.id
  source_tags = ["app"]
  target_tags = ["sfu"]
  allow {
    protocol = "tcp"
    ports    = ["7880"]
  }
}

# Défi ACME du load balancer : Nginx le relaie vers la supervision, qui obtient le certificat.
resource "google_compute_firewall" "acme_app_ops" {
  name        = "acme-app-vers-supervision"
  network     = google_compute_network.cible.id
  source_tags = ["app"]
  target_tags = ["ops"]
  allow {
    protocol = "tcp"
    ports    = ["8080"]
  }
}
