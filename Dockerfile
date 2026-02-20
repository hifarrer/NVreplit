FROM node:20-slim AS base

# Install Chrome headless shell dependencies required by Remotion
RUN apt-get update && apt-get install -y --no-install-recommends \
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

# Build the app (vite build + esbuild + copy remotion + pre-download Chrome Headless Shell)
# The build script runs `npx remotion browser ensure` at the end, which bakes Chrome
# into the image so it doesn't need to be fetched on every container start (~87 MB saved)
RUN npm run build

EXPOSE 5000

ENV NODE_ENV=production

CMD ["npm", "run", "start"]
