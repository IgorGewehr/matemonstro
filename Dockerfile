# syntax=docker/dockerfile:1

# Imagem base comum (Debian slim = glibc, compativel com o binario nativo
# do better-sqlite3 compilado no estagio de build).
FROM node:20-bookworm-slim AS base

# ---------------------------------------------------------------------------
# Estagio 1: build
# ---------------------------------------------------------------------------
FROM base AS build
WORKDIR /app

# Toolchain de compilacao nativa exigida pelo better-sqlite3 (node-gyp).
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Instala dependencias com lockfile (inclui a compilacao nativa do better-sqlite3).
COPY package.json package-lock.json ./
RUN npm ci

# Copia o resto do codigo e builda.
# `npm run build` roda `npm run bundle` (gera public/curriculum-data.json +
# lib/curriculum-meta.json a partir de data/curriculum/) e depois `next build`
# (output: "standalone").
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# Estagio 2: runtime
# ---------------------------------------------------------------------------
FROM base AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Caminho do arquivo SQLite (CONTRATO). Fica dentro do volume /data.
ENV DB_PATH=/data/matemonstro.db

# Diretorio persistido via volume (docker-compose) para o SQLite (WAL + shm).
RUN mkdir -p /data
VOLUME ["/data"]

# Saida standalone do Next: server.js + node_modules minimos ja resolvidos
# (inclui o binario nativo do better-sqlite3 rastreado pelo file tracing).
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
