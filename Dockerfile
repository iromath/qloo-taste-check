# syntax=docker/dockerfile:1

# --- build ------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Manifests first so the dependency layer is cached independently of source.
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/qloo/package.json packages/qloo/
COPY apps/server/package.json apps/server/
COPY apps/devvit/package.json apps/devvit/
RUN npm ci

COPY packages/qloo packages/qloo
COPY apps/server apps/server
RUN npm run build -w @taste/qloo && npm run build -w @taste/server

# --- runtime ----------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/qloo/package.json packages/qloo/
COPY apps/server/package.json apps/server/
# Only the two workspaces this image serves; the Devvit CLI stays out of it.
RUN npm ci --omit=dev --workspace @taste/qloo --workspace @taste/server && npm cache clean --force

COPY --from=build /app/packages/qloo/dist packages/qloo/dist
COPY --from=build /app/apps/server/dist apps/server/dist
COPY TERMS.md PRIVACY.md ./

ENV PORT=8787
EXPOSE 8787
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/server/dist/index.js"]
