# doc-review

For the **Code tab of Claude Desktop**: after the main agent writes a [superpowers](https://github.com/obra/superpowers) spec or plan, it offers to have a read-only Fable subagent review it. Current version: **1.0.0**.

> Unofficial fan project. Not affiliated with or endorsed by Anthropic.

## What it does

- Watches `Write` and `Edit` calls that succeed on a Markdown file directly in `docs/superpowers/specs/` or `docs/superpowers/plans/` (not in subfolders).
- When a turn of the main conversation finishes (not a subagent turn, not an aborted one), it asks once: `派 Fable 子代理审核 <paths>？` with **审核** (review) and **跳过** (skip). Several docs written in one turn are offered in a single question; a file already offered this session is not offered again. The turn does not wait for the answer.
- **审核** submits a prompt asking Claude to dispatch a read-only subagent with the Agent tool and `model: "fable"`. The subagent looks for gaps, contradictions, ambiguity, unverifiable steps and scope creep and edits nothing; Claude relays its findings and waits for your decision before editing.
- **跳过**, or dismissing the question, does nothing.
- No commands and no settings. The question is in Chinese only.

## Install

In a Code tab session in Claude Desktop:

```text
/plugin marketplace add Geek0x0/claude-desktop-mods
/plugin install doc-review@claude-desktop-mods
```

Then run `/reload-plugins` or start a new session.

## Requirements

- Your account must be able to use the `fable` model for subagents; otherwise the review subagent fails.
- It only reacts to the `docs/superpowers/specs|plans/*.md` layout used by superpowers.

## What it reads, stores and sends

**Reads**: the `file_path` of `Write` and `Edit` calls, and whether the call succeeded. **Stores**: in the plugin's local state, the doc paths waiting to be offered and the paths already offered. **Sends**: nothing on its own; it calls no network and no model. A review happens only when you pick **审核**, as a normal prompt in the conversation.

## Hooks

- `tool.call` for `Write` / `Edit`: runs the call unchanged, then notes matching paths.
- `turn.complete`: on the main conversation, asks about the noted paths and, if you agree, submits the review prompt.

## Source and license

[github.com/Geek0x0/claude-desktop-mods](https://github.com/Geek0x0/claude-desktop-mods) · MIT

---

## 中文

为 **Claude 桌面 App 的 Code 页** 做的 mod：主代理写完 [superpowers](https://github.com/obra/superpowers) 的 spec 或 plan 后，提议派一个只读的 Fable 子代理审阅。当前版本 **1.0.0**。

### 功能

- 监听成功执行的 `Write` / `Edit`，只关注直接位于 `docs/superpowers/specs/` 或 `docs/superpowers/plans/` 中的 `.md` 文件（不含子目录）
- 主对话的一轮结束时（子代理的回合和被中断的回合不算）弹出一次「派 Fable 子代理审核 <路径>？」，选项为「审核」和「跳过」。同一轮写了多份文档会合并成一个问题；本会话问过的文件不再重复问。这一轮不会等你回答
- 选「审核」会提交一条提示，让 Claude 用 Agent 工具、`model: "fable"` 派一个只读子代理，检查遗漏、矛盾、歧义、无法验证的步骤和范围蔓延，不改任何文件；Claude 转述结论后等你决定，再动手修改
- 选「跳过」或关掉问题，什么都不做
- 没有命令，也没有设置项

### 安装

在 Claude 桌面 App 的 Code 页会话里输入：

```text
/plugin marketplace add Geek0x0/claude-desktop-mods
/plugin install doc-review@claude-desktop-mods
```

然后输入 `/reload-plugins`，或者新开一个会话。

### 需要什么

- 账号需要能给子代理使用 `fable` 模型，否则审阅子代理会失败
- 只认 superpowers 的 `docs/superpowers/specs|plans/*.md` 目录结构

### 读取、保存和发送什么

只读取 `Write` / `Edit` 的 `file_path` 以及调用是否成功；在插件本地状态里保存待询问和已询问过的文档路径；自身不联网、不调用模型。只有你选了「审核」，才会以一条普通提示在对话中发起审阅。
