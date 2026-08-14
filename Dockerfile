# ---- web build ----
FROM node:22-alpine AS web-build
WORKDIR /build/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---- api build ----
FROM node:22-alpine AS api-build
WORKDIR /build
COPY package*.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src/ src/
RUN npm run build && npm ci --omit=dev

# ---- runtime ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=api-build /build/package.json ./
COPY --from=api-build /build/node_modules node_modules/
COPY --from=api-build /build/dist dist/
COPY --from=web-build /build/web/dist web/dist/
USER node
EXPOSE 3000
# No shell wrapper: node receives signals directly for graceful shutdown.
CMD ["node", "dist/server.js"]
