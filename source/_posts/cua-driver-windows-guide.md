---
title: Cua Driver Windows 实战 — 从安装到让 AI Agent 后台操控桌面
date: 2026-09-20
tags:
  - AI Agent
  - 桌面自动化
  - MCP
  - Windows
  - Cua
categories:
  - 编程笔记
---

[trycua/cua](https://github.com/trycua/cua) 是 2026-09-20 的 GitHub Trending 榜首级项目，口号是 "Give AI agents computers they can use"。它的仓库已经重构成五个组件，其中**真正负责「操控本机桌面」的是 Cua Driver**。

本文只讲 Windows，且所有命令都实测自官方仓库 `libs/cua-driver/` 的 `WINDOWS.md`、`SKILL.md`、以及 `https://cua.ai/driver/install.ps1` 脚本本体（版本线 **0.28.x**）。凡文档与脚本不一致之处，均在文中标注。

<!-- more -->

---

## 1. 先认清组件：Windows 上你只需要 Cua Driver

| 组件 | 作用 | Windows 可用性 |
| --- | --- | --- |
| **Cua Driver** | 后台驱动本机原生 GUI 应用（读无障碍树、点击、输入、截图、启动、排布窗口），对外暴露 CLI / MCP / SDK 三种接口 | ✅ 一等公民（UIA + PostMessage） |
| Cua Fleets | 云端隔离桌面，用 Sandbox SDK 批量领用 | ✅ 平台无关（但要付费凭据） |
| Lume | Apple Silicon 上跑 macOS/Linux 本机 VM | ❌ 依赖 `Virtualization.Framework`，Windows 用不了 |
| Cua Bench | 造任务、评测 computer-use agent、导出轨迹 | ✅ 跨平台 |
| CUA-S1 | 面向计算机操作的 Small-S1 决策模型（MIT，权重在 HF） | ✅ 与平台无关 |

**结论**：想让 agent 操作你 Windows 上的真实应用，装 Cua Driver 就够了。

---

## 2. 核心卖点：no-foreground 契约

这是 Cua Driver 区别于 AutoHotkey / PyAutoGUI / `SendInput` 脚本的根本点：

- 点击和按键**直接注入目标进程**（PostMessage / UIA Invoke），不激活窗口、不置顶、不移动你的真实鼠标；
- 你可以在**前台继续用电脑**，agent 在后台操作另一个应用；
- 被遮挡（occluded）的窗口在 `background` 模式下不会像传统方案那样"先弹到最前再点"，而是返回结构化的 `background_unavailable` 错误——**宁可失败也不抢焦点**。

驱动会画一个**合成的 agent 光标覆盖层**让你看到它正在哪里操作，但那只是可视化，真实指针不动。想真的移动系统光标必须显式用 `move_cursor({x,y,scope:"desktop"})`，文档明确不建议除非用户要求。

---

## 3. 安装（PowerShell）

### 3.1 一行安装（推荐）

```powershell
irm https://cua.ai/driver/install.ps1 | iex
```

脚本特点（读脚本本体确认）：

- 从 GitHub Releases 下载 `cua-driver-rs-v*` 的 zip；
- **免 sudo、不需要开发者模式、不需要管理员**（除了下面的 autostart 例外）；
- 用**两级目录联接（junction）**布局，升级/回滚只需重指向联接，不覆盖文件。

### 3.2 落盘位置与 PATH

```
%LOCALAPPDATA%\Programs\Cua\cua-driver\bin      ← 加入 User PATH 的可见目录（junction）
%USERPROFILE%\.cua-driver\packages\current      ← junction → 当前版本
%USERPROFILE%\.cua-driver\packages\releases\<version>-<arch>\cua-driver.exe   ← 真实文件
```

同时会装一个 `cua-cursor-theme.exe` 用于管理 agent 光标主题。

安装脚本自动把 bin 目录追加到**用户级 PATH**，所以**必须新开一个 PowerShell** 才能直接敲 `cua-driver`。当前会话临时生效：

```powershell
$env:Path = "$env:LOCALAPPDATA\Programs\Cua\cua-driver\bin;$env:Path"
(Get-Command cua-driver).Source   # 确认真实路径
cua-driver --version
```

> ⚠️ **一处文档不一致**：仓库 `WINDOWS.md` 里写的安装路径是旧版的 `%LOCALAPPDATA%\Programs\trycua\cua-driver-rs\bin`。`install.ps1` 注释说明该布局在 **v0.2.14** 改名为 `Programs\Cua\cua-driver\`，旧路径会在下次重装时自动迁移并从 PATH 里清理。**以 `(Get-Command cua-driver).Source` 的输出为准**，别照抄文档路径。

### 3.3 固定版本 / 选渠道

`irm | iex` 形式无法传参，但支持环境变量覆盖（优先级：env > `-Release` > 脚本内置 baked 版本 > GitHub API）：

```powershell
# 钉死某个版本
$env:CUA_DRIVER_RS_VERSION = "0.28.2"
irm https://cua.ai/driver/install.ps1 | iex

# 使用 nightly 渠道
$env:CUA_DRIVER_RS_VERSION = "nightly"
irm https://cua.ai/driver/install.ps1 | iex
```

需要用脚本参数（`-Release` / `-Channel` / `-NoAutoStart` / `-NoPathUpdate`）时，落盘再带参执行：

```powershell
irm https://cua.ai/driver/install.ps1 -OutFile .\install-cua-driver.ps1
powershell -ExecutionPolicy Bypass -File .\install-cua-driver.ps1 -Release 0.28.2 -NoAutoStart
```

### 3.4 卸载

```powershell
irm https://cua.ai/driver/uninstall.ps1 | iex

# 免交互强删（脚本注释说明：因为 iex 无法传 -Force，只能走环境变量）
$env:CUA_DRIVER_RS_UNINSTALL_FORCE = '1'
irm https://cua.ai/driver/uninstall.ps1 | iex
```

会清掉：计划任务自启动项、运行中的 daemon 进程、目录联接、整个包目录，以及 `skills install` 撒在各 agent 配置目录里的技能联接。

---

## 4. 首次启动与自检

### 4.1 自启动计划任务（Windows 上的 LaunchAgent 等价物）

`install.ps1` **默认就会注册**名为 `cua-driver-serve` 的计划任务，登录后自动起 daemon。管理命令：

```powershell
cua-driver autostart status
cua-driver autostart enable     # 幂等，重复执行会替换旧任务
cua-driver autostart kick       # 不等下次登录，立刻拉起
cua-driver autostart disable
```

**这里有一个 Windows 独有的大坑，务必理解：**

- 计划任务以 **`RunLevel=Highest`** 注册，因此**注册那一步需要一次 UAC 提权**（脚本会自动请求，只此一次；文件解压、建联接、改 PATH 这些都不提权）。
- 这么设计的原因是：**中等完整性级别的 token 去驱动 UWP / AppContainer 应用（计算器、新版设置、照片）时，UIA 跨 AppContainer 的 RPC 会把控件树截断成约 1 个元素**（官方 issue 1601 / 1602）。只有以 High IL 运行才能拿到完整树。
- 所以：**装了 `-NoAutoStart` 又用普通权限手动起 daemon，你会发现计算器"打不开控件树"**。要么接受那次 UAC，要么别用 UWP 应用。

安装脚本里也提到，若安装时不提权，它只会打印后续注册命令让你自己补做。

### 4.2 生命周期与状态

```powershell
cua-driver status            # daemon 是否在跑
cua-driver serve             # 显式起一个常驻服务（一般不用手敲）
cua-driver stop              # 停
```

要点：**一次性的 `cua-driver call <tool>` 走 daemon 路径**，所以纯命令行使用必须先有 daemon（autostart 或 `serve`）；而 **`cua-driver mcp` 在 Windows 上自己持有 runtime**，不依赖 daemon。

若 daemon 是被 Elevated 计划任务起的，普通 `Stop-Process` 可能杀不掉，用：

```powershell
schtasks /End /TN cua-driver-serve
taskkill /F /IM cua-driver.exe
```

### 4.3 体检

```powershell
cua-driver doctor            # 会话 ID、COM 套间、UIA 桌面枚举可达性、安装路径、版本
cua-driver diagnose          # 更详细的诊断
cua-driver check-update      # 只读探测是否有新版，可加 --json
cua-driver update --apply    # 升级
```

`doctor` 里任何一项是 `false` / `error`，先修它再去调工具。

### 4.4 Session 0 陷阱（远程/SSH/服务场景必踩）

Windows 把服务隔离在没有桌面的 Session 0，而 UIA 枚举、`PrintWindow` 截图、`IApplicationActivationManager` 在 Session 0 里会**静默返回空或超时**。

```powershell
Get-Process cua-driver | Select-Object Id, SessionId   # SessionId 必须是 1+
```

- 自启动任务用的是 `LogonType=Interactive`，所以正常落在用户登录会话里，没问题；
- **通过 SSH 连到这台 Windows 时**，你所在的会话通常就是 Session 0，直接跑 `cua-driver serve` 或裸 `cua-driver mcp` 会被拒绝。正确做法是让 daemon 留在交互会话里，SSH 侧通过命名管道连过去：

```powershell
schtasks /Run /TN cua-driver-serve
cua-driver mcp --socket \\.\pipe\cua-driver
```

### 4.5 权限说明

Windows 没有 macOS 的 TCC（辅助功能 / 屏幕录制）那套授权。`WINDOWS.md` 的说法是：正常使用不需要管理员，仅 `autostart` 注册系统级任务要提权。另外首次运行未签名二进制时 **SmartScreen** 可能拦截，点一次「更多信息 → 仍要运行」即可。

> 注意：`WINDOWS.md` 称"per-user 计划任务非提权且是默认"，但 `install.ps1` 实际是**默认注册 `RunLevel=Highest` 并请求 UAC**（理由见 4.1）。同样以脚本为准。

---

## 5. 命令行调用范式

### 5.1 命名规则

- **工具名 `snake_case`**（`launch_app`、`get_window_state`）
- **管理子命令 `kebab-case`**（`list-tools`、`check-update`）

调用工具：`cua-driver call <tool> [JSON]`。

### 5.2 自描述：最权威的接口来自本机

不要背文档，装好后直接问本机二进制（这也是本文清单可能过时的兜底办法）：

```powershell
cua-driver list-tools                 # 全部工具
cua-driver describe click             # 单个工具的参数 schema
cua-driver manifest                   # 能力清单
cua-driver dump-docs                  # 导出内置文档
```

### 5.3 三种传 JSON 的姿势（PowerShell 转义是重灾区）

```powershell
# ① 管道 stdin —— 官方推荐，完全绕开引号地狱
'{"pid":1234,"text":"hello world"}' | & cua-driver call type_text

# ② 位置参数 + 转义引号（仅当字符串值里没有空格时可靠）
& cua-driver call list_windows '{\"app_name\":\"Calculator\"}'

# ③ PowerShell 5.1 的停止解析符
& cua-driver call type_text --% {"pid":1234,"text":"hello world"}
```

Windows PowerShell 5.1 在 argv 中同时出现 `"` 和空格时会把 JSON 撕坏，**官方明确建议优先用 stdin**。

---

## 6. 核心不变式：snapshot → act → verify

`SKILL.md` 的原话是 **snapshot-before-action 不变式不是可选项**，跳过就会静默失效。规范循环：

```text
launch_app(target, session)
  → 从返回的 windows 数组里挑 window_id（或单独 list_windows(pid)）
  → get_window_state(pid, window_id)        # 拿 element_token
  → [act] click / type_text / press_key ...  # 带 target
  → verify_state(pid, window_id, expect)     # 结构化断言，可选带图
end_session(session?)                        # 可选清理
```

`launch_app` 现在会在返回 pid 的同时附带 `windows` 数组，常见情形省掉一次 `list_windows`，两步即可。

**寻址方式**：`get_window_state` 返回 `tree_markdown`（带 `[N]` 序号）+ `element_token` + `snapshot_id` + 截图。

```powershell
'{"pid":6004,"window_id":459672}' | & cua-driver call get_window_state
# → tree_markdown / element_token(如 "s0000002a:22") / snapshot_id / screenshot / dimensions

'{"pid":6004,"element_token":"s0000002a:22"}' | & cua-driver call click
# → "✅ Performed UIA Invoke on [22] ..."
```

三条硬规矩：

1. **优先 `element_token`**；用可见整数 `element_index` 则必须同时回传 `snapshot_id`，裸序号在 0.17 起 **fail closed**。
2. **重新 snapshot 后旧 token 立刻失效**，绝不能跨快照复用。
3. **无障碍路径优先于像素**。`click({pid,x,y})` 是给 canvas / WebView 用的兜底，先穷尽 AX（菜单、工具栏、快捷键、palette），再降级到坐标。

**为什么 snapshot-bound token 是主路径**：它对隐藏 / 被遮挡 / 桌面外的窗口同样有效，不抢焦点，而且在控件树重建后失败关闭而不是悄悄打到复用的序号上。

### 6.1 `delivery_mode` 阶梯

每个输入类工具（`click` / `double_click` / `right_click` / `drag` / `scroll` / `press_key` / `hotkey` / `type_text`）都接受 `delivery_mode`：

| 取值 | Windows 上的行为 |
| --- | --- |
| `"background"`（默认） | 永不前置、**永不抬起或重排层级**。像素点击会先在坐标处做一次 UIA 命中测试（走无障碍 Invoke，对 UWP/WinUI3 有效且不闪），未命中则仅在"目标确实是该点可见窗口"时注入 pen/touch 坐标，普通 Win32 走 PostMessage；目标在该点被遮挡时返回 `background_unavailable` 而不是抬起窗口 |
| `"foreground"` | 显式降级才用，会真正前置窗口 |

**官方建议：永远先试 `background`。**

### 6.2 工具速查表

| 意图 | 工具 |
| --- | --- |
| 列应用 / 找 pid | `list_apps` |
| 启动应用（幂等） | `launch_app({path}` \| `{name}` \| `{aumid}` \| `{urls}`, `args:[]})` |
| 列某 pid 的窗口 | `list_windows({pid})` → `window_id`/`title`/`bounds`/`z_index`/`is_on_screen` |
| 精确设置窗口位置和大小 | `set_window_frame({pid, window_id, x, y, width, height})`（读回几何后才回 `confirmed`） |
| 调用原生菜单 | `invoke_menu({pid, window_id, path:["View","Sort by","Name"]})`（逐级校验标签，缺失/歧义/禁用即拒绝，绝不退化成像素点击） |
| 快照窗口 | `get_window_state({pid, window_id})` |
| 结构化断言 | `verify_state({pid, window_id, expect, include_screenshot?})` → `satisfied`/`unsatisfied`/`unknown` |
| 点击 | `click({pid, element_token})`；像素式 `click({pid, x, y})`；`action:"press"` 为默认，右键用 `right_click` 或 `click(..., action:"show_menu")` |
| 输入文本 | `type_text({pid, text, element_token})`（AX 路径）；`type_text({pid, text, window_id, x, y})`（像素路径，专治 Chromium/Electron 里 AX 打不进的输入框） |
| 设置非文本控件值 | `set_value({pid, element_token, value})`（**仅 AX**：下拉、复选框、滑块、微调器） |
| 滚动 | `scroll({pid, direction, amount, by, element_token})` |
| 按键 | `press_key({pid, key, element_token, modifiers})` / `{pid, key, x, y}` / `{pid, key, modifiers}`（不改焦点，发给当前焦点） |
| 组合键 | `hotkey({pid, keys:["ctrl","c"]})` / `{pid, x, y, keys}` |
| 拖拽 | `drag({pid, from_x, from_y, to_x, to_y})` |
| 截图 | `screenshot`，或直接用 `get_window_state` 里那张 |
| 剪贴板 | `clipboard_write` / `clipboard_read` |
| 整屏快照（桌面作用域） | `get_desktop_state()` |
| 会话 | `start_session` / `end_session` |

`z_index` 的可移植约定：**数值越大越靠前**，取最大非 null 者即最前。原生 Wayland 上可能全为 `null`（Windows 不涉及），此时必须显式兜底，**不要把 null 当 0，也不要按数组顺序猜层叠**。

---

## 7. 接入 AI Agent（MCP）

Driver 把 `cua-driver mcp` 作为**运行时中立**的 agent 边界。支持的客户端包括 Claude Code、Codex、Cursor、OpenClaw、Muse Code 等。

### 7.1 Claude Code

```powershell
claude mcp add --transport stdio cua-driver -- cua-driver mcp
```

如果你要的是 Claude Code 那种"看图操作"（vision / computer-use）的交互风格，注册兼容模式：

```powershell
claude mcp add --transport stdio cua-computer-use -- cua-driver mcp --claude-code-computer-use-compat
```

该 flag 保留其它所有 MCP 工具，只改 `screenshot` 的语义：必须传 `pid` 和 `window_id`，且只截那个窗口。注意 **必须走 MCP**——CLI 截图虽然仍是同一个驱动调用，但拿不到 `mcp__cua-computer-use__screenshot` 这个 Claude Code 用来做图像定位锚点的工具名。

### 7.2 通用 stdio 配置形状

任何支持 MCP 的客户端都是这两行：

```json
{
  "command": "cua-driver",
  "args": ["mcp"]
}
```

Muse Code 示例（写进 `~/.config/muse/settings.json`，注意是**合并** `mcp_servers` 而非覆盖整个文件，且要填绝对路径）：

```json
{
  "mcp_servers": {
    "cua-driver": {
      "enabled": true,
      "transport": "stdio",
      "command": "C:\\Users\\<you>\\AppData\\Local\\Programs\\Cua\\cua-driver\\bin\\cua-driver.exe",
      "args": ["mcp"]
    }
  }
}
```

Windows 上填**安装出来的 exe 绝对路径**（用 `(Get-Command cua-driver).Source` 取），配置改完要**新开会话**——MCP server 在启动时加载。

### 7.3 协议版本与 HTTP 限制

- stdio 支持现代 MCP 修订 **`2026-07-28`**，同时保留 `2025-06-18` 的 legacy `initialize` 协商；
- 现代客户端在每个请求的 `_meta` 里带协议版本与客户端能力，发现阶段用 `server/discover` 即可，无需 `initialize`；
- 回环 HTTP 端点**仍停留在 legacy MCP，会显式拒绝现代的 metadata 与 discovery 请求**——要用现代协议就走 stdio；
- 带鉴权的本地 HTTP 通过 `CUA_DRIVER_RS_MCP_HTTP_PORT` + `CUA_DRIVER_RS_MCP_HTTP_TOKEN` 开启。

### 7.4 让 agent 少犯错：装官方 skill

Driver 内置一份写给 agent 看的技能包（`SKILL.md` + 各平台指南 + 浏览器 + 录制 + 嵌入，共 8 个文件，`sha256` 校验）：

```powershell
cua-driver skills install        # 只装当前宿主 OS 的那份文档
cua-driver skills install --all-platforms
cua-driver skills status
cua-driver skills path
```

也可以从 ClawHub 装 `@cua/driver`。按 `SKILL.md` 的说法，Codex 能直接枚举并读取内嵌资源；而 Claude Code 2.1.x 虽然能列出并读取这些资源，但**不会**把它纳入原生技能目录，因此对该客户端仍需 `skills install` 落到文件系统才算原生激活。

---

## 8. 多场景应用流程

以下均为 PowerShell + 纯 CLI（不依赖任何 LLM），因此可以直接塞进批处理、计划任务或 CI。同一套流程换成 MCP 工具调用即可交给 agent 执行。

### 场景 A：最小闭环——让计算器算 6×7 并核验

官方教学案例，用来验证"装对了、能操作、能读回结果"。

```powershell
# 1) 启动（UWP 计算器用 aumid；返回 pid + windows）
'{"aumid":"Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"}' | & cua-driver call launch_app
#    → {pid: 6004, windows: [{window_id: 459672, ...}]}

# 2) 快照 UIA 树，拿 element_token
'{"pid":6004,"window_id":459672}' | & cua-driver call get_window_state

# 3) 用返回的 token 点击（下面是文档示例值，每次运行都不同，必须现取现用）
'{"pid":6004,"element_token":"s0000002a:22"}' | & cua-driver call click

# 4) 重新快照，读回结果是否 42
'{"pid":6004,"window_id":459672}' | & cua-driver call get_window_state

# 或者用结构化断言一次搞定
'{"pid":6004,"window_id":459672,"expect":[{"element":{"selector":{"label_contains":"42"},"exists":true}}]}' | & cua-driver call verify_state
```

全程计算器**不会前置**，你的前台窗口和鼠标位置不受影响。

### 场景 B：Win32 应用 + 表单批量填写

```powershell
# 1) 按可执行文件名或完整路径启动
'{"name":"notepad","args":["D:\\notes\\todo.txt"]}' | & cua-driver call launch_app
#    绝对路径形式：{"path":"C:\\Windows\\System32\\notepad.exe"}

# 2) 快照 → 找到编辑区 element_token
'{"pid":<pid>,"window_id":<wid>}' | & cua-driver call get_window_state

# 3) 写入（AX 路径会先聚焦元素再用平台文本原语写入）
'{"pid":<pid>,"text":"第一行内容","element_token":"<token>"}' | & cua-driver call type_text

# 4) 保存
'{"pid":<pid>,"keys":["ctrl","s"]}' | & cua-driver call hotkey

# 5) 断言落盘结果，而不是"看起来点了"
'{"pid":<pid>,"window_id":<wid>,"expect":[{"element":{"selector":{"label_contains":"todo.txt"},"exists":true}}]}' | & cua-driver call verify_state
```

**批量时**：`type_text` 用 `text` 字段循环即可；要精确追加而非替换，先 `click` 聚焦再用键盘。若目标输入框对 AX 无反应（典型是 Electron/Chromium 渲染区），改用像素式一行解决：`type_text({pid, text, window_id, x, y})`——它会先像素点击 `(x,y)` 拿到焦点再输入。

### 场景 C：把文件 / URL 交给默认应用（不要用 Start-Process）

`Intent → tool` 映射表明确把 shell 命令列入"别用"栏：

```powershell
# 用默认浏览器打开 URL
'{"urls":["https://github.com/trycua/cua"]}' | & cua-driver call launch_app

# 用默认程序打开本地文件
'{"urls":["D:\\report\\a.pdf"]}' | & cua-driver call launch_app

# 指定程序打开文件
'{"path":"C:\\Program Files\\VideoLAN\\VLC\\vlc.exe","args":["D:\\a.mp4"]}' | & cua-driver call launch_app
```

替代掉的错误写法：`Start-Process "https://…"`、`explorer.exe ms-edge:…`、`cmd /c start "" "url"`、`Get-Process` 找 pid、`tasklist`、`Stop-Process`。理由是只有走 Driver 才能拿到 pid/window_id 并维持 no-foreground 契约。

**关应用**：`WINDOWS.md` 要求**先征得用户同意**，再用 `hotkey({pid, keys:["alt","f4"]})`，而不是 `taskkill /F`。

### 场景 D：精确窗口排布（多屏 / 并排对照）

```powershell
# 把 A 放左半屏
'{"pid":1111,"window_id":222233,"x":0,"y":0,"width":1280,"height":1392}' | & cua-driver call set_window_frame
# 把 B 放右半屏
'{"pid":4444,"window_id":555566,"x":1280,"y":0,"width":1280,"height":1392}' | & cua-driver call set_window_frame
```

`set_window_frame` 走窗口管理器并做几何读回，只有确认后才回 `confirmed`。**若结果不是 `confirmed`，先 `list_windows` 复查再继续**，别假设成功。

### 场景 E：网页内容（Chromium / Edge / Electron）

浏览器**外壳**（地址栏、权限弹窗、下载框、文件选择器）仍是原生窗口，用第 6 节的 AX/PX 阶梯；**页面内容**要切到类型化浏览器循环，且必须先读 `BROWSER.md`：

```text
start_session(session?)
list_windows / launch_app                       # 拿到原生 (pid, window_id)
get_browser_state(pid, window_id, session?)     # ① 绑定
get_browser_state(target_id, tab_id, session?, snapshot_format=semantic_v2)   # ② 快照
browser_navigate / browser_click / browser_type / browser_pointer
browser_dialog / browser_set_input_files / browser_download
get_browser_state(... snapshot_format=semantic_v2)   # ③ 校验并刷新引用
end_session(session?)
```

铁律：**绝不拿裸 CDP target id、tab 序号、URL 匹配或记忆中的 ref 去替代 `get_browser_state` 返回的能力句柄**；tab id 与 ref 都是 session 作用域，过期引用必须重新快照。

把页面内容精确复制到剪贴板时，不必模拟选中动作——从新的语义快照读值，再 `clipboard_write` 写入、`clipboard_read` 校验。这条路径是后台安全的，也不需要可点击 ref。

### 场景 F：整屏绝对坐标（跨窗口、目标无无障碍树）

```text
get_desktop_state()
  → click / scroll / drag / move_cursor / type_text / press_key / hotkey
    统一传 scope:"desktop"，坐标取自刚返回的整屏图像
  → get_desktop_state()   # 复核
```

在有效的桌面作用域下，这些工具**省略 `pid`/`window_id`**，坐标是**屏幕绝对像素**，且必须来自**最近一次** `get_desktop_state` 的那张图。

反过来注意：**窗口作用域的键盘/文本原语必须带 `pid`**；只有严格/有效的 desktop session 才能省略 `pid`，而且它会把键盘输入**有意**投递给当前前台应用。

### 场景 G：多个 agent 并行操作

`SKILL.md` 对并发的说明很具体，两个坑：

1. **`launch_app` 是幂等的**——两次运行启动同一个应用会拿到**同一个实例**（Calculator 这类单实例应用甚至是同一个窗口），互相覆盖。
2. **不同 session 只隔离光标，不隔离连接**。共用一个 `cua-driver mcp`（stdio）连接的子 agent，其工具调用会被传输层**串行化**（排队而非并行）。

正确姿势：每个并行 agent 给**独立连接**（各自一个 `cua-driver mcp` 进程，或各指向独立端点），并且 `launch_app` 传 `creates_new_application_instance: true` 拿自己的窗口。元素缓存按 `(pid, window_id)` 键控、光标按私有生命周期 session 键控，因此实例与传输各自独立即可互不干扰。

配合 `session` 标签更好排查（**传一次不粘**，每个接受该参数的调用都要重复传；未命名调用会用传输层的隐式 session）：

```powershell
'{"aumid":"Microsoft.WindowsCalculator_8wekyb3d8bbwe!App","session":"calc-A","creates_new_application_instance":true}' | & cua-driver call launch_app
```

会话在传输关闭、显式 `end_session`、或**空闲 5 分钟 TTL** 后回收。

### 场景 H：录制轨迹做演示 / 回归 / 训练数据

```powershell
cua-driver recording start D:\cua-trajectories\run-1
#   … 跑完整流程 …
cua-driver recording status
cua-driver recording stop
cua-driver recording render      # 渲染成可视产物
```

机制：`start_recording` 打开 session 作用域的轨迹记录器，此后每个**动作类**工具（`click`/`right_click`/`scroll`/`type_text`/`press_key`/`hotkey`/`set_value`）都在输出目录下写一个编号 turn 文件夹；**只读工具不记录**。默认**同时录视频**到 `<output_dir>\recording.mp4`（H.264 / 30fps），`stop_recording` 时封装完成；不需要视频就传 `record_video: false`。

**Windows 的视频依赖 ffmpeg 子进程（`gdigrab`）**：

```powershell
winget install Gyan.FFmpeg
```

ffmpeg 不在 PATH 时，**逐 turn 的状态捕获照常进行，只是没有视频**，`last_error` 里带安装提示；而 ffmpeg 启动本身失败会快速失败并附带 stderr 尾部。录制只在用户明确要求时开启，官方技能不会自动启用。

### 场景 I：Python 脚本编排（确定性流程，不需要模型）

应用侧可以直接把 Driver 当 SDK 用（wheel 内置 UniFFI 绑定 + 平台原生库 + `cua-driver` 可执行文件）：

```bash
pip install cua-driver
```

```python
import asyncio
from cua_driver import (
    CuaDriver, CursorReducedMotion, EndSessionInput,
    GetDesktopStateInput, SetAgentCursorThemeInput, StartSessionInput,
)

async def main() -> None:
    driver = CuaDriver.create()          # 在导入它的进程内加载 runtime
    await driver.start_session(StartSessionInput(session="demo", capture_scope=None, cursor_theme=None))
    try:
        await driver.set_agent_cursor_theme(SetAgentCursorThemeInput(
            session="demo", theme_id="cua.default", reduced_motion=CursorReducedMotion.AUTO))
        desktop = await driver.get_desktop_state(GetDesktopStateInput(session="demo", screenshot_out_file=None))
        print(desktop.images[0].mime_type)
    finally:
        await driver.end_session(EndSessionInput(session="demo"))
        await driver.shutdown()

asyncio.run(main())
```

选型边界（官方写得很清楚）：**SDK 是给客户端应用用的，不是给 agent 用的**——它不含语言原生 MCP facade，也没有 `/sdk`、`/mcp`、`/native` 后缀；`CuaDriver.create()` 在宿主进程内加载 runtime，因此**不需要 daemon**。给 agent 用请一律走 `cua-driver mcp`。TypeScript 侧对应 `@trycua/cua-driver`。已被移除的预发布 facade（`CuaDriver.stdio()`、`AsyncCuaDriver`、`*Args`、transport 类）不要再找。

### 场景 J：无人值守 / CI

组合上面几条，Windows 上的无人值守要点是：

```powershell
# 机器登录 → autostart 任务（RunLevel=Highest, LogonType=Interactive）自动起 daemon
cua-driver autostart status
cua-driver doctor
# 一次性操作走 daemon；需要服务多个客户端时显式选管道端点
'{"name":"msedge","urls":["http://localhost:8080"]}' | & cua-driver call launch_app
```

CI/容器里若不希望注册计划任务，安装时传 `-NoAutoStart`；远程驱动则记住 4.4 的 Session 0 规则。评测类需求（造任务、跑 agent、算 reward）用 `cua-bench`：

```bash
uv tool install 'cua-bench[browser]'
uv tool run --from 'cua-bench[browser]' playwright install chromium
```

要求 Python 3.12 或 3.13 且已装 `uv`；它的最小任务示例不需要 VM、Docker 或模型 API key。

---

## 9. 报错对照表

| 错误 | 含义 | 处置 |
| --- | --- | --- |
| `No cached AX state for pid X window_id W` | 本轮跳过了 `get_window_state`，或者点击用的 `window_id` 与快照时不是同一个 | 先对**同一个** `window_id` 调 `get_window_state` |
| `snapshot_id_required` / `stale_element_token` | 传了裸序号，或已被更新的快照取代 | 重跑 `get_window_state`，改用新 `element_token`，或让 `element_index` 配上它的 `snapshot_id` |
| `window_id W belongs to pid P, not …` | 传了别的进程拥有的 window_id | 用 `list_windows({pid: X})` 枚举该 pid 自己的窗口 |
| `background_unavailable` | 该点被遮挡，或事件类型不支持后台注入，而当前是 `background` 模式 | **不要**盲目改成 `foreground`；先重新定位（换 AX token、换窗口、或 `set_window_frame`） |
| UWP/计算器控件树只有约 1 个元素 | daemon 以 Medium IL 运行，跨 AppContainer 的 UIA 被截断 | 用默认方式注册 `RunLevel=Highest` 的 `cua-driver-serve` 任务 |
| 远程/SSH 下全部工具静默返回空或超时 | 落在 Session 0 | 见 4.4，`schtasks /Run /TN cua-driver-serve` + `--socket \\.\pipe\cua-driver` |
| 首次运行被 SmartScreen 拦 | 未签名二进制首次执行 | 「更多信息 → 仍要运行」一次 |

---

## 10. 安全与权限模式

- **权限模式在启动时固定，属于持有 runtime 的那个进程**。运行中的 daemon 必须重启才能换模式：`cua-driver serve` 用命令行 flag；`cua-driver mcp` 和嵌入式宿主用环境变量 `CUA_DRIVER_PERMISSION_MODE`、`CUA_DRIVER_CAPABILITY_MANIFEST_FILE`、`CUA_DRIVER_CAPABILITY_MANIFEST_APPROVED`。

| 模式 | 含义 |
| --- | --- |
| `standard` | 常规自动化的默认，无逐次弹窗 |
| `bounded` | 只允许经审查清单里的工具和资源 |
| `unrestricted` | 必须显式带 `--dangerously-bypass-approvals` |

- **挂接已登录的 Chromium 配置文件必须显式授权**：`cua-driver mcp --grant existing-profile`（或宿主实现 `DriverAuthorizationHost`，或 bounded 清单里声明 `kind: existing_profile`）。Driver 自己不渲染授权弹窗。
- `cua-driver revoke` 用于撤销授权；遥测用 `cua-driver telemetry enable|disable|status|reset-id|inspect` 管理。
- **破坏性动作**（删文件、关未保存文档、发消息、提交表单）在没有用户明确同意前不要执行——这条是官方技能文档的红线，写自动化时应当成硬约束。
- **Computer History（macOS nightly 预览，Windows 暂不适用）**：可选的本地加密操作历史，只存严格的元数据白名单，**从不**保存截图、输入文本、剪贴板内容、原始参数/结果、无障碍树、路径、窗口标题或 URL；通过 `history_status` / `history_query` 做只读回放。只有当两个工具都被 advertise、且用户要求"继续/回忆上次操作"时才用，且返回的元数据只能当线索、必须回到当前状态核实。

---

## 11. 一句话总结

Windows 上落地 Cua 的正确顺序是：**`install.ps1` 一行装（接受那一次 UAC 以便驱动 UWP）→ `autostart status` + `doctor` 自检 → `cua-driver call` 跑通「计算器 6×7」闭环 → 再决定接 MCP（给 agent）还是用 Python SDK（给应用）**。真正决定成败的是两条纪律：**永远 snapshot→act→verify，永远先用 `delivery_mode:"background"` 和Accessibility 路径**，把 `Start-Process`、`taskkill`、`SendInput`、AutoHotkey 这类老习惯全部换成 Driver 的工具。

---

## 参考资料

- 仓库：<https://github.com/trycua/cua>（MIT）
- Driver 源码文档：<https://github.com/trycua/cua/tree/main/libs/cua-driver>
- 官方文档：<https://cua.ai/docs/cua-driver>
- Drive your first app：<https://cua.ai/docs/tutorials/drive-your-first-app>
- 安装指南：<https://cua.ai/docs/how-to-guides/driver/install>
- CLI 参考：<https://cua.ai/docs/reference/cua-driver/cli-reference>
- MCP 工具参考：<https://cua.ai/docs/reference/cua-driver/mcp-tools>
- 平台支持边界：<https://cua.ai/docs/reference/cua-driver/platform-support>
- 权限模式：<https://cua.ai/docs/reference/cua-driver/permission-modes>
- 连接你的 agent：<https://cua.ai/docs/how-to-guides/driver/connect-your-agent>

> 本文技术内容截至 2026-09-20，对应 Cua Driver 0.28.x。该项目的 CLI 与文档迭代很快，**装好后请以 `cua-driver list-tools` / `cua-driver describe <tool>` 的本机输出为准**。
