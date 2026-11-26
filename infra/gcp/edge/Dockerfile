# Nginx de la cible : TLS interne sur 8443, client React statique et relais vers l'API.
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
# Le dossier public contient aussi le client de la démo standalone : seul sw.js est repris.
RUN rm -f apps/web/public/index.html apps/web/public/app.js apps/web/public/chat.css
RUN pnpm --filter @chatisen/web build

FROM nginx:1.27-alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY infra/gcp/edge/nginx.conf.template /etc/nginx/templates-chatisen/nginx.conf.template
COPY infra/gcp/edge/entrypoint.sh /usr/local/bin/chatisen-edge
RUN chmod 755 /usr/local/bin/chatisen-edge
EXPOSE 8443
ENTRYPOINT ["/usr/local/bin/chatisen-edge"]
