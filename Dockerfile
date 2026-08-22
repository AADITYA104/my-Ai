# ============================================================================
#  ULTRON 2026 MULTI-STAGE OPTIMIZED DOCKERFILE
#  - Layer-cached dependency installation.
#  - Non-root user security isolation.
#  - Headless Chromium (Playwright) and Python3 runtime sandbox.
# ============================================================================

# Stage 1: Build & Dependencies
FROM node:20-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --only=production

# Stage 2: Runtime Sandbox
FROM node:20-slim AS runner

WORKDIR /app

# Install minimal runtime libraries for headless browser and Python
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libasound2 fonts-liberation libpango-1.0-0 libcairo2 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY . .

# Install the Chromium binary Playwright needs (browser-agent.js otherwise
# silently falls back to a plain fetch() with no JS rendering). Installed
# into an app-owned path so the later non-root user can still launch it.
ENV PLAYWRIGHT_BROWSERS_PATH=/app/.pw-browsers
RUN npx --yes playwright install chromium

# Create non-root user with dedicated workspace
RUN useradd -u 1001 -m agentuser && \
    mkdir -p /app/agent-memory /app/workspace && \
    chown -R agentuser:agentuser /app

USER agentuser

ENV NODE_ENV=production
ENV FREEZE_DIR=/app/workspace
ENV PORT=3000

EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "ultron-server.js"]
