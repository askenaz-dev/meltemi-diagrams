# syntax=docker/dockerfile:1
FROM node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d AS app

ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
ENV WRANGLER_SEND_METRICS=false \
    WRANGLER_SEND_ERROR_REPORTS=false \
    WRANGLER_HIDE_BANNER=true \
    CLOUDFLARE_CF_FETCH_ENABLED=false \
    CI=1 \
    PLAYGROUND_LOCAL=true

WORKDIR /app
RUN apt-get update && apt-get install --yes --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch --frozen-lockfile
COPY . .
RUN pnpm install --offline --frozen-lockfile \
    && node scripts/local/source-revision.mjs > source-revision.txt \
    && MELTEMI_SOURCE_REVISION="$(cat source-revision.txt)" pnpm playground:build
RUN command -v flock >/dev/null && mkdir /data && chown node:node /data
USER node
EXPOSE 8788
ENTRYPOINT ["node", "--conditions=@meltemi/diagrams-source", "scripts/local/entry.mjs"]
