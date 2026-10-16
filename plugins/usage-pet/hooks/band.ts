import type { Activity, Bars, ReactionKind, Snap, ToolIcon } from '../types'
import type { Mood } from './mood'
import { type Lang, T, weekday } from './i18n'
import { gearOf } from './pet'

// 桌面端整条（Clawd + 三个圆环）画成一张 SVG。动画全部是 SVG 内的 CSS 动画，浏览器在合成线程上按刷新率播放。
// 桌面端任何状态变化都会重画整条、动画从头播（anthropics/claude-code#99211），
// 所以「一次性」动画（圆环扫过、数字滚动、+N% 提示、Clawd 跳一下）只在 from ≠ to 时才写进去。

export const H = 80
// 收起后的细条高度：Clawd 10 格 × 3px，刚好容下本体；帽子等装扮可以稍微探出
export const H_MINI = 30

const U = 4.5 // Clawd 的一个像素 = 4.5px
const CLAWD_X = 22 // 左右留白都是这么宽
const CLAWD_W = 16 * U // Clawd 本体 16 格宽
const MINI_U = 3
const MINI_X = 14
const MINI_Y = (H_MINI - 10 * MINI_U) / 2
const MINI_W = 16 * MINI_U
const MINI_LAYOUT_W = MINI_W + 10 * MINI_U // 细条里 Clawd 最多向右跑 10 格
const ACTIVITY_ICON_X = 16.4
const ACTIVITY_ICON_Y = -1.5
const MINI_ACTIVITY_ICON_Y = 0.15
const ACTIVITY_ICON_SIZE = 7
const ACTIVITY_ICON_CELL = 0.75
// Expanded icon protrudes beyond the 16-unit Clawd box; mini also accounts for its 10-unit walk.
export const ACTIVITY_LAYOUT_RESERVE = Math.ceil((ACTIVITY_ICON_X + ACTIVITY_ICON_SIZE * ACTIVITY_ICON_CELL - 16) * U)
const MINI_ACTIVITY_RESERVE = Math.ceil(
  (10 + ACTIVITY_ICON_X + ACTIVITY_ICON_SIZE * ACTIVITY_ICON_CELL - MINI_LAYOUT_W / MINI_U) * MINI_U,
)
const MINI_BAR = 40
const CLAWD_Y = (H - 10 * U) / 2 + 4 // 身子仍比圆环中心低 4px
const R = 26
const RING_STROKE = 5
const RING_W = 2 * R + RING_STROKE + 1
const RING_LABEL_GAP = 7
const RING_CX_OFFSET = RING_W / 2
const RING_CY = H / 2
const STACKED_RING_CY = R + 5
const MINI_BAR_H = 6
const MINI_BAR_Y = (H_MINI - MINI_BAR_H) / 2
const MINI_TEXT_BASELINE = H_MINI / 2 + 4
const C = 2 * Math.PI * R
const NUM_SIZE = 12
const NUM_SMALL_SIZE = 10.4
const PCT_SIZE = 8.2
const DIG = 6.2 * (NUM_SIZE / 11)
const PCT_SLOT = 7 * (NUM_SIZE / 11)
const NUM_BASELINE = 3.8 * (NUM_SIZE / 11)
const NUM_CLIP_H = NUM_SIZE
const LINE = 14
const LAB_SIZE = 14
const SUB_SIZE = 12
const MINI_LABEL_SIZE = 13
const MINI_VALUE_SIZE = 13
const OUT = 'cubic-bezier(.23,1,.32,1)'
const SPRING = 'cubic-bezier(.34,1.56,.64,1)'

const ACTIVITY_PIXELS: Record<ToolIcon, string[]> = {
  terminal: ['.TTTTT.', 'TNNNNNT', 'TNWNNNT', 'TNNWNNT', 'TNWNNNT', 'TNNWWWT', '.TTTTT.'],
  pencil: ['......P', '.....PP', '....PYP', '...PYP.', '..PYP..', '.PYP...', 'YP.....'],
  magnifier: ['..GGG..', '.GBBBG.', 'GB...BG', 'GB...BG', '.GBBBG.', '..GGGG.', '.....G.'],
  globe: ['..BBB..', '.B...B.', 'B.G.G.B', 'B..G..B', 'B.G.G.B', '.B...B.', '..BBB..'],
  bolt: ['...Y...', '..YY...', '.YYYYY.', '...YY..', '..YY...', '.YY....', 'YY.....'],
  mini: ['.P...P.', '.P...P.', '.P...P.', '.PPPPP.', '..PPP..', '...P...', '...P...'],
  spinner: ['...W...', '..S.S..', '.S...S.', 'S.....S', 'S.....S', '.S...S.', '..S.S..'],
  bang: ['...R...', '...R...', '...R...', '...R...', '...R...', '.......', '...R...'],
  question: ['..AAA..', '.A...A.', '.....A.', '....A..', '...A...', '.......', '...A...'],
  check: ['......G', '.....G.', 'G...G..', '.G.G...', '..GG...', '.......', '.......'],
  cross: ['R.....R', '.R...R.', '..R.R..', '...R...', '..R.R..', '.R...R.', 'R.....R'],
}

const ACTIVITY_COLORS: Record<string, string> = {
  T: '#83CFA7',
  N: '#3C3A35',
  W: '#F0EEE6',
  P: '#E98D6E',
  Y: '#F2C14E',
  G: '#91BDA2',
  B: '#69A9D0',
  S: '#F0EEE6',
  R: '#E5484D',
  A: '#F2C14E',
}

const SLEEP_Z_PIXELS = ['ZZZZ', '...Z', '..Z.', '.Z..', 'ZZZZ']

function activityIconSvg(icon: ToolIcon, mini: boolean): string {
  const pixels = ACTIVITY_PIXELS[icon]
    .map((row, y) =>
      [...row]
        .map((color, x) =>
          color === '.'
            ? ''
            : `<rect x="${x}" y="${y}" width=".92" height=".92" class="activity-pixel pixel-${color.toLowerCase()}"/>`,
        )
        .join(''),
    )
    .join('')
  const spinner = icon === 'spinner' ? '<g class="activity-spinner">' + pixels + '</g>' : pixels

  return `<g class="activity-icon ${icon}" transform="translate(${ACTIVITY_ICON_X} ${mini ? MINI_ACTIVITY_ICON_Y : ACTIVITY_ICON_Y}) scale(${ACTIVITY_ICON_CELL})">${spinner}</g>`
}

function sleepZSvg(mini: boolean): string {
  const pixels = SLEEP_Z_PIXELS.map((row, y) =>
    [...row].map((cell, x) => (cell === 'Z' ? `<rect x="${x}" y="${y}" width=".9" height=".9" class="sleep-z-pixel"/>` : '')).join(''),
  ).join('')
  const positions: [number, number][] = mini ? [[13.4, 0.25], [15.7, 1.25]] : [[13.4, -2.2], [15.7, -3.5]]

  return positions
    .map(
      ([x, y], i) =>
        `<g transform="translate(${x} ${y}) scale(.35)"><g class="sleep-z" style="animation-delay:${i * 0.45}s">${pixels}</g></g>`,
    )
    .join('')
}

function doneSparklesSvg(mini: boolean): string {
  const sparkle = `<rect x="1" y="0" width="1" height="3" class="done-sparkle-pixel"/><rect x="0" y="1" width="3" height="1" class="done-sparkle-pixel"/>`
  const positions: [number, number, number][] = mini
    ? [
        [1.2, 0.2, 0.45],
        [13.8, 0.4, 0.5],
        [15.2, 2, 0.4],
      ]
    : [
        [1.2, -1.6, 0.55],
        [13.4, -2.1, 0.45],
        [14.8, 1.4, 0.4],
      ]

  return positions
    .map(
      ([x, y, scale], i) =>
        `<g transform="translate(${x} ${y}) scale(${scale})"><g class="done-sparkle" style="animation-delay:${i * 0.18}s">${sparkle}</g></g>`,
    )
    .join('')
}

function reactionFaceSvg(reaction?: ReactionKind): string {
  if (reaction === 'test-fail' || reaction === 'oops') {
    return `<g class="reaction-x-eyes" fill="none" stroke="#231511" stroke-width=".65" stroke-linecap="square"><path d="M3.6 1.9 5.1 3.4M5.1 1.9 3.6 3.4M10.9 1.9 12.4 3.4M12.4 1.9 10.9 3.4"/></g>`
  }
  if (reaction === 'tantrum') {
    return `<g class="angry-eyes" fill="none" stroke="#231511" stroke-width=".65" stroke-linecap="square"><path d="M3.4 1.6 5.2 2.1M10.8 2.1 12.6 1.6M4 3.2h1.2M10.8 3.2H12"/></g>`
  }

  return ''
}

function reactionEffectsSvg(reaction: ReactionKind | undefined): string {
  if (reaction === 'test-pass') {
    const pieces: [number, number, string][] = [[0.3, 4.8, '#E5484D'], [1.1, 1.2, '#69A9D0'], [14.5, 2.8, '#F2C14E'], [15.3, 6.2, '#91BDA2'], [7.7, 0.6, '#9B6BDF']]
    const reactionColor = (color: string) =>
      color === '#69A9D0' ? 'class="reaction-pixel-blue"' :
        color === '#F2C14E' ? 'class="reaction-pixel-gold"' :
          color === '#91BDA2' ? 'class="reaction-pixel-green"' : `fill="${color}"`

    return `<g class="reaction-confetti">${pieces
      .map(
        ([x, y, color], i) =>
          `<g class="confetti-piece" style="animation-delay:${i * 0.12}s"><rect x="${x}" y="${y}" width=".8" height="1.2" ${reactionColor(color)}/></g>`,
      )
      .join('')}</g>`
  }
  if (reaction === 'tantrum') {
    const puff =
      `<rect x="1" y="1" width="2" height="1" class="steam-pixel-mid"/><rect x=".5" y="2" width="3" height="1" class="steam-pixel-dark"/>` +
      `<rect x="1.5" y="0" width="1" height="1" class="steam-pixel-light"/>`

    return `<g class="tantrum-steam"><g transform="translate(.1 .1) scale(.65)">${puff}</g><g transform="translate(13.9 .1) scale(.65)">${puff}</g></g>`
  }

  return ''
}

function moodForClawd(isWorking: boolean, activity: Activity | undefined, pet?: PetView): Mood | undefined {
  const pose = activity?.kind
  if (isWorking || (pose !== undefined && pose !== 'idle' && pose !== 'sleep')) return undefined

  return pet?.mood
}

