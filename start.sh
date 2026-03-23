#!/bin/bash
# Nash - AI Safety Guard 启动脚本

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🛡️  Nash - AI Safety Guard"
echo "=========================="
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误：需要 Node.js"
    echo "   安装：brew install node"
    exit 1
fi

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
fi

# 确保日志目录存在
mkdir -p logs

# 启动服务
echo "🚀 启动 Nash Server..."
node src/nash_server.js
