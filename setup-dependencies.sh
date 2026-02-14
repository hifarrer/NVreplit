#!/bin/bash
# Setup script to install Chrome headless shell dependencies for Remotion
# This script installs the required system libraries on Linux systems

set -e

echo "Setting up Remotion Chrome headless shell dependencies..."

if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Check if we're on a Debian/Ubuntu system
    if command -v apt-get &> /dev/null; then
        echo "Installing dependencies via apt-get..."
        sudo apt-get update
        sudo apt-get install -y \
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
            libxtst6
        echo "Dependencies installed successfully!"
    elif command -v nix-env &> /dev/null || [ -f shell.nix ]; then
        echo "Nix detected. Please ensure shell.nix is properly configured."
        echo "You may need to enter a nix-shell or restart your Replit environment."
    else
        echo "Warning: Could not detect package manager. Please install the following libraries manually:"
        echo "  - libnspr4 (NSPR library)"
        echo "  - libnss3 (NSS library)"
        echo "  - Other Chrome/Chromium dependencies"
    fi
else
    echo "This script is for Linux systems only."
    exit 1
fi

echo "Setup complete!"