function moodEffectsSvg(mood: Mood | undefined, mini: boolean): string {
  if (!mood) return ''

  const moodColorAttr = (color: string) => {
    const colorClasses: Record<string, string> = {
      '#F7909F': 'mood-petal-pink',
      '#F2C14E': 'mood-gold',
      '#D97757': 'mood-autumn-coral',
      '#E7A44C': 'mood-autumn-amber',
      '#C2603F': 'mood-autumn-russet',
      '#69A9D0': 'mood-blue',
      '#E98D6E': 'mood-coral',
    }
    const className = colorClasses[color]

    return className ? `class="${className}"` : `fill="${color}"`
  }

  const coffee = mood.timeOfDay === 'morning'
    ? `<g class="mood-coffee" transform="translate(14.2 4.5)"><rect x="0" y=".7" width="2.4" height="2.2" class="mood-coffee-cup"/><rect x=".3" y="1" width="1.8" height=".5" fill="#6B4226"/><path d="M2.4 1.1h.6v1.2h-.6" class="mood-coffee-handle" fill="none" stroke-width=".35"/><path class="mood-steam" d="M.6.4Q0-.2.6-.7M1.6.4Q1-.2 1.6-.7" fill="none" stroke-width=".28"/></g>`
    : ''
  if (mini) return coffee

  const particles: [number, number, string][] =
    mood.season === 'winter'
      ? [[.4, 1.2, '#F4F2EC'], [15.2, 2.8, '#DDE8F2'], [1.1, 6.7, '#F4F2EC']]
      : mood.season === 'spring'
        ? [[.4, 1.2, '#F7909F'], [15.2, 2.8, '#F2C14E'], [1.1, 6.7, '#F7909F']]
        : mood.season === 'autumn'
          ? [[.4, 1.2, '#D97757'], [15.2, 2.8, '#E7A44C'], [1.1, 6.7, '#C2603F']]
          : []
  const seasonParticles = particles.length
    ? `<g class="mood-particles ${mood.season}">${particles
      .map(
        ([x, y, color], i) =>
          `<g transform="translate(${x} ${y})"><g class="mood-particle" style="animation-delay:${i * 2.1}s">${
            mood.season === 'winter'
              ? `<rect x=".3" y="0" width=".25" height="1" class="mood-snow-${color === '#F4F2EC' ? 'bright' : 'cool'}"/><rect x="0" y=".3" width=".85" height=".25" class="mood-snow-${color === '#F4F2EC' ? 'bright' : 'cool'}"/>`
              : mood.season === 'spring'
                ? `<path d="M.45 0Q1 .4.45.9Q-.1.4.45 0Z" ${moodColorAttr(color)}/>`
                : `<path d="M.05.55Q.3-.1.95.08.82.75.22.95Z" ${moodColorAttr(color)}/><path d="M.18.82.78.2" stroke="#754A34" stroke-width=".1"/>`
          }</g></g>`,
      )
      .join('')}</g>`
    : mood.season === 'summer'
      ? `<g class="mood-sun" transform="translate(14.1 .4)"><rect x="1" y="0" width="1" height="3" class="mood-gold"/><rect x="0" y="1" width="3" height="1" class="mood-gold"/><rect x=".7" y=".7" width="1.6" height="1.6" class="mood-sun-highlight"/></g>`
      : ''
  const fireworks = mood.holiday === 'new-year'
    ? `<g class="mood-fireworks"><g transform="translate(1 1.2)"><g class="mood-firework"><rect x=".8" y="0" width=".5" height="2.2" class="mood-gold"/><rect x="0" y=".8" width="2.2" height=".5" class="mood-blue"/><rect x=".3" y=".3" width=".5" height=".5" fill="#E5484D"/></g></g><g transform="translate(14 3.2) scale(.8)"><g class="mood-firework"><rect x=".8" y="0" width=".5" height="2.2" class="mood-coral"/><rect x="0" y=".8" width="2.2" height=".5" fill="#9B6BDF"/><rect x="1.7" y=".2" width=".5" height=".5" class="mood-gold"/></g></g></g>`
    : ''

  return coffee + seasonParticles + fireworks
}
// 背景透明。小窗口的配色方案和 App 不一致时，浏览器会给它垫一块不透明的底，
// 所以声明 color-scheme: light dark：小窗口跟着 App 的外观走（浅色 / 深色 / 跟随系统），
// 两边永远一致；浅色配色在 STYLE 末尾的 prefers-color-scheme:light 里。
// 不铺底色：此前用填色 #232323 去抵消 App 的色彩转换，但转换结果随显示器变，换屏就对不上。

type Tier = 'ok' | 'warn' | 'danger'

// 信息栏上 Clawd 的养成状态：等级决定装扮，title 是鼠标悬停的提示
// halloween：万圣节装扮；askAgo：答完一轮后 Clawd 讨糖开始了几秒（负数 = 还没开始，undefined = 不讨糖）
export type PetView = { level: number; title: string; halloween?: boolean; askAgo?: number; mood?: Mood }

const tier = (p: number): Tier => (p >= 95 ? 'danger' : p >= 80 ? 'warn' : 'ok')

export function tokensText(n: number): string {
  // 近 7 天的合计能上十亿（缓存读取占大头）
  if (n >= 1e9) {
    return `${+(n / 1e9).toFixed(2)}B`
  }
  if (n >= 1e6) {
    return `${+(n / 1e6).toFixed(2)}M`
  }

  return n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`
}

export const formatCost = (usd: number): string => `$${usd.toFixed(2)}`

const grouped = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

function resetText(resetsAt: string | undefined, lang: Lang): string {
  if (!resetsAt) {
    return ''
  }
  const at = new Date(resetsAt)
  const time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`

  return at.getTime() - Date.now() < 24 * 3600000 ? T[lang].reset(time) : T[lang].resetDay(weekday(lang, at.getDay()), time)
}

function leftText(resetsAt: string | undefined, lang: Lang): string {
  if (!resetsAt) {
    return ''
  }
  const min = Math.max(0, Math.round((Date.parse(resetsAt) - Date.now()) / 60000))
  if (min < 60) {
    return T[lang].left(min, 'm')
  }
  if (min < 1440) {
    return T[lang].left(Math.floor(min / 60), 'hm', min % 60)
  }

  return T[lang].left(Math.floor(min / 1440), 'dh', Math.floor((min % 1440) / 60))
}

// ───────────────────────── 圆环 ─────────────────────────

// SVG 里量不到文字宽度，按字体规律估（系数按 Chrome 实测 getComputedTextLength 校准，误差 ≤1.5px）：
// 中文 = 字号，数字 0.6，% 接近一个字宽，空格和标点更窄
function textWidth(text: string, size: number): number {
  let w = 0
  for (const ch of text) {
    if (/[\u3000-\u9fff\uff00-\uffef]/.test(ch)) w += size
    else if (ch === '%') w += size
    else if (ch === '—') w += size * 0.9
    else if (ch === ' ') w += size * 0.28
    else if (ch === '/' || ch === '.' || ch === ':') w += size * 0.35
    else if (ch === 'M' || ch === 'W') w += size * 0.85
    else if (/[A-Z]/.test(ch)) w += size * 0.66
    else if (/[0-9]/.test(ch)) w += size * 0.6
    else w += size * 0.58
  }

  return w
}

// 一块内容的实际宽度：圆环（含线宽）+ 间隔 + 标题、副标题、悬停时换上的详情三行里最长的那行
// （只算副标题的话，悬停详情比副标题长就会压到分隔线、或被信息栏右边裁掉）
// 缓存倒计时的字号：比标题（14）和副标题（12）都小，只当旁注
const TIMER_SIZE = 9
// 标题右边的缓存倒计时留宽：最长的那一档（60m / 60分 / cold / 已过期）
let timerLang: Lang = 'zh'
const timerWidth = (g: Gauge, size: number) =>
  g.timerMs === undefined
    ? 0
    : 6 + Math.max(textWidth(T[timerLang].cacheLeft(Math.max(60, Math.ceil(g.timerMs / 60000))), size), textWidth(T[timerLang].cacheCold, size))
const contentWidth = (g: Gauge) =>
  RING_W + RING_LABEL_GAP + Math.max(textWidth(g.label, LAB_SIZE) + timerWidth(g, TIMER_SIZE), textWidth(g.sub, SUB_SIZE), textWidth(g.detail, SUB_SIZE))

// 缓存倒计时：插件不能每分钟重画（重画会让所有动画从头播），所以把每一分钟的数字都画好，
// 用 SMIL 按时间轮流显示：剩 m 分钟那一个在 [剩余-m 分, 剩余-(m-1) 分) 这段时间可见，最后换成「已过期」
// beside：旁边那段文字的字号。字小一号时和它共用底线会显得偏下，所以按两段文字的中线对齐（字母、数字的中线约在底线上 0.36em）
function cacheTimerSvg(x: number, baseline: number, remainMs: number, lang: Lang, size: number, beside: number): string {
  const t = T[lang]
  const y = (baseline - (beside - size) * 0.36).toFixed(2)
  const at = (ms: number) => `${Math.max(0, ms / 1000).toFixed(2).replace(/\.?0+$/, '')}s`
  const style = `font-size:${size}px`
  if (remainMs <= 0) {
    return `<text x="${x.toFixed(1)}" y="${y}" class="tm cold" style="${style}">${t.cacheCold}</text>`
  }
  const total = Math.ceil(remainMs / 60000)
  const steps = Math.min(total, MAX_TIMER_MINUTES)
  const coarseStart = total > MAX_TIMER_MINUTES ? total : 0
  const minutes = Array.from({ length: steps }, (_, k) => {
    const m = steps - k
    const startMs = remainMs - m * 60000
    const durationMs = m === total ? remainMs - (m - 1) * 60000 : 60000

    return `<text${m <= 5 ? ' class="warn"' : ''} opacity="0"><set attributeName="opacity" to="1" begin="${at(startMs)}" dur="${at(durationMs)}"/>${t.cacheLeft(m)}</text>`
  }).join('')
  const coarse = coarseStart
    ? `<text opacity="1"><set attributeName="opacity" to="0" begin="${at(remainMs - MAX_TIMER_MINUTES * 60000)}" fill="freeze"/>${t.cacheLeft(coarseStart)}</text>`
    : ''
  const cold = `<text class="cold" opacity="0"><set attributeName="opacity" to="1" begin="${at(remainMs)}" fill="freeze"/>${t.cacheCold}</text>`

  return `<g class="tm" transform="translate(${x.toFixed(1)} ${y})" style="${style}">${coarse}${minutes}${cold}</g>`
}

// At most 60 timed minute labels plus one coarse label and the expired label.
const MAX_TIMER_MINUTES = 60

// 窗口窄的时候逐级收：full（圆环 + 标题 + 副标题）→ compact（圆环 + 标题）→ stacked（圆环上移、小字标题放在圆环下面）
// → rings（只有圆环）。收掉的文字都还在每块的悬停提示（<title>）里。
// 宁可少字，也不让内容挤出信息栏、把右边的按钮挤到下一行
type Layout = 'full' | 'compact' | 'stacked' | 'rings'
const STACKED_LABEL = 9
const blockWidth = (g: Gauge, layout: Layout) =>
  layout === 'full'
    ? contentWidth(g)
    : layout === 'compact'
      ? RING_W + RING_LABEL_GAP + (g.kind === 'cost' ? Math.max(textWidth(g.label, LAB_SIZE), textWidth(g.sub, SUB_SIZE)) : textWidth(g.label, LAB_SIZE)) + timerWidth(g, TIMER_SIZE)
      : layout === 'stacked'
        ? Math.max(RING_W, textWidth(g.label, STACKED_LABEL))
        : RING_W
// 每种排法要求的最小间距：标题在圆环下面、或只剩圆环时可以挨得更近
const MIN_GAP: Record<Layout, number> = { full: 14, compact: 14, stacked: 10, rings: 6 }

// 最窄排法只留圆环；Clawd 按本体的 16 格计宽，笔记本和动效伸进间距
export const MIN_BAND_W = Math.ceil(2 * CLAWD_X + CLAWD_W + 4 * RING_W + 4 * MIN_GAP.rings)
export const MIN_BAND_W_WITH_FABLE = Math.ceil(2 * CLAWD_X + CLAWD_W + 5 * RING_W + 5 * MIN_GAP.rings)
export const MIN_BAND_W_WITH_COST = MIN_BAND_W + RING_W + MIN_GAP.rings
export const MIN_BAND_W_WITH_FABLE_AND_COST = MIN_BAND_W_WITH_FABLE + RING_W + MIN_GAP.rings
export const MIN_BAND_W_WITH_ACTIVITY = MIN_BAND_W + ACTIVITY_LAYOUT_RESERVE
export const MIN_BAND_W_WITH_FABLE_AND_ACTIVITY = MIN_BAND_W_WITH_FABLE + ACTIVITY_LAYOUT_RESERVE
export const MIN_BAND_W_WITH_COST_AND_ACTIVITY = MIN_BAND_W_WITH_COST + ACTIVITY_LAYOUT_RESERVE
export const MIN_BAND_W_WITH_FABLE_AND_COST_AND_ACTIVITY = MIN_BAND_W_WITH_FABLE_AND_COST + ACTIVITY_LAYOUT_RESERVE

export function pickLayout(gauges: { label: string; sub: string; detail: string }[], width: number, clawdWidth = CLAWD_W): Layout {
  const need = (layout: Layout) =>
    2 * CLAWD_X + clawdWidth + gauges.reduce((a, g) => a + blockWidth(g as Gauge, layout), 0) + gauges.length * MIN_GAP[layout]

  return (['full', 'compact', 'stacked'] as const).find(layout => need(layout) <= width) ?? 'rings'
}

type Gauge = {
  kind?: 'cost'
  tier?: Tier
  id: string
  label: string
  // 窄窗口细条里用的短标签
  short?: string
  sub: string
  detail: string
  title: string
  from?: number
  to?: number
  // 缓存倒计时：离缓存过期还有多少毫秒（≤0 = 已过期，undefined = 不显示）
  timerMs?: number
}

const off = (p: number | undefined) => (C * (1 - Math.min(100, Math.max(0, p ?? 0)) / 100)).toFixed(2)

