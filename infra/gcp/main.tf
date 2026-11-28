# Infrastructure de l'architecture cible ChatISEN (docs/architecture/).
# Aucun secret dans ces fichiers : ils sont générés et gardés dans l'état Terraform
# (bucket privé et versionné) et dans Secret Manager.
terraform {
  required_version = ">= 1.9"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }
  backend "gcs" {
    bucket = "chatisen-cible-tfstate-424540770012"
    prefix = "cible"
  }
}

provider "google" {
  project = var.project
  region  = var.region
}

variable "project" {
  type    = string
  default = "project-fd23d3d9-a7e8-4002-a7a"
}

variable "region" {
  type    = string
  default = "europe-west4"
}

locals {
  zones = ["${var.region}-a", "${var.region}-b"]
  # Comptes de service créés par le propriétaire du projet (hors Terraform).
  sa = {
    app    = "sa-app@${var.project}.iam.gserviceaccount.com"
    turn   = "sa-turn@${var.project}.iam.gserviceaccount.com"
    ops    = "sa-ops@${var.project}.iam.gserviceaccount.com"
    deploy = "sa-deploy@${var.project}.iam.gserviceaccount.com"
    # Créé par cd/compte-migration.sh.
    migration = "sa-migration@${var.project}.iam.gserviceaccount.com"
  }
  labels = { application = "chatisen", environnement = "cible" }
}
