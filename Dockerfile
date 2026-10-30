FROM node:24-bookworm-slim AS build
WORKDIR /build/server
COPY server/package*.json ./
RUN npm ci
COPY server/tools/build-v2.js tools/build-v2.js
COPY server/src/crypto/ src/crypto/
RUN npm run build:v2
RUN npm prune --omit=dev
FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /build/server/node_modules server/node_modules
COPY --chown=node:node server/ server/
COPY --chown=node:node database/ database/
COPY --chown=node:node client/ client/
COPY --from=build --chown=node:node /build/client/js/vendor/secure-v2.js client/js/vendor/secure-v2.js
RUN mkdir -p /app/.data/encrypted-files && chown -R node:node /app/.data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD node -e "fetch('http://127.0.0.1:3000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","server/tools/start.js"]
