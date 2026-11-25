# remote-sessions

For the **Code tab of Claude Desktop**: `/remote-sessions` opens a side pane listing the sessions that have Remote Control on, and closes each one with a click. Current version: **1.0.0**.

> Unofficial fan project. Not affiliated with or endorsed by Anthropic.

## What it does

- **`/remote-sessions`** opens the **Remote Control** pane: one row per session with Remote Control on, the current session included and tagged 当前 (current). Each row shows the title, the working folder and a dot that is green while the session is running.
- **关闭** (close) on a row turns Remote Control off for that session. **↻ 刷新** refreshes by hand; while the pane is open it also refreshes every 30 seconds.
- **`/remote-sessions off`** turns Remote Control off for every session that has it on, the current one included. **`/remote-sessions off <keyword>`** only does it for sessions whose title contains the keyword (case-insensitive), then lists what happened to each.
- Errors from the session tools are shown in the pane or in the command reply. The UI text is in Chinese only.

## Install

In a Code tab session in Claude Desktop:

```text
/plugin marketplace add Geek0x0/claude-desktop-mods
/plugin install remote-sessions@claude-desktop-mods
```

Then run `/reload-plugins` or start a new session.

## Requirements and known limits

- Uses the desktop app's session-management tools (`ccd_session_mgmt`: `list_sessions`, `get_session`, `set_remote_control`); without them the pane shows the error.
- Only the 50 most recent sessions, plus the current one, are checked.

## What it reads, stores and sends

**Reads**: session id, title, working folder, running state and Remote Control state from `ccd_session_mgmt`. **Stores**: the last list, error, refresh time and the rows being closed, in the plugin's local state. **Changes**: only Remote Control, and only when you press 关闭 or run `/remote-sessions off`. It calls no network and no model.

## Hooks and commands

- `session.start`: registers `/remote-sessions`.
- `command.run` for `/remote-sessions` and `/remote-sessions off [keyword]`.
- `ui.render` for the pane.

## Source and license

[github.com/Geek0x0/claude-desktop-mods](https://github.com/Geek0x0/claude-desktop-mods) · MIT

---

## 中文

为 **Claude 桌面 App 的 Code 页** 做的 mod：`/remote-sessions` 打开侧边面板，列出开着 Remote Control 的会话，点一下就能关掉。当前版本 **1.0.0**。

### 功能

- **`/remote-sessions`** 打开「Remote Control」面板：每个开着 Remote Control 的会话一行，当前会话也在内并标「当前」。每行显示标题、工作目录和状态点，会话运行中时为绿色
- 点某行的「关闭」即关掉该会话的 Remote Control；「↻ 刷新」手动刷新，面板开着时每 30 秒自动刷新
- **`/remote-sessions off`** 关掉所有开着 Remote Control 的会话（包括当前会话）；**`/remote-sessions off <关键字>`** 只关标题包含关键字的会话（不分大小写），并逐个列出结果
- 会话工具报错时，错误显示在面板或命令回复里

### 安装

在 Claude 桌面 App 的 Code 页会话里输入：

```text
/plugin marketplace add Geek0x0/claude-desktop-mods
/plugin install remote-sessions@claude-desktop-mods
```

然后输入 `/reload-plugins`，或者新开一个会话。

### 需要什么 / 已知限制

- 依赖桌面 App 的会话管理工具（`ccd_session_mgmt`：`list_sessions`、`get_session`、`set_remote_control`），没有时面板显示错误
- 只检查最近 50 个会话和当前会话

### 读取、保存和改动什么

从 `ccd_session_mgmt` 读取会话的 id、标题、工作目录、运行状态和 Remote Control 状态；在插件本地状态里保存上次的列表、错误、刷新时间和正在关闭的行；只在你点「关闭」或运行 `/remote-sessions off` 时改动 Remote Control。自身不联网、不调用模型。