// 数字滚轮：每位一条 0-9 的竖条，裁成一格高，从旧数字滚到新数字（前导空位记作 10）
function odometer(g: Gauge, i: number, cx: number, cy: number, isChanged: boolean, css: string[]): string {
  if (g.to === undefined) {
    return `<text x="${cx}" y="${cy + NUM_BASELINE}" text-anchor="middle" class="num dim">—</text>`
  }
  const s = String(Math.round(Math.min(999, Math.max(0, g.to))))
  const f = g.from === undefined ? '' : String(Math.round(Math.min(999, Math.max(0, g.from))))
  const fromDigits = f.padStart(s.length, ' ').slice(-s.length)
  // 三位数（100%）放不进圆环：去掉 %，数字间距收紧
  const isWide = s.length >= 3
  const dig = isWide ? 5.6 * (NUM_SIZE / 11) : DIG
  const width = s.length * dig + (isWide ? 0 : PCT_SLOT)
  const left = cx - width / 2

  const digits = [...s]
    .map((ch, k) => {
      const d = Number(ch)
      const was = fromDigits[k] === ' ' ? 10 : Number(fromDigits[k])
      const x = left + k * dig
      const name = `od${g.id}${k}`
      if (!isChanged || was === d) {
        return `<text x="${(x + dig / 2).toFixed(1)}" y="${cy + NUM_BASELINE}" text-anchor="middle" class="num${isWide ? ' sm' : ''}">${d}</text>`
      }
      css.push(
        `@keyframes ${name}{from{transform:translateY(${-was * LINE}px)}to{transform:translateY(${-d * LINE}px)}}` +
          `.${name}{animation:${name} ${0.75 + k * 0.12}s ${OUT} ${(i * 0.06).toFixed(2)}s both}`,
      )
      const strip = Array.from(
        { length: 10 },
        (_, n) => `<text y="${cy + NUM_BASELINE + n * LINE}">${n}</text>`,
      ).join('')

      return (
        `<clipPath id="c${name}"><rect x="${(x - 1).toFixed(1)}" y="${cy - NUM_CLIP_H / 2}" width="${dig + 2}" height="${NUM_CLIP_H}"/></clipPath>` +
        `<g clip-path="url(#c${name})"><g transform="translate(${(x + dig / 2).toFixed(1)} 0)"><g class="${name}" style="transform:translateY(${-d * LINE}px)"><g class="num${isWide ? ' sm' : ''}" text-anchor="middle">${strip}</g></g></g></g>`
      )
    })
    .join('')

  return digits + (isWide ? '' : `<text x="${(left + s.length * dig + 0.5).toFixed(1)}" y="${cy + NUM_BASELINE}" class="pct">%</text>`)
}

function costGauge(g: Gauge, i: number, x: number, w: number, isFirst: boolean, layout: Layout): string {
  const cx = layout === 'stacked' ? x + w / 2 : x + RING_CX_OFFSET
  const cy = layout === 'stacked' ? STACKED_RING_CY : RING_CY
  const badgeText = layout === 'stacked' || layout === 'rings'
    ? `<text x="${cx}" y="${cy + 2}" class="cost-glyph in-badge">$</text><text x="${cx}" y="${cy + 16}" class="cost-value in-badge">${g.sub.slice(1)}</text>`
    : `<text x="${cx}" y="${cy + 8}" class="cost-glyph">$</text>`
  const textX = cx + R + 10
  const details = layout === 'full'
    ? `<text x="${textX}" y="${cy - 3}" class="lab">${g.label}</text><text x="${textX}" y="${cy + 11}" class="cost-value">${g.sub}</text><text x="${textX}" y="${cy + 25}" class="cost-sub">${g.detail}</text>`
    : layout === 'compact'
      ? `<text x="${textX}" y="${cy - 3}" class="lab">${g.label}</text><text x="${textX}" y="${cy + 11}" class="cost-value">${g.sub}</text>`
      : layout === 'stacked'
        ? `<text x="${cx}" y="${H - 7}" text-anchor="middle" class="lab stk">${g.label}</text>`
        : ''

  return (
    `<g class="g${isFirst ? ' enter' : ''}"${isFirst ? ` style="animation-delay:${(i * 0.06).toFixed(2)}s"` : ''}>` +
    `<title>${g.title}</title>` +
    `<rect x="${x}" y="0" width="${w.toFixed(1)}" height="${H}" fill="transparent"/>` +
    `<g class="ring"><circle cx="${cx}" cy="${cy}" r="${R}" class="cost-badge"/>${badgeText}</g>` +
    details +
    `</g>`
  )
}

function gauge(g: Gauge, i: number, x: number, w: number, isChanged: boolean, isFirst: boolean, css: string[], layout: Layout = 'full', lang: Lang = 'zh'): string {
  if (g.kind === 'cost') {
    return costGauge(g, i, x, w, isFirst, layout)
  }

  // stacked：圆环在这一块里居中、往上挪，给下面的小字标题让位
  const cx = layout === 'stacked' ? x + w / 2 : x + RING_CX_OFFSET
  const cy = layout === 'stacked' ? STACKED_RING_CY : RING_CY
  const t = g.tier ?? tier(g.to ?? 0)
  const visible = (g.to ?? 0) > 0.4
  const arcClass = `arc${g.id}`

  if (isChanged && (g.from ?? 0) !== (g.to ?? 0)) {
    css.push(
      `@keyframes ${arcClass}{from{stroke-dashoffset:${off(g.from)}}to{stroke-dashoffset:${off(g.to)}}}` +
        `.${arcClass}{animation:${arcClass} .95s ${OUT} ${(i * 0.06).toFixed(2)}s both}`,
    )
  }

  // 数值变化时，圆环右上角飘出 +N%
  let chip = ''
  if (isChanged && !isFirst && g.from !== undefined && g.to !== undefined) {
    const delta = Math.round(g.to) - Math.round(g.from)
    if (delta !== 0) {
      // 窄排法里旁边没有标题的位置，+N% 贴着圆环右上角
      const chipX = layout === 'full' || layout === 'compact' ? cx + R + 10 : cx + R - 2
      const chipY = layout === 'full' || layout === 'compact' ? cy - R + 2 : layout === 'stacked' ? 14 : 10
      chip = `<text x="${chipX}" y="${chipY}" class="chip ${t}">${delta > 0 ? '+' : ''}${delta}%</text>`
    }
  }

  const arc = (cls: string) =>
    `<circle cx="${cx}" cy="${cy}" r="${R}" class="${cls} ${arcClass}" stroke="url(#grad-${t})" ` +
    `stroke-dasharray="${C.toFixed(2)}" style="stroke-dashoffset:${off(g.to)}" opacity="${visible ? 1 : 0}"/>`

  return (
    `<g class="g${isFirst ? ' enter' : ''}"${isFirst ? ` style="animation-delay:${(i * 0.06).toFixed(2)}s"` : ''}>` +
    `<title>${g.title}</title>` +
    `<rect x="${x}" y="0" width="${w.toFixed(1)}" height="${H}" fill="transparent"/>` +
    `<g class="ring">` +
    `<circle cx="${cx}" cy="${cy}" r="${R}" class="track"/>` +
    `<g transform="rotate(-90 ${cx} ${cy})">${arc(`glow ${t}`)}${arc('arc')}</g>` +
    odometer(g, i, cx, cy, isChanged, css) +
    `</g>` +
    (layout === 'full'
      ? `<text x="${cx + R + 10}" y="${cy - 3}" class="lab">${g.label}</text>` +
        (g.timerMs === undefined ? '' : cacheTimerSvg(cx + R + 10 + textWidth(g.label, LAB_SIZE) + 6, cy - 3, g.timerMs, lang, TIMER_SIZE, LAB_SIZE)) +
        `<text x="${cx + R + 10}" y="${cy + 11}" class="sub">${g.sub}</text>` +
        `<text x="${cx + R + 10}" y="${cy + 11}" class="sub2">${g.detail}</text>`
      : layout === 'compact'
        ? `<text x="${cx + R + 10}" y="${cy + 4}" class="lab">${g.label}</text>` +
          (g.timerMs === undefined ? '' : cacheTimerSvg(cx + R + 10 + textWidth(g.label, LAB_SIZE) + 6, cy + 4, g.timerMs, lang, TIMER_SIZE, LAB_SIZE))
        : layout === 'stacked'
          ? `<text x="${cx}" y="${H - 7}" text-anchor="middle" class="lab stk">${g.label}</text>`
          : '') +
    chip +
    `</g>`
  )
}

// ───────────────────────── Clawd ─────────────────────────
// 16×10 的像素网格，外层整体放大 U 倍。动作分层：hop（跳）→ breath（呼吸压扁）→ 部件（眼、钳子、腿）

const px = (x: number, y: number, w: number, h: number, fill: string, extra = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${extra}/>`

const HEART = 'M0 .5C0-.3 1-.4 1.2.3 1.4-.4 2.4-.3 2.4.5 2.4 1.3 1.2 2 1.2 2S0 1.3 0 .5Z'

function spark(cx: number, cy: number, r: number, w: number, color: string): string {
  return [0, 45, 90, 135]
    .map(a => {
      const rad = (a * Math.PI) / 180
      const dx = (Math.cos(rad) * r).toFixed(2)
      const dy = (Math.sin(rad) * r).toFixed(2)

      return `<line x1="${(cx - +dx).toFixed(2)}" y1="${(cy - +dy).toFixed(2)}" x2="${(cx + +dx).toFixed(2)}" y2="${(cy + +dy).toFixed(2)}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`
    })
    .join('')
}

// 养成解锁的装扮（Clawd 的格子坐标，头顶 y<0）。画在 body 里，跟着呼吸、跳、跑一起动
// 万圣节：巫师帽（帽尖往后折，最高到 -3.8 格，不出信息栏上沿）
const WITCH_HAT =
  `<path d="M5.4-.6 10.6-.6 9.5-3 11.3-3.8 8.7-3.4Z" fill="#3B2A55"/>` +
  `<path d="M8.7-3.4 9.5-3 9.1-2.6Z" fill="#2A1E3D"/>` +
  px(2.6, -0.8, 10.8, 0.8, '#2A1E3D') +
  `<rect x="5.7" y="-1.45" width="4.6" height=".55" class="halloween-orange"/>` +
  `<rect x="7.6" y="-1.5" width=".9" height=".65" class="halloween-gold"/>`
const SANTA_HAT =
  `<g class="mood-hat santa"><path d="M4.4-.25H12L10.5-2.1Q8.5-3.1 6.5-1.55Z" fill="#D94343"/>` +
  `<rect x="3.7" y="-.65" width="9.2" height=".75" class="mood-paper-white"/>` +
  `<circle cx="10.8" cy="-2.45" r=".62" class="mood-paper-white"/></g>`
const PARTY_HAT =
  `<g class="mood-hat party"><path d="M4.8-.2 8-4 11.4-.2Z" fill="#8F63CE"/>` +
  `<rect x="5.5" y="-1.35" width="4.8" height=".4" class="mood-gold"/>` +
  `<rect x="6.8" y="-2.4" width=".55" height=".55" class="mood-blue"/>` +
  px(8.8, -3.25, 0.55, 0.55, '#E5484D') +
  `<circle cx="8" cy="-4.1" r=".45" class="mood-gold"/></g>`
const NIGHTCAP =
  `<g class="mood-hat nightcap"><path d="M3.8-.2Q4.2-2.65 7.5-3.1 10.8-3.45 12-.2Z" fill="#4766B2"/>` +
  `<path d="M9.2-2.7Q11.5-3.55 13.1-2.65L11.9-1.25Z" fill="#354F91"/>` +
  px(3.6, -0.65, 8.8, 0.6, '#293F79') +
  `<circle cx="13.2" cy="-2.65" r=".55" class="mood-paper-white"/></g>`
const MINI_SANTA_HAT =
  `<g class="mood-hat santa"><path d="M5 1.2 8 .15 11 1.2Z" fill="#D94343"/><rect x="4.4" y="1.05" width="7.2" height=".5" class="mood-paper-white"/><circle cx="8" cy=".1" r=".35" class="mood-paper-white"/></g>`
const MINI_PARTY_HAT =
  `<g class="mood-hat party"><path d="M5 1.3 8 .1 11 1.3Z" fill="#8F63CE"/><rect x="6.3" y=".8" width="3.4" height=".35" class="mood-gold"/><circle cx="8" cy=".05" r=".35" class="mood-gold"/></g>`
const MINI_NIGHTCAP =
  `<g class="mood-hat nightcap"><path d="M4.5 1.25Q5 .15 8 .15 10.8 .15 11.5 1.25L12.5 1.55 11.6 1.8Z" fill="#4766B2"/>${px(4.5, 1.05, 7.2, .35, '#293F79')}<circle cx="12.55" cy="1.55" r=".35" class="mood-paper-white"/></g>`

