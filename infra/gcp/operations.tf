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

# Les droits de la console (redémarrer six VM désignées, lire la date des sauvegardes) sont
# posés par un propriétaire avec cd/droits-console.sh, comme les autres droits des comptes.
