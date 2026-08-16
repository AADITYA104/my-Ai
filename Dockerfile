# ============================================================================
#  Dockerfile — sandboxed environment for the autonomous agent
# ============================================================================
#  Why this matters: terminal_exec / code_exec run REAL commands. Running
#  the agent directly on your host dev machine means a bad plan could touch
#  real files, real credentials, or real host processes.
#  This container isolates the agent to a non-root environment with /app/workspace.
# ============================================================================

FROM node:20-slim

# System libraries for Playwright Chromium & Python execution
RUN apt-get update && apt-get install -y \
    python3 python3-pip \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libasound2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install
RUN npx playwright install --with-deps chromium

COPY . .

# Non-root user for security
RUN useradd -m agentuser && chown -R agentuser:agentuser /app
USER agentuser

# Scoped execution directory
ENV FREEZE_DIR=/app/workspace
RUN mkdir -p /app/workspace

CMD ["node", "autonomous-loop-agent-v5-native-tools.js"]
