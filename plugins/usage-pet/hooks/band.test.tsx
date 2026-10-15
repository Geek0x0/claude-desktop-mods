import { expect, mock, test } from 'claude-code/testing'

import type { Activity, Bars } from '../types'
import { moodAt } from './mood'
import {
  bandSvg,
  H,
  H_MINI,
  MIN_BAND_W,
  MIN_BAND_W_WITH_ACTIVITY,
  MIN_BAND_W_WITH_FABLE,
  MIN_BAND_W_WITH_FABLE_AND_ACTIVITY,
} from './band'

// 原有用例都按中文界面断言：显式指定 /config 的 language = zh
const ZH = { options: { language: 'zh' } }

const BAND = (isWorking: boolean) => ({
  plugin: 'usage-pet',
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking, maxRows: 12, bodyColumns: 140, scroll: { offset: 0, bodyRows: 12 }, view: {} },
  viewport: { columns: 140, rows: 40 },
})

const measure = (ctx: number, session: number, weekly: number) => ({
  context: { window: 200000, tokens: ctx * 2000, percent: ctx },
  rateLimits: [
    { kind: 'five_hour', percentUsed: session, resetsAt: new Date(Date.now() + 50 * 60000).toISOString() },
    { kind: 'seven_day', percentUsed: weekly, resetsAt: new Date(Date.now() + 3 * 86400000).toISOString() },
  ],
  changed: ['context', 'rateLimits'] as ('context' | 'rateLimits')[],
})

const svgOf = async (ui: { findAll: (q: { type: 'Svg' }) => Promise<{ props?: Record<string, unknown> }[]> }) =>
  (await ui.findAll({ type: 'Svg' }))[0]

const EMPTY_BARS = { from: null, to: null }

function fingerprint(source: string): number {
  let hash = 2166136261
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619)
  return hash >>> 0
}

test('干活时：展开和细条都有紫色像素背景，且背景在读数和 Clawd 之前', ZH, async () => {
  for (const mini of [false, true]) {
    const source = bandSvg(EMPTY_BARS, true, 1100, mini)
    const height = mini ? H_MINI : H
    const background = source.indexOf('class="ultra-dither"')
    expect(background).toBeGreaterThan(-1)
    expect(background).toBeLessThan(source.indexOf('<g class="gauges">'))
    expect(background).toBeLessThan(source.indexOf('class="clawd working'))
    expect(source).toContain('id="ultra-dither-pattern-0"')
    expect(source).toContain('width="30" height="30" patternUnits="userSpaceOnUse"')
    expect(source).toContain('h2v2h-2z')
    expect(source).toContain('stop-color="#4a3f8a"')
    expect(source).toContain('stop-color="#d0b4ff"')
    expect(source).toContain('@media (prefers-color-scheme:dark){.ultra-dither{opacity:.4}')
    expect(source).toContain('.gauges text{paint-order:stroke;stroke:#1C1B1A;stroke-width:3px;stroke-linejoin:round}')
    expect(source).toContain('.mlab,.sub,.pct,.dim{fill:#E5E5E5}')
    expect(source).toContain('rx="7"')
    expect(source).toContain('<stop offset="0" stop-color="#fff" stop-opacity="1"/>')
    expect(source).toContain('id="ultra-dither-density-mask"')
    expect(source).toContain('<g mask="url(#ultra-dither-density-mask)">')
    expect(source).toContain('id="ultra-dither-pattern-add-0"')
    expect(source).toContain(`viewBox="0 0 1100 ${height}" width="1100" height="${height}"`)
    expect(source).toContain(`maskContentUnits="userSpaceOnUse" x="0" y="0" width="1100" height="${height}"`)
    const patterns = [...source.matchAll(/<pattern\b[\s\S]*?<\/pattern>/g)].map(match => match[0])
    expect(patterns.join('')).not.toContain('ultra-dither-density')
    expect(source).toContain('@keyframes ultra-dither-twinkle')
    expect(source).toContain('@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}')
  }
})

