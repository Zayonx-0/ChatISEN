.PHONY: doctor install dev build test verify up down migrate seed evidence study
install:
	npm install

doctor:
	npm run doctor

dev:
	npm run dev
build:
	npm run build
test:
	npm test
verify:
	npm run verify
up:
	docker compose -f infra/compose/docker-compose.yml up -d --build
down:
	docker compose -f infra/compose/docker-compose.yml down
migrate:
	npm run db:migrate
seed:
	npm run db:seed
evidence:
	npm run verify | tee artifacts/verify-$$(date -u +%Y%m%dT%H%M%SZ).log
study:
	npm run study
