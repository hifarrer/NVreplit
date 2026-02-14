# Fix for Remotion Subtitle Rendering on Replit

## Problem
Remotion's Chrome headless shell was failing to launch due to missing system dependencies (`libnspr4.so` and related libraries), causing subtitle rendering to fail silently and fall back to videos without captions.

## Solution Applied

### 1. Created `shell.nix` file
This Nix configuration file installs all required system dependencies for Chrome headless shell:
- `nspr` (provides libnspr4.so)
- `nss` (provides libnss3.so)
- Other Chrome/Chromium dependencies (alsa-lib, atk, cairo, etc.)

### 2. Updated `server/services/remotion.ts`
Added library path setup to help Chrome headless shell find required libraries on Linux systems.

### 3. Created `setup-dependencies.sh`
A setup script for manual installation of dependencies if Nix is not available.

## Next Steps for Replit

### Option 1: Use Nix (Recommended)
If your Replit environment supports Nix (which it should based on your `.replit` file):

1. **Restart your Replit environment** - This will load the `shell.nix` file and install dependencies
2. The `shell.nix` file should be automatically detected and used
3. Verify by checking if `LD_LIBRARY_PATH` includes Nix store paths

### Option 2: Manual Installation
If Nix doesn't work or you need to install dependencies manually:

1. Run the setup script:
   ```bash
   chmod +x setup-dependencies.sh
   ./setup-dependencies.sh
   ```

2. Or install packages manually:
   ```bash
   sudo apt-get update
   sudo apt-get install -y libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libdbus-1-3 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2 libatspi2.0-0 libxshmfence1 libxss1 libxtst6
   ```
  
### Option 3: For Autoscale Deployment
If you're using Replit's autoscale deployment, you may need to:

1. Ensure `shell.nix` is committed to your repository
2. Replit should automatically use it during deployment
3. If not, you may need to add a build step that installs dependencies

## Verification

After applying the fix, test video generation with subtitles. You should see:
- No "Failed to launch the browser process" errors
- Subtitles successfully rendered on videos
- No fallback to videos without TikTok overlay

## Troubleshooting
 
If subtitles still don't render:

1. Check the console for any remaining library errors
2. Verify `LD_LIBRARY_PATH` is set correctly:
   ```bash
   echo $LD_LIBRARY_PATH
   ```
3. Check if Chrome headless shell can launch:
   ```bash
   ls -la node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/
   ```
4. Try running the setup script manually

## Files Changed
- `shell.nix` (new) - Nix configuration for dependencies
- `server/services/remotion.ts` - Added library path setup
- `setup-dependencies.sh` (new) - Manual setup script