test('圆环和细条：展开尺寸、描边、文字与进度条都按新比例绘制', ZH, async () => {
  const bars = {
    from: null,
    to: {
      contextPercent: 42,
      contextTokens: 84000,
      contextWindow: 200000,
      session: { percent: 8 },
      weekly: { percent: 63 },
      cache: { rate: 92, read: 9, write: 1, fresh: 0 },
    },
  } as unknown as Bars
  const expanded = bandSvg(bars, false, 1100)
  const mini = bandSvg(bars, false, 1100, true)

  expect(H).toBe(80)
  expect(H_MINI).toBe(30)
  expect(expanded).toContain('r="26" class="track"')
  expect(expanded).toContain('.track{fill:none;stroke:#2C2B29;stroke-width:5}')
  expect(expanded).toContain('.arc,.glow{fill:none;stroke-width:5;stroke-linecap:round}')
  expect(expanded).toContain('.glow{stroke-width:6;filter:url(#blur);opacity:.5}')
  expect(expanded).toContain('.num{font-size:12px;font-weight:700')
  expect(expanded).toContain('.num.sm{font-size:10.4px}')
  expect(expanded).toContain('.pct{font-size:8.2px;font-weight:600')
  expect(expanded).toContain('.lab{font-size:14px;font-weight:500')
  expect(expanded).toContain('.sub,.sub2{font-size:12px;')
  expect(expanded).toContain('translate(22 21.5) scale(4.5)')
  expect(mini).toContain('.mlab{font-size:13px;')
  expect(mini).toContain('.mval{font-size:13px;')
  expect(mini).toContain('y="12" width="40" height="6" rx="3" class="mtrack"')
  expect(mini).toMatch(/y="12" width="[\d.]+" height="6" rx="3" fill="url\(#grad-/)
  expect(mini).toContain('y="19" class="mlab"')
  expect(mini).toContain('y="19" class="mval"')
  expect(mini).toContain('translate(14 0) scale(3)')
  expect(MIN_BAND_W).toBe(372)
  expect(MIN_BAND_W_WITH_FABLE).toBe(436)
  expect(MIN_BAND_W_WITH_ACTIVITY).toBe(398)
  expect(MIN_BAND_W_WITH_FABLE_AND_ACTIVITY).toBe(462)
})

test('浅色外观：工作底纹隐藏，不叠加深色描边或标签颜色', ZH, async () => {
  const source = bandSvg(EMPTY_BARS, true, 1100)
  expect(source).toContain('@media (prefers-color-scheme:light){.ultra-dither{display:none}}')
  expect(source).not.toContain('@media (prefers-color-scheme:light){.gauges text{')
  expect(source).not.toContain('@media (prefers-color-scheme:light){.mlab,.sub,.pct,.dim{')
})

test('休息时：不画紫色像素背景，SVG 保持原样', ZH, async () => {
  const source = bandSvg(EMPTY_BARS, false, 1100)
  expect(source).not.toContain('ultra-dither')
  expect(source.length).toBe(18967)
  expect(fingerprint(source)).toBe(2498379622)
})

test('工具活动：展开图标替代浮动字形，细条仅在图标和首个读数之间留得下间距时显示', () => {
  const activity: Activity = { kind: 'working', icon: 'terminal', owner: 1 }
  const expanded = bandSvg(EMPTY_BARS, true, 1100, false, 'zh', undefined, undefined, activity)
  const expandedAtMin = bandSvg(EMPTY_BARS, true, MIN_BAND_W_WITH_ACTIVITY, false, 'zh', undefined, undefined, activity)
  const mini = bandSvg(EMPTY_BARS, true, 1100, true, 'zh', undefined, undefined, activity)
  const miniAtMin = bandSvg(EMPTY_BARS, true, MIN_BAND_W_WITH_ACTIVITY, true, 'zh', undefined, undefined, activity)
  const narrowMini = bandSvg(EMPTY_BARS, true, 110, true, 'zh', undefined, undefined, activity)
  const expandedClawd = expanded.match(/class="clawd working[^"]*" transform="translate\(([\d.]+) [\d.]+\) scale\(([\d.]+)\)"/)
  const expandedIcon = expanded.match(/class="activity-icon terminal" transform="translate\(([\d.]+) (-?[\d.]+)\) scale\(([\d.]+)\)"/)
  const expandedFirstGauge = expandedAtMin.match(/<g class="g[^\"]*"[^>]*><title>[\s\S]*?<rect x="([\d.]+)" y="0"/)
  const miniClawd = mini.match(/class="clawd working[^"]* mini" transform="translate\(([\d.]+) [\d.]+\) scale\(([\d.]+)\)"/)
  const miniIcon = mini.match(/class="activity-icon terminal" transform="translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)"/)

  expect(expanded).toContain('class="activity-icon terminal"')
  expect(expandedClawd).not.toBeNull()
  expect(expandedIcon).not.toBeNull()
  const expandedClawdRight = Number(expandedClawd?.[1]) + 16 * Number(expandedClawd?.[2])
  const expandedIconLeft = Number(expandedClawd?.[1]) + Number(expandedIcon?.[1]) * Number(expandedClawd?.[2])
  expect(expandedIconLeft).toBeGreaterThanOrEqual(expandedClawdRight)
  expect(7 * Number(expandedIcon?.[3]) * Number(expandedClawd?.[2])).toBeGreaterThanOrEqual(22)
  expect(7 * Number(expandedIcon?.[3]) * Number(expandedClawd?.[2])).toBeLessThanOrEqual(27)
  expect(expanded).not.toContain('class="glyph"')
  expect(expanded).toContain('<g class="laptop">')
  expect(expanded).toContain('.working .armL{animation:tap')
  expect(mini).toContain('class="activity-icon terminal"')
  expect(miniClawd).not.toBeNull()
  expect(miniIcon).not.toBeNull()
  const miniClawdRight = Number(miniClawd?.[1]) + 16 * Number(miniClawd?.[2])
  const miniIconLeft = Number(miniClawd?.[1]) + Number(miniIcon?.[1]) * Number(miniClawd?.[2])
  expect(miniIconLeft).toBeGreaterThanOrEqual(miniClawdRight)
  expect(Math.abs(7 * Number(miniIcon?.[3]) * Number(miniClawd?.[2]) - 15.75) < 0.01).toBe(true)
  expect(expandedFirstGauge).not.toBeNull()
  const iconRight = Number(expandedClawd?.[1]) + (Number(expandedIcon?.[1]) + 7 * Number(expandedIcon?.[3])) * Number(expandedClawd?.[2])
  expect(Number(expandedFirstGauge?.[1])).toBeGreaterThanOrEqual(iconRight)
  const miniAtMinClawd = miniAtMin.match(/class="clawd working[^\"]* mini" transform="translate\(([\d.]+) [\d.]+\) scale\(([\d.]+)\)"/)
  const miniAtMinIcon = miniAtMin.match(/class="activity-icon terminal" transform="translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)"/)
  const miniAtMinFirstGauge = miniAtMin.match(/<g class="gauges">[\s\S]*?<rect x="([\d.]+)" y="0" width="[\d.]+" height="30"/)
  expect(miniAtMin).toContain('class="activity-icon terminal"')
  expect(miniAtMinClawd).not.toBeNull()
  expect(miniAtMinIcon).not.toBeNull()
  expect(miniAtMinFirstGauge).not.toBeNull()
  const miniIconRight =
    Number(miniAtMinClawd?.[1]) + (10 + Number(miniAtMinIcon?.[1]) + 7 * Number(miniAtMinIcon?.[3])) * Number(miniAtMinClawd?.[2])
  expect(Number(miniAtMinFirstGauge?.[1])).toBeGreaterThanOrEqual(miniIconRight)
  expect(Number(mini.match(/<rect x="([\d.]+)" y="0" width="[\d.]+" height="30" fill="transparent"/)?.[1])).toBeGreaterThan(120)
  expect(narrowMini).not.toContain('class="activity-icon terminal"')
})

test('需要你、完成、压缩和睡眠：展开与细条都画对应姿势并遵守减弱动态设置', () => {
  const states: { activity: Activity; marker?: string; pose: string }[] = [
    { activity: { kind: 'needs-you', icon: 'question' }, marker: 'class="activity-icon question"', pose: '.needs-you .hop{animation:' },
    { activity: { kind: 'done' }, marker: 'class="done-sparkle"', pose: '.done .happy{opacity:1}' },
    { activity: { kind: 'compacting' }, marker: '.compacting .hop{transform:scale', pose: '@keyframes compacting-squish' },
    { activity: { kind: 'sleep' }, marker: 'class="sleep-z"', pose: '.clawd.sleep{opacity:.5}' },
  ]

  for (const mini of [false, true]) {
    for (const { activity, marker, pose } of states) {
      const src = bandSvg(EMPTY_BARS, false, 1100, mini, 'zh', undefined, undefined, activity)
      expect(src).toContain(`class="clawd ${mini ? 'mini ' : ''}${activity.kind}`)
      expect(src).toContain(marker)
      expect(src).toContain(pose)
      expect(src).toContain('@media (prefers-reduced-motion:reduce)')
    }
  }
  const sleep = bandSvg(EMPTY_BARS, false, 1100, false, 'zh', undefined, undefined, { kind: 'sleep' })
  expect(sleep).toContain('class="sleep-eyes"')
})

test('反应：测试通过、失败、普通错误和发火在展开与细条上都有对应像素姿势', () => {
  const reactions: { activity: Activity; markers: string[] }[] = [
    { activity: { kind: 'reaction', reaction: 'test-pass', icon: 'check' }, markers: ['class="activity-icon check"', 'class="reaction-confetti"', '.test-pass .armL'] },
    { activity: { kind: 'reaction', reaction: 'test-fail', icon: 'cross' }, markers: ['class="activity-icon cross"', 'class="reaction-x-eyes"', 'class="sweat"'] },
    { activity: { kind: 'reaction', reaction: 'oops', icon: 'cross' }, markers: ['class="activity-icon cross"', 'class="reaction-x-eyes"', '.oops .hop{animation:oops-shake'] },
    { activity: { kind: 'reaction', reaction: 'tantrum' }, markers: ['class="angry-eyes"', 'class="tantrum-steam"', '.tantrum .hop{animation:tantrum-stomp'] },
  ]

  for (const mini of [false, true]) {
    for (const { activity, markers } of reactions) {
      const src = bandSvg(EMPTY_BARS, false, 1100, mini, 'zh', undefined, undefined, activity)
      expect(src).toMatch(new RegExp(`class="clawd${mini ? ' mini' : ''} reaction ${activity.reaction}`))
      for (const marker of markers) expect(src).toContain(marker)
      expect(src).toContain('@media (prefers-reduced-motion:reduce)')
    }
  }
})

test('时段和节日装扮：帽子优先级正确，细条保留帽子与咖啡但不画粒子', () => {
  const crown = '<path d="M4.2 0V-2.4L6.1-1.2 8-3 9.9-1.2 11.8-2.4V0Z" fill="#F2C14E"/>'
  const christmas = { level: 10, title: 'Clawd Lv.10', mood: moodAt(new Date(2026, 11, 25, 23))! }
  const christmasExpanded = bandSvg(EMPTY_BARS, false, 1100, false, 'zh', christmas)
  const christmasMini = bandSvg(EMPTY_BARS, false, 1100, true, 'zh', christmas)
  expect(christmasExpanded).toContain('class="mood-hat santa"')
  expect(christmasExpanded).not.toContain('class="mood-hat nightcap"')
  expect(christmasExpanded).not.toContain(crown)
  expect(christmasExpanded).toContain('class="mood-particles winter"')
  expect(christmasMini).toContain('class="mood-hat santa"')
  expect(christmasMini).not.toContain('class="mood-particles')

  const spring = { level: 1, title: 'Clawd Lv.1', mood: moodAt(new Date(2026, 2, 1, 12))! }
  const autumn = { level: 1, title: 'Clawd Lv.1', mood: moodAt(new Date(2026, 8, 1, 12))! }
  expect(bandSvg(EMPTY_BARS, false, 1100, false, 'zh', spring)).toContain('class="mood-particles spring"')
  expect(bandSvg(EMPTY_BARS, false, 1100, false, 'zh', autumn)).toContain('class="mood-particles autumn"')

  const newYear = { level: 10, title: 'Clawd Lv.10', mood: moodAt(new Date(2026, 11, 31, 23))! }
  const newYearSvg = bandSvg(EMPTY_BARS, false, 1100, false, 'zh', newYear)
  const newYearMini = bandSvg(EMPTY_BARS, false, 1100, true, 'zh', newYear)
  expect(newYearSvg).toContain('class="mood-hat party"')
  expect(newYearSvg).toContain('class="mood-fireworks"')
  expect(newYearSvg).not.toContain('class="mood-hat nightcap"')
  expect(newYearSvg).not.toContain(crown)
  expect(newYearMini).toContain('class="mood-hat party"')
  expect(newYearMini).not.toContain('class="mood-fireworks"')

  const night = { level: 10, title: 'Clawd Lv.10', mood: moodAt(new Date(2026, 5, 1, 23))! }
  const nightSvg = bandSvg(EMPTY_BARS, false, 1100, false, 'zh', night)
  const nightMini = bandSvg(EMPTY_BARS, false, 1100, true, 'zh', night)
  expect(nightSvg).toContain('class="mood-hat nightcap"')
  expect(nightSvg).not.toContain(crown)
  expect(nightMini).toContain('class="mood-hat nightcap"')

  const morning = { level: 1, title: 'Clawd Lv.1', mood: moodAt(new Date(2026, 5, 1, 8))! }
  const morningExpanded = bandSvg(EMPTY_BARS, false, 1100, false, 'zh', morning)
  const morningMini = bandSvg(EMPTY_BARS, false, 1100, true, 'zh', morning)
  expect(morningExpanded).toContain('class="mood-coffee"')
  expect(morningExpanded).toContain('class="mood-sun"')
  expect(morningMini).toContain('class="mood-coffee"')
  expect(morningMini).not.toContain('class="mood-sun"')
  expect(morningMini).not.toContain('class="mood-particles')
})

test('活动和反应覆盖时段、季节与节日装扮，睡眠仍可显示', () => {
  const pet = { level: 10, title: 'Clawd Lv.10', mood: moodAt(new Date(2026, 11, 25, 8))! }
  const active: { isWorking: boolean; activity: Activity }[] = [
    { isWorking: true, activity: { kind: 'working', icon: 'terminal', owner: 1 } },
    { isWorking: false, activity: { kind: 'needs-you', icon: 'bang' } },
    { isWorking: false, activity: { kind: 'compacting' } },
    { isWorking: false, activity: { kind: 'reaction', reaction: 'oops', icon: 'cross' } },
    { isWorking: false, activity: { kind: 'done' } },
  ]

  for (const { isWorking, activity } of active) {
    const src = bandSvg(EMPTY_BARS, isWorking, 1100, false, 'zh', pet, undefined, activity)
    expect(src).not.toContain('class="mood-hat santa"')
    expect(src).not.toContain('class="mood-coffee"')
    expect(src).not.toContain('class="mood-particles')
  }

  const asleep = bandSvg(EMPTY_BARS, false, 1100, false, 'zh', pet, undefined, { kind: 'sleep' })
  expect(asleep).toContain('class="mood-hat santa"')
  expect(asleep).toContain('class="mood-coffee"')
})

test('干活时：1100px 信息栏的 SVG 源码远低于宿主限制', ZH, async () => {
  const expanded = bandSvg(EMPTY_BARS, true, 1100)
  const mini = bandSvg(EMPTY_BARS, true, 1100, true)
  expect(expanded.length).toBeLessThan(131072)
  expect(mini.length).toBeLessThan(131072)
})

test('终端：直接画三个读数（不用 Client），数字、token 和进度条都在', ZH, async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure(measure(42, 8, 63))

  const ui = await $.ui.mount({ ...BAND(false), surface: 'terminal' })
  const percents = await ui.findAll({ type: 'Text', text: /%$/ })
  expect(percents.map(t => t.text)).toEqual(['42%', '8%', '63%'])
  expect(await ui.find({ type: 'Text', text: '84k / 200k' })).toBeDefined()
  expect(await ui.findAll({ type: 'Client' })).toEqual([])
})

