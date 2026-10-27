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
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000
# Health check uses Node's built-in fetch (no extra packages to download)
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
