#!/bin/bash

# LogLayer Pro Linux Offline Packaging Script (No NPM required)
# This script bundles all dependencies for zero-internet environments.

APP_NAME="loglayer-pro"
BUILD_DIR="dist_linux"
VENDOR_DIR="$BUILD_DIR/vendor"
ESBUILD_VERSION="0.20.1"

echo "📦 Starting OFFLINE packaging for $APP_NAME..."

# 1. Create directory structure
rm -rf $BUILD_DIR
mkdir -p $VENDOR_DIR

# 2. Get esbuild compiler (standalone binary)
if ! command -v ./esbuild &> /dev/null; then
    echo "⬇️ Downloading esbuild compiler..."
    OS_TYPE=$(uname -s | tr '[:upper:]' '[:lower:]')
    ARCH_TYPE=$(uname -m)
    
    if [ "$ARCH_TYPE" = "x86_64" ]; then ARCH_TYPE="64"; fi
    if [ "$ARCH_TYPE" = "aarch64" ]; then ARCH_TYPE="arm64"; fi

    curl -fsSL "https://esbuild.github.io/dl/v$ESBUILD_VERSION" | sh
fi

# 3. Download Dependencies for Offline Use
echo "⬇️ Downloading React, React-DOM and Tailwind for offline use..."
# We download the ESM versions of React/React-DOM
curl -sL "https://esm.sh/react@18.2.0?bundle" -o "$VENDOR_DIR/react.js"
curl -sL "https://esm.sh/react-dom@18.2.0/client?bundle" -o "$VENDOR_DIR/react-dom-client.js"
curl -sL "https://esm.sh/react-dom@18.2.0?bundle" -o "$VENDOR_DIR/react-dom.js"
curl -sL "https://esm.sh/react@18.2.0/jsx-runtime?bundle" -o "$VENDOR_DIR/jsx-runtime.js"
# Standalone Tailwind Play CDN (Works offline once loaded locally)
curl -sL "https://cdn.tailwindcss.com/3.4.1" -o "$VENDOR_DIR/tailwind.js"

# 4. Compile index.tsx
echo "🚀 Bundling Application Code..."
./esbuild index.tsx \
    --bundle \
    --minify \
    --format=esm \
    --outfile=$BUILD_DIR/bundle.js \
    --define:process.env.NODE_ENV='"production"' \
    --external:react \
    --external:react-dom \
    --external:react-dom/client \
    --external:react/jsx-runtime

# 5. Prepare HTML
echo "📄 Patching index.html for local paths..."
cp index.html $BUILD_DIR/index.html

# Rewrite Import Map and Scripts to use local vendor files
# We use a temp file for safer sed operations
cat > $BUILD_DIR/index.html <<EOF
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LogLayer Pro (Offline)</title>
    <script src="./vendor/tailwind.js"></script>
    <script type="importmap">
    {
      "imports": {
        "react": "./vendor/react.js",
        "react-dom": "./vendor/react-dom.js",
        "react-dom/client": "./vendor/react-dom-client.js",
        "react/jsx-runtime": "./vendor/jsx-runtime.js"
      }
    }
    </script>
    <style>
      body, html { margin: 0; padding: 0; background-color: #0d0d0d; color: #cccccc; font-family: 'Inter', sans-serif; overflow: hidden; height: 100vh; width: 100vw; }
      #root { height: 100%; width: 100%; display: flex; flex-direction: column; }
      ::-webkit-scrollbar { width: 10px; height: 10px; }
      ::-webkit-scrollbar-track { background: #1e1e1e; }
      ::-webkit-scrollbar-thumb { background: #333333; }
      ::-webkit-scrollbar-thumb:hover { background: #444444; }
      .select-text { user-select: text !important; }
    </style>
</head>
<body>
    <div id="root"></div>
    <script type="module" src="bundle.js"></script>
</body>
</html>
EOF

# 6. Generate Clean run.sh (Force Unix Line Endings)
echo "📜 Generating run.sh..."
printf "#!/bin/bash\n\n" > $BUILD_DIR/run.sh
printf "echo \"----------------------------------------\"\n" >> $BUILD_DIR/run.sh
printf "echo \"LogLayer Pro (OFFLINE MODE) is starting...\"\n" >> $BUILD_DIR/run.sh
printf "echo \"Target: http://localhost:8080\"\n" >> $BUILD_DIR/run.sh
printf "echo \"----------------------------------------\"\n" >> $BUILD_DIR/run.sh
printf "if command -v python3 &> /dev/null; then\n" >> $BUILD_DIR/run.sh
printf "    python3 -m http.server 8080\n" >> $BUILD_DIR/run.sh
printf "elif command -v python &> /dev/null; then\n" >> $BUILD_DIR/run.sh
printf "    python -m SimpleHTTPServer 8080\n" >> $BUILD_DIR/run.sh
printf "else\n" >> $BUILD_DIR/run.sh
printf "    echo \"Error: No Python found.\"\n" >> $BUILD_DIR/run.sh
printf "fi\n" >> $BUILD_DIR/run.sh

# Force remove any CR (\r) characters just in case the printf was handled oddly on Windows
sed -i 's/\r$//' $BUILD_DIR/run.sh

chmod +x $BUILD_DIR/run.sh

echo "✅ ALL-IN-ONE Package created at: $BUILD_DIR"
echo "Instructions:"
echo "1. Copy $BUILD_DIR to your offline Linux machine."
echo "2. Run ./run.sh"