test('桌面：一张显式宽高、自带底色的 SVG；变化时有扫环、滚数字、+N%、Clawd 跳，播完收成静止', ZH, async ($, on) => {
  const clock = mock.clock(on)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure(measure(42, 8, 63))

  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  expect(JSON.stringify(await ui.drawn())).not.toContain('"Client"')
  expect(await ui.findAll({ type: 'Svg' })).toHaveLength(1)
  const first = await svgOf(ui)
  expect(first.props?.width).toBe(1068)
  expect(first.props?.height).toBe(H)
  expect(first.props?.isInteractive).toBe(true)
  // 首次出现：圆环从空扫入、依次入场
  expect(String(first.props?.source)).toContain('@keyframes arcc{from{stroke-dashoffset:163.36}')
  expect(String(first.props?.source)).toContain('class="g enter"')

  await clock.advance(1400)
  await ui.redraw()
  const settled = await svgOf(ui)
  expect(settled.props?.alt).toBe('上下文 42%，5 小时额度 8%，每周额度 63%，缓存命中 —；Claude 在休息')
  // 背景透明：不铺底色；配色方案声明成 light dark，小窗口跟着 App 外观走，两边一致就不会垫底
  expect(String(settled.props?.source)).not.toContain('class="bg"')
  expect(String(settled.props?.source)).toContain(':root{color-scheme:light dark;background:transparent}')
  expect(String(settled.props?.source)).toContain('style="color-scheme:light dark;background:transparent"')
  // 浅色外观：文字和轨道有浅色版；分隔线走 class，不能把深色写死在属性里
  expect(String(settled.props?.source)).toMatch(/@media \(prefers-color-scheme:light\)\{\.num\{fill:#1F1E1D\}.*\.track\{stroke:#E8E5DC\}.*\.sep\{stroke:#E5E2D9\}/)
  expect(String(settled.props?.source)).toContain('class="sep"')
  expect(String(settled.props?.source)).not.toContain('stroke="#2A2927"')
  expect(String(settled.props?.source)).not.toContain('@keyframes arc')
  expect(String(settled.props?.source)).toContain('class="hop idle"')

  await $.session.measure(measure(57, 8, 63))
  await ui.redraw()
  const moving = String((await svgOf(ui)).props?.source)
  // 十位 4→5、个位 2→7 滚动；上下文圆环从 42% 扫到 57%；+15% 提示；Clawd 跳一下
  expect(moving).toContain('@keyframes odc0{from{transform:translateY(-56px)}to{transform:translateY(-70px)}}')
  expect(moving).toContain('@keyframes odc1{from{transform:translateY(-28px)}to{transform:translateY(-98px)}}')
  expect(moving).toContain('@keyframes arcc{')
  expect(moving).not.toContain('@keyframes arcs{')
  expect(moving).toContain('>+15%</text>')
  expect(moving).toContain('class="hop once"')

  await clock.advance(1400)
  await ui.redraw()
  const after = String((await svgOf(ui)).props?.source)
  expect(after).not.toContain('@keyframes arc')
  expect(after).not.toContain('@keyframes od')
  expect(after).toContain('class="hop idle"')
  expect(after).not.toContain('+15%')
  expect((await svgOf(ui)).props?.alt).toContain('上下文 57%')
})

test('Clawd：干活时搬出笔记本，额度 ≥90% 冒汗', ZH, async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  const idle = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  const busy = await $.ui.mount({ ...BAND(true), surface: 'desktop' })
  expect(String((await svgOf(idle)).props?.alt)).toContain('Claude 在休息')
  expect(String((await svgOf(idle)).props?.source)).not.toContain('class="laptop"')
  expect(String((await svgOf(busy)).props?.alt)).toContain('Claude 正在干活')
  expect(String((await svgOf(busy)).props?.source)).toContain('class="laptop"')

  await $.session.measure(measure(30, 92, 50))
  await idle.redraw()
  expect(String((await svgOf(idle)).props?.source)).toContain('class="sweat"')
  expect(String((await svgOf(idle)).props?.source)).toContain('class="clawd stressed"')
})

const turn = (read: number, write: number, fresh: number, agentId?: string) => ({
  answer: 'ok',
  durationMs: 1000,
  isAborted: false,
  turnId: `t${read}`,
  reason: 'answer' as const,
  ...(agentId ? { agentId } : {}),
  usage: { model: 'claude-opus-5-5', input_tokens: fresh, output_tokens: 10, cache_read_input_tokens: read, cache_creation_input_tokens: write },
})

test('缓存命中：按轮累计（读取 ÷ 读取+写入+未走缓存），子代理不算，第四个圆环显示', ZH, async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.complete', ($, e) => ({ text: '', usage: e.usage }))
  await $.session.measure(measure(42, 8, 63))
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })

  // 第一轮 80/(80+10+10)=80%；第二轮 190/(190+0+10)=95%；累计 270/300=90%
  await $.turn.complete(turn(80, 10, 10))
  await $.turn.complete(turn(190, 0, 10))
  // 子代理的轮次不计入
  await $.turn.complete(turn(0, 500, 500, 'agent-1'))
  await ui.redraw()
  const svg = await svgOf(ui)
  expect(String(svg.props?.alt)).toContain('缓存命中 90%')
  expect(String(svg.props?.source)).toContain('缓存命中')
  expect(String(svg.props?.source)).toContain('本轮 95%')
  expect(String(svg.props?.source)).toContain('读取 270')
})

