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
