---
name: nash
description: "Nash - AI Safety Guard (越狱和有害内容检测)"
metadata:
  {
    "openclaw":
      {
        "emoji": "🛡️",
        "events": ["message:received"],
        "install": [{ "id": "nash", "kind": "local", "label": "Local hook" }],
      },
  }
requires:
  bins:
    - "node"
---

# Nash Hook

AI 安全护栏 Hook - 调用 Nash 服务 (http://127.0.0.1:8768) 进行安全检查。

## 功能

- 越狱攻击检测 (Prompt Injection)
- 暴力内容检测
- 违法内容检测
- 自残内容检测
- 毒品相关内容检测
- 辱骂骚扰检测

## 配置

编辑 `~/.openclaw/workspace/Nash/src/config/config.json` 调整检测策略。

## 服务管理

```bash
cd ~/.openclaw/workspace/Nash
./start.sh        # 启动
pkill -f nash     # 停止
curl http://127.0.0.1:8768/health  # 状态
```

## Fail-Open

如果 Nash 服务不可用，Hook 会自动放行消息（不影响正常使用）。