test('排布均匀：左右留白相等，Clawd 与四块之间五段间距相等', ZH, async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  // 故意用长短差很多的文字：上下文副标题短，每周额度副标题长
  await $.session.measure(measure(42, 8, 63))
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  const src = String((await svgOf(ui)).props?.source)
  const blocks = [...src.matchAll(new RegExp(`<rect x="([\\d.]+)" y="0" width="([\\d.]+)" height="${H}" fill="transparent"\\/>`, 'g'))].map(m => [Number(m[1]), Number(m[2])])
  expect(blocks).toHaveLength(4)
  const near = (a: number, b: number) => Math.abs(a - b) < 0.6
  const clawdRight = 22 + 16 * 4.5
  const gaps = [blocks[0][0] - clawdRight, ...[1, 2, 3].map(i => blocks[i][0] - (blocks[i - 1][0] + blocks[i - 1][1]))]
  for (const g of gaps) expect(near(g, gaps[0])).toBe(true)
  // 右边留白 = 左边留白（22）
  expect(near(1068 - (blocks[3][0] + blocks[3][1]), 22)).toBe(true)
  // 各块宽度跟着文字走，不再强行等宽（上下文按悬停详情「84,000 tokens」留宽，比 5 小时额度那块宽）
  expect(blocks[0][1] > blocks[1][1]).toBe(true)
})

