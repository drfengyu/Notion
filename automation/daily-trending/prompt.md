# 每日 GitHub Trending 推送 · 架构说明

每日 10:03（Asia/Shanghai）抓取 GitHub Trending，去重后生成中文日报文章并推送到本仓库 master 分支。

## 双保险调度

| 层级 | 触发 | 执行者 | 产出 |
|---|---|---|---|
| 主：Qoder 自动化「GitHub Trending 每日推送」 | 每天 10:03 | Qoder AI 会话（完整流程：抓取→解析→去重→中文简介+亮点润色→构建→推送） | 中文润色版日报 |
| 兜底：Windows 计划任务 `\GitHub-Trending-Daily` | 每天 13:03 | `run.cmd` → `daily_trending.py`（纯 Python，无 AI 依赖） | 英文原文版日报（仅当主任务未运行时生效） |

兜底逻辑：Python 脚本幂等——若当日文章已存在则直接跳过。Qoder 正常运行时兜底任务空转；Qoder 未开机时兜底任务保证不断更。

## 关键路径

- Qoder 自动化任务（权威 prompt 存于 Qoder「Automations」面板）：每天 10:03
- `run.cmd`：Windows 计划任务入口 → `daily_trending.py`。代理自检：检测 10808 端口监听，未监听则自动启动 v2rayN（`E:\Download\v2rayN-master\...\Debug\net8.0\v2rayN.exe`）并等待 ≤30s；端口就绪后为子进程设置 `http_proxy/https_proxy=socks5h://127.0.0.1:10808`（git 推送走代理），不可用时记警告日志并直连兜底
- **注意：`run.cmd` 必须保持纯 ASCII（英文）**。批处理在代码页不匹配时会把 UTF-8 中文字符的尾字节（如 `&`）当成命令分隔符，导致 REM/echo 行被切成碎片命令执行（2026-09-19 实测复现）
- `daily_trending.py`：抓取（socks5://127.0.0.1:10808，直连被网络拦截）→ 解析 → 去重 → 生成 → `npx hexo generate` 校验 → git 提交推送 origin master
- `parse_trending.py`：HTML → JSON 解析（供 AI 会话复用）
- 日志：`logs/{日期}.log`；去重清单：`source/_posts/github-trending-daily/_seen.json`

## 历史备注

- 2026-06-26 ~ 2026-09-19 断更：原方案依赖无头 `claude` + cc-switch 本地网关（127.0.0.1:15721），网关停止且上游 token 失效。
- 本目录曾位于 `scripts/daily-trending/`，因 hexo 会把 `scripts/` 下所有文件当 JS 插件加载而迁至 `automation/`。