// 讨糖南瓜桶（以桶左上角为原点，3×2.4 格）
const PAIL =
  `<path d="M.4.3Q1.5-1.1 2.6.3" stroke="#55534D" stroke-width=".28" fill="none"/>` +
  `<rect y=".2" width="3" height="2.4" rx=".9" class="halloween-orange"/>` +
  px(1.3, 0.2, 0.4, 2.4, '#D96F12') +
  `<path d="M.5.9 1 .9 .75 1.35Z" fill="#3A2208"/><path d="M2 .9 2.5 .9 2.25 1.35Z" fill="#3A2208"/>` +
  px(0.6, 1.8, 1.8, 0.28, '#3A2208') +
  px(0.5, -0.15, 0.6, 0.45, '#E5484D') +
  `<rect x="1.9" y="-.2" width=".6" height=".5" class="halloween-blue"/>`

function gearSvg(level: number, halloween = false, pailExtra = '', mood?: Mood, mini = false): string {
  const { head, bowtie } = gearOf(level)
  const moodHat = mood?.holiday === 'christmas'
    ? mini ? MINI_SANTA_HAT : SANTA_HAT
    : mood?.holiday === 'new-year'
      ? mini ? MINI_PARTY_HAT : PARTY_HAT
      : mood?.timeOfDay === 'night'
        ? mini ? MINI_NIGHTCAP : NIGHTCAP
        : ''
  const hat = halloween
    ? WITCH_HAT
    : moodHat || (head === 'sprout'
      ? px(7.75, -1.7, 0.5, 1.7, '#5E9E4B') + px(6.3, -2.3, 1.4, 0.7, '#7BC163') + px(8.3, -2.8, 1.4, 0.7, '#8ED073')
      : head === 'cap'
        ? `<rect x="3.4" y="-1.8" width="9" height="1.9" rx=".8" fill="#3E6FD8"/>` +
          px(4.2, -1.45, 2.2, 0.35, '#7FA3EC') +
          `<rect x="10.6" y="-.45" width="4.4" height=".6" rx=".25" fill="#2B57B3"/>` +
          `<rect x="7.6" y="-2.15" width=".8" height=".45" rx=".2" fill="#2B57B3"/>`
        : head === 'crown'
          ? `<path d="M4.2 0V-2.4L6.1-1.2 8-3 9.9-1.2 11.8-2.4V0Z" fill="#F2C14E"/>` +
            px(4.2, -0.55, 7.6, 0.55, '#D9A23A') +
            px(7.6, -1.5, 0.8, 0.8, '#E5484D') +
            px(5.1, -1, 0.6, 0.6, '#5FB0F0') +
            px(10.3, -1, 0.6, 0.6, '#5FB0F0')
          : '')
  const tie = bowtie
    ? `<path d="M6.4 5.3 7.8 5.85 6.4 6.4Z" fill="#E5484D"/><path d="M9.6 5.3 8.2 5.85 9.6 6.4Z" fill="#E5484D"/>` + px(7.6, 5.55, 0.8, 0.6, '#B83238')
    : ''

  // 南瓜桶挂在右钳子上
  const pail = halloween ? `<g class="hw-pail" transform="translate(14.3 4.9)">${pailExtra}${PAIL}</g>` : ''

  return tie + hat + pail
}

// Clawd 的身子（不含阴影、笔记本、爱心）：信息栏和战报卡共用
export function clawdBody(isStressed: boolean, level = 1, halloween = false, pailExtra = '', mood?: Mood, mini = false): string {
  const eyes =
    `<g class="eyes"><g class="look">` +
    px(4, 2, 1, 2, '#231511', ' class="eye"') +
    px(11, 2, 1, 2, '#231511', ' class="eye"') +
    px(4.1, 2.1, 0.35, 0.35, '#F6E7DC', ' class="eye glint"') +
    px(11.1, 2.1, 0.35, 0.35, '#F6E7DC', ' class="eye glint"') +
    `</g></g>`
  const happy =
    `<g class="happy" fill="none" stroke="#231511" stroke-width=".55" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M3.6 3.3 4.5 2.4 5.4 3.3"/><path d="M10.6 3.3 11.5 2.4 12.4 3.3"/></g>`
  const cheeks = `<g class="cheek">${px(2.6, 4.1, 1.7, 0.7, '#F7909F')}${px(11.7, 4.1, 1.7, 0.7, '#F7909F')}</g>`
  const brows = isStressed
    ? `<g stroke="#231511" stroke-width=".42" stroke-linecap="round"><line x1="3.4" y1="1.55" x2="5.1" y2="1.05"/><line x1="12.6" y1="1.55" x2="10.9" y2="1.05"/></g>`
    : ''

  const body =
    `<g class="legA">${px(3, 7, 1, 2, '#B9644A')}${px(10, 7, 1, 2, '#B9644A')}</g>` +
    `<g class="legB">${px(5, 7, 1, 2, '#B9644A')}${px(12, 7, 1, 2, '#B9644A')}</g>` +
    px(2, 0, 12, 1, '#E99B80') +
    px(2, 1, 12, 5, '#D97757') +
    px(2, 1, 1, 5, '#DE8264') +
    px(2, 6, 12, 1, '#BC6448') +
    `<g class="armL">${px(0, 4, 2, 1, '#D97757')}${px(0, 5, 2, 1, '#BC6448')}</g>` +
    `<g class="armR">${px(14, 4, 2, 1, '#D97757')}${px(14, 5, 2, 1, '#BC6448')}</g>` +
    eyes +
    `<g class="shades"><rect x="2" y="1.85" width="12" height=".45" fill="#141414"/>` +
    `<rect x="2.9" y="1.55" width="3.5" height="2.3" rx=".45" fill="#141414"/>` +
    `<rect x="9.6" y="1.55" width="3.5" height="2.3" rx=".45" fill="#141414"/>` +
    `<rect x="3.4" y="1.95" width="1.2" height=".38" fill="#F6E7DC" opacity=".8"/>` +
    `<rect x="10.1" y="1.95" width="1.2" height=".38" fill="#F6E7DC" opacity=".8"/></g>` +
    happy +
    cheeks +
    brows +
    gearSvg(level, halloween, pailExtra, mood, mini)

  return body
}

// mini：收起状态下的 Clawd 不搬笔记本，干活时在细条上来回小跑
// ───────── 万圣节 ─────────

// 干活时飘的糖果（代替 { } </> ✓）：以糖果中心为原点，约 2 格宽
const CANDIES = [
  `<rect x="-.55" y="-.4" width="1.1" height=".8" rx=".35" fill="#E5484D"/><path d="M-.55 0-1.1-.42-1.1.42Z" class="halloween-pink"/><path d="M.55 0 1.1-.42 1.1.42Z" class="halloween-pink"/>`,
  `<rect x="-.09" y=".1" width=".18" height="1.1" class="halloween-neutral"/><circle r=".6" fill="#9B6BDF"/><circle r=".26" class="halloween-gold"/>`,
  `<path d="M0-.75.6.6-.6.6Z" class="halloween-gold"/><path d="M-.38.15.38.15.6.6-.6.6Z" class="halloween-paper"/><path d="M-.21-.27.21-.27.35.05-.35.05Z" class="halloween-orange"/>`,
]

// Claude 干活时披上白床单当幽灵（帽子照戴）
const GHOST =
  `<path d="M2.6-.9Q8-2.4 13.4-.9L14.6 6.6 15.6 8.6 13.6 8 12.2 8.9 10.6 8 9 8.9 7.4 8 5.8 8.9 4.2 8 2.6 8.9 1.4 8 .4 8.6 1.4 6.6Z" class="halloween-paper"/>` +
  `<ellipse cx="4.6" cy="3" rx=".75" ry="1.05" fill="#231511"/><ellipse cx="11.4" cy="3" rx=".75" ry="1.05" fill="#231511"/>` +
  `<rect x="2.8" y="4.4" width="1.4" height=".5" class="halloween-pink" opacity=".55"/>` +
  `<rect x="11.8" y="4.4" width="1.4" height=".5" class="halloween-pink" opacity=".55"/>`

// 讨糖：答完一轮后 Clawd 举起南瓜桶要糖。ANGRY_AFTER 秒没人点他就生气；
// 点一下 = 给糖（开心 3 秒），CLICK_WINDOW 内连点第二下空翻、第三下跳起来撒糖。
// 插件收不到 SVG 里的点击，全靠 SMIL 事件：三层点击区叠着，点上面一层它就藏起一会儿，下一下落到下一层。
// 「没点就生气」用一个跑两遍的计时器：被点击提前结束就没有第二遍（repeat 事件），生气也就不会开始。
const ANGRY_AFTER = 12
const CLICK_WINDOW = '1.6s'
const HIT_RECT = 'x="-1.5" y="-4.5" width="19" height="15" fill="transparent"'

function candyTimeline(askAgo: number) {
  const start = `${Math.max(0, -askAgo).toFixed(2)}s`
  const wait = Math.max(0.05, ANGRY_AFTER - Math.max(0, askAgo)).toFixed(2)
  const angry = 'hwtimer.repeat(1)'
  const asking = `begin="${start}" end="hit.click"`
  const showWhileAsking = `<set attributeName="opacity" to="1" ${asking}/>`
  const showWhenAngry = `<set attributeName="opacity" to="1" begin="${angry}"/>`

  const confetti = Array.from({ length: 6 }, (_, k) => {
    const a = (k / 6) * Math.PI * 2 - Math.PI / 2
    const to = `${(8 + Math.cos(a) * 9).toFixed(2)} ${(3 + Math.sin(a) * 6).toFixed(2)}`

    return (
      `<g opacity="0"><set attributeName="opacity" to="1" begin="hit3.click" dur=".9s"/>` +
      `<animateTransform attributeName="transform" type="translate" from="8 3" to="${to}" dur=".9s" begin="hit3.click" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".2 .8 .2 1"/>` +
      `${CANDIES[k % 3]}</g>`
    )
  }).join('')

  return {
    // 挂在钳子上的桶：讨糖时藏起来，换成举高摇晃的那只
    pail: `<set attributeName="opacity" to="0" ${asking}/>`,
    // 脸（画在身子里，跟着呼吸一起动）
    face:
      `<g opacity="0">${showWhileAsking}<g opacity="0">${showWhenAngry}` +
      px(2, 1, 12, 5, '#E5484D', ' opacity=".22"') +
      `<g stroke="#231511" stroke-width=".42" stroke-linecap="round" fill="none"><line x1="3.4" y1="1.05" x2="5.1" y2="1.6"/><line x1="12.6" y1="1.05" x2="10.9" y2="1.6"/>` +
      `<path d="M6.8 5.1Q8 4.3 9.2 5.1"/></g></g></g>` +
      `<g opacity="0"><set attributeName="opacity" to="1" begin="hit.click" dur="3s"/>` +
      px(3, 1.8, 3, 2.4, '#D97757') +
      px(10, 1.8, 3, 2.4, '#D97757') +
      `<g fill="none" stroke="#231511" stroke-width=".55" stroke-linecap="round" stroke-linejoin="round"><path d="M3.6 3.3 4.5 2.4 5.4 3.3"/><path d="M10.6 3.3 11.5 2.4 12.4 3.3"/></g>` +
      `<rect x="2.6" y="4.1" width="1.7" height=".7" class="halloween-pink"/>` +
      `<rect x="11.7" y="4.1" width="1.7" height=".7" class="halloween-pink"/>` +
      `</g>`,
    // 生气时原地跺脚
    stomp: `<animateTransform attributeName="transform" type="translate" values="0 0;.35 0;0 0;-.35 0;0 0" dur=".3s" repeatCount="indefinite" begin="${angry}" end="hit.click"/>`,
    // 连点三下：跳起来
    jump: `<animateTransform attributeName="transform" type="translate" values="0 0;0 -3;0 0;0 -1.6;0 0" keyTimes="0;.3;.55;.78;1" dur="1.1s" begin="hit3.click"/>`,
    overlay:
      `<rect width="0" height="0"><animate id="hwtimer" attributeName="x" values="0;0" begin="${start}" dur="${wait}s" repeatCount="2" end="hit.click"/></rect>` +
      // 举起南瓜桶摇 + 头顶问号；生气时问号换成青筋、冒烟
      `<g opacity="0">${showWhileAsking}` +
      `<g transform="translate(13.6 1.4)"><g class="hw-beg">${PAIL}</g></g>` +
      `<g><set attributeName="opacity" to="0" begin="${angry}"/><text x="14.6" y="-.4" class="hw-q">?</text></g>` +
      `<g opacity="0">${showWhenAngry}` +
      `<g class="hw-vein" transform="translate(15 -2.2)"><path d="M-.9-.3-.3-.3-.3-.9M.3-.9.3-.3.9-.3M.9.3.3.3.3.9M-.3.9-.3.3-.9.3" stroke="#E5484D" stroke-width=".38" fill="none" stroke-linecap="round"/></g>` +
      `<circle class="hw-steam halloween-neutral" cx="1.2" cy="-1.2" r=".7"/><circle class="hw-steam halloween-neutral" cx="14.6" cy="-.6" r=".6" style="animation-delay:.5s"/>` +
      `</g></g>` +
      // 给糖：一颗糖掉进桶里
      `<g opacity="0"><set attributeName="opacity" to="1" begin="hit.click" dur=".7s"/>` +
      `<animateTransform attributeName="transform" type="translate" from="15.8 -3" to="15.8 4.8" dur=".6s" begin="hit.click" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".5 0 .8 .6"/>` +
      `${CANDIES[0]}</g>` +
      confetti,
    hits:
      `<rect id="hit3" ${HIT_RECT}/>` +
      `<rect id="hit2" ${HIT_RECT}><set attributeName="visibility" to="hidden" begin="hit2.click" dur="${CLICK_WINDOW}"/></rect>` +
      `<rect id="hit" ${HIT_RECT}><set attributeName="visibility" to="hidden" begin="hit.click" dur="${CLICK_WINDOW}"/></rect>`,
  }
}