test('100% 放进圆环：三位数去掉 %、换小字号', ZH, async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.complete', ($, e) => ({ text: '', usage: e.usage }))
  await $.session.measure(measure(42, 8, 63))
  await $.turn.complete(turn(500, 0, 0))
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  const src = String((await svgOf(ui)).props?.source)
  expect(String((await svgOf(ui)).props?.alt)).toContain('缓存命中 100%')
  // 另外三个两位数以内的圆环各有一个 %，100 的那个没有
  expect(src.match(/class="pct"/g)?.length).toBe(3)
  expect(src).toContain('class="num sm"')
})

test('折叠：数据刷新展开 5 秒后收成细条；按钮和 /clawd 切换「一直展开」', ZH, async ($, on) => {
  const clock = mock.clock(on)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure(measure(42, 8, 63))
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })

  // 刚刷新：展开
  expect((await svgOf(ui)).props?.height).toBe(H)
  expect((await ui.find({ key: 'toggle' }))?.props?.label).toBe('▼')

  // 4.9 秒还展开着，5 秒后收成细条
  await clock.advance(4900)
  await ui.redraw()
  expect((await svgOf(ui)).props?.height).toBe(H)
  await clock.advance(200)
  await ui.redraw()
  const mini = await svgOf(ui)
  expect(mini.props?.height).toBe(H_MINI)
  expect(String(mini.props?.source)).toContain(' mini"')
  expect(String(mini.props?.source)).toContain('class="mlab">缓存命中')
  // 细条也跟着 App 外观走
  expect(String(mini.props?.source)).toContain('style="color-scheme:light dark;background:transparent"')
  expect(String(mini.props?.source)).toContain('.mtrack{fill:#E8E5DC}')
  expect((await ui.find({ key: 'toggle' }))?.props?.label).toBe('▲')

  // 按「展开」→ 一直展开，再等多久都不收
  await ui.press({ key: 'toggle' })
  await clock.advance(20000)
  await ui.redraw()
  expect((await svgOf(ui)).props?.height).toBe(H)

  // 按「收起」→ 立刻收起
  await ui.press({ key: 'toggle' })
  await ui.redraw()
  expect((await svgOf(ui)).props?.height).toBe(H_MINI)

  // 新数据来了：自动展开，5 秒后又收
  await $.session.measure(measure(57, 8, 63))
  await ui.redraw()
  expect((await svgOf(ui)).props?.height).toBe(H)
  await clock.advance(5100)
  await ui.redraw()
  expect((await svgOf(ui)).props?.height).toBe(H_MINI)

  // /clawd：切到一直展开，再切回来
  await $.command.run({ command: 'clawd', args: '' } as never)
  await clock.advance(20000)
  await ui.redraw()
  expect((await svgOf(ui)).props?.height).toBe(H)
  await $.command.run({ command: 'clawd', args: '' } as never)
  await ui.redraw()
  expect((await svgOf(ui)).props?.height).toBe(H_MINI)
})

