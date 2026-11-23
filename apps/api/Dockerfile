FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm install --ignore-scripts
COPY apps/api apps/api
COPY packages packages
COPY tsconfig.json ./
RUN npm run build -w @chatisen/api
FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["node","apps/api/dist/server.js"]
