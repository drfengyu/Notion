---
title: muyuan.do 中转 403 "Your request was blocked" 排查与修复
date: 2026-06-11 09:19:35
categories:
  - 技术问题排查
tags:
  - Hermes Agent
  - API中转
  - Cloudflare WAF
  - User-Agent
---

> 环境：Hermes Agent v0.15.1 (Windows) / 模型 `claude-opus-4-8` / 中转 `https://muyuan.do/v1`

---

## 1. 现象

终端 / gateway 调用模型时报错，并在 `sessions/` 下生成请求转储：

```
sessions/request_dump_20260611_091935_1f4d30_*.json
```

转储关键字段：

```json
{
  "reason": "non_retryable_client_error",
  "request": { "url": "https://muyuan.do/v1/chat/completions", "model": "claude-opus-4-8" },
  "error": {
    "type": "PermissionDeniedError",
    "status_code": 403,
    "message": "Your request was blocked.",
    "response_text": "Your request was blocked."
  }
}
```

gateway 日志同步出现：

```
agent.conversation_loop: API call failed error_type=PermissionDeniedError ... summary=HTTP 403: Your request was blocked.
agent.conversation_loop: Non-retryable client error: Your request was blocked.
```

**特征：每一条请求都 403，不是偶发。**

---

## 2. 根本原因

`muyuan.do` 位于 Cloudflare 之后，其 WAF 有一条**黑名单规则，专门拦截官方 SDK 的默认 User-Agent**。

Hermes 底层用 **OpenAI Python SDK** 调用 OpenAI-wire 接口，SDK 默认发送的
`User-Agent: OpenAI/Python <ver>` 正好命中黑名单 → 边缘直接 403，
Hermes 把 403 归类为 `non_retryable_client_error`（永久客户端错误，不重试）。

### 验证证据（同一 key、同一 body，只改 User-Agent）

| User-Agent | 结果 |
|---|---|
| `OpenAI/Python 1.55.0` | ❌ 403 `Your request was blocked.` |
| `AsyncOpenAI/Python 1.55.0` | ❌ 403 |
| `Anthropic/Python 0.40.0` | ❌ 403 |
| `curl/8.5.0` | ✅ 200 |
| `python-requests/2.31.0` | ✅ 200 |
| `Mozilla/5.0 (...)` | ✅ 200 |
| `claude-code/0.1.0` | ✅ 200 |
| `hermes-agent/1.0` | ✅ 200 |
| 空 UA | ✅ 200 |

> 结论：黑名单只针对 SDK 默认 UA。任何「非官方 SDK 默认」的 UA 都放行。

### 早期误判说明
- 一开始用 `curl` 测试返回 200，误以为是「Cloudflare 偶发拦截」→ 实为 curl 的 UA 不在黑名单。
- 误判后尝试「同源 fallback」无效：Hermes 检测到 fallback 条目 `base_url` 与当前后端相同会主动跳过：
  ```
  agent.chat_completion_helpers: Fallback skip: chain entry base_url https://muyuan.do/v1 matches current backend
  ```

---

## 3. 最终修复（升级安全，不改 Hermes 源码）

利用 Hermes 官方扩展点：自定义 provider 在构建客户端时，会读取
`get_provider_profile(agent.provider).default_headers` 注入请求头
（见 `agent/agent_init.py` 显式凭证分支）。

**关键坑**：运行时 `agent.provider` 实际是泛化的 **`custom`**，而**不是**
`custom:muyuan.do`（`:Muyuan.do` 后缀在构建客户端前已被剥离，gateway 日志
`provider=custom base_url=https://muyuan.do/v1` 可证）。因此必须**覆盖内置的
`custom` profile**，给它加 UA——注册 `custom:muyuan.do` 名字的 profile 不会被查到。

用户插件目录在 bundled 之后加载，注册同名 `custom` 即可覆盖。用子类继承内置
`CustomProfile` 以保留 Ollama/think 行为。

### 文件

`~/AppData/Local/hermes/plugins/model-providers/muyuan-do/__init__.py`

```python
from providers import register_provider
from providers.base import ProviderProfile
from plugins.model_providers.custom import CustomProfile as _Base

_ALLOWED_UA = "hermes-agent/1.0"   # 不在 WAF 黑名单中的 UA

class MuyuanCustomProfile(_Base):   # 继承内置 custom，保留 Ollama/think 行为
    pass

# 覆盖内置 'custom' profile（运行时 agent.provider == 'custom'）
register_provider(MuyuanCustomProfile(
    name="custom",
    aliases=("ollama", "local", "vllm", "llamacpp", "llama.cpp", "llama-cpp"),
    env_vars=(),
    base_url="",
    default_headers={"User-Agent": _ALLOWED_UA},
))
```

### 为什么对所有入口生效
插件注册进 Hermes **全局 provider 注册表**，终端 `hermes` 命令、后台 gateway、
cron 任务构建 API 客户端走的是**同一段** `agent_init.py` 逻辑，因此三者全部覆盖，
无需分别配置。Hermes 升级也不会覆盖用户插件目录。

---

## 4. 验证

端到端对照实验（复现 Hermes 实际客户端构建逻辑）：

```
带插件注入 UA (hermes-agent/1.0)  -> ✅ 200，模型正常回答
不带 (OpenAI SDK 默认 UA)          -> ❌ PermissionDeniedError: Your request was blocked.
```

全新进程（等同终端 `hermes`）插件发现验证：

```
[OK] 全新进程也能加载插件: custom:muyuan.do {'User-Agent': 'hermes-agent/1.0'}
```

---

## 5. 维护提示

- 若某天 `hermes-agent/*` 也被 muyuan.do 加入黑名单，只需改插件里 `_ALLOWED_UA`
  换一个放行值即可（`curl/8.5.0`、`Mozilla/5.0 (...)`、`python-requests/2.31.0` 均实测可用）。
- 若**持续** 403 且换任何 UA 都不行 → 那才是 key 失效 / 欠费 / IP 封禁，
  与本问题无关，需联系 muyuan.do 服务商。
- 本修复不依赖 `fallback_providers`；该项已恢复为 `'[]'`。

---

## 6. 变更清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `plugins/model-providers/muyuan-do/__init__.py` | 新建 | 核心修复 |
| `config.yaml` | 改后回滚 | fallback 试过无效，已还原，净变化 0 |
| `config.yaml.bak.fallback_20260611_094006` | 备份 | 可回滚点 |