test('细条排布均匀：左右留白相等、Clawd 与四项之间间距相等', ZH, async ($, on) => {
  const clock = mock.clock(on)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure(measure(42, 8, 63))
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  await clock.advance(5100)
  await ui.redraw()
  const src = String((await svgOf(ui)).props?.source)
  const items = [...src.matchAll(new RegExp(`<rect x="([\\d.]+)" y="0" width="([\\d.]+)" height="${H_MINI}" fill="transparent"\\/>`, 'g'))].map(m => [Number(m[1]), Number(m[2])])
  expect(items).toHaveLength(4)
  const near = (a: number, b: number) => Math.abs(a - b) < 0.6
  const gaps = [items[0][0] - (14 + 26 * 3), ...[1, 2, 3].map(i => items[i][0] - (items[i - 1][0] + items[i - 1][1]))]
  for (const g of gaps) expect(near(g, gaps[0])).toBe(true)
  expect(near(1068 - (items[3][0] + items[3][1]), 14)).toBe(true)
})

test('连续刷新：只认最后一次的 5 秒，早先的定时器不会提前收起', ZH, async ($, on) => {
  const clock = mock.clock(on)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure(measure(42, 8, 63))
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  await clock.advance(3000)
  await $.session.measure(measure(50, 9, 63))
  // 第一次刷新的定时器在第 5 秒到期；第二次在第 8 秒。第 5.5 秒应该还展开着
  await clock.advance(2500)
  await ui.redraw()
  expect((await svgOf(ui)).props?.height).toBe(H)
  await clock.advance(2600)
  await ui.redraw()
  expect((await svgOf(ui)).props?.height).toBe(H_MINI)
})