function clawd(
  isWorking: boolean,
  isStressed: boolean,
  didChange: boolean,
  mini = false,
  isChill = false,
  pet?: PetView,
  activity?: Activity,
  showActivityIcon = true,
): string {
  const pose = activity?.kind
  const reaction = pose === 'reaction' ? activity?.reaction : undefined
  const mood = moodForClawd(isWorking, activity, pet)
  const hasSpecialPose = pose === 'needs-you' || pose === 'reaction' || pose === 'done' || pose === 'compacting' || pose === 'sleep'
  const clawdWorking = !hasSpecialPose && (isWorking || (pose === 'working' && activity?.icon !== undefined))
  const isHalloween = pet?.halloween === true
  const candy = isHalloween && !clawdWorking && pet?.askAgo !== undefined ? candyTimeline(pet.askAgo) : undefined
  const activityIcon = showActivityIcon ? activity?.icon : undefined
  const isSleeping = pose === 'sleep'
  const isDone = pose === 'done'
  const reactionFace = reactionFaceSvg(reaction)
  const body = clawdBody(isStressed, pet?.level, isHalloween, candy?.pail, mood, mini)
  const sleepEyes = isSleeping ? `<g class="sleep-eyes">${px(3.7, 3.1, 1.6, 0.45, '#231511')}${px(10.7, 3.1, 1.6, 0.45, '#231511')}</g>` : ''
  const activityClass = pose && pose !== 'idle' && pose !== 'working' ? ` ${pose}${reaction ? ` ${reaction}` : ''}` : ''
  // 头上戴了东西，干活时的小火花挪到头的左边，不跟帽子打架
  const sparkAt = isHalloween || gearOf(pet?.level ?? 1).head ? '-1.2 -1.2' : '8 -2.6'
  // 讨糖时：第一下点击是给糖，第二下才空翻
  const flipOn = candy ? 'hit2.click' : 'hit.click'

  const laptop = clawdWorking && !mini
    ? `<g class="laptop">` +
      `<rect x="3.6" y="4.7" width="8.8" height="4.4" rx=".5" fill="#34332F"/>` +
      `<rect x="3.6" y="4.7" width="8.8" height=".35" rx=".17" fill="#5A5852"/>` +
      `<g class="logo">${spark(8, 6.9, .95, 0.4, '#E98D6E')}</g>` +
      `<rect x="1.4" y="8.9" width="13.2" height=".9" rx=".3" fill="#55534D"/>` +
      `<rect x="1.4" y="8.9" width="13.2" height=".25" rx=".12" fill="#77746C"/>` +
      `</g>` +
      (activityIcon
        ? ''
        : isHalloween
        ? [16.6, 17.8, 17]
            .map((x, k) => `<g transform="translate(${x} 3.4)"><g class="glyph" style="animation-delay:${k * 0.8}s">${CANDIES[k]}</g></g>`)
            .join('')
        : [
            ['{ }', 16.2, '0s'],
            ['&lt;/&gt;', 17.4, '.8s'],
            ['✓', 16.6, '1.6s'],
          ]
            .map(([glyph, x, delay]) => `<text x="${x}" y="4.2" class="glyph" style="animation-delay:${delay}">${glyph}</text>`)
            .join('')) +
      `<g transform="translate(${sparkAt})"><g class="spark-pulse"><g class="spark-spin">${spark(0, 0, 1.45, 0.5, '#E98D6E')}</g></g></g>`
    : ''

  const sweat = (isStressed || reaction === 'test-fail') && !isSleeping
    ? `<path class="sweat" d="M14.9-.4q.75 1.05.75 1.6a.75.75 0 0 1-1.5 0q0-.55.75-1.6z"/>`
    : ''
  const moodEffects = moodEffectsSvg(mood, mini)

  const hearts = [
    [2.2, -1.2, '0s', -1.2],
    [11.6, -2, '.45s', 1],
    [7, -3.2, '.9s', 0.2],
  ]
    .map(
      ([x, y, delay, dx]) =>
        `<g transform="translate(${x} ${y}) scale(.75)"><path class="heart" d="${HEART}" fill="#FF7A93" style="animation-delay:${delay};--dx:${dx}px"/></g>`,
    )
    .join('')

  // 点一下：原地 360° 空翻 + 一圈火花（SMIL 事件，不需要脚本）
  const burst = Array.from({ length: 8 }, (_, k) => {
    const a = (k / 8) * Math.PI * 2
    const dx = (Math.cos(a) * 8).toFixed(2)
    const dy = (Math.sin(a) * 6).toFixed(2)

    return (
      `<rect x="7.6" y="4.6" width=".8" height=".8" fill="${k % 2 ? '#F3B18F' : '#E98D6E'}" opacity="0">` +
      `<animate attributeName="opacity" values="0;1;0" dur=".7s" begin="${flipOn}"/>` +
      `<animateTransform attributeName="transform" type="translate" from="0 0" to="${dx} ${dy}" dur=".7s" begin="${flipOn}" calcMode="spline" keyTimes="0;1" keySplines=".2 .8 .2 1"/>` +
      `</rect>`
    )
  }).join('')

  const hopClass = didChange || isDone ? 'hop once' : isSleeping ? 'hop sleep' : clawdWorking ? 'hop' : 'hop idle'

  return (
    `<g class="clawd${clawdWorking ? ' working' : ''}${isStressed ? ' stressed' : ''}${mini ? ' mini' : ''}${activityClass}${isChill ? ' chill' : ''}" ` +
    `transform="translate(${mini ? MINI_X : CLAWD_X} ${mini ? MINI_Y : CLAWD_Y}) scale(${mini ? MINI_U : U})">` +
    (pet ? `<title>${pet.title}</title>` : '') +
    `<circle cx="8" cy="5" r="9.5" fill="url(#aura)" class="aura"/>` +
    `<g class="pace">` +
    `<ellipse cx="8" cy="9.75" rx="6.3" ry=".55" class="shadow ${didChange ? 'once' : clawdWorking ? '' : 'idle'}"/>` +
    `<g class="spin"><animateTransform attributeName="transform" type="rotate" from="0 8 4.5" to="360 8 4.5" dur=".7s" begin="${flipOn}" calcMode="spline" keyTimes="0;1" keySplines=".3 .1 .2 1"/>` +
    `<g>${candy?.jump ?? ''}<g>${candy?.stomp ?? ''}` +
    `<g class="${hopClass}"><g class="tremble"><g class="breath">${body}${reactionFace}${sleepEyes}${isHalloween && clawdWorking ? GHOST : ''}${candy?.face ?? ''}</g></g></g>` +
    `</g></g>` +
    `</g>` +
    sweat +
    moodEffects +
    (activityIcon ? activityIconSvg(activityIcon, mini) : '') +
    `</g>` +
    laptop +
    (isDone ? doneSparklesSvg(mini) : '') +
    (isSleeping ? sleepZSvg(mini) : '') +
    reactionEffectsSvg(reaction) +
    hearts +
    burst +
    (candy ? candy.overlay + candy.hits : `<rect id="hit" ${HIT_RECT}/>`) +
    `</g>`
  )
}

// ───────────────────────── 样式 ─────────────────────────

const STYLE =
  `:root{color-scheme:light dark;background:transparent}text{font-family:-apple-system,"SF Pro Text","PingFang SC","Segoe UI","Microsoft YaHei UI","Microsoft YaHei",sans-serif}` +
  // Clawd
  `.clawd *{transform-box:fill-box}` +
  `.hop,.breath,.tremble{transform-origin:50% 100%}` +
  `.breath{animation:breath 3.2s ease-in-out infinite}.working .breath{animation:breath .9s ease-in-out infinite}` +
  `.hop.idle{animation:idlehop 9s ${OUT} 2s infinite}.hop.once{animation:hop .8s ${OUT} both}` +
  `.shadow{fill:#000;opacity:.42;transform-origin:center}.shadow.idle{animation:idleshadow 9s ${OUT} 2s infinite}.shadow.once{animation:shadow .8s ${OUT} both}` +
  `.eye{transform-origin:center;animation:blink 4.6s infinite}.working .eye{animation-duration:3.3s}` +
  `.look{transition:transform .3s ${OUT};animation:look 7s ease-in-out infinite}.working .look{animation:focus 4s ease-in-out infinite}` +
  `.gauges:hover~.clawd .look{animation:none;transform:translate(1px,-.15px)}` +
  `.happy,.cheek{opacity:0;transition:opacity .18s ease}` +
  // 墨镜不全程戴：空闲时 9 秒一轮「戴着 → 推到额头露出眼睛 → 拉回来」；Claude 干活时推到头顶专心敲代码
  `.shades{opacity:0;transition:opacity .18s ease}.chill .shades{opacity:1;animation:shadesCycle 9s ease-in-out infinite}` +
  `.chill .eyes{opacity:0;animation:eyesPeek 9s ease-in-out infinite}` +
  `.chill.working .shades{animation:none;transform:translateY(-1.9px)}.chill.working .eyes{animation:none;opacity:1}` +
  `.chill .breath{animation-duration:5s}.chill .hop.idle{animation-duration:14s}` +
  `.working .armL{animation:tap .24s ease-in-out infinite alternate}.working .armR{animation:tap .24s ease-in-out .12s infinite alternate}` +
  `.working .legA,.working .legB{opacity:0}` +
  `.logo{transform-origin:center;animation:glow 2.4s ease-in-out infinite}` +
  `.spark-spin{transform-origin:center;animation:spin 2.2s linear infinite}.spark-pulse{transform-origin:center;animation:pulse 1.1s ease-in-out infinite}` +
  `.aura{opacity:0;transform-origin:center}.working .aura{animation:aura 2.4s ease-in-out infinite}` +
  `.stressed .tremble{animation:tremble .16s linear infinite}` +
  `.heart{opacity:0;transform-origin:center}` +
  `@media (hover:hover){.clawd:hover .hop{animation:bounce .55s cubic-bezier(.3,.7,.4,1) infinite}` +
  `.clawd:hover .shadow{animation:bshadow .55s cubic-bezier(.3,.7,.4,1) infinite}` +
  `.clawd:hover .eyes,.clawd:hover .shades{opacity:0;animation:none}.clawd:hover .happy{opacity:1}.clawd:hover .cheek{opacity:.9}` +
  `.clawd:hover .heart{animation:heart 1.35s ${OUT} infinite}}` +
  `#hit,#hit2,#hit3{cursor:pointer}` +
  // keyframes
  `@keyframes shadesCycle{0%,50%{transform:none}56%,80%{transform:translateY(-1.9px)}86%,100%{transform:none}}` +
  `@keyframes eyesPeek{0%,52%{opacity:0}56%,80%{opacity:1}84%,100%{opacity:0}}` +
  `@keyframes breath{0%,100%{transform:scale(1,1)}50%{transform:scale(1.03,.955)}}` +
  `@keyframes idlehop{0%,86%,100%{transform:none}88%{transform:scale(1.1,.88)}92%{transform:translateY(-3px) scale(.94,1.08)}96%{transform:scale(1.07,.93)}98%{transform:scale(.98,1.02)}}` +
  `@keyframes hop{0%{transform:scale(1.12,.86)}35%{transform:translateY(-3.6px) scale(.93,1.09)}65%{transform:scale(1.08,.92)}82%{transform:scale(.98,1.03)}100%{transform:none}}` +
  `@keyframes idleshadow{0%,86%,100%{transform:none;opacity:.42}92%{transform:scale(.6);opacity:.2}}` +
  `@keyframes shadow{0%{transform:scale(1.1)}35%{transform:scale(.55);opacity:.18}65%{transform:scale(1.08)}100%{transform:none}}` +
  `@keyframes bounce{0%,100%{transform:scale(1.05,.95)}50%{transform:translateY(-2.4px) scale(.97,1.04)}}` +
  `@keyframes bshadow{0%,100%{transform:scale(1.05)}50%{transform:scale(.65);opacity:.22}}` +
  `@keyframes blink{0%,91%,97%,100%{transform:scaleY(1)}94%{transform:scaleY(.12)}}` +
  `@keyframes look{0%,16%{transform:none}22%,40%{transform:translate(.8px,0)}46%,62%{transform:translate(-.8px,0)}68%,100%{transform:none}}` +
  `@keyframes focus{0%,70%{transform:translate(0,.55px)}76%,92%{transform:translate(.5px,-.1px)}100%{transform:translate(0,.55px)}}` +
  `@keyframes tap{from{transform:none}to{transform:translateY(-.8px)}}` +
  `@keyframes glow{0%,100%{opacity:.55;transform:scale(.92)}50%{opacity:1;transform:scale(1.08)}}` +
  `@keyframes spin{to{transform:rotate(360deg)}}` +
  `@keyframes pulse{0%,100%{transform:scale(.85)}50%{transform:scale(1.15)}}` +
  `@keyframes aura{0%,100%{opacity:.15;transform:scale(.92)}50%{opacity:.4;transform:scale(1.06)}}` +
  `@keyframes tremble{0%,100%{transform:none}25%{transform:translateX(.14px)}75%{transform:translateX(-.14px)}}` +
  `@keyframes heart{0%{opacity:0;transform:scale(.4)}20%{opacity:1;transform:scale(1)}100%{opacity:0;transform:translate(var(--dx),-5px) scale(.8)}}` +
  `@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}` +
  // 阴影和渐变在展开、细条共用
  `@media (prefers-color-scheme:light){` +
  `.shadow{opacity:.16}@keyframes idleshadow{0%,86%,100%{transform:none;opacity:.16}92%{transform:scale(.6);opacity:.08}}` +
  `#grad-ok stop+stop{stop-color:#EC9A78}#grad-warn stop+stop{stop-color:#F2B04E}#grad-danger stop+stop{stop-color:#F2705C}}`

