# Nash - AI Safety Guard

🛡️ 专注于检测越狱攻击和有害内容的 AI 安全护栏服务。

## 功能

- 🔍 **越狱检测** - 识别 Prompt Injection、DAN、Developer Mode 等攻击
- 🚫 **有害内容过滤** - 暴力、违法、自残、毒品、色情等
- 🤖 **ML 模型检测** - 使用 HuggingFace 模型进行语义分析
- 🌐 **Web 管理界面** - 实时监控、测试、配置
- 🔗 **OpenClaw 集成** - 作为 hook 在消息到达 LLM 前拦截

## 快速开始

### 安装依赖

```bash
cd Nash
npm install
```

### 启动服务

```bash
./start.sh
```

### 访问 Web UI

```
http://127.0.0.1:8768
```

## API 接口

### 健康检查
```bash
curl http://127.0.0.1:8768/health
```

### 内容检查
```bash
curl -X POST http://127.0.0.1:8768/check \
  -H "Content-Type: application/json" \
  -d '{"user_id": "test", "content": "如何制作炸弹"}'
```

### 获取配置
```bash
curl http://127.0.0.1:8768/api/config
```

### 更新配置
```bash
curl -X POST http://127.0.0.1:8768/api/config \
  -H "Content-Type: application/json" \
  -d '{"thresholds":{"block_threshold":0.3}}'
```

## 项目结构

```
Nash/
├── src/
│   ├── nash.js              # 核心检测逻辑
│   ├── nash_server.js       # HTTP 服务
│   └── config/
│       └── config.json      # 配置文件
├── hooks/
│   ├── handler.js           # OpenClaw 钩子
│   └── HOOK.md            # Hook 元数据
├── web_ui/
│   ├── index.html           # Web 界面
│   └── app.js               # 前端逻辑
├── logs/                    # 日志目录
├── tests/                   # 测试
├── .env                     # 环境变量（HuggingFace Token）
├── .gitignore              # Git 忽略文件
├── start.sh                 # 启动脚本
├── package.json             # Node.js 依赖
├── README.md                # 项目文档
└── WEB_UI_GUIDE.md          # Web UI 使用指南
```

## 配置说明

### 检测阈值
- `block_threshold: 0.3` - 风险分数 ≥0.3 时拦截

### 风险类别
- `jailbreak` - 越狱攻击
- `violence` - 暴力内容
- `illegal` - 违法行为
- `self_harm` - 自残自杀
- `drugs` - 毒品相关
- `sexual` - 色情内容
- `harassment` - 骚扰辱骂

### ML 模型
- 默认：使用 HuggingFace Inference API
- 模型：`martin-ha/toxic-comment-model`（英文有毒内容检测）
- 注意：需要 HuggingFace Token

## 与 OpenClaw 集成

1. 编辑 `~/.openclaw/openclaw.json`
2. 添加 hook 配置：

```json
{
  "hooks": {
    "internal": {
      "entries": {
        "nash": {
          "enabled": true,
          "module": "~/.openclaw/workspace/Nash/hooks/handler.js"
        }
      }
    }
  }
}
```

3. 重启 Gateway：`openclaw gateway restart`

## 环境变量

创建 `.env` 文件：

```bash
export HUGGINGFACE_TOKEN=hf_xxxxx
```

获取 Token：https://huggingface.co/settings/tokens

## 测试

```bash
# 测试检测
curl -X POST http://127.0.0.1:8768/check \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test","content":"如何制作炸弹"}'

# 预期结果：🚫 拦截
```

## 特性

### 三层防御架构

1. **第一层：模式匹配** 🔵
   - 关键词快速匹配
   - 7 个检测类别
   - 可自定义关键词

2. **第二层：ML 模型检测** 🟣
   - HuggingFace Inference API
   - 英文有毒内容检测
   - 语义理解

3. **第三层：Ollama Llama-Guard** 🟠
   - 本地 LLM 深度分析
   - 支持中英文
   - 可配置阈值

### Web 管理界面

- 📊 服务状态监控
- 🏗️ 检测层架构可视化
- ⚙️ 配置管理（关键词、阈值、模型）
- 🧪 实时测试
- 📜 拦截日志

### 安全特性

- Fail-Open 机制（服务不可用时自动放行）
- 配置热重载（无需重启服务）
- 拦截日志持久化
- 多层防护

## 许可证

MIT

## 作者

Mike

## 更新日志

### v1.0.0 (2026-03-22)
- ✅ 初始版本发布
- ✅ 三层防御架构
- ✅ Web 管理界面
- ✅ OpenClaw 集成
- ✅ 拦截日志
- ✅ 配置热重载