// ───────── 跟随系统语言 ─────────

const START = { cwd: '/tmp', surface: 'desktop' as const, isInteractive: true }

// ───────── 语言 / 放松模式 ─────────
const EN = { options: { language: 'en' } }
const AUTO = { options: { language: 'auto' } }

// 跑一次 session.start，环境变量和 macOS 系统语言列表都由测试给定
async function startAuto(
  $: Parameters<Parameters<typeof test>[2]>[0],
  on: Parameters<Parameters<typeof test>[2]>[1],
  env: Record<string, string>,
  appleLanguages: string | null,
) {
  mock.store(on, {})
  mock.env(on, env)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  const asked: string[][] = []
  on('process.run', ($, e) => {
    asked.push([...e.argv])
    if (appleLanguages === null) {
      return { deny: 'no defaults command (not macOS)' }
    }

    return { value: { exitCode: 0, stdout: appleLanguages, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  await $.session.start(START as never)

  return asked
}

test('英文界面：language = en 时标签、重置时间、读屏描述都是英文', EN, async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure(measure(42, 8, 63))
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  const svg = await svgOf(ui)
  const src = String(svg.props?.source)
  expect(svg.props?.alt).toBe('Context 42%, 5-hour 8%, Weekly 63%, Cache hit —; Claude is resting')
  expect(src).toContain('class="lab">Context<')
  expect(src).toContain('class="lab">Cache hit<')
  expect(src).toContain('Resets ')
  expect(src).not.toContain('重置')
  expect(src).not.toContain('上下文')
})

test('英文界面：四块仍然左右留白相等、间距相等', EN, async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure(measure(42, 8, 63))
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  const src = String((await svgOf(ui)).props?.source)
  const blocks = [...src.matchAll(new RegExp(`<rect x="([\\d.]+)" y="0" width="([\\d.]+)" height="${H}" fill="transparent"\\/>`, 'g'))].map(m => [Number(m[1]), Number(m[2])])
  const near = (a: number, b: number) => Math.abs(a - b) < 0.6
  const gaps = [blocks[0][0] - (22 + 16 * 4.5), ...[1, 2, 3].map(i => blocks[i][0] - (blocks[i - 1][0] + blocks[i - 1][1]))]
  for (const g of gaps) expect(near(g, gaps[0])).toBe(true)
  expect(near(1068 - (blocks[3][0] + blocks[3][1]), 22)).toBe(true)
})

test('跟随系统：环境变量是中文 → 中文，不去问 macOS', AUTO, async ($, on) => {
  const asked = await startAuto($, on, { LANG: 'zh_CN.UTF-8' }, '("en-US")')
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  expect(String((await svgOf(ui)).props?.alt)).toContain('上下文')
  expect(asked).toHaveLength(0)
})

test('跟随系统：环境变量为空、macOS 首选英文（en-MY, zh-Hans-MY）→ 英文', AUTO, async ($, on) => {
  const asked = await startAuto($, on, {}, '(\n    "en-MY",\n    "zh-Hans-MY"\n)\n')
  expect(asked[0]).toEqual(['defaults', 'read', '-g', 'AppleLanguages'])
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  expect(String((await svgOf(ui)).props?.alt)).toContain('Context')
})

test('跟随系统：环境变量为空、macOS 首选中文（zh-Hans-CN）→ 中文', AUTO, async ($, on) => {
  await startAuto($, on, {}, '(\n    "zh-Hans-CN",\n    en\n)\n')
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  expect(String((await svgOf(ui)).props?.alt)).toContain('上下文')
})

test('跟随系统：不是 macOS（没有 defaults 命令）也能正常显示', AUTO, async ($, on) => {
  await startAuto($, on, {}, null)
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  expect(String((await svgOf(ui)).props?.alt)).toMatch(/上下文|Context/)
})

test('跟随系统（Windows）：环境变量为空、显示语言中文（zh-CN）→ 中文，问的是 PowerShell 不是 defaults', AUTO, async ($, on) => {
  const asked = await startAuto($, on, { OS: 'Windows_NT' }, 'zh-CN\r\n')
  expect(asked).toHaveLength(1)
  expect(asked[0][0]).toBe('powershell.exe')
  expect(asked[0]).toContain('(Get-UICulture).Name')
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  expect(String((await svgOf(ui)).props?.alt)).toContain('上下文')
})

test('跟随系统（Windows）：显示语言英文（en-US）→ 英文', AUTO, async ($, on) => {
  await startAuto($, on, { OS: 'Windows_NT' }, 'en-US\r\n')
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  expect(String((await svgOf(ui)).props?.alt)).toContain('Context')
})

test('放松模式：缓存命中 ≥90% 戴墨镜；同时额度告急则只冒汗不戴墨镜', ZH, async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.complete', ($, e) => ({ text: '', usage: e.usage }))
  await $.session.measure(measure(42, 8, 63))
  await $.turn.complete(turn(95, 0, 5))
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  expect(String((await svgOf(ui)).props?.source)).toMatch(/class="clawd[^"]* chill"/)

  // 额度告急：冒汗优先
  await $.session.measure(measure(42, 93, 63))
  await ui.redraw()
  const src = String((await svgOf(ui)).props?.source)
  expect(src).toMatch(/class="clawd[^"]* stressed/)
  expect(src).not.toMatch(/class="clawd[^"]* chill"/)
})

