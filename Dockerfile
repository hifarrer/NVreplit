FROM node:20-slim AS base

# Install ffmpeg (for local video merging) and Chrome headless shell dependencies required by Remotion
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libnspr4 \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    libatspi2.0-0 \
    libxshmfence1 \
    libxss1 \
    libxtst6 \
    libx11-xcb1 \
    fonts-liberation \
    fonts-noto-color-emoji \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy all source files
COPY . .

# Build the app
RUN npm run build

# Pre-download Chrome Headless Shell so it's baked into the image
# and doesn't need to be fetched on every container start (~87 MB saved per cold start)
RUN node -e "import('@remotion/renderer').then(m => m.ensureBrowser()).then(() => console.log('Browser ready')).catch(e => { console.error(e); process.exit(1); })"

# Pre-build the Remotion webpack bundle so it's baked into the image.
# Saves ~30-60s of webpack compilation on every container start.
RUN node -e "\
  import('@remotion/bundler').then(async ({ bundle }) => { \
    const path = await bundle('server/remotion/Root.tsx'); \
    const fs = await import('fs'); \
    fs.cpSync(path, '/app/.remotion-bundle', { recursive: true }); \
    console.log('Remotion bundle ready at /app/.remotion-bundle'); \
  }).catch(e => { console.error('Remotion bundle failed:', e); process.exit(1); })"

EXPOSE 5000

ENV NODE_ENV=production

CMD ["npm", "run", "start"]
