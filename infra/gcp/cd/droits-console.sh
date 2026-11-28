#!/usr/bin/env bash
# Droits de la console du webmaster, pour le compte des VM applicatives. À lancer par un
# propriétaire du projet. Relançable : la condition suit la liste actuelle des VM.
#
# Rien d'autre que lire l'état et redémarrer : ni arrêt, ni suppression, ni métadonnées,
# ni groupe de VM. Les VM hors de la cible sont exclues par leur nom exact.
set -euo pipefail

PROJECT=${CHATISEN_PROJECT:-project-fd23d3d9-a7e8-4002-a7a}
ACCOUNT=serviceAccount:sa-app@$PROJECT.iam.gserviceaccount.com
gc() { gcloud "$@" --project "$PROJECT" --quiet; }

role() {
  local id=$1 title=$2 permissions=$3 action=create
  if gc iam roles describe "$id" >/dev/null 2>&1; then action=update; fi
  gc iam roles "$action" "$id" --title="$title" --permissions="$permissions" --stage=GA >/dev/null
}
bind() {
  local id=projects/$PROJECT/roles/$1 title=$2 expression=$3
  # Une ancienne condition de ce même rôle est retirée avant de poser la nouvelle.
  gc projects remove-iam-policy-binding "$PROJECT" --member="$ACCOUNT" --role="$id" --all >/dev/null 2>&1 || true
  gc projects add-iam-policy-binding "$PROJECT" --member="$ACCOUNT" --role="$id" \
    --condition="^~^title=$title~expression=$expression" >/dev/null
}

vms=$(gc compute instances list --filter='name~^chatisen-(app-[a-z0-9-]+|turn|ops|sfu-[12])$' \
  --format='csv[no-heading](name,zone.basename())' | sort)
[[ $(wc -l <<<"$vms" | tr -d ' ') == 6 ]] || { echo "Six VM de la cible attendues, liste reçue :" >&2; echo "$vms" >&2; exit 1; }
expression=
while IFS=, read -r name zone; do
  expression+="${expression:+ || }resource.name == \"projects/$PROJECT/zones/$zone/instances/$name\""
done <<<"$vms"

role chatisenOperationsReset "Console ChatISEN : redémarrages" compute.instances.get,compute.instances.reset
role chatisenOperationsBackupList "Console ChatISEN : dates des sauvegardes" cloudsql.backupRuns.list
bind chatisenOperationsReset instances_chat_cible \
  "resource.type == \"compute.googleapis.com/Instance\" && ($expression)"
bind chatisenOperationsBackupList instance_sql_chat_cible \
  "resource.type == \"sqladmin.googleapis.com/Instance\" && resource.name == \"projects/$PROJECT/instances/chatisen-pg\""
echo "Droits de la console posés sur :"
cut -d, -f1 <<<"$vms"
