# usage-pet

A usage band above the prompt in the **Code tab of Claude Desktop**: context, 5-hour limit, weekly limit and cache hit rate, plus an optional Fable weekly ring, with Clawd, a pixel pet who keeps you company while Claude works. Current version: **1.16.0**.

![Light mode shows the expanded band in chill mode with sunglasses and a crown, including a $ badge and “Cost $4.27 This session” after Cache hit, plus a collapsed editing strip showing “Cost $4.27”. Dark mode shows work with a terminal icon and purple dither, near-limit amber and red rings, and a collapsed idle Clawd wearing a nightcap; every band has the Cost block after Cache hit](https://raw.githubusercontent.com/Geek0x0/claude-desktop-mods/main/assets/usage-pet-preview.png)

![A grid of Clawd's looks, each shown expanded and collapsed: idle, working with a terminal icon, needs you (!), question (?), done, sleep, compacting, tests pass, tests fail, oops, tantrum, morning coffee, night cap, autumn, winter, Christmas and New Year](https://raw.githubusercontent.com/Geek0x0/claude-desktop-mods/main/assets/usage-pet-looks.png)

> Unofficial fan project. Not affiliated with or endorsed by Anthropic. Clawd is Anthropic's mascot; the pixel version here is fan-made.

## What it does

- **Four base rings**: context, 5-hour limit, weekly limit and cache hit rate (cumulative for the main conversation this session; subagents excluded), plus an optional fifth Fable weekly ring. Rings, labels and percentages are larger than in earlier versions. Hover for exact numbers. The context ring marks where auto-compaction kicks in (hidden when auto-compact is off); hover to see tokens left, or "compacting soon" at or past the mark. If a 5-hour, weekly or Fable weekly limit may run out before reset, hover to see when (hidden in the first 10% of a window); otherwise it shows time left.
- **Optional Fable weekly ring**: appears after Weekly when the account has that allowance, with percent used and reset time; it uses the same amber/red thresholds. Clawd sweats when any 5-hour, weekly or Fable limit reaches 90%. It appears only with an eligible first-party OAuth Claude subscription login. API keys, Bedrock/Vertex, gateways, no login or a failed request leave it hidden; a failed later refresh keeps the last good value.
- **Cache countdown**: hidden while Claude works; appears next to Cache hit after the first reply (about 1 hour on a subscription, 5 minutes on an API key). It turns amber in the last 5 minutes and says "cold" once expired.
- **Session cost**: shown after Cache hit as a $ badge and `Cost $… This session` when expanded, or `Cost $…` in the collapsed strip; also shown in the terminal and as a `/clawd-card` tile. It matches `/cost`'s API-equivalent total; subscription amounts are estimates, not bills. Hidden when the host reports no cost.
- **Clawd's activity and moods**: matching tool icons while Claude works, with a purple pixel dither across the band in dark mode; breathing, blinking and sleep after 10 idle minutes. Permission requests and plan approval (`ExitPlanMode`) show "!"; the mark clears when that tool finishes or is denied. `AskUserQuestion` shows "?". He reacts to test pass/fail, tool errors and frustration (three frustrated composer prompts in 20 minutes trigger a tantrum; `tantrums: off` disables it). Sunglasses require cache hit ≥90% and no limit at 90%+; hover him for hearts, click for a flip. While subagents run, a purple "×N" badge beside Clawd shows the count; hover Clawd to see each subagent's type and short description, with "99+" above 99 and no badge when none are running (desktop band only).
- **Tool icons**: Bash/PowerShell → terminal; Edit/Write/MultiEdit/NotebookEdit → pencil; Read/Grep/Glob → magnifier; WebFetch/WebSearch → globe; Agent/Task → bolt; MCP tools → mini icon; other tools → spinner.
- **Seasonal moods**: northern-hemisphere seasons; coffee 06:00–10:00, nightcap 22:00–06:00, Christmas Dec 20–26, New Year Dec 31–Jan 1. `seasonal: off` disables time-of-day, seasonal and holiday looks.
- **Last 7 days**: with the band expanded, hover Clawd for the tokens used in the last 7 days, all sessions together, subagents included; the report card shows it too. Counted by the plugin itself from 1.9.0 on.
- **Growth**: Clawd earns XP for every reply and levels up (sprout, bow tie, cap, crown). Hover for level, XP and streak, plus the last-7-days line while expanded. Achievements appear only on `/clawd-card`, and only those newly unlocked this session; no pop-ups, progress persists across sessions.
- **Report card**: `/clawd-card` draws a card of the session (duration, turns, tool calls, files edited, tokens, cache hit, cost when available, level, achievements unlocked this session) and saves it as a PNG you can paste anywhere.
- **Halloween** (Oct 25 to Nov 1): witch hat, pumpkin pail, ghost mode while Claude works, and trick-or-treat after each reply. Turn time-of-day, seasonal and holiday looks off by setting `seasonal` to `off` in `/config`.
- **Collapses out of the way**: stays collapsed as a 30px strip until you click ▲ or run `/clawd` to expand it; click ▼ or run `/clawd` again to collapse it.
- English and Chinese, light and dark appearance, macOS and Windows. The terminal shows context, 5-hour, weekly and optional Fable bars plus session cost when the host provides it, with no cache hit or Clawd; Remote Control, mobile and web show nothing.

## Install

In a Code tab session in Claude Desktop:

```text
/plugin marketplace add Geek0x0/claude-desktop-mods
/plugin install usage-pet@claude-desktop-mods
```

Then run `/reload-plugins` or start a new session.

## What it runs, stores and sends

**Network**: Claude Code's plugin API exposes only the 5-hour and weekly windows, so the plugin fetches Fable's separate weekly allowance itself from Anthropic's usage endpoint (`https://api.anthropic.com/api/oauth/usage`). It uses `$.session.authorize()` and `$.http.fetch`; Claude Code adds the credential on the host side, and the plugin never sees the token. Fetches happen at session start and after replies, at most once every five minutes per session. The only request is that GET; no prompts, replies or telemetry are sent. `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` or an organization web-fetch policy can block the request.

**Reads**: Claude Code's current-session context, rate limits and token counts, plus session cost from `session.usage()` and `session.measure` when the host provides a cost ledger; cost matches the API-equivalent total shown by `/cost`, and subscription amounts are estimates, not bills. It also reads Fable's weekly limit from Anthropic when an eligible first-party OAuth subscription login is available, and the `LANG`, `LANGUAGE`, `LC_ALL`, `LC_MESSAGES`, `OS`, `TEMP` and `TMP` environment variables (language, platform and temp folder only). Every submitted prompt is checked for a leading `/` after trimming whitespace to distinguish slash commands from turns; when `tantrums` is on, composer text is also checked locally for frustration. Prompt text is never stored, sent or changed; `tantrums: off` disables only the frustration check. `classic.PermissionRequest` is observed only to show "!" and is never answered or changed; `ExitPlanMode` also shows "!". `tool.call` reads Bash/PowerShell commands to spot test runs and result/exit-code data for test and error reactions. The plugin never reads or receives credentials; Claude Code supplies authorization to the usage request on the host side. While a session runs it counts tool calls and keeps edited file paths in memory for the report card; paths are never written to disk or shown on the card.

**Stores** (in the plugin's local store on your machine): Clawd's XP, level, streak and achievements, and token counts per session and hour for the "last 7 days" figure (four numbers per hour: uncached input, cache writes, cache reads, output; keyed by the session's id; a session's counts are deleted 8 days after its last turn). Recent frustration-hit timestamps are kept in process memory only for the 20-minute tantrum window. No prompt text, replies, tool output or file contents are stored.

**Runs**:

- Language detection when `language` is `auto`: `defaults read -g AppleLanguages` on macOS; on Windows: `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Sta -Command (Get-UICulture).Name`.
- `/clawd-card` on macOS: `/bin/sh` with Quick Look (`qlmanage`) and `sips` to turn the card SVG into a PNG in a temporary folder, `osascript` to put it on the clipboard. It saves the PNG to `~/Pictures/Clawd Reports` and moves cards beyond the newest 20 (only files named `Clawd-report-*.png` in that folder) to the Trash.
- `/clawd-card` on Windows runs `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Sta -File <plugin-root>\hooks\export-card.ps1 -Svg <svgPath> -Name <name> -Keep 20`. The script opens the local SVG in headless Edge, or Chrome if Edge is missing, takes a 1200×675 screenshot, copies it to the clipboard, saves it to `Pictures\Clawd Reports`, moves older matching cards to the Recycle Bin, and deletes temporary files.

## Hooks and commands

The mod is one hooks module, `hooks/register.tsx`. Its hooks on Claude Code's own events only watch them and pass them on unchanged; it answers only its own two commands and draws only its own band and pane:

- `session.start`: fetch Fable weekly usage (when eligible; throttled to once per five minutes), register `/clawd` and `/clawd-card`, detect the language, and read Clawd's progress from the local store. Release notes remain in the project's `hooks/changelog.ts` record and are not shown as a pop-up.
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

## Source and license

[github.com/Geek0x0/claude-desktop-mods](https://github.com/Geek0x0/claude-desktop-mods) · MIT

Some activity and reaction looks are inspired by [Revono/clawd-pet](https://github.com/Revono/clawd-pet) · MIT, redrawn for usage-pet's SVG grid and style.
