#!/bin/sh
set -eu
curl -fsS http://localhost/healthz
curl -fsS http://localhost/readyz