const EXPANDED_STYLE =
  `.num{font-size:${NUM_SIZE}px;font-weight:700;fill:#F4F2EC;font-variant-numeric:tabular-nums}.num.dim{fill:#6E6C66}.num.sm{font-size:${NUM_SMALL_SIZE}px}` +
  `.pct{font-size:${PCT_SIZE}px;font-weight:600;fill:#9C9A93}` +
  `.lab{font-size:${LAB_SIZE}px;font-weight:500;fill:#ECEAE4;letter-spacing:.2px}.lab.stk{font-size:${STACKED_LABEL}px;letter-spacing:0}` +
  `.sub,.sub2{font-size:${SUB_SIZE}px;fill:#8C8A84;font-variant-numeric:tabular-nums;transition:opacity .22s ease,filter .22s ease}` +
  `.sub2{opacity:0;filter:blur(2px);fill:#C9C6BE}` +
  `.track{fill:none;stroke:#2C2B29;stroke-width:${RING_STROKE}}` +
  `.arc,.glow{fill:none;stroke-width:${RING_STROKE};stroke-linecap:round}` +
  `.glow{stroke-width:${RING_STROKE + 1};filter:url(#blur);opacity:.5}.glow.danger{animation:dpulse 1.6s ease-in-out infinite}` +
  `.ring{transform-box:fill-box;transform-origin:center;transition:transform .4s ${SPRING}}` +
  `.g{transform-box:fill-box}.g.enter{animation:rise .55s ${OUT} both}` +
  `.chip{font-size:9.5px;font-weight:700;opacity:0;animation:chip 1.8s ${OUT} .25s both}` +
  `.chip.ok{fill:#F3B18F}.chip.warn{fill:#FFCB7A}.chip.danger{fill:#FF8F7A}` +
  `@media (hover:hover){.g:hover .ring{transform:scale(1.09)}.g:hover .sub{opacity:0;filter:blur(2px)}.g:hover .sub2{opacity:1;filter:blur(0)}}` +
  `.glyph{font-size:2.3px;font-weight:700;fill:#F0EEE6;opacity:0;animation:float 2.4s ${OUT} infinite}` +
  `@keyframes rise{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}` +
  `@keyframes chip{0%{opacity:0;transform:translateY(4px)}18%{opacity:1;transform:none}75%{opacity:1}100%{opacity:0;transform:translateY(-6px)}}` +
  `@keyframes dpulse{0%,100%{opacity:.35}50%{opacity:.9}}` +
  `@keyframes float{0%{opacity:0;transform:translate(0,1px) scale(.7)}18%{opacity:.9;transform:translate(.3px,-1px) scale(1)}100%{opacity:0;transform:translate(1.2px,-8px) scale(.9)}}` +
  `.sep{stroke:#2A2927}` +
  `@media (prefers-color-scheme:light){` +
  `.num{fill:#1F1E1D}.num.dim{fill:#B4B1A8}.pct{fill:#8A877E}.lab{fill:#2D2C2A}.sub{fill:#77746C}.sub2{fill:#46443F}` +
  `.track{stroke:#E8E5DC}.sep{stroke:#E5E2D9}.glow{opacity:.3}.chip.ok{fill:#C2603F}.chip.warn{fill:#B26E12}.chip.danger{fill:#D2392B}.glyph{fill:#6B6862}` +
  `}`

const COST_STYLE =
  `.cost-badge{fill:url(#grad-ok);stroke:#F3B18F;stroke-width:1.2}.cost-glyph{font-size:21px;font-weight:800;fill:#231511;text-anchor:middle}.cost-glyph.in-badge{font-size:15px}.cost-value{font-size:${SUB_SIZE}px;font-weight:700;fill:#ECEAE4;font-variant-numeric:tabular-nums}.cost-value.in-badge{font-size:8px}.cost-sub{font-size:10px;fill:#8C8A84}` +
  `@media (prefers-color-scheme:light){.cost-badge{stroke:#C2603F}.cost-glyph{fill:#231511}.cost-value{fill:#2D2C2A}.cost-sub{fill:#77746C}}`

const MINI_STYLE =
  `.pace{transform-origin:center}.mini.working .pace{animation:pace 3.2s ease-in-out infinite}` +
  `.mini.working .legA,.mini.working .legB{opacity:1}.mini.working .legA{animation:step .3s ease-in-out infinite alternate}.mini.working .legB{animation:step .3s ease-in-out .15s infinite alternate}` +
  `.mlab{font-size:${MINI_LABEL_SIZE}px;fill:#8C8A84}.mval{font-size:${MINI_VALUE_SIZE}px;font-weight:700;fill:#ECEAE4;font-variant-numeric:tabular-nums}.mtrack{fill:#2C2B29}.mfill.danger{animation:mpulse 1.6s ease-in-out infinite}` +
  `@keyframes pace{0%{transform:none}46%{transform:translateX(10px)}50%{transform:translateX(10px) scaleX(-1)}96%{transform:scaleX(-1)}100%{transform:none}}` +
  `@keyframes mpulse{0%,100%{opacity:.6}50%{opacity:1}}` +
  `@keyframes step{from{transform:none}to{transform:translateY(-.9px)}}` +
  `@media (prefers-color-scheme:light){.mtrack{fill:#E8E5DC}.mlab{fill:#77746C}.mval{fill:#2D2C2A}}`

const TIMER_STYLE =
  `.tm{font-weight:600;fill:#F3B18F;font-variant-numeric:tabular-nums}.tm .warn{fill:#FFCB7A}.tm.cold,.tm .cold{fill:#6E6C66;font-weight:500}` +
  `@media (prefers-color-scheme:light){.tm,.tm.cold{fill:#C2603F}.tm .warn{fill:#B26E12}.tm .cold{fill:#B4B1A8}}`

const HALLOWEEN_STYLE =
  // 万圣节：干活时南瓜桶收起来（手要敲电脑）；讨糖时桶摇、问号上下跳、青筋一跳一跳、头顶冒烟（细条太矮，问号和青筋会出上沿，不画）
  `.working .hw-pail{opacity:0}.mini .hw-q,.mini .hw-vein{display:none}` +
  `.hw-beg{transform-origin:50% 0;animation:beg .45s ease-in-out infinite alternate}` +
  `.hw-q{font-size:3.2px;font-weight:800;fill:#F2C14E;animation:qbob .8s ease-in-out infinite alternate}` +
  `.hw-vein{animation:vein .5s ease-in-out infinite alternate}` +
  `.hw-steam{opacity:0;transform-origin:center;animation:steam 1s ease-out infinite}` +
  `@keyframes beg{from{transform:rotate(-9deg)}to{transform:translateY(-.5px) rotate(9deg)}}` +
  `@keyframes qbob{from{transform:none}to{transform:translateY(-.7px)}}` +
  `@keyframes vein{from{transform:scale(.8)}to{transform:scale(1.15)}}` +
  `@keyframes steam{0%{opacity:0;transform:scale(.4)}30%{opacity:.8}100%{opacity:0;transform:translateY(-2.6px) scale(1.3)}}` +
  `.halloween-paper{fill:#F4F2EC}.halloween-neutral{fill:#C9C6BE}.halloween-pink{fill:#F7909F}.halloween-gold{fill:#F2C14E}.halloween-orange{fill:#F28C28}.halloween-blue{fill:#5FB0F0}` +
  `@media (prefers-color-scheme:light){.hw-q{fill:#C2603F}.halloween-paper{fill:#514E47}.halloween-neutral{fill:#77746C}.halloween-pink{fill:#A74254}.halloween-pink[opacity=".55"]{opacity:1}.halloween-gold{fill:#8A5B00}.halloween-orange{fill:#B65B00}.halloween-blue{fill:#276F9F}}`

const ACTIVITY_STYLE =
  `.activity-icon{shape-rendering:crispEdges}` +
  Object.entries(ACTIVITY_COLORS).map(([code, color]) => `.activity-pixel.pixel-${code.toLowerCase()}{fill:${color}}`).join('') +
  `@media (prefers-color-scheme:light){.activity-pixel.pixel-w,.activity-pixel.pixel-s{fill:#4D4A43}.activity-pixel.pixel-t{fill:#377C60}.activity-pixel.pixel-p{fill:#A84F35}.activity-pixel.pixel-y,.activity-pixel.pixel-a{fill:#8A5B00}.activity-pixel.pixel-g{fill:#4B765D}.activity-pixel.pixel-b{fill:#3C6F92}}` +
  `.activity-spinner{transform-box:fill-box;transform-origin:center;animation:activity-spin .9s steps(8) infinite}@keyframes activity-spin{to{transform:rotate(360deg)}}`
const NEEDS_STYLE =
  `.needs-you .eyes{transform:scale(1.25);transform-origin:center}.needs-you .hop{animation:needs-hop .85s ease-in-out infinite}.needs-you .activity-icon{animation:needs-blink .7s steps(2,end) infinite}` +
  `@keyframes needs-hop{0%,100%{transform:none}50%{transform:translateY(-1.4px)}}@keyframes needs-blink{0%,49%{opacity:1}50%,100%{opacity:0}}`
const DONE_STYLE =
  `.done .eyes{opacity:0}.done .happy{opacity:1}.done .shades{opacity:0;animation:none}.done-sparkle{opacity:.75;animation:done-sparkle 1.1s ease-in-out infinite}.done-sparkle-pixel{fill:#F2C14E}@media (prefers-color-scheme:light){.done-sparkle-pixel{fill:#8A5B00}}` +
  `@keyframes done-sparkle{0%,100%{opacity:.4}50%{opacity:1;transform:scale(1.15)}}`
const COMPACTING_STYLE =
  `.compacting .hop{transform:scale(1.18,.76);transform-origin:50% 100%;animation:compacting-squish .36s ease-in-out infinite alternate}` +
  `@keyframes compacting-squish{from{transform:scale(1.12,.82)}to{transform:scale(1.24,.7)}}`
const SLEEP_STYLE =
  `.clawd.sleep{opacity:.5}.sleep .eyes{opacity:0}.sleep .shades{opacity:0;animation:none}.sleep-eyes{display:block}.sleep .hop,.sleep .pace{animation:none!important;transform:none}.sleep-z{opacity:.8;animation:sleep-z 1.8s ease-out infinite}` +
  `.sleep-z-pixel{fill:#F0EEE6}@media (prefers-color-scheme:light){.sleep-z-pixel{fill:#4D4A43}}` +
  `@keyframes sleep-z{0%{opacity:0;transform:translateY(1px)}20%{opacity:.8}100%{opacity:0;transform:translateY(-2.5px)}}`
