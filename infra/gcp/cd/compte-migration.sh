#!/usr/bin/env bash
# Compte du Job de migration (E37). À lancer par un propriétaire du projet, comme les
# autres comptes de service, créés hors Terraform. Relançable sans effet de bord.
set -euo pipefail

PROJECT=${CHATISEN_PROJECT:-project-fd23d3d9-a7e8-4002-a7a}
ACCOUNT=sa-migration@$PROJECT.iam.gserviceaccount.com
gc() { gcloud "$@" --project "$PROJECT" --quiet; }

if [[ -z $(gc iam service-accounts list --filter="email=$ACCOUNT" --format='value(email)') ]]; then
  gc iam service-accounts create sa-migration --display-name="Migration SQL" >/dev/null
fi
# Seuls le CD et l'exploitation peuvent faire tourner une tâche sous ce compte.
for member in sa-deploy claude-ops; do
  for _ in 1 2 3 4 5 6; do
    gc iam service-accounts add-iam-policy-binding "$ACCOUNT" --role=roles/iam.serviceAccountUser \
      --member="serviceAccount:$member@$PROJECT.iam.gserviceaccount.com" --condition=None >/dev/null 2>&1 && continue 2
    sleep 10
  done
  echo "Droit non posé pour $member." >&2
  exit 1
done
echo "Compte de migration prêt."
