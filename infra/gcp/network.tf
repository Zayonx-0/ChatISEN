resource "google_compute_network" "cible" {
  name                    = "chatisen-cible"
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"
}

resource "google_compute_subnetwork" "app" {
  name                     = "app"
  network                  = google_compute_network.cible.id
  ip_cidr_range            = "10.40.10.0/24"
  private_ip_google_access = true
}

resource "google_compute_subnetwork" "media" {
  name                     = "media"
  network                  = google_compute_network.cible.id
  ip_cidr_range            = "10.40.20.0/24"
  private_ip_google_access = true
}

resource "google_compute_subnetwork" "ops" {
  name                     = "ops"
  network                  = google_compute_network.cible.id
  ip_cidr_range            = "10.40.30.0/24"
  private_ip_google_access = true
}

# Réservé aux proxys Envoy du load balancer régional.
# Hors de la plage des services gérés (10.40.32.0/20 va jusqu'à 10.40.47.255).
resource "google_compute_subnetwork" "proxy" {
  name          = "proxy-only"
  network       = google_compute_network.cible.id
  ip_cidr_range = "10.40.50.0/24"
  purpose       = "REGIONAL_MANAGED_PROXY"
  role          = "ACTIVE"
}

# Private Service Access : Cloud SQL et Memorystore en adresses privées.
resource "google_compute_global_address" "psa" {
  name          = "services-geres"
  network       = google_compute_network.cible.id
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  address       = "10.40.32.0"
  prefix_length = 20
}

resource "google_service_networking_connection" "psa" {
  network                 = google_compute_network.cible.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.psa.name]
}

# Sortie Internet des VM sans adresse publique (dont les notifications Web Push).
resource "google_compute_router" "cible" {
  name    = "routeur-cible"
  network = google_compute_network.cible.id
}

resource "google_compute_router_nat" "cible" {
  name                               = "nat-cible"
  router                             = google_compute_router.cible.name
  nat_ip_allocate_option             = "AUTO_ONLY"
  auto_network_tier                  = "STANDARD"
  source_subnetwork_ip_ranges_to_nat = "LIST_OF_SUBNETWORKS"

  dynamic "subnetwork" {
    for_each = [google_compute_subnetwork.app.id, google_compute_subnetwork.ops.id, google_compute_subnetwork.media.id]
    content {
      name                    = subnetwork.value
      source_ip_ranges_to_nat = ["ALL_IP_RANGES"]
    }
  }

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

# Adresses publiques. La région n'en autorise que 4 en service.
resource "google_compute_address" "turn" {
  name         = "turn"
  network_tier = "STANDARD"
}

# Adresse temporaire du load balancer. À la bascule, il reprend celle de la démo.
resource "google_compute_address" "web" {
  name         = "web-temporaire"
  network_tier = "STANDARD"
}

# Noms publics temporaires, sans DNS à gérer : sslip.io répond avec l'adresse écrite dans le nom.
locals {
  web_host  = "${replace(google_compute_address.web.address, ".", "-")}.sslip.io"
  turn_host = "${replace(google_compute_address.turn.address, ".", "-")}.sslip.io"
}
