# usage-pet

A usage band above the prompt in the **Code tab of Claude Desktop**: context, 5-hour limit, weekly limit and cache hit rate on four animated rings, plus an optional fifth Fable weekly ring, with Clawd, a pixel pet who keeps you company while Claude works.

![usage-pet in light and dark mode](https://raw.githubusercontent.com/Geek0x0/claude-desktop-mods/main/assets/usage-pet-preview.png)

> Unofficial fan project. Not affiliated with or endorsed by Anthropic. Clawd is Anthropic's mascot; the pixel version here is fan-made.

## What it does

- **Four meters, one glance**: context window, 5-hour limit, weekly limit (with reset times) and cache hit rate. Hover a ring for exact numbers.
- **Optional Fable weekly ring**: appears after Weekly and shows the Fable model's separate weekly allowance, percent used and reset time. It uses the same amber/red thresholds as other limits, and Clawd sweats at 90%+. It appears only with a first-party OAuth Claude subscription login that has a Fable weekly limit. API keys, Bedrock/Vertex, gateways, no login or a failed request leave the band at four rings; if a later refresh fails, the last good value stays visible.
- **Cache countdown**: next to Cache hit, how long the prompt cache stays warm after the last reply (about 1 hour on a subscription, 5 minutes on an API key). It turns amber in the last 5 minutes and says "cold" once expired.
- **Clawd reacts**: he types on a tiny laptop while Claude works, sweats when a limit is above 90%, and puts on sunglasses when the cache hit rate is 90% or more. Hover him for hearts, click him for a flip.
- **Last 7 days**: with the band expanded, hover Clawd for the tokens used in the last 7 days, all sessions together, subagents included; the report card shows it too. Counted by the plugin itself from 1.9.0 on.
- **Growth**: Clawd earns XP for every reply, levels up (sprout, bow tie, cap, crown) and unlocks 8 achievements. Progress is kept across sessions.
- **Report card**: `/clawd-card` draws a card of the session (duration, turns, tool calls, files edited, tokens, cache hit, level) and saves it as a PNG you can paste anywhere.
- **Halloween** (Oct 25 to Nov 1): witch hat, pumpkin pail, ghost mode while Claude works, and trick-or-treat after each reply. Turn seasonal costumes off by setting `seasonal` to `off` in `/config`.
- **Collapses out of the way**: a 30px strip most of the time; expands for five seconds when the numbers change. `/clawd` or the ▲▼ button keeps it open.
- English and Chinese, light and dark appearance, macOS and Windows. The terminal shows the numbers only.

## Install

In a Code tab session in Claude Desktop:

```text
/plugin marketplace add Geek0x0/claude-desktop-mods
/plugin install usage-pet@claude-desktop-mods
```

Then run `/reload-plugins` or start a new session.

## What it runs, stores and sends

**Network**: Claude Code's plugin API exposes only the 5-hour and weekly windows, so the plugin fetches Fable's separate weekly allowance itself from Anthropic's usage endpoint (`https://api.anthropic.com/api/oauth/usage`). It uses `$.session.authorize()` and `$.http.fetch`; Claude Code adds the credential on the host side, and the plugin never sees the token. Fetches happen at session start and after replies, at most once every five minutes per session. The only request is that GET; no prompts, replies or telemetry are sent. `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` or an organization web-fetch policy can block the request.

**Reads**: Claude Code's own usage numbers for the current session (context size, rate limits, token counts) through the plugin API; Fable's weekly limit from Anthropic when an eligible first-party OAuth subscription login is available; and the `LANG`, `LANGUAGE`, `LC_ALL`, `LC_MESSAGES`, `OS`, `TEMP` and `TMP` environment variables (language, platform and temp folder only). The plugin never reads or receives credentials; Claude Code supplies the authorization to the request on the host side. While a session runs it counts tool calls and keeps the paths of files Claude edits, only in memory, to fill in the report card's "files edited" count. Paths are never written to disk or shown on the card.

**Stores** (in the plugin's local store on your machine): Clawd's XP, level, streak and achievements, the last release-notes version you have seen, and token counts per session and hour for the "last 7 days" figure (four numbers per hour: uncached input, cache writes, cache reads, output; keyed by the session's id; a session's counts are deleted 8 days after its last turn). No prompts, replies or file contents.

**Runs**:

- Language detection when `language` is `auto`: `defaults read -g AppleLanguages` on macOS, `powershell.exe -NoProfile -Command (Get-UICulture).Name` on Windows.
- `/clawd-card` on macOS: `/bin/sh` with Quick Look (`qlmanage`) and `sips` to turn the card SVG into a PNG in a temporary folder, `osascript` to put it on the clipboard. It saves the PNG to `~/Pictures/Clawd Reports` and moves cards beyond the newest 20 (only files named `Clawd-report-*.png` in that folder) to the Trash.
- `/clawd-card` on Windows: writes the card SVG to `%TEMP%`, then runs the bundled `hooks/export-card.ps1` with `powershell.exe -ExecutionPolicy Bypass` (so the script runs on machines whose policy blocks unsigned scripts). The script opens the local SVG file in headless Edge, or Chrome when Edge is missing, with its own temporary profile, takes a 1200×675 screenshot, puts it on the clipboard, saves it to `Pictures\Clawd Reports`, sends cards beyond the newest 20 (only `Clawd-report-*.png`) to the Recycle Bin, and deletes its temporary files.

## Hooks and commands

The mod is one hooks module, `hooks/register.tsx`. Its hooks on Claude Code's own events only watch them and pass them on unchanged; it answers only its own two commands and draws only its own band and pane:

- `session.start`: fetch Fable weekly usage (when eligible; throttled to once per five minutes), register `/clawd` and `/clawd-card`, detect the language, read Clawd's progress from the local store, and show the release notes toast once after an update. `session.attach` shows the toast if the window connects after the session starts.
- `session.measure` and `turn.complete`: read the usage numbers to redraw the band; refresh Fable weekly usage after replies (when eligible; throttled to once per five minutes); add XP after each reply of the main conversation (not subagents), add each turn's token counts (main conversation and subagents) to the hourly tally for the "last 7 days" figure, note when that reply finished for the cache countdown (kept for the session only), and start the Halloween candy animation in season.
- `tool.call`: counts tool calls and remembers which files Edit, Write, MultiEdit and NotebookEdit touched, for the report card. It always calls `next` with the call unchanged and never denies or answers a tool call.
- `command.run` for `/clawd` (toggle the band) and `/clawd-card` (open the card pane and export the PNG).
- `ui.render` for the band above the prompt and the card pane.

The plugin never runs slash commands or tools by itself, never calls a model, and never reads the conversation's text. Files ending in `.test.tsx` are tests for `claude plugin test`; Claude Code does not load them when the plugin runs.

## Settings

In `/config`: `language` (`auto`, `zh` or `en`; anything else means `auto`) and `seasonal` (`auto`, or `off` to skip holiday costumes).

## Source and license

[github.com/Geek0x0/claude-desktop-mods](https://github.com/Geek0x0/claude-desktop-mods) · MIT
