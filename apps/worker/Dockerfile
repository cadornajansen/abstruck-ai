FROM node:24.18.0-bookworm-slim AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/typescript-config ./packages/typescript-config
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json
COPY apps/worker/package.json ./apps/worker/package.json
RUN pnpm install --frozen-lockfile --filter @workspace/worker...
COPY apps/worker/tsconfig.json ./apps/worker/tsconfig.json
COPY apps/worker/src ./apps/worker/src
RUN pnpm --filter @workspace/worker build
RUN pnpm --filter @workspace/worker deploy --prod --legacy /runtime

FROM postgres:18-bookworm AS backup
WORKDIR /app
COPY --from=build /usr/local/bin/node /usr/local/bin/node
# The backup script resolves the S3 client using apps/web/package.json.
COPY --from=build /runtime/node_modules ./apps/web/node_modules
COPY apps/web/package.json ./apps/web/package.json
COPY scripts/database-backup.mjs ./scripts/database-backup.mjs
COPY config/supabase-ca.crt ./config/supabase-ca.crt
RUN node --version && pg_dump --version \
    && mkdir -m 0700 /app/.local && chown postgres:postgres /app/.local
ENTRYPOINT []
USER postgres
CMD ["node", "scripts/database-backup.mjs", "create"]

FROM node:24.18.0-bookworm-slim AS runtime
WORKDIR /app
# Copy small assets before installing office/media tools: VFS builders deep-copy each parent layer.
COPY --from=build /workspace/apps/worker/dist ./dist
COPY --from=build /runtime/node_modules ./node_modules
COPY apps/worker/package.json ./package.json
COPY apps/worker/test ./test
COPY test/feasibility/fixtures/greenhouse.pdf test/feasibility/fixtures/greenhouse.docx test/feasibility/fixtures/greenhouse.pptx test/feasibility/fixtures/malformed.pdf test/feasibility/fixtures/disguised.pdf /fixtures/
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates ffmpeg poppler-utils libreoffice-writer libreoffice-impress \
    fonts-dejavu-core python3 python3-venv util-linux \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/yt-dlp \
    && /opt/yt-dlp/bin/pip install --no-cache-dir 'yt-dlp[default,pin]==2026.10.26'
ENV PATH="/opt/yt-dlp/bin:${PATH}"
ENV ABSTRUCK_FIXTURE_ROOT="/fixtures"
USER node
CMD ["node", "dist/cli.js", "capabilities"]
