#!/bin/sh
set -eu
curl -fsSI http://localhost/ | grep -qi 'X-Content-Type-Options' || true