const REACTION_STYLE =
  `.reaction .eyes,.reaction .shades{opacity:0;animation:none}.reaction .happy{opacity:0}` +
  `.reaction.test-pass .happy{opacity:1}.reaction.test-pass .armL{transform-origin:100% 100%;transform:rotate(42deg) translateY(-.45px)}.reaction.test-pass .armR{transform-origin:0 100%;transform:rotate(-42deg) translateY(-.45px)}` +
  `.reaction.test-pass .hop{animation:reaction-hop .78s ease-in-out infinite}.reaction.test-fail .reaction-x-eyes,.reaction.oops .reaction-x-eyes,.reaction.tantrum .angry-eyes{display:block}` +
  `.clawd.reaction.test-fail .happy,.clawd.reaction.oops .happy,.clawd.reaction.tantrum .happy{opacity:0}` +
  `.reaction.oops .hop{animation:oops-shake .32s ease-in-out infinite}.reaction.tantrum .hop{animation:tantrum-stomp .42s steps(2,end) infinite}` +
  `.reaction.tantrum .legA,.reaction.tantrum .legB{transform-origin:50% 0;animation:stomp-leg .42s steps(2,end) infinite}.reaction.tantrum .legB{animation-delay:.21s}` +
  `.reaction-confetti{shape-rendering:crispEdges}.confetti-piece{transform-origin:center;animation:confetti-float 1.2s ease-in-out infinite alternate}.tantrum-steam{opacity:.95}.tantrum-steam g{transform-origin:center;animation:steam-puff 1s ease-out infinite alternate}` +
  `.tantrum-steam .steam-pixel-mid{fill:#B4B1A8}.tantrum-steam .steam-pixel-dark{fill:#8C8A84}.tantrum-steam .steam-pixel-light{fill:#D4D1C9}` +
  `.reaction-pixel-blue{fill:#69A9D0}.reaction-pixel-gold{fill:#F2C14E}.reaction-pixel-green{fill:#91BDA2}` +
  `@media (prefers-color-scheme:light){.tantrum-steam .steam-pixel-mid{fill:#6C6962}.tantrum-steam .steam-pixel-dark{fill:#77746C}.tantrum-steam .steam-pixel-light{fill:#5E5B54}.reaction-pixel-blue{fill:#3C6F92}.reaction-pixel-gold{fill:#8A5B00}.reaction-pixel-green{fill:#4B765D}}` +
  `@keyframes reaction-hop{0%,100%{transform:none}50%{transform:translateY(-1.5px)}}@keyframes oops-shake{0%,100%{transform:none}25%{transform:translateX(-.55px)}75%{transform:translateX(.55px)}}` +
  `@keyframes tantrum-stomp{0%,100%{transform:translateY(0)}50%{transform:translateY(-.45px)}}@keyframes stomp-leg{from{transform:rotate(-12deg)}to{transform:rotate(12deg)}}` +
  `@keyframes confetti-float{from{transform:translateY(0) rotate(0)}to{transform:translateY(-1px) rotate(18deg)}}@keyframes steam-puff{from{opacity:.5;transform:translateY(0)}to{opacity:1;transform:translateY(-1px)}}`
const MOOD_STYLE =
  `.mood-coffee{shape-rendering:crispEdges}.mood-steam{transform-origin:center;animation:mood-steam 2.6s ease-in-out infinite}` +
  `.mood-gold{fill:#F2C14E}.mood-sun-highlight{fill:#FFD86A}.mood-petal-pink{fill:#F7909F}.mood-autumn-coral{fill:#D97757}.mood-autumn-amber{fill:#E7A44C}.mood-autumn-russet{fill:#C2603F}.mood-blue{fill:#69A9D0}.mood-coral{fill:#E98D6E}` +
  `.mood-paper-white{fill:#F4F2EC}.mood-snow-bright{fill:#F4F2EC}.mood-snow-cool{fill:#DDE8F2}.mood-coffee-cup{fill:#E7DDD0}.mood-coffee-handle{stroke:#E7DDD0}.mood-steam{stroke:#D4D1C9}` +
  `@media (prefers-color-scheme:light){.mood-gold,.mood-sun-highlight{fill:#8A5B00}.mood-petal-pink{fill:#A74254}.mood-autumn-coral{fill:#A84F35}.mood-autumn-amber{fill:#8A4F0A}.mood-autumn-russet{fill:#C2603F}.mood-blue{fill:#3C6F92}.mood-coral{fill:#A84F35}.mood-paper-white{fill:#514E47}.mood-snow-bright{fill:#5B6B79}.mood-snow-cool{fill:#647B8E}.mood-coffee-cup{fill:#5A4638}.mood-coffee-handle{stroke:#5A4638}.mood-steam{stroke:#6B6862}}` +
  `.mood-particles,.mood-sun,.mood-fireworks{shape-rendering:crispEdges}.mood-particle{transform-origin:center;animation:mood-fall 8s ease-in-out infinite}.mood-firework{transform-origin:center;animation:mood-firework 3.6s ease-in-out infinite alternate}` +
  `@keyframes mood-fall{from{opacity:.25;transform:translateY(-1px)}20%{opacity:1}to{opacity:.35;transform:translateY(2.5px)}}@keyframes mood-firework{0%,100%{opacity:.45;transform:scale(.8)}50%{opacity:1;transform:scale(1.1)}}@keyframes mood-steam{0%,100%{opacity:.35;transform:translateY(0)}50%{opacity:.8;transform:translateY(-.7px)}}`
const SWEAT_STYLE =
  `.sweat{fill:#8FD0FF}.sweat{animation:drip 1.5s ease-in infinite}` +
  `@keyframes drip{0%{opacity:0;transform:none}20%{opacity:1}100%{opacity:0;transform:translateY(2.4px)}}` +
  `@media (prefers-color-scheme:light){.sweat{fill:#2D7FB8}}`

function activityStyle(activity?: Activity, showIcon = true): string {
  if (!activity || activity.kind === 'idle') return ''
  return (
    (activity.icon && showIcon ? ACTIVITY_STYLE : '') +
    (activity.kind === 'needs-you' ? NEEDS_STYLE : '') +
    (activity.kind === 'done' ? DONE_STYLE : '') +
    (activity.kind === 'compacting' ? COMPACTING_STYLE : '') +
    (activity.kind === 'sleep' ? SLEEP_STYLE : '') +
    (activity.kind === 'reaction' ? REACTION_STYLE : '') +
    (activity.kind === 'reaction' && activity.reaction === 'test-fail' ? SWEAT_STYLE : '')
  )
}

const DEFS =
  `<defs>` +
  `<linearGradient id="grad-ok" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#D97757"/><stop offset="1" stop-color="#F5BC98"/></linearGradient>` +
  `<linearGradient id="grad-warn" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E9963F"/><stop offset="1" stop-color="#FFD58A"/></linearGradient>` +
  `<linearGradient id="grad-danger" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E5484D"/><stop offset="1" stop-color="#FF9A82"/></linearGradient>` +
  `<radialGradient id="aura"><stop offset="0" stop-color="#D97757" stop-opacity=".22"/><stop offset="1" stop-color="#D97757" stop-opacity="0"/></radialGradient>` +
  `<filter id="blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.2"/></filter>` +
  `</defs>`

// 干活时用三张固定种子的图案轮流闪烁；单元格按密度拆成常亮底层和渐变显出的高密度层。
const ditherHash = (n: number) => {
  let x = n + 0x9e3779b9
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad)
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97)
  return (x ^ (x >>> 15)) >>> 0
}

const DITHER_CELLS = Array.from({ length: 100 }, (_, i) => i).sort((a, b) => ditherHash(a) - ditherHash(b))
const DITHER_BASE = new Set(DITHER_CELLS.slice(0, 22))
const ditherPath = (cells: number[]) =>
  cells.map(i => `M${(i % 10) * 3} ${Math.floor(i / 10) * 3}h2v2h-2z`).join('')

const DITHER_STYLE =
  `@media (prefers-color-scheme:dark){` +
  `.ultra-dither{opacity:.4}` +
  `.gauges text{paint-order:stroke;stroke:#1C1B1A;stroke-width:3px;stroke-linejoin:round}.gauges .cost-glyph{stroke:none}` +
  `.mlab,.sub,.pct,.dim{fill:#E5E5E5}` +
  `.ultra-dither .layer-0{opacity:.8;animation:ultra-dither-twinkle-0 1.2s ease-in-out -.4s infinite alternate}` +
  `.ultra-dither .layer-1{opacity:.8;animation:ultra-dither-twinkle-1 2s ease-in-out -1.1s infinite alternate}` +
  `.ultra-dither .layer-2{opacity:.8;animation:ultra-dither-twinkle-2 2.8s ease-in-out -2.2s infinite alternate}` +
  `@keyframes ultra-dither-twinkle-0{from{opacity:.6}to{opacity:1}}` +
  `@keyframes ultra-dither-twinkle-1{from{opacity:1}to{opacity:.6}}` +
  `@keyframes ultra-dither-twinkle-2{from{opacity:.6}to{opacity:1}}` +
  `}@media (prefers-color-scheme:light){.ultra-dither{display:none}}`

function ditherSvg(width: number, height: number): string {
  const patterns = Array.from({ length: 3 }, (_, layer) => {
    const base = DITHER_CELLS.filter(i => DITHER_BASE.has(i) && i % 3 === layer)
    const added = DITHER_CELLS.filter(i => !DITHER_BASE.has(i) && i % 3 === layer)
    return (
      `<pattern id="ultra-dither-pattern-${layer}" width="30" height="30" patternUnits="userSpaceOnUse">` +
      `<path fill="#fff" d="${ditherPath(base)}"/></pattern>` +
      `<pattern id="ultra-dither-pattern-add-${layer}" width="30" height="30" patternUnits="userSpaceOnUse">` +
      `<path fill="#fff" d="${ditherPath(added)}"/>` +
      `</pattern>`
    )
  }).join('')
  const masks = Array.from(
    { length: 3 },
    (_, layer) =>
      `<mask id="ultra-dither-mask-${layer}"><rect width="${width}" height="${height}" fill="url(#ultra-dither-pattern-${layer})"/></mask>` +
      `<mask id="ultra-dither-mask-add-${layer}"><rect width="${width}" height="${height}" fill="url(#ultra-dither-pattern-add-${layer})"/></mask>`,
  ).join('')
  const layers = Array.from({ length: 3 }, (_, layer) =>
    `<g class="layer-${layer}">` +
    `<rect width="${width}" height="${height}" fill="url(#ultra-dither-color)" mask="url(#ultra-dither-mask-${layer})"/>` +
    `<g mask="url(#ultra-dither-density-mask)"><rect width="${width}" height="${height}" fill="url(#ultra-dither-color)" mask="url(#ultra-dither-mask-add-${layer})"/></g>` +
    `</g>`,
  ).join('')

  return (
    `<defs>` +
    `<linearGradient id="ultra-dither-color" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0" stop-color="#4a3f8a" stop-opacity=".6"/><stop offset="25%" stop-color="#6a5acd" stop-opacity=".7"/>` +
    `<stop offset="50%" stop-color="#8a76e8" stop-opacity=".8"/><stop offset="75%" stop-color="#b9a3ff" stop-opacity=".9"/>` +
    `<stop offset="100%" stop-color="#d0b4ff"/></linearGradient>` +
    `<linearGradient id="ultra-dither-density" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${width}" y2="0">` +
    `<stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="25%" stop-color="#fff" stop-opacity=".33"/>` +
    `<stop offset="50%" stop-color="#fff" stop-opacity=".57"/><stop offset="75%" stop-color="#fff" stop-opacity=".79"/>` +
    `<stop offset="100%" stop-color="#fff"/></linearGradient>` +
    patterns + masks +
    `<mask id="ultra-dither-density-mask" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="url(#ultra-dither-density)"/></mask>` +
    `<clipPath id="ultra-dither-clip"><rect width="${width}" height="${height}" rx="7"/></clipPath>` +
    `</defs><g class="ultra-dither" clip-path="url(#ultra-dither-clip)">${layers}</g>`
  )
}

// ───────────────────────── 整条 ─────────────────────────

