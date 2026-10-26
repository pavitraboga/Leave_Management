# ---------- Stage 1: build (full Node image, installs prod deps only) ----------
FROM node:20 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public

# ---------- Stage 2: runtime (small alpine image) ----------
FROM node:20-alpine
ARG APP_VERSION=dev
ENV NODE_ENV=production \
    PORT=3000 \
    APP_VERSION=${APP_VERSION}
WORKDIR /app
RUN apk add --no-cache curl
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
CMD ["node", "src/server.js"]
