FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm install --ignore-scripts
COPY apps/web apps/web
COPY tsconfig.json ./
RUN npm run build -w @chatisen/web
FROM nginx:1.27-alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