// 收起后的细条：小 Clawd + 所有可用读数的「标签 细进度条 百分比」，同样左右留白相等、间距相等；不画分隔线，靠间距分组
function miniSvg(gauges: Gauge[], isWorking: boolean, isStressed: boolean, width: number, isChill: boolean, pet?: PetView, lang: Lang = 'zh', activity?: Activity): string {
  // 窄窗口同样逐级收：标签 + 细条 + 百分比 → 标签 + 百分比 → 短标签 + 百分比 → 只剩百分比（完整标签在悬停提示里）
  const measure = (showBar: boolean, showLabel: boolean, isShort = false) =>
    gauges.map(g => {
      const value = g.kind === 'cost' ? g.sub : g.to === undefined ? '—' : `${Math.round(g.to)}%`
      const label = isShort ? (g.short ?? g.label) : g.label
      const labelW = showLabel ? textWidth(label, MINI_LABEL_SIZE) : 0
      const valueW = textWidth(value, MINI_VALUE_SIZE) * 1.05
      const showProgress = showBar && g.kind !== 'cost'

      return { g, value, label, labelW, valueW, showBar: showProgress, showLabel, w: (showLabel ? labelW + 8 : 0) + (showProgress ? MINI_BAR + 8 : 0) + valueW + timerWidth(g, TIMER_SIZE) }
    })
  // 间距至少 24px：Clawd 干活时会往右跑 20px，不能撞上第一项
  const fits = (list: { w: number }[], activityReserve = 0) =>
    2 * MINI_X + MINI_LAYOUT_W + activityReserve + list.reduce((a, b) => a + b.w, 0) + list.length * 24 <= width
  const compact = measure(false, false)
  const layouts = [measure(true, true), measure(false, true), measure(false, true, true), compact]
  const iconItems = activity?.icon ? layouts.find(list => fits(list, MINI_ACTIVITY_RESERVE)) : undefined
  const showActivityIcon = iconItems !== undefined
  const items = iconItems ?? layouts.find(list => fits(list)) ?? compact
  const activityReserve = showActivityIcon ? MINI_ACTIVITY_RESERVE : 0
  const mood = moodForClawd(isWorking, activity, pet)
  const hasTimer = gauges.some(g => g.timerMs !== undefined)
  const layoutWidth = MINI_LAYOUT_W + activityReserve
  const gap = Math.max(24, (width - 2 * MINI_X - layoutWidth - items.reduce((a, b) => a + b.w, 0)) / items.length)
  let x = MINI_X + layoutWidth + gap
  const parts: string[] = []
  items.forEach(({ g, value, label, labelW, valueW, showBar, showLabel, w }) => {
    const t = g.tier ?? tier(g.to ?? 0)
    const barX = x + (showLabel ? labelW + 8 : 0)
    const fill = ((Math.min(100, Math.max(0, g.to ?? 0)) / 100) * MINI_BAR).toFixed(1)
    parts.push(
      `<g><title>${g.title}</title>` +
        `<rect x="${x.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${H_MINI}" fill="transparent"/>` +
        (showLabel ? `<text x="${x.toFixed(1)}" y="${MINI_TEXT_BASELINE}" class="mlab">${label}</text>` : '') +
        (showBar ? `<rect x="${barX.toFixed(1)}" y="${MINI_BAR_Y}" width="${MINI_BAR}" height="${MINI_BAR_H}" rx="${MINI_BAR_H / 2}" class="mtrack"/>` : '') +
        (showBar && (g.to ?? 0) > 0.4
          ? `<rect x="${barX.toFixed(1)}" y="${MINI_BAR_Y}" width="${fill}" height="${MINI_BAR_H}" rx="${MINI_BAR_H / 2}" fill="url(#grad-${t})" class="mfill ${t}"/>`
          : '') +
        `<text x="${(barX + (showBar ? MINI_BAR + 8 : 0)).toFixed(1)}" y="${MINI_TEXT_BASELINE}" class="mval">${value}</text>` +
        (g.timerMs === undefined ? '' : cacheTimerSvg(barX + (showBar ? MINI_BAR + 8 : 0) + valueW + 6, MINI_TEXT_BASELINE, g.timerMs, lang, TIMER_SIZE, MINI_VALUE_SIZE)) +
        `</g>`,
    )
    x += w + gap
  })

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${H_MINI}" width="${width}" height="${H_MINI}" style="color-scheme:light dark;background:transparent">` +
    `<style>${STYLE}${MINI_STYLE}${activityStyle(activity, showActivityIcon)}${isStressed ? SWEAT_STYLE : ''}${mood ? MOOD_STYLE : ''}${pet?.halloween ? HALLOWEEN_STYLE : ''}${hasTimer ? TIMER_STYLE : ''}${isWorking ? DITHER_STYLE : ''}</style>` +
    DEFS +
    (isWorking ? ditherSvg(width, H_MINI) : '') +
    `<g class="gauges">${parts.join('')}</g>` +
    clawd(isWorking, isStressed, false, true, isChill, pet, activity, showActivityIcon) +
    `</svg>`
  )
}

// cacheTimer：离缓存过期的毫秒数和有效期（Claude 干活时不显示：那时缓存一直在用）
export type CacheTimer = { remainMs: number; ttlMs: number }

export function bandSvg(bars: Bars, isWorking: boolean, width: number, mini = false, lang: Lang = 'zh', pet?: PetView, cacheTimer?: CacheTimer, activity?: Activity): string {
  timerLang = lang
  // The host's live working flag outranks a lingering done/sleep pose.
  const displayActivity: Activity | undefined =
    isWorking && (activity?.kind === 'done' || activity?.kind === 'sleep') ? { kind: 'working' } : activity
  const mood = moodForClawd(isWorking, displayActivity, pet)
  const { from, to } = bars
  // $.state 存取会序列化，from/to 永远是两个对象，必须比内容
  const isChanged = JSON.stringify(from) !== JSON.stringify(to)
  const isFirst = from === null
  const isStressed = Math.max(to?.session?.percent ?? 0, to?.weekly?.percent ?? 0, to?.fable?.percent ?? 0) >= 90
  // 放松模式（@Joshua_WD 的点子）：缓存命中 ≥90% 且额度没告急 → 戴墨镜、呼吸变慢
  const isChill = !isStressed && (to?.cache?.rate ?? 0) >= 90
  const css: string[] = []

  const t = T[lang]
  const pct = (v: number | undefined) => (v === undefined ? '—' : `${Math.round(v)}%`)
  const timer = isWorking ? undefined : cacheTimer
  const gauges: Gauge[] = [
    {
      id: 'c',
      label: t.context,
      short: t.short.context,
      sub: to?.contextTokens !== undefined ? `${tokensText(to.contextTokens)} / ${tokensText(to.contextWindow)}` : t.waitingReply,
      detail: to?.contextTokens !== undefined ? t.tokens(grouped(to.contextTokens)) : t.waitingReply,
      title: to?.contextTokens !== undefined ? `${t.context} ${pct(to.contextPercent)} · ${grouped(to.contextTokens)} / ${grouped(to.contextWindow)} tokens` : `${t.context}: ${t.waitingReply}`,
      from: from?.contextPercent,
      to: to?.contextPercent,
    },
    {
      id: 's',
      label: t.session,
      short: t.short.session,
      sub: resetText(to?.session?.resetsAt, lang) || t.noData,
      detail: leftText(to?.session?.resetsAt, lang) || t.noData,
      title: to?.session ? `${t.session} ${to.session.percent}% · ${resetText(to.session.resetsAt, lang)}` : `${t.session}: ${t.noData}`,
      from: from?.session?.percent,
      to: to?.session?.percent,
    },
    {
      id: 'w',
      label: t.weekly,
      short: t.short.weekly,
      sub: resetText(to?.weekly?.resetsAt, lang) || t.noData,
      detail: leftText(to?.weekly?.resetsAt, lang) || t.noData,
      title: to?.weekly ? `${t.weekly} ${to.weekly.percent}% · ${resetText(to.weekly.resetsAt, lang)}` : `${t.weekly}: ${t.noData}`,
      from: from?.weekly?.percent,
      to: to?.weekly?.percent,
    },
    ...(to?.fable
      ? [
          {
            id: 'f',
            label: t.fable,
            short: t.short.fable,
            sub: resetText(to.fable.resetsAt, lang) || t.noData,
            detail: leftText(to.fable.resetsAt, lang) || t.noData,
            title: `${t.fable} ${to.fable.percent}% · ${resetText(to.fable.resetsAt, lang) || t.noData}`,
            from: from?.fable?.percent,
            to: to.fable.percent,
          },
        ]
      : []),
    {
      id: 'k',
      // 命中越高越好：低于 50% 才提醒
      tier: (to?.cache?.rate ?? 100) < 50 ? 'warn' : 'ok',
      label: t.cache,
      short: t.short.cache,
      sub: to?.cache ? t.cacheRead(tokensText(to.cache.read)) : t.waitingReply,
      detail: to?.cache ? t.cacheTurn(pct(to.cache.turnRate)) : t.waitingReply,
      title:
        (to?.cache ? t.cacheTitle(to.cache.rate, grouped(to.cache.read), grouped(to.cache.write), grouped(to.cache.fresh)) : `${t.cache}: ${t.waitingReply}`) +
        (timer ? ` · ${t.cacheTimerTitle(timer.ttlMs >= 3600000 ? t.ttlHour : t.ttlFive)}` : ''),
      from: from?.cache?.rate,
      to: to?.cache?.rate,
      timerMs: timer?.remainMs,
    },
    ...(to?.cost
      ? [
          {
            kind: 'cost' as const,
            id: 'cost',
            label: t.cost,
            short: t.short.cost,
            sub: formatCost(to.cost.usd),
            detail: t.thisSession,
            title: `${t.cost} ${formatCost(to.cost.usd)} · ${t.thisSession}`,
            from: from?.cost?.usd,
            to: to.cost.usd,
          },
        ]
      : []),
  ]
  const hasCost = gauges.some(g => g.kind === 'cost')
  if (mini) {
    return miniSvg(gauges, isWorking, isStressed, width, isChill, pet, lang, displayActivity)
  }
  const hasTimer = gauges.some(g => g.timerMs !== undefined)

  // 按内容实际宽度排：左右留白相等（都是 CLAWD_X），Clawd 与每块之间的间距相等
  const hasActivityIcon = displayActivity?.icon !== undefined
  const clawdWidth = CLAWD_W + (hasActivityIcon ? ACTIVITY_LAYOUT_RESERVE : 0)
  const layout = pickLayout(gauges, width, clawdWidth)
  const widths = gauges.map(g => blockWidth(g, layout))
  const gap = Math.max(MIN_GAP[layout], (width - 2 * CLAWD_X - clawdWidth - widths.reduce((a, b) => a + b, 0)) / gauges.length)
  const xs: number[] = []
  widths.reduce((x, w) => (xs.push(x), x + w + gap), CLAWD_X + clawdWidth + gap)
  const blocks = gauges.map((g, i) => gauge(g, i, xs[i], widths[i], isChanged, isFirst, css, layout, lang)).join('')
  // 分隔线放在两块之间那段间距的正中间
  const seps = Array.from({ length: gauges.length - 1 }, (_, i) => i + 1)
    .map(i => {
      const mid = (xs[i] - gap / 2).toFixed(1)

      return `<line x1="${mid}" y1="${RING_CY - R + 1}" x2="${mid}" y2="${RING_CY + R - 1}" class="sep"/>`
    })
    .join('')

  const clawdChanged = isChanged && !isFirst

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${H}" width="${width}" height="${H}" style="color-scheme:light dark;background:transparent">` +
    `<style>${STYLE}${EXPANDED_STYLE}${activityStyle(displayActivity)}${isStressed ? SWEAT_STYLE : ''}${mood ? MOOD_STYLE : ''}${pet?.halloween ? HALLOWEEN_STYLE : ''}${hasTimer ? TIMER_STYLE : ''}${hasCost ? COST_STYLE : ''}${css.join('')}${isWorking ? DITHER_STYLE : ''}</style>` +
    DEFS +
    (isWorking ? ditherSvg(width, H) : '') +
    `<g class="gauges">${seps}${blocks}</g>` +
    clawd(isWorking, isStressed, clawdChanged, false, isChill, pet, displayActivity) +
    `</svg>`
  )
}

export function bandAlt(to: Snap | null, isWorking: boolean, lang: Lang = 'zh'): string {
  const t = T[lang]
  const pct = (v: number | undefined) => (v === undefined ? '—' : `${Math.round(v)}%`)
  const sep = lang === 'zh' ? '，' : ', '

  return (
    [
      `${t.context} ${pct(to?.contextPercent)}`,
      `${t.session} ${pct(to?.session?.percent)}`,
      `${t.weekly} ${pct(to?.weekly?.percent)}`,
      ...(to?.fable ? [`${t.fable} ${pct(to.fable.percent)}`] : []),
      `${t.cache} ${pct(to?.cache?.rate)}`,
      ...(to?.cost ? [`${t.cost} ${formatCost(to.cost.usd)}`] : []),
    ].join(sep) +
    (lang === 'zh' ? '；' : '; ') +
    (isWorking ? t.working : t.resting)
  )
}
