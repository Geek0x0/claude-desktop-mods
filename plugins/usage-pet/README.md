# usage-pet

A usage band above the prompt in the **Code tab of Claude Desktop**: context, 5-hour limit, weekly limit and cache hit rate, plus an optional Fable weekly ring, with Clawd, a pixel pet who keeps you company while Claude works. Current version: **1.19.3**.

![Light mode shows the expanded band in chill mode with sunglasses and a crown, a small auto-compact tick on the Context ring, and the Cost block after Cache hit; a collapsed editing strip appears below. Dark mode shows work with a terminal icon, purple dither and a purple “×2” subagent badge, near-limit amber and red rings, and a collapsed idle Clawd wearing a nightcap](https://raw.githubusercontent.com/Geek0x0/claude-desktop-mods/main/assets/usage-pet-preview.png)

![A grid of Clawd's looks, each shown expanded and collapsed: idle, working with a terminal icon, needs you (!), question (?), done, sleep, compacting, tests pass, tests fail, oops, tantrum, morning coffee, night cap, autumn, winter, Christmas, New Year and subagents ×2 working with a terminal icon and a ×2 badge](https://raw.githubusercontent.com/Geek0x0/claude-desktop-mods/main/assets/usage-pet-looks.png)

> Unofficial fan project. Not affiliated with or endorsed by Anthropic. Clawd is Anthropic's mascot; the pixel version here is fan-made.

## What it does

- **Four base rings**: context, 5-hour limit, weekly limit and cache hit rate (cumulative for the main conversation this session; subagents excluded), plus an optional fifth Fable weekly ring. Rings, labels and percentages are larger than in earlier versions. Hover for exact numbers. The context ring marks where auto-compaction kicks in (hidden when auto-compact is off); hover to see tokens left, or "compacting soon" at or past the mark. If a 5-hour, weekly or Fable weekly limit may run out before reset, hover to see when (hidden in the first 10% of a window); otherwise it shows time left. Plans without a 5-hour limit (verified Ultra) don't show the 5-hour meter.
- **Optional Fable weekly ring**: appears after Weekly when the account has that allowance, with percent used and reset time; it uses the same amber/red thresholds. Clawd sweats when any 5-hour, weekly or Fable limit reaches 90%. It appears only with an eligible first-party OAuth Claude subscription login. API keys, Bedrock/Vertex, gateways, no login or a failed request leave it hidden; a failed later refresh keeps the last good value.
- **Cache countdown**: hidden while Claude works; appears next to Cache hit after the first reply (about 1 hour on a subscription, 5 minutes on an API key). It turns amber in the last 5 minutes and says "cold" once expired.
- **Session cost**: shown after Cache hit as a $ badge and `Cost $… This session` when expanded, or `Cost $…` in the collapsed strip; also shown in the terminal and as a `/clawd-card` tile. It matches `/cost`'s API-equivalent total; subscription amounts are estimates, not bills. Hidden when the host reports no cost.
- **Clawd's activity and moods**: matching tool icons while Claude works, with a purple pixel dither across the band in dark mode; run `/clawd-dither on|off` to control it. Breathing, blinking and sleep after 10 idle minutes. Permission requests and plan approval (`ExitPlanMode`) show "!"; the mark clears when that tool finishes or is denied. `AskUserQuestion` shows "?". He reacts to test pass/fail, tool errors and frustration (three frustrated composer prompts in 20 minutes trigger a tantrum; `tantrums: off` disables it). Sunglasses require cache hit ≥90% and no limit at 90%+; hover him for hearts, click for a flip. While subagents run, a purple "×N" badge beside Clawd shows the count; hover Clawd to see each subagent's type and short description, with "99+" above 99 and no badge when none are running (desktop band only).
- **Tool icons**: Bash/PowerShell → terminal; Edit/Write/MultiEdit/NotebookEdit → pencil; Read/Grep/Glob → magnifier; WebFetch/WebSearch → globe; Agent/Task → bolt; MCP tools → mini icon; other tools → spinner.
- **Seasonal moods**: northern-hemisphere seasons; coffee 06:00–10:00, nightcap 22:00–06:00, Christmas Dec 20–26, New Year Dec 31–Jan 1. `seasonal: off` disables time-of-day, seasonal and holiday looks.
- **Last 7 days**: with the band expanded, hover Clawd to see how many tokens you used in the last 7 days (the past 7×24 hours), all sessions together, subagents included; the report card shows it too. The plugin keeps its own hourly tally (Claude only reports the current session), so counting starts when you install 1.9.0, and until a full week has passed it says since when. Other sessions' counts are re-read at most once every five minutes; this session's turns count right away.
- **Growth**: Clawd earns 10 XP per turn (+5 at 90%+ cache hit, +20 for the first turn of the day), with a sprout at Lv.2, bow tie at Lv.3, cap at Lv.5 and crown at Lv.10. Hover for level, XP and streak, plus the last-7-days line while expanded. Of 8 achievements (Cache master, Night owl, Close call, Full week…), only those newly unlocked this session appear on `/clawd-card`; there are no pop-ups, and progress persists across sessions.
- **Report card**: `/clawd-card` makes a card of this session (duration, turns, tool calls, files edited, tokens, cache hit, cost when available, level, achievements unlocked this session), copies it to the clipboard and saves it to Pictures/Clawd Reports (keeps the latest 20; older ones go to the Trash), ready to paste into X (exported with Quick Look on macOS; on Windows with Edge, or Chrome, and older cards go to the Recycle Bin).
- **Halloween** (Oct 25 to Nov 1): Clawd wears a witch hat and carries a pumpkin pail; while Claude works he turns into a bedsheet ghost and candy floats up instead of code. After each turn he holds out his pail for **trick or treat**: click him once to give candy (he's happy for 3 seconds), twice for a flip, three times and he jumps for joy and throws candy. Ignore him for 12 seconds and he stomps in a huff until you click. Turn time-of-day, seasonal and holiday looks off with `seasonal: off` in `/config`.
- **Collapses out of the way**: stays collapsed as a 30px strip until you click ▲ or run `/clawd` to expand it; click ▼ or run `/clawd` again to collapse it. In very narrow windows, Cost, Fable weekly, Cache hit and then Weekly are hidden as needed; Context and 5-hour stay visible (Context and Weekly on plans without a 5-hour limit).
- English and Chinese, light and dark appearance, macOS and Windows. The terminal shows context, 5-hour, weekly and optional Fable bars plus session cost when the host provides it, with no cache hit or Clawd; Remote Control, mobile and web show nothing.

## Install

In a Code tab session in Claude Desktop:

```text
/plugin marketplace add Geek0x0/claude-desktop-mods
/plugin install usage-pet@claude-desktop-mods
```

Then run `/reload-plugins` or start a new session.

## Requirements and known issues

- The **Code tab of Claude Desktop**, light or dark appearance. The terminal shows context, 5-hour, weekly and optional Fable bars plus session cost when the host provides it, with no cache hit or Clawd; Remote Control, mobile and web show nothing
- Mods are on by default from Claude Code **2.1.287**; tested by the author on 2.1.286 (macOS); Windows is supported from 1.6.0
- On Windows, exporting the report card needs Windows PowerShell 5.1 (built in) and Edge or Chrome
- Desktop redraws every mod site on any state change ([anthropics/claude-code#99211](https://github.com/anthropics/claude-code/issues/99211)), which restarts animations and can make the ▲▼ button miss clicks; `/clawd` always works
- Where an organization manages Claude Code (a Team or Enterprise login, or a machine with managed settings), Claude Code does not run the `classic.*` and `session.compact` hooks of plugins you install, and `/plugin` shows a note saying so. There, permission requests show no "!", compaction has no look of its own, and after `/clear`, `/resume` or `/branch` the band starts from its defaults: the expanded state, dither and Clawd's level come back after the next reply, and a `language: auto` band stays in English until `/reload-plugins` (set `language` to `zh` or `en` to avoid that)

## What it runs, stores and sends

**Network**: Claude Code's plugin API exposes only the 5-hour and weekly windows, so the plugin fetches Fable's separate weekly allowance itself from Anthropic's usage endpoint (`https://api.anthropic.com/api/oauth/usage`). It uses `$.session.authorize()` and `$.http.fetch`; Claude Code adds the credential on the host side, and the plugin never sees the token. Fetches happen at session start, after `/clear`, `/resume` or `/branch`, and after replies, at most once every five minutes per session. The only request is that GET; no prompts, replies or telemetry are sent. `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` or an organization web-fetch policy can block the request.

**Reads**: Claude Code's current-session context, rate limits and token counts, plus session cost from `session.usage()` and `session.measure` when the host provides a cost ledger; cost matches the API-equivalent total shown by `/cost`, and subscription amounts are estimates, not bills. It also reads Fable's weekly limit from Anthropic when an eligible first-party OAuth subscription login is available, and the `LANG`, `LANGUAGE`, `LC_ALL`, `LC_MESSAGES`, `OS`, `TEMP` and `TMP` environment variables (language, platform and temp folder only). Every submitted prompt is checked for a leading `/` after trimming whitespace to distinguish slash commands from turns; when `tantrums` is on, composer text is also checked locally for frustration. Prompt text is never stored, sent or changed; `tantrums: off` disables only the frustration check. `classic.PermissionRequest` is observed only to show "!" and is never answered or changed; `ExitPlanMode` also shows "!". `tool.call` reads Bash/PowerShell commands to spot test runs and result/exit-code data for test and error reactions. The plugin never reads or receives credentials; Claude Code supplies authorization to the usage request on the host side. While a session runs it counts tool calls and keeps edited file paths in memory for the report card; paths are never written to disk or shown on the card.

**Stores** (in the plugin's local store on your machine): Clawd's XP, level, streak and achievements, whether your plan has no 5-hour limit (so a new session doesn't start with an empty ring), and token counts per session and hour for the "last 7 days" figure (four numbers per hour: uncached input, cache writes, cache reads, output; keyed by the session's id; a session's counts are deleted 8 days after its last turn). Recent frustration-hit timestamps are kept in process memory only for the 20-minute tantrum window. No prompt text, replies, tool output or file contents are stored.

**Runs**:

- Language detection when `language` is `auto`, at session start and again after `/clear`, `/resume` or `/branch`: `defaults read -g AppleLanguages` on macOS; on Windows: `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Sta -Command (Get-UICulture).Name`.
- `/clawd-card` on macOS: `/bin/sh` with Quick Look (`qlmanage`) and `sips` to turn the card SVG into a PNG in a temporary folder, `osascript` to put it on the clipboard. It saves the PNG to `~/Pictures/Clawd Reports` and moves cards beyond the newest 20 (only files named `Clawd-report-*.png` in that folder) to the Trash.
- `/clawd-card` on Windows runs `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Sta -File <plugin-root>\hooks\export-card.ps1 -Svg <svgPath> -Name <name> -Keep 20`. The script opens the local SVG in headless Edge, or Chrome if Edge is missing, takes a 1200×675 screenshot, copies it to the clipboard, saves it to `Pictures\Clawd Reports`, moves older matching cards to the Recycle Bin, and deletes temporary files.

## Hooks and commands

The mod is one hooks module, `hooks/register.tsx`. Its hooks on Claude Code's own events only watch them and pass them on unchanged; it answers only its own two commands and draws only its own band and pane:

- `session.start`: fetch Fable weekly usage (when eligible; throttled to once per five minutes), register `/clawd` and `/clawd-card`, detect the language, and read Clawd's progress from the local store. Release notes remain in the project's `hooks/changelog.ts` record and are not shown as a pop-up.
- `classic.SessionStart`, only after `/clear`, `/resume` or `/branch`: Claude Code resets the band's in-session state there without firing `session.start`, so the plugin repeats the `session.start` loading (Fable usage, language, Clawd's progress, saved choices, usage readings, last-7-days tally) without registering the commands again. It passes the event through unchanged.
- `session.measure` and `turn.complete`: read the usage numbers to redraw the band; refresh Fable weekly usage after replies (when eligible; throttled to once per five minutes); add XP after each reply of the main conversation (not subagents), add each turn's token counts (main conversation and subagents) to the hourly tally for the "last 7 days" figure, note when that reply finished for the cache countdown (kept for the session only), and start the Halloween candy animation in season.
- `classic.PermissionRequest`: shows "!" for permission requests and passes the request through unchanged; it never answers or changes it.
- `prompt.submit`: checks every prompt for a leading `/` after trimming whitespace; when `tantrums` is on, also checks composer text locally for frustration and keeps only hit timestamps in memory. It passes the prompt through unchanged.
- `tool.call`: shows the working look and tool icon; `AskUserQuestion` shows "?", `ExitPlanMode` shows "!". Clears a permission look when the requested tool finishes or is denied; counts non-denied calls and remembers edited paths. Reads Bash/PowerShell `command` to spot test runs and result/exit-code data for pass/fail and errors. It passes calls through unchanged and never denies them.
- `session.compact`: shows the compacting look for main-conversation compactions, not subagents or precompute, and passes the event through unchanged.
- `command.run` for `/clawd` (toggle the band) and `/clawd-card` (open the card pane and export the PNG).
- `ui.render` for the band above the prompt and the card pane.

The plugin never runs slash commands or tools by itself and never calls a model. It does not read conversation history; for tantrums, it checks submitted text locally for frustration only when `tantrums` is on. Files ending in `.test.tsx` are tests for `claude plugin test`; Claude Code does not load them when the plugin runs.

## Settings

In `/config`, `language` accepts lowercase `auto`, `zh` or `en`; anything else means `auto`. `seasonal` and `tantrums` are enabled by default: `off` (case-insensitive, surrounding spaces ignored) disables the corresponding looks or frustration check; any other value keeps it on.

## 中文

### 功能

- **四个基础用量环**：上下文、5 小时额度、每周额度、缓存命中率（仅主对话本会话，排除子代理）；圆环、标签和百分比比早期版本更大。80% 变琥珀色，95% 变红，缓存命中低于 50% 才提醒。上下文环标出自动压缩位置（关闭自动压缩时不显示），悬停可看距压缩还剩多少 tokens，已到位置时显示「即将压缩」；5 小时、每周和 Fable 每周额度若可能在重置前用完，悬停显示预计用完时间（窗口前 10% 不显示），否则显示剩余时间。没有 5 小时额度的套餐（已验证的 Ultra）不显示 5 小时额度
- **Fable 每周（可选第五环）**：有额度时显示在每周之后，沿用额度环的琥珀色 / 红色阈值。仅当符合条件的 Claude 订阅 OAuth 登录有 Fable 每周额度时显示；API 密钥、Bedrock/Vertex、网关、未登录或请求失败时不显示，刷新失败保留上次读数。插件在会话开始、`/clear`、`/resume`、`/branch` 之后和回复后自行 GET Anthropic 用量接口（`https://api.anthropic.com/api/oauth/usage`），最多每 5 分钟一次；宿主添加凭据，插件看不到令牌，也不发送提示词、回复或遥测。策略 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` 或组织网页请求限制可能会阻止获取
- **收起状态**：默认保持为 30px 的细条；点 ▲ 或运行 `/clawd` 展开，点 ▼ 或再次运行 `/clawd` 收起
- **展开时**：圆环依次扫入、数字像老虎机一样滚动、旁边飘出「+N%」
- **缓存倒计时**：Claude 工作时隐藏，首轮回复后才显示在缓存命中旁（订阅约 1 小时、API 密钥 5 分钟，每次回复重新计时），剩 5 分钟变色，过期显示「已过期」。缓存过期后下一轮要把整段对话重新写入缓存，更耗额度
- **本会话费用**：在 Cache hit 后显示；展开时有 `$` 徽章和「费用 $… 本会话」，收起时显示「费用 $…」。终端和 `/clawd-card` 也显示费用。金额与 `/cost` 的 API 等价总额一致；订阅金额是估算，不是账单；宿主未提供费用时隐藏
- **Clawd 的活动与心情**：工作时显示对应工具图标，深色模式下信息栏有紫色像素点阵；运行 `/clawd-dither on|off` 可控制点阵。空闲时呼吸、眨眼、张望；10 分钟无活动后睡觉。权限请求和计划批准（`ExitPlanMode`）显示「!」，对应工具完成或被拒绝后清除；`AskUserQuestion` 显示「?」。测试通过/失败、工具报错和烦躁也有专属反应（20 分钟内 3 次后跺脚，`tantrums: off` 关闭）。任何 5 小时、每周或 Fable 额度达到 90% 都会冒汗；仅当缓存命中 ≥90% 且没有额度达到 90% 才戴墨镜（点子来自 [@Joshua_WD](https://x.com/Joshua_WD)）。子代理运行时，Clawd 旁会显示紫色「×N」徽章，悬停可查看各子代理的类型和简述；超过 99 显示「99+」，无人运行时隐藏（仅桌面信息栏）。
- **工具图标**：Bash/PowerShell 是终端，Edit/Write/MultiEdit/NotebookEdit 是铅笔，Read/Grep/Glob 是放大镜，WebFetch/WebSearch 是地球，Agent/Task 是闪电，MCP 工具是小图标，其余是转圈图标
- **时段与季节装扮**：北半球季节；咖啡 06:00–10:00，夜帽 22:00–06:00，圣诞节 12 月 20–26 日，新年 12 月 31 日至 1 月 1 日。`seasonal: off` 关闭这些装扮
- **隐私**：只读取 Claude Code 本会话的用量与费用（费用与 `/cost` 的 API 等价总额一致；订阅费用是估算，不是账单）；只观察 `classic.PermissionRequest` 来显示「!」，从不替你回答或修改请求；计划批准（`ExitPlanMode`）也显示「!」。每条提交文本只检查去掉首尾空格后是否以 `/` 开头，以区分斜杠命令和对话；`tantrums` 开启时还会在 composer 本地检查烦躁词句。提示文本不保存、不发送、不改写；`tantrums: off` 只关闭烦躁检查。读取工具结果仅用于判断测试通过/失败和工具错误。
- **中英双语**：默认跟随系统语言（macOS 读系统首选语言，Windows 读显示语言）；`language` 只认小写 `auto` / `zh` / `en`，其他值按 `auto` 处理
- **配置**：`seasonal` 和 `tantrums` 填 `off`（不分大小写、忽略首尾空格）才会关闭；其他值保持开启
- **浅色 / 深色**：跟着 Claude App 的外观设置自动切换，背景始终透明
- **养成**：Claude 每答完一轮 Clawd 涨 10 点经验（缓存命中 ≥90% 再 +5，每天第一轮 +20）。Lv.2 长出小芽、Lv.3 戴红领结、Lv.5 戴帽子、Lv.10 戴皇冠。悬停可看等级、经验和连续天数；展开时也显示近 7 天用量。8 个成就中，缓存大师、夜猫子、极限操作、一周不停等只在 `/clawd-card` 列出本会话新解锁项，不弹出提示；数据跨会话保存
- **战报卡**：输入 `/clawd-card`，生成本次会话的战报（时长、回合、工具调用、改动文件、Tokens、缓存命中、费用、等级、本次解锁的成就），复制到剪贴板、存到「图片/Clawd Reports」（只留最近 20 张，更早的自动移进废纸篓），直接粘贴到 X（macOS 用系统自带的 Quick Look 导出；Windows 用系统自带的 Edge，没有 Edge 时用 Chrome，旧图移进回收站）
- **万圣节**（10 月 25 日到 11 月 1 日）：Clawd 戴巫师帽、拎南瓜桶；Claude 干活时披上床单变幽灵，旁边飘的代码换成糖果。每答完一轮他会举起桶**讨糖**：点他一下就是给糖（开心 3 秒），连点两下空翻、三下跳起来撒糖；12 秒没人理他就生气跺脚，点一下就消气。不想要时段、季节和节日装扮：`/config` 里把 `seasonal` 填成 `off`
- **鼠标**：放到 Clawd 身上会冒爱心，点它会空翻；放到圆环上显示详细数值
- **近 7 天用量**：信息栏展开时，鼠标放到 Clawd 身上显示最近 7 天（从现在往回 7×24 小时）用了多少 tokens，所有会话合计、含子代理；战报卡上也有这一行。插件自己按小时记账（Claude 只给当前会话的用量），所以从装上 1.9.0 起才开始记，不满 7 天时会写明从哪天开始；别的会话的用量最多每 5 分钟重读一次，本会话照常即时计入
- **切换**：信息栏默认保持收起为 30px 的细条，点右侧 ▲ 或运行 `/clawd` 展开；点 ▼ 或再次运行 `/clawd` 收起。窗口特别窄时，会依次隐藏费用、Fable 每周、缓存命中和每周额度；上下文与 5 小时额度始终保留（没有 5 小时额度的套餐保留上下文与每周额度）。

### 安装

在 Claude 桌面 App 的 Code 页会话里输入：

```text
/plugin marketplace add Geek0x0/claude-desktop-mods
/plugin install usage-pet@claude-desktop-mods
```

然后输入 `/reload-plugins`，或者新开一个会话。

### 需要什么 / 已知限制

- Claude 桌面 App 的 **Code 页**支持浅色和深色。终端显示上下文、5 小时、每周（和 Fable）进度条及宿主有提供时的本会话费用，没有缓存命中或 Clawd；Remote Control、手机和网页端不显示
- Claude Code **2.1.287 起**默认支持 mod；作者在 2.1.286（macOS）上实测，Windows 从 1.6.0 起支持
- Windows 导出战报图片要用 Windows PowerShell 5.1（系统自带）和 Edge 或 Chrome
- 桌面 App 目前有一个重画 bug（[anthropics/claude-code#99211](https://github.com/anthropics/claude-code/issues/99211)）：状态变化时动画会从头播；▲▼ 按钮偶尔点不动，可以用 `/clawd` 代替
- 由组织管理 Claude Code 的环境（Team / Enterprise 登录，或机器上有 managed settings）里，Claude Code 不会运行用户安装插件的 `classic.*` 和 `session.compact` 钩子，`/plugin` 里会有提示。这时权限请求不显示「!」，压缩没有专属动作；`/clear`、`/resume`、`/branch` 之后信息栏先回到默认状态：展开状态、点阵和等级在下一轮回复后恢复，`language` 为 `auto` 时会停在英文，直到 `/reload-plugins`（把 `language` 填成 `zh` 或 `en` 可避免）

## Source and license

[github.com/Geek0x0/claude-desktop-mods](https://github.com/Geek0x0/claude-desktop-mods) · MIT

Some activity and reaction looks are inspired by [Revono/clawd-pet](https://github.com/Revono/clawd-pet) · MIT, redrawn for usage-pet's SVG grid and style.
