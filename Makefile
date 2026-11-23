SHELL := /bin/bash
LEVEL ?= core

.PHONY: doctor bootstrap install dev build test verify up down migrate seed seed-demo evidence study
install:
	pnpm install --frozen-lockfile

doctor:
	node scripts/doctor.mjs
bootstrap:
	node scripts/bootstrap.mjs
dev:
	pnpm dev
build:
	pnpm build
test:
	pnpm test
verify:
	LEVEL=$(LEVEL) pnpm verify
up:
	docker compose -f infra/compose/docker-compose.yml up -d --build
down:
	docker compose -f infra/compose/docker-compose.yml down
migrate:
	pnpm db:migrate
seed:
	pnpm db:seed
seed-demo:
	@echo "seed-demo indisponible : les fixtures PostgreSQL du profil Compose ne sont pas encore raccordées" >&2; exit 1
evidence:
	@mkdir -p artifacts
	@set -o pipefail; pnpm verify | tee artifacts/verify-$$(date -u +%Y%m%dT%H%M%SZ).log
study:
	pnpm study