test('放松模式：缓存命中低于 90% 不戴墨镜', ZH, async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.complete', ($, e) => ({ text: '', usage: e.usage }))
  await $.session.measure(measure(42, 8, 63))
  await $.turn.complete(turn(80, 10, 10))
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  expect(String((await svgOf(ui)).props?.source)).not.toMatch(/class="clawd[^"]* chill"/)
})

test('放松模式 + 干活：墨镜和干活两种状态同时挂在 Clawd 上（干活时墨镜推到头顶）', ZH, async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.complete', ($, e) => ({ text: '', usage: e.usage }))
  await $.session.measure(measure(42, 8, 63))
  await $.turn.complete(turn(95, 0, 5))
  const ui = await $.ui.mount({ ...BAND(true), surface: 'desktop' })
  const src = String((await svgOf(ui)).props?.source)
  expect(src).toMatch(/class="clawd working[^"]* chill"/)
  expect(src).toContain('.chill.working .shades{animation:none;transform:translateY(-1.9px)}')
})

test('悬停换上的详情（如「84,000 tokens」）比副标题长时，这一块按详情留宽，不压分隔线、不出右边界', EN, async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.complete', ($, e) => ({ text: '', usage: e.usage }))
  await $.session.measure(measure(42, 8, 63))
  await $.turn.complete(turn(990000, 140000, 5000))
  const src = String((await svgOf(await $.ui.mount({ ...BAND(false), surface: 'desktop' }))).props?.source)
  const blocks = [...src.matchAll(new RegExp(`<rect x="([\\d.]+)" y="0" width="([\\d.]+)" height="${H}" fill="transparent"\\/>`, 'g'))].map(m => [Number(m[1]), Number(m[2])])
  const details = [...src.matchAll(/class="sub2">([^<]*)</g)].map(m => m[1])
  expect(blocks).toHaveLength(4)
  expect(details).toHaveLength(4)
  expect(details[0]).toBe('84,000 tokens')
  // 文字区 = 块宽 − 圆环和间隔（2R + 6 + 7 = 65）；下限按每字 0.5 个字号估（与插件的测宽函数无关）
  details.forEach((d, i) => expect(blocks[i][1] - 65).toBeGreaterThanOrEqual(d.length * 12 * 0.5))
  // 最后一块的右边不超过信息栏宽度（右边留白 22）
  expect(blocks[3][0] + blocks[3][1]).toBeLessThanOrEqual(1068 - 22 + 0.6)
})

test('窗口变窄：信息栏宽度跟着收，加上右边按钮也不超过可用宽度（按钮不会被挤到下一行）；内容逐级收，不出右边界', EN, async ($, on) => {
  const clock = mock.clock(on)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.complete', ($, e) => ({ text: '', usage: e.usage }))
  await $.session.measure(measure(42, 8, 63))
  await $.turn.complete(turn(990000, 140000, 5000))
  const seen = new Set<string>()
  for (const cols of [140, 115, 105, 70, 58, 45, 40]) {
    const band = { ...BAND(false), props: { ...BAND(false).props, bodyColumns: cols }, viewport: { columns: cols, rows: 40 }, surface: 'desktop' as const }
    const svg = await svgOf(await $.ui.mount(band))
    const width = Number(svg.props?.width)
    // 可用宽度 ≈ 每列 8px；SVG + 按钮（44）不超过它（最窄 372 的下限只在极窄时才起作用）
    if (cols * 8 - 8 >= MIN_BAND_W + 44) expect(width + 44).toBeLessThanOrEqual(cols * 8 - 8)
    const src = String(svg.props?.source)
    const blocks = [...src.matchAll(new RegExp(`<rect x="([\\d.]+)" y="0" width="([\\d.]+)" height="${H}" fill="transparent"\\/>`, 'g'))].map(m => Number(m[1]) + Number(m[2]))
    expect(blocks).toHaveLength(4)
    expect(Math.max(...blocks)).toBeLessThanOrEqual(width - 22 + 0.6)
    // 收掉的文字还在悬停提示里
    expect(src).toContain('<title>Context 42% · 84,000 / 200,000 tokens</title>')
    seen.add(src.includes('class="sub"') ? 'full' : src.includes('class="lab stk"') ? 'stacked' : src.includes('class="lab"') ? 'compact' : 'rings')
  }
  // 这组宽度把四种排法都走到了
  expect([...seen].sort()).toEqual(['compact', 'full', 'rings', 'stacked'])

  // 收起的细条同样不出右边界
  await clock.advance(5100)
  for (const cols of [140, 70, 58, 45]) {
    const band = { ...BAND(false), props: { ...BAND(false).props, bodyColumns: cols }, viewport: { columns: cols, rows: 40 }, surface: 'desktop' as const }
    const svg = await svgOf(await $.ui.mount(band))
    const width = Number(svg.props?.width)
    const items = [...String(svg.props?.source).matchAll(new RegExp(`<rect x="([\\d.]+)" y="0" width="([\\d.]+)" height="${H_MINI}" fill="transparent"\\/>`, 'g'))].map(m => Number(m[1]) + Number(m[2]))
    expect(items).toHaveLength(4)
    expect(Math.max(...items)).toBeLessThanOrEqual(width - 14 + 0.6)
  }
})
