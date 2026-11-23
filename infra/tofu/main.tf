terraform { required_version = ">= 1.7.0" }
variable "server_name" { type=string default="chatisen-demo" }
variable "location" { type=string default="fsn1" }
output "notes" { value="Provisionner une VM Linux puis appliquer Ansible; les secrets restent hors state." }
