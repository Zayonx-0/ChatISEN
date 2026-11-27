#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo 'Usage (espace réseau nommé d’un banc Linux) : netem.sh <interface> add <latence|perte|debit|mixte>' >&2
  echo '                                         netem.sh <interface> <status|clear>' >&2
  exit 2
}

[[ $# -ge 2 && $(uname -s) == Linux && $EUID == 0 ]] || usage
dev=$1
action=$2
[[ $dev =~ ^[a-zA-Z0-9_.-]{1,15}$ && $dev != lo ]] || usage
[[ -n $(ip netns identify "$$") ]] || {
  echo 'Utiliser ip netns exec sur un espace réseau nommé du banc.' >&2
  exit 2
}

case "$action" in
  add)
    [[ $# == 3 ]] || usage
    case "$3" in
      latence) profile=(delay 100ms 20ms distribution normal) ;;
      perte) profile=(loss 5%) ;;
      debit) profile=(rate 256kbit) ;;
      mixte) profile=(delay 150ms 30ms distribution normal loss 3% rate 512kbit) ;;
      *) usage ;;
    esac
    tc qdisc add dev "$dev" root handle 80: netem "${profile[@]}"
    ;;
  status)
    [[ $# == 2 ]] || usage
    tc -s qdisc show dev "$dev"
    ;;
  clear)
    [[ $# == 2 ]] || usage
    qdiscs=$(tc qdisc show dev "$dev")
    if [[ $qdiscs =~ (^|$'\n')qdisc\ netem\ 80:\ root ]]; then
      tc qdisc del dev "$dev" root handle 80:
    fi
    ;;
  *) usage ;;
esac
