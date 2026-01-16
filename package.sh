#!/bin/bash

# LogLayer Pro Linux 打包脚本 (无需 NPM)
# 该脚本将应用打包为可在 Linux 上运行的静态资源包

APP_NAME="loglayer-pro"
BUILD_DIR="dist_linux"
ESBUILD_VERSION="0.20.1"

echo "📦 开始打包 $APP_NAME..."

# 1. 创建输出目录
rm -rf $BUILD_DIR
mkdir -p $BUILD_DIR

# 2. 检查并获取 esbuild (单二进制文件，无需 node)
if ! command -v ./esbuild &> /dev/null; then
    echo "获取 esbuild 编译器..."
    OS_TYPE=$(uname -s | tr '[:upper:]' '[:lower:]')
    ARCH_TYPE=$(uname -m)
    
    if [ "$ARCH_TYPE" = "x86_64" ]; then ARCH_TYPE="64"; fi
    if [ "$ARCH_TYPE" = "aarch64" ]; then ARCH_TYPE="arm64"; fi

    curl -fsSL "https://esbuild.github.io/dl/v$ESBUILD_VERSION" | sh
fi

# 3. 编译并打包 index.tsx
echo "🚀 编译 TypeScript 资源..."
./esbuild index.tsx \
    --bundle \
    --minify \
    --sourcemap \
    --format=esm \
    --outfile=$BUILD_DIR/bundle.js \
    --define:process.env.NODE_ENV='"production"' \
    --external:react \
    --external:react-dom

# 4. 准备 HTML 文件
echo "📄 处理 HTML..."
cp index.html $BUILD_DIR/index.html

# 修改 index.html 以适应本地生产路径
# 将 <script type="module" src="index.tsx"></script> 替换为打包后的 bundle.js
sed -i 's/index.tsx/bundle.js/g' $BUILD_DIR/index.html

# 5. 生成简单的 Python 启动脚本 (Linux 通用)
cat > $BUILD_DIR/run.sh <<EOF
#!/bin/bash
echo "----------------------------------------"
echo "LogLayer Pro 正在启动..."
echo "请在浏览器中打开: http://localhost:8080"
echo "----------------------------------------"
# 优先使用 python3, 其次 python
if command -v python3 &> /dev/null; then
    python3 -m http.server 8080
elif command -v python &> /dev/null; then
    python -m SimpleHTTPServer 8080
else
    echo "错误: 未找到 Python，请手动将此目录部署到任意 Web 服务器。"
fi
EOF

chmod +x $BUILD_DIR/run.sh

# 6. 完成
echo "✅ 打包完成！"
echo "目录: $BUILD_DIR"
echo "使用方法: 将 $BUILD_DIR 文件夹拷贝到 Linux 系统，运行 ./run.sh 即可。"
