# zh-reply

For the **Code tab of Claude Desktop**: keeps Claude's conversational replies in Chinese, while everything written for other people or systems stays in English. Current version: **1.0.0**.

> Unofficial fan project. Not affiliated with or endorsed by Anthropic.

## What it does

- Adds a session-scope system-prompt section (`zh-reply:rule`) saying that replies to you must be in Chinese, including short acknowledgements and final summaries, even after long English tool output.
- On each prompt you submit, appends a short hidden Chinese reminder to the prompt context. Prompts that are not from you (peer, coordinator, observer and similar origins) are left untouched.
- Stays English: code, comments, commit messages, identifiers, commands, file paths, PR descriptions and comments, Jira tickets and comments, Slack messages and drafts, Teams messages.
- No commands and no settings.

## Install

In a Code tab session in Claude Desktop:

```text
/plugin marketplace add Geek0x0/claude-desktop-mods
/plugin install zh-reply@claude-desktop-mods
```

Then start a new session.

## Limits

- The system-prompt section only reaches a thread when a new prompt is composed, so `/reload-plugins` is not enough: start a new session after installing.
- It is a prompt-level nudge, not a hard guarantee; the model can still slip into English now and then.

## What it reads, stores and sends

**Reads**: the origin of each submitted prompt. **Stores**: nothing. **Sends**: nothing on its own; it calls no network and no model. The rule and the reminder are added to the normal prompt of the conversation.

## Hooks

- `prompt.compose`: appends the `zh-reply:rule` section (replacing any earlier copy of it).
- `prompt.submit`: appends the reminder to the prompt context unless the origin is peer-like.

## Source and license

[github.com/Geek0x0/claude-desktop-mods](https://github.com/Geek0x0/claude-desktop-mods) · MIT

---

## 中文

为 **Claude 桌面 App 的 Code 页** 做的 mod：让 Claude 对你的对话回复一律用中文，写给他人或系统的内容保持英文。当前版本 **1.0.0**。

### 功能

- 增加一段会话级系统提示（`zh-reply:rule`）：对你的回复必须用中文，包括简短确认和最终总结，即使前面有很长的英文工具输出
- 你每次提交提示时，在提示上下文里追加一条隐藏的中文提醒；来自 peer、coordinator、observer 等非本人来源的提示不改动
- 保持英文：代码、注释、提交信息、标识符、命令、文件路径、PR 描述和评论、Jira 工单和评论、Slack 消息和草稿、Teams 消息
- 没有命令，也没有设置项

### 安装

在 Claude 桌面 App 的 Code 页会话里输入：

```text
/plugin marketplace add Geek0x0/claude-desktop-mods
/plugin install zh-reply@claude-desktop-mods
```

然后新开一个会话。

### 限制

- 系统提示段只会在组合新提示时进入会话，所以 `/reload-plugins` 不够：装完请新开一个会话
- 这只是提示层面的约束，不是硬保证，模型偶尔仍可能说回英文

### 读取、保存和发送什么

只读取每条提交提示的来源；不保存任何内容；自身不联网、不调用模型。规则和提醒随对话的普通提示一起发送。
