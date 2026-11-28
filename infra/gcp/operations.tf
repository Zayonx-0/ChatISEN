variable "operations_restarts_enabled" {
  type        = bool
  default     = false
  description = "Active les redémarrages de la console avec la liste des VM vérifiée sur la cible."
}

variable "operations_app_instances" {
  type        = object({ a = string, b = string })
  default     = null
  description = "Noms exacts des deux membres du MIG chatisen-app dans les zones a et b. À relever avec le compte d'exploitation."
  validation {
    condition = var.operations_app_instances == null ? true : (
      var.operations_app_instances.a != var.operations_app_instances.b &&
      alltrue([for name in values(var.operations_app_instances) : can(regex("^chatisen-app-[a-z0-9][a-z0-9-]{0,49}[a-z0-9]$", name))])
    )
    error_message = "Fournir deux noms distincts de membres du MIG chatisen-app."
  }
}

locals {
  operations_reset_enabled = local.app_enabled && var.operations_restarts_enabled && var.operations_app_instances != null
  operations_app_targets = var.operations_app_instances == null ? [] : [
    for index, name in [var.operations_app_instances.a, var.operations_app_instances.b] :
    "projects/${var.project}/zones/${local.zones[index]}/instances/${name}"
  ]
  operations_targets = concat(local.operations_app_targets, [
    for vm in concat([google_compute_instance.turn, google_compute_instance.ops], google_compute_instance.sfu) :
    "projects/${var.project}/zones/${vm.zone}/instances/${vm.name}"
  ])
  operations_reset_expression = format(
    "resource.type == \"compute.googleapis.com/Instance\" && (%s)",
    join(" || ", [for target in local.operations_targets : "resource.name == \"${target}\""])
  )
  operations_backup_expression = format(
    "resource.type == \"sqladmin.googleapis.com/Instance\" && resource.name == \"projects/%s/instances/%s\"",
    var.project,
    google_sql_database_instance.pg.name
  )
}

resource "google_project_iam_custom_role" "operations_reset" {
  count       = local.operations_reset_enabled ? 1 : 0
  role_id     = "chatisenOperationsReset"
  title       = "Console ChatISEN : redémarrages"
  permissions = ["compute.instances.get", "compute.instances.reset"]
}

resource "google_project_iam_member" "operations_reset" {
  count   = local.operations_reset_enabled ? 1 : 0
  project = var.project
  role    = google_project_iam_custom_role.operations_reset[0].name
  member  = "serviceAccount:${local.sa.app}"
  condition {
    title      = "instances_chat_cible"
    expression = local.operations_reset_expression
  }
}

resource "google_project_iam_custom_role" "operations_backups" {
  role_id     = "chatisenOperationsBackupList"
  title       = "Console ChatISEN : dates des sauvegardes"
  permissions = ["cloudsql.backupRuns.list"]
}

resource "google_project_iam_member" "operations_backups" {
  project = var.project
  role    = google_project_iam_custom_role.operations_backups.name
  member  = "serviceAccount:${local.sa.app}"
  condition {
    title      = "instance_sql_chat_cible"
    expression = local.operations_backup_expression
  }
}
