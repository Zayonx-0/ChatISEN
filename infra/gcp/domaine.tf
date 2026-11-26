# --- Domaine public ------------------------------------------------------------
# L'enregistrement DNS appartient à l'école et ne change jamais. C'est l'adresse IP qu'il
# désigne, réservée pour la démo, qui passe au load balancer.
variable "public_domain" {
  type        = string
  default     = "ia-pple.isen.fedyna.fr"
  description = "Nom public de l'application. Vide : nom de repli en sslip.io."
}

variable "domain_active" {
  type        = bool
  default     = true
  description = "Vrai : le load balancer porte l'adresse visée par le DNS. Faux : elle est libre, par exemple pour la rendre à la démo."
}

import {
  to = google_compute_address.public
  id = "projects/project-fd23d3d9-a7e8-4002-a7a/regions/europe-west4/addresses/isenchatprojectt"
}

resource "google_compute_address" "public" {
  name         = "isenchatprojectt"
  region       = var.region
  address_type = "EXTERNAL"
  network_tier = "STANDARD"
  # Le DNS pointe sur cette adresse : la libérer la perdrait définitivement.
  lifecycle {
    prevent_destroy = true
    ignore_changes  = [description, labels]
  }
}

resource "google_compute_forwarding_rule" "public" {
  for_each              = local.app_enabled && var.domain_active ? { https = "443", http = "80" } : {}
  name                  = "chatisen-public-${each.key}"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  network               = google_compute_network.cible.id
  ip_address            = google_compute_address.public.id
  ip_protocol           = "TCP"
  port_range            = each.value
  target                = each.key == "https" ? google_compute_region_target_https_proxy.web[0].id : google_compute_region_target_http_proxy.web[0].id
  network_tier          = "STANDARD"
  depends_on            = [google_compute_subnetwork.proxy]
}
