# jira-link

For the **Code tab of Claude Desktop**: `/jira` links Jira tickets to the session, lists them in a **Jira Tickets** pane, and shows them in the status line. Current version: **1.0.0**.

> Unofficial fan project. Not affiliated with or endorsed by Anthropic or Atlassian.

## What it does

- **`/jira show`** opens the **Jira Tickets** pane: one row per linked ticket, newest first, with a button to remove it and one to clear them all. Where no pane is drawn, it replies with the list as text instead.
- **`/jira`** on its own lists the linked tickets as text.
- **`/jira link <KEY|URL>`** links a ticket by key (`FF-1`) or by a Jira URL. **`/jira KEY`** is an alias.
- **`/jira unlink <KEY>`** removes one ticket; **`/jira clear`** removes all of them.
- **Auto-link**: Jira keys, and `/browse/KEY` or `selectedIssue=KEY` URLs, found in the prompts **you** submit are linked and a toast says so. Model output and tool output are never scanned.
- Auto-link ignores code spans and code blocks, lowercase or odd forms, numbers with a leading zero (`FF-01`), and common non-ticket prefixes (`UTF`, `SHA`, `MD`, `HTTP`, `HTTPS`, `TLS`, `SSL`, `ISO`, `AES`, `RSA`, `IPV`, `RFC`, `CVE`). `/jira link` is explicit, so it only takes a well-formed key or URL.
- The status line reads `Jira: FF-1, FF-2 +N`: the first three tickets, then how many more.
- Up to 20 tickets are kept per session; past that the oldest drop off. The pane text is in Chinese only.

## Install

In a Code tab session in Claude Desktop:

```text
/plugin marketplace add Geek0x0/claude-desktop-mods
/plugin install jira-link@claude-desktop-mods
```

Then run `/reload-plugins` or start a new session.

## Requirements and known limits

- Pasted prose can mis-link: a stray `AB-12` in a log or a paragraph counts as a ticket. Remove it with `/jira unlink <KEY>`.
- It only records ticket keys. It never opens, fetches or checks them, so a key is not verified to exist.

## What it reads, stores and sends

**Reads**: the text of the prompts you submit, and the arguments of `/jira`. **Stores**: the list of linked ticket keys (at most 20) in the session state. **Sends**: nothing. It makes no network calls and no model calls, and never contacts Jira.

## Hooks and commands

- `session.start`: registers `/jira` and restores the status line.
- `command.run` for `/jira`, `/jira show`, `/jira link`, `/jira unlink` and `/jira clear`.
- `prompt.submit`: auto-links keys found in your prompt.
- `ui.render` for the pane.

## Source and license

[github.com/Geek0x0/claude-desktop-mods](https://github.com/Geek0x0/claude-desktop-mods) · MIT

---

## 中文

为 **Claude 桌面 App 的 Code 页** 做的 mod：`/jira` 把 Jira Ticket 关联到会话，在「Jira Tickets」面板里列出，并显示在状态栏。当前版本 **1.0.0**。

### 功能

- **`/jira show`** 打开「Jira Tickets」面板：每个已关联的 Ticket 一行，最新的在上，可单个移除或一键清空；没有面板可画的地方改为文字回复列表
- 单独输入 **`/jira`** 以文字列出已关联的 Ticket
- **`/jira link <KEY|URL>`** 按编号（`FF-1`）或 Jira 链接关联 Ticket；**`/jira KEY`** 是同样的简写
- **`/jira unlink <KEY>`** 移除一个；**`/jira clear`** 全部移除
- **自动关联**：**你**提交的提示词里的 Jira 编号，以及 `/browse/KEY`、`selectedIssue=KEY` 形式的链接，会被自动关联并弹出提示；模型输出和工具输出不会被扫描
- 自动关联会忽略代码片段和代码块、小写或奇怪的写法、带前导零的数字（`FF-01`），以及常见的非 Ticket 前缀（`UTF`、`SHA`、`MD`、`HTTP`、`HTTPS`、`TLS`、`SSL`、`ISO`、`AES`、`RSA`、`IPV`、`RFC`、`CVE`）；`/jira link` 是明确指定，只接受格式正确的编号或链接
- 状态栏显示 `Jira: FF-1, FF-2 +N`：前三个 Ticket，再加还有几个
- 每个会话最多保存 20 个 Ticket，超出后最早的被丢弃；面板文字只有中文

### 安装

在 Claude 桌面 App 的 Code 页会话里输入：

```text
/plugin marketplace add Geek0x0/claude-desktop-mods
/plugin install jira-link@claude-desktop-mods
```

然后输入 `/reload-plugins`，或者新开一个会话。

### 需要什么 / 已知限制

- 粘贴的大段文字可能误关联：日志或段落里一个 `AB-12` 也会被当成 Ticket。用 `/jira unlink <KEY>` 移除
- 只记录 Ticket 编号，不会打开、获取或核实，所以不保证该编号真实存在

### 读取、保存和发送什么

读取你提交的提示词文本和 `/jira` 的参数；在会话状态里保存已关联的 Ticket 编号（最多 20 个）；不发送任何东西。不联网、不调用模型，也从不连接 Jira。
