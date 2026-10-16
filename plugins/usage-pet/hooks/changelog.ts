// 更新日志：最新的放最前面。每次发布改动，在这里加一条（中英各一份），只作版本记录，插件不再弹出提示。
// version 要和 plugin.json 的 version 一致；每次发布两处一起改，否则用户收不到更新。
import type { Lang } from './i18n'

export type Release = { version: string; notes: Record<Lang, string[]> }

export const CHANGELOG: Release[] = [
  {
    version: '1.14.0',
    notes: {
      zh: ['上下文环标出自动压缩位置，悬停可看剩余 tokens；5 小时、每周和 Fable 每周环会在额度可能先于重置用完时提示时间（窗口前 10% 不显示）'],
      en: ['The context ring marks where auto-compaction kicks in; hover to see tokens left. Hover the 5-hour, weekly and Fable weekly rings to see when a limit may run out before reset (hidden in the first 10% of a window)'],
    },
  },
  {
    version: '1.13.4',
    notes: {
      zh: ['修复：用量刷新出错不再影响插件；启动步骤各自独立，单步失败时信息栏和命令仍可正常显示'],
      en: ['Fix: usage refresh errors no longer affect the plugin; startup steps run independently, so one failure won’t leave the band blank or commands missing'],
    },
  },
  {
    version: '1.13.3',
    notes: {
      zh: ['修复：许可工具完成或被拒绝后及时清除感叹号；万圣节战报卡补齐配色；放松模式下睡眠和完成姿势不再眨眼；烦躁识别过滤代码和常见技术词；启动时不再等待系统语言检测'],
      en: ['Fixes: clear permission marks when a tool finishes or is denied; color Halloween report cards; keep chill sleep/done eyes still; filter code and common tech terms from tantrum detection; detect system language without blocking startup'],
    },
  },
  {
    version: '1.13.2',
    notes: {
      zh: ['修复：子代理连续调用工具时信息栏会闪烁；同一图标不再重复重画，工具结束后稍等再恢复'],
      en: ['Fix: the band flickered while subagents ran tools; the same icon no longer redraws, and the pose restores after a short delay'],
    },
  },
  {
    version: '1.13.1',
    notes: {
      zh: ['修复：Claude 干活时费用徽章里的 $ 被文字描边糊住'],
      en: ['Fix: the $ in the cost badge was smeared by the text outline while Claude works'],
    },
  },
  {
    version: '1.13.0',
    notes: {
      zh: ['新增本会话费用读数：与 /cost 显示的 API 等价费用一致；订阅用户看到的是估算，不是账单。'],
      en: ['Added session cost from the API-equivalent total shown by /cost; subscription amounts are estimates, not bills.'],
    },
  },
  {
    version: '1.12.2',
    notes: {
      zh: ['更流畅：每轮对话的重画从约 11 次减到约 8 次，动画不再被反复打断；信息栏图形体积减小约 30%，外观不变'],
      en: ['Smoother: about 8 band redraws per turn instead of 11, so animations restart less; the band SVG is about 30% smaller with no visible change'],
    },
  },
  {
    version: '1.12.1',
    notes: {
      zh: ['修复：Clawd 不再卡在“等你”或停不下来不睡觉；插件出错也不会挡住消息、权限和工具；浅色模式下的小图标看得清；测试、报错和烦躁反应少了误报'],
      en: ["Fixes: Clawd no longer gets stuck on needs-you or stays awake forever; plugin errors never block prompts, permissions or tools; small icons are visible in light mode; fewer false test, error and tantrum reactions"],
    },
  },
  {
    version: '1.12.0',
    notes: {
      zh: [
        'Claude 干活时 Clawd 会显示对应的工具像素图标；需要你、完成、睡眠和上下文压缩都有专属姿势',
        '测试通过会欢呼，测试失败或工具报错会显示失误表情；20 分钟内第三次烦躁提示会跺脚，可在 /config 把 tantrums 设为 off 关闭',
        '新增时段、季节与节日装扮：早晨咖啡、夜帽、季节天气、圣诞帽和新年派对帽',
        '不再弹出任何提示：更新说明、升级和成就都只记在 Clawd 悬停提示和战报卡里',
      ],
      en: [
        'Clawd now shows per-tool pixel icons while Claude works, with distinct looks for needs-you, done, sleep and compaction',
        'He celebrates passing tests and reacts to failed tests or tool errors; the third frustrated prompt in 20 minutes triggers a tantrum (turn it off with tantrums = off in /config)',
        'New time-of-day, seasonal and holiday looks: morning coffee, a nightcap, seasonal weather, a Santa hat and a New Year party hat',
        'No more pop-ups: release notes, level-ups and achievements now live only in the Clawd tooltip and the report card',
      ],
    },
  },
  {
    version: '1.11.0',
    notes: {
      zh: ['信息栏放大：圆环更大更粗，标签和百分比字号加大，Clawd 也长大了；收起的细条进度条加粗'],
      en: ['Bigger band: larger, thicker rings, bigger labels and percentages, a bigger Clawd, and thicker bars on the slim strip'],
    },
  },
  {
    version: '1.10.0',
    notes: {
      zh: ['Fable 模型每周额度：有 Fable 用量读数时，信息栏多显示一个每周额度圆环和重置时间', 'Claude 干活时，信息栏背后铺一层闪烁的紫色像素点阵（仅深色模式）'],
      en: ['Fable weekly limit: when usage is available, the band adds a ring with its reset time', 'While Claude works, a twinkling purple pixel dither fills the band (dark mode only)'],
    },
  },
  {
    version: '1.9.0',
    notes: {
      zh: ['近 7 天用了多少 tokens：信息栏展开时，鼠标放到 Clawd 身上就能看到（所有会话合计，含子代理）；/clawd-card 战报卡也多了这一行。从这个版本装上起开始记，不满 7 天时会写明从哪天开始'],
      en: ['Tokens used in the last 7 days: hover Clawd while the band is expanded (all sessions together, subagents included); the /clawd-card report shows it too. Counting starts with this version, and until a full week has passed it says since when'],
    },
  },
  {
    version: '1.8.0',
    notes: {
      zh: ['缓存倒计时：缓存命中旁边显示缓存还热多久（订阅约 1 小时、API 密钥 5 分钟，每次回复重新计时），剩 5 分钟变色，过期显示「已过期」——赶在过期前回复更省额度'],
      en: ['Cache countdown next to Cache hit: how long the cache stays warm (about 1 hour on a subscription, 5 minutes on an API key; every reply restarts it). It turns amber in the last 5 minutes and says "cold" once expired, so you can reply before it does'],
    },
  },
  {
    version: '1.7.0',
    notes: {
      zh: [
        '🎃 万圣节（10 月 25 日到 11 月 1 日）：Clawd 戴巫师帽、拎南瓜桶；Claude 干活时变幽灵，飘的是糖果',
        '每答完一轮 Clawd 会讨糖：点他一下给糖，连点三下跳起来；12 秒不理他会生气（/config 里 seasonal 选 off 可关）',
      ],
      en: [
        '🎃 Halloween (Oct 25 to Nov 1): Clawd wears a witch hat and carries a pumpkin pail; while Claude works he turns into a ghost and candy floats up',
        'After each turn Clawd asks for candy: click him to give some, click three times and he jumps for joy; ignore him for 12 seconds and he gets grumpy (turn off with seasonal = off in /config)',
      ],
    },
  },
  {
    version: '1.6.0',
    notes: {
      zh: [
        '支持 Windows：跟随 Windows 显示语言；/clawd-card 用系统自带的 Edge（没有就用 Chrome）导出图片，复制到剪贴板、存到「图片\\Clawd Reports」，旧的移进回收站；文字用 Segoe UI / 微软雅黑',
      ],
      en: [
        'Windows support: follows the Windows display language; /clawd-card exports the image with Edge (or Chrome), copies it to the clipboard and saves it to Pictures\\Clawd Reports, older cards go to the Recycle Bin; text uses Segoe UI / Microsoft YaHei',
      ],
    },
  },
  {
    version: '1.5.7',
    notes: {
      zh: ['移除「一键压缩」：桌面 App 里插件暂时不能触发压缩（官方接口限制），压缩请直接输入 /compact'],
      en: ['Removed one-click compact: plugins cannot trigger compaction in the desktop app yet (an engine limit). Use /compact'],
    },
  },
  {
    version: '1.4.6',
    notes: {
      zh: ['战报卡改存到「图片/Clawd Reports」，不再堆在桌面；只留最近 20 张，更早的自动移进废纸篓'],
      en: ['Report cards now go to Pictures/Clawd Reports instead of the Desktop; the latest 20 are kept and older ones move to the Trash'],
    },
  },
  {
    version: '1.4.5',
    notes: {
      zh: ['窗口变窄时信息栏跟着收：先去掉副标题，再把标题缩小放到圆环下面，最窄只留圆环；▼ 按钮始终在右边，不再掉到下一行'],
      en: ['Narrow windows: the band now adapts (drops subtitles, then tucks labels under the rings, then rings only) and the ▼ button stays on the right instead of wrapping'],
    },
  },
  {
    version: '1.4.4',
    notes: {
      zh: ['修复：鼠标放到圆环上换出的详情文字会压到分隔线、或被右边裁掉'],
      en: ['Fix: the details shown when hovering a meter could run into the divider or get cut off on the right'],
    },
  },
  {
    version: '1.4.3',
    notes: {
      zh: ['更新内容、升级、成就的提示停留时间加长到 1 分钟（App 允许的上限），鼠标放上去会停住，点一下就关'],
      en: ['Release notes, level-ups and achievements now stay for a full minute (the most the app allows); hover to hold, click to close'],
    },
  },
  {
    version: '1.4.1',
    notes: {
      zh: ['修复：重启 App 后更新提示可能一闪而过没人看到，现在等窗口连上再弹'],
      en: ["Fix: after restarting the app, the what's-new toast could fire before the window was there; it now waits for the window"],
    },
  },
  {
    version: '1.4.0',
    notes: {
      zh: ['Clawd 会成长了：每轮攒经验升级，解锁小芽、领结、棒球帽、皇冠，还有 8 个成就', '新命令 /clawd-card：生成本次会话的战报卡，复制到剪贴板、存到桌面，直接贴到 X'],
      en: ['Clawd grows: earn XP every turn, level up to unlock a sprout, a bow tie, a cap and a crown, plus 8 achievements', 'New /clawd-card: a report card of this session, copied to the clipboard and saved to the Desktop, ready to paste into X'],
    },
  },
  {
    version: '1.3.0',
    notes: {
      zh: ['支持浅色界面：跟着 Claude App 的外观设置走（浅色 / 深色 / 跟随系统），不用另外设置'],
      en: ['Light mode: follows the Claude app appearance (light, dark or match system), nothing to configure'],
    },
  },
  {
    version: '1.2.1',
    notes: {
      zh: ['墨镜不再全程戴着：时不时推到额头上眨眨眼；Claude 干活时把墨镜推到头顶专心敲代码'],
      en: ['Sunglasses come off now and then: Clawd pushes them up to blink, and wears them on his head while Claude works'],
    },
  },
  {
    version: '1.2.0',
    notes: {
      zh: ['新增英文界面：默认跟随系统语言，/config 里可以手动切换', '缓存命中 ≥90% 时 Clawd 戴上墨镜放松（点子来自 @Joshua_WD）'],
      en: ['English UI: follows your system language, switch it in /config', 'Chill mode: cache hit ≥ 90% and Clawd puts on sunglasses (idea by @Joshua_WD)'],
    },
  },
  {
    version: '1.1.0',
    notes: {
      zh: ['新增更新提示：插件更新后，第一次打开会弹出这次改了什么'],
      en: ["What's new: after an update, the first load shows what changed"],
    },
  },
  {
    version: '1.0.0',
    notes: {
      zh: ['四个圆环：上下文、5 小时、每周、缓存命中', '自动折叠成细条，数据刷新时展开 5 秒', '▲▼ 或 /clawd 切换一直展开'],
      en: ['Four meters: context, 5-hour, weekly, cache hit', 'Collapses to a slim strip, expands for 5 s on refresh', '▲▼ or /clawd keeps it expanded'],
    },
  },
]
