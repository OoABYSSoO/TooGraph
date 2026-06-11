FROM node:22-bookworm-slim AS frontend-build

WORKDIR /app

COPY scripts ./scripts
COPY frontend/package.json frontend/package-lock.json ./frontend/

WORKDIR /app/frontend
RUN npm ci

COPY frontend/index.html frontend/tsconfig*.json frontend/vite.config.* ./
COPY frontend/src ./src
COPY frontend/public ./public

RUN npm run build \
  && node --input-type=module -e "import { writeFrontendBuildManifest } from '../scripts/frontend-build-plan.mjs'; writeFrontendBuildManifest({ frontendDir: process.cwd(), distDir: 'dist' });"

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=3477
ENV TOOGRAPH_HOST=0.0.0.0
ENV TOOGRAPH_SKIP_DEP_INSTALL=1
ENV PYTHON=/opt/toograph/venv/bin/python
ENV PATH=/opt/toograph/venv/bin:$PATH

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl python3 python3-pip python3-venv \
  && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./backend/requirements.txt
RUN python3 -m venv /opt/toograph/venv \
  && /opt/toograph/venv/bin/python -m pip install --upgrade pip \
  && /opt/toograph/venv/bin/python -m pip install --no-cache-dir -r backend/requirements.txt

COPY package.json README.md LICENSE ./
COPY scripts ./scripts
COPY backend ./backend
COPY docs ./docs
COPY examples ./examples
COPY action ./action
COPY graph_template ./graph_template
COPY knowledge ./knowledge
COPY node_preset ./node_preset
COPY tool ./tool

COPY frontend/index.html frontend/package.json frontend/package-lock.json frontend/tsconfig*.json frontend/vite.config.* ./frontend/
COPY frontend/src ./frontend/src
COPY frontend/public ./frontend/public
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

VOLUME ["/app/backend/data"]
EXPOSE 3477

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1

CMD ["node", "scripts/start.mjs"]
