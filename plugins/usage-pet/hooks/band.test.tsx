import { expect, mock, test } from 'claude-code/testing'

import type { Activity, Bars } from '../types'
import { moodAt } from './mood'
import {
  ACTIVITY_LAYOUT_RESERVE,
  bandSvgParts,
  CLAWD_X,
  MINI_U,
  MINI_WALK_X,
  MINI_X,
  U,
  WORKING_CANDY_HALF_WIDTH,
  WORKING_CANDY_XS,
  WORKING_GLYPH_FLOAT_X,
  WORKING_GLYPH_LAYOUT,
  H,
  H_MINI,
  MIN_BAND_W_WITH_ACTIVITY,
  MIN_BAND_W_WITH_FABLE_AND_ACTIVITY,
  paceWarningAt,
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

const svgOf = async (ui: { findAll: (q: { type: 'Svg' }) => Promise<{ props?: Record<string, unknown> }[]> }) => {
  const [clawd, gauges] = await ui.findAll({ type: 'Svg' })
  if (!clawd || !gauges) return clawd
  const width = Number(clawd.props?.width) + Number(gauges.props?.width)
  const height = clawd.props?.height

  return {
    props: {
      source: `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${String(gauges.props?.source)}${String(clawd.props?.source)}</svg>`,
      width,
      height,
      alt: gauges.props?.alt,
      isInteractive: Boolean(clawd.props?.isInteractive && gauges.props?.isInteractive),
    },
  }
}

const bandSvg = (...args: Parameters<typeof bandSvgParts>) => {
  const { gauges, clawd } = bandSvgParts(...args)
  return gauges + clawd
}

const svgSourcesOf = async (ui: { findAll: (q: { type: 'Svg' }) => Promise<{ props?: Record<string, unknown> }[]> }) =>
  (await ui.findAll({ type: 'Svg' })).map(node => String(node.props?.source))

const EMPTY_BARS = { from: null, to: null }

test('姿势变化只改变 Clawd SVG，读数数据改变时才改变 gauges SVG', () => {
  const bars = {
    from: null,
    to: {
      contextPercent: 42,
      contextTokens: 84000,
      contextWindow: 200000,
      session: { percent: 8 },
      weekly: { percent: 63 },
      cache: { rate: 92, read: 900000, write: 50000, fresh: 50000 },
    },
  } as unknown as Bars
  const now = new Date(2026, 9, 10, 14).getTime()
  const calm = bandSvgParts(bars, false, 1100, false, 'zh', { level: 1, title: 'Clawd' }, undefined, { kind: 'idle' }, now)
  const posed = bandSvgParts(
    bars,
    false,
    1100,
    false,
    'zh',
    { level: 2, title: 'Clawd Lv.2', halloween: true, mood: moodAt(new Date(2026, 9, 31, 8)) },
    undefined,
    { kind: 'working', icon: 'terminal' },
    now,
  )
  const changedBars = { ...bars, to: { ...bars.to!, contextPercent: 43 } } as Bars
  const changed = bandSvgParts(changedBars, false, 1100, false, 'zh', { level: 1, title: 'Clawd' }, undefined, { kind: 'idle' }, now)

  expect(posed.gauges).toBe(calm.gauges)
  expect(posed.clawd).not.toBe(calm.clawd)
  for (const clawdOnly of ['.clawd', 'class="clawd"', '.hop', '@keyframes hop{', '.glyph', '@keyframes float{', '.stressed', '.activity-', '.sweat', '.mood-', '.halloween-']) {
    expect(calm.gauges).not.toContain(clawdOnly)
  }
  expect(changed.gauges).not.toBe(calm.gauges)
})

test('运行中子代理徽标只画在 Clawd 上，并在零个时保持 SVG 字节不变', () => {
  const now = new Date(2026, 9, 10, 14).getTime()
  for (const mini of [false, true]) {
    const current = bandSvgParts(EMPTY_BARS, false, 1100, mini, 'zh', undefined, undefined, undefined, now)
    const zero = bandSvgParts(EMPTY_BARS, false, 1100, mini, 'zh', undefined, undefined, undefined, now, 0)
    const active = bandSvgParts(EMPTY_BARS, false, 1100, mini, 'zh', undefined, undefined, undefined, now, 3)
    const x = mini ? 91 : 94
    const y = mini ? 8 : 52
    const width = mini ? 17 : 24
    const height = mini ? 13 : 15

    expect(zero).toEqual(current)
    expect(x + width).toBeLessThanOrEqual(mini ? 109 : 120)
    expect(active.clawd).toContain(`<g class="agent-count"><rect x="${x}" y="${y}" width="${width}" height="${height}"`)
    expect(active.clawd).toContain('×3')
    expect(active.clawd).not.toContain('×0')
    expect(active.clawd).toContain('fill:#7C6AE0;stroke:#1C1B1A;stroke-opacity:.35')
    expect(active.clawd).toContain('fill:#6A58D6')
    expect(active.clawd).toContain(`font-size="${mini ? 8.5 : 10}"`)
    expect(active.gauges).toBe(current.gauges)
    expect(active.gauges).not.toContain('agent-count')
    expect(Math.max(active.clawd.length, active.gauges.length)).toBeLessThan(45000)
  }

  expect(bandSvgParts(EMPTY_BARS, false, 1100, false, 'zh', undefined, undefined, undefined, now, 120).clawd).toContain('×99+')
})

test('resetsAt 的显示分钟变化不改变 gauges memo key，但 bars 变化会改变', () => {
  const now = new Date(2026, 9, 10, 14).getTime()
  const bars = {
    from: null,
    to: {
      contextPercent: 42,
      contextTokens: 84000,
      contextWindow: 200000,
      compactAt: 160000,
      session: { percent: 50, resetsAt: new Date(now + 60 * 60000).toISOString() },
      weekly: { percent: 63, resetsAt: new Date(now + 3 * 86400000).toISOString() },
      cache: { rate: 92, read: 900000, write: 50000, fresh: 50000 },
      cost: { usd: 1.25 },
    },
  } as unknown as Bars
  const first = bandSvgParts(bars, false, 1100, false, 'zh', undefined, undefined, undefined, now)
  const minuteLater = bandSvgParts(bars, false, 1100, false, 'zh', undefined, undefined, undefined, now + 60000)
  const changed = bandSvgParts(
    { ...bars, to: { ...bars.to!, contextPercent: 43 } } as Bars,
    false,
    1100,
    false,
    'zh',
    undefined,
    undefined,
    undefined,
    now + 60000,
  )

  expect(first.gaugesKey).toBe(minuteLater.gaugesKey)
  expect(changed.gaugesKey).not.toBe(first.gaugesKey)
})

test('展开字形和糖果的浮动范围留在 cut 内，细条步行范围也留有同等空间', () => {
  const now = new Date(2026, 9, 10, 14).getTime()
  const readBounds = (parts: ReturnType<typeof bandSvgParts>, mini: boolean) => {
    const clawd = parts.clawd.match(/<g class="clawd[^\"]*" transform="translate\(([\d.]+) [\d.]+\) scale\(([\d.]+)\)">/)
    expect(clawd).not.toBeNull()
    const translateX = Number(clawd?.[1])
    const scale = Number(clawd?.[2])
    const walk = mini ? MINI_WALK_X : 0
    const availableRight = (parts.cut - translateX) / scale - walk

    return { availableRight }
  }
  const expanded = bandSvgParts(EMPTY_BARS, true, 1100, false, 'zh', undefined, undefined, undefined, now)
  const { availableRight } = readBounds(expanded, false)
  const glyphXs = [...expanded.clawd.matchAll(/<text x="([\d.]+)" y="4\.2" class="glyph"/g)].map(match => Number(match[1]))

  expect(glyphXs).toEqual(WORKING_GLYPH_LAYOUT.map(glyph => glyph.x))
  expect(expanded.clawd).toContain(`translate(${WORKING_GLYPH_FLOAT_X}px,-8px)`)
  for (const glyph of WORKING_GLYPH_LAYOUT) {
    expect(glyph.x + glyph.width + WORKING_GLYPH_FLOAT_X).toBeLessThanOrEqual(availableRight)
  }

  const halloween = bandSvgParts(EMPTY_BARS, true, 1100, false, 'zh', { level: 1, title: 'Clawd', halloween: true }, undefined, undefined, now)
  const candyXs = [...halloween.clawd.matchAll(/<g transform="translate\(([\d.]+) 3\.4\)"><g class="glyph"/g)].map(match => Number(match[1]))
  expect(candyXs).toEqual(WORKING_CANDY_XS)
  for (const x of WORKING_CANDY_XS) {
    expect(x + WORKING_CANDY_HALF_WIDTH + WORKING_GLYPH_FLOAT_X).toBeLessThanOrEqual(availableRight)
  }

  const mini = bandSvgParts(EMPTY_BARS, true, 1100, true, 'zh', undefined, undefined, undefined, now)
  const miniBounds = readBounds(mini, true)
  expect(mini.clawd).toContain(`translateX(${MINI_WALK_X}px)`)
  expect(mini.clawd).not.toContain('class="glyph"')
  for (const glyph of WORKING_GLYPH_LAYOUT) {
    expect(glyph.x + glyph.width + WORKING_GLYPH_FLOAT_X).toBeLessThanOrEqual(miniBounds.availableRight)
  }
  for (const x of WORKING_CANDY_XS) {
    expect(x + WORKING_CANDY_HALF_WIDTH + WORKING_GLYPH_FLOAT_X).toBeLessThanOrEqual(miniBounds.availableRight)
  }
  expect(availableRight).toBe((expanded.cut - CLAWD_X) / U)
  expect(miniBounds.availableRight).toBe((mini.cut - MINI_X) / MINI_U - MINI_WALK_X)
})

test('展开和细条的 cut 固定保留工具图标空间', () => {
  for (const mini of [false, true]) {
    const idle = bandSvgParts(EMPTY_BARS, false, 1100, mini, 'zh', undefined, undefined, { kind: 'idle' })
    const working = bandSvgParts(EMPTY_BARS, false, 1100, mini, 'zh', undefined, undefined, { kind: 'working', icon: 'terminal' })

    expect(idle.cut).toBe(working.cut)
    expect(Number.isInteger(idle.cut)).toBe(true)
    expect(idle.cut).toBe(mini ? 109 : 120)
  }
})

test('额度消耗快于剩余时间时：预测耗尽时间，过滤无效提醒', () => {
  const now = new Date(2026, 0, 1, 12).getTime()
  const fiveHours = 5 * 60 * 60 * 1000
  const week = 7 * 24 * 60 * 60 * 1000
  const resetsAt = (elapsed: number) => new Date(now + fiveHours - elapsed).toISOString()

  expect(paceWarningAt({ percent: 50, resetsAt: resetsAt(60 * 60 * 1000) }, fiveHours, now)).toBe(now + 60 * 60 * 1000)
  expect(paceWarningAt({ percent: 10, resetsAt: resetsAt(60 * 60 * 1000) }, fiveHours, now)).toBeUndefined()
  expect(paceWarningAt({ percent: 50, resetsAt: resetsAt(10 * 60 * 1000) }, fiveHours, now)).toBeUndefined()
  expect(paceWarningAt({ percent: 0, resetsAt: resetsAt(60 * 60 * 1000) }, fiveHours, now)).toBeUndefined()
  expect(paceWarningAt({ percent: 100, resetsAt: resetsAt(60 * 60 * 1000) }, fiveHours, now)).toBeUndefined()
  expect(paceWarningAt({ percent: 50 }, fiveHours, now)).toBeUndefined()
  expect(paceWarningAt({ percent: 50, resetsAt: 'invalid' }, fiveHours, now)).toBeUndefined()
  expect(paceWarningAt({ percent: 50, resetsAt: new Date(now + week - 2 * 86400000).toISOString() }, week, now))
    .toBe(now + 2 * 86400000)
})

test('消耗过快时：中文和英文圆环详情与悬停提示都显示预测耗尽时间', ZH, (_, on) => {
  mock.clock(on)
  const now = Date.now()
  const fiveHours = 5 * 60 * 60 * 1000
  const week = 7 * 86400000
  const elapsed5h = 60 * 60000
  const elapsedWeek = 2 * 86400000
  const fiveHourWindow = { percent: 50, resetsAt: new Date(now + fiveHours - elapsed5h).toISOString() }
  const weeklyWindow = { percent: 50, resetsAt: new Date(now + week - elapsedWeek).toISOString() }
  const bars = () => ({
    from: null,
    to: { contextWindow: 200000, session: fiveHourWindow, weekly: weeklyWindow, fable: weeklyWindow },
  }) as unknown as Bars
  const timeAt = (offset: number) => {
    const date = new Date(now + offset)
    const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`

    return { time, day: date.getDay() }
  }
  const fiveHourAt = timeAt(elapsed5h)
  const fiveHourResetAt = timeAt(fiveHours - elapsed5h)
  const weeklyAt = timeAt(elapsedWeek)
  const weeklyResetAt = timeAt(week - elapsedWeek)
  const zhDay = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const enDay = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const zh = bandSvg(bars(), false, 1100, false, 'zh')
  const en = bandSvg(bars(), false, 1100, false, 'en')

  expect(zh).toContain(`>约 ${fiveHourAt.time} 用完</text>`)
  expect(zh).toContain(`<title>5 小时额度 50% · ${fiveHourResetAt.time} 重置 · 约 ${fiveHourAt.time} 用完</title>`)
  expect(zh).toContain(`>约 ${zhDay[weeklyAt.day]} ${weeklyAt.time} 用完</text>`)
  expect(zh).toContain(`<title>每周额度 50% · ${zhDay[weeklyResetAt.day]} ${weeklyResetAt.time} 重置 · 约 ${zhDay[weeklyAt.day]} ${weeklyAt.time} 用完</title>`)
  expect(zh).toContain(`<title>Fable 每周 50% · ${zhDay[weeklyResetAt.day]} ${weeklyResetAt.time} 重置 · 约 ${zhDay[weeklyAt.day]} ${weeklyAt.time} 用完</title>`)
  expect(en).toContain(`>Out ~${fiveHourAt.time}</text>`)
  expect(en).toContain(`<title>5-hour 50% · Resets ${fiveHourResetAt.time} · Out ~${fiveHourAt.time}</title>`)
  expect(en).toContain(`>Out ~${enDay[weeklyAt.day]} ${weeklyAt.time}</text>`)
  expect(en).toContain(`<title>Weekly 50% · Resets ${enDay[weeklyResetAt.day]} ${weeklyResetAt.time} · Out ~${enDay[weeklyAt.day]} ${weeklyAt.time}</title>`)
  expect(en).toContain(`<title>Fable weekly 50% · Resets ${enDay[weeklyResetAt.day]} ${weeklyResetAt.time} · Out ~${enDay[weeklyAt.day]} ${weeklyAt.time}</title>`)
})

test('干活时：展开和细条都有紫色像素背景，且背景在读数和 Clawd 之前', ZH, async () => {
  for (const mini of [false, true]) {
    const parts = bandSvgParts(EMPTY_BARS, true, 1100, mini)
    const source = parts.gauges + parts.clawd
    const height = mini ? H_MINI : H
    const gaugesWidth = 1100 - parts.cut
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
    expect(parts.gauges).toContain(`viewBox="0 0 ${gaugesWidth} ${height}" width="${gaugesWidth}" height="${height}"`)
    expect(parts.clawd).toContain(`viewBox="0 0 ${parts.cut} ${height}" width="${parts.cut}" height="${height}"`)
    expect(parts.gauges).toContain(`transform="translate(-${parts.cut} 0)"`)
    expect(parts.gauges).toContain('gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1100" y2="0"')
    expect(parts.clawd).toContain('gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1100" y2="0"')
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
  expect(MIN_BAND_W_WITH_ACTIVITY).toBe(398)
  expect(MIN_BAND_W_WITH_FABLE_AND_ACTIVITY).toBe(462)
})

test('自动压缩：圆环标记阈值，悬停详情显示距压缩或即将压缩', () => {
  const bars = (compactAt?: number, contextTokens = 10000) => ({
    from: null,
    to: {
      contextPercent: 5,
      contextTokens,
      contextWindow: 200000,
      ...(compactAt === undefined ? {} : { compactAt }),
    },
  }) as unknown as Bars
  const marked = bandSvg(bars(50000), false, 1100)
  const soon = bandSvg(bars(50000, 50000), false, 1100, false, 'en')
  const withoutThreshold = bandSvg(bars(), false, 1100)
  const outsideWindow = bandSvg(bars(200000), false, 1100)

  expect(marked).toContain('class="compact-tick"')
  expect(marked).toContain('transform="rotate(90.00 ')
  expect(marked).toContain('>距压缩 40,000</text>')
  expect(marked).toContain('tokens · 距压缩 40,000')
  expect(soon).toContain('>compacting soon</text>')
  expect(soon).toContain('tokens · compacting soon')
  expect(withoutThreshold).not.toContain('class="compact-tick"')
  expect(outsideWindow).not.toContain('class="compact-tick"')
  expect(withoutThreshold).toContain('>10,000 tokens</text>')
})

test('模型窗口变化：summary 只为新窗口重读一次', ZH, async ($, on) => {
  mock.store(on, {})
  on('session.id', () => ({ value: 'compact-window' }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.authorize', () => ({ value: null }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  let usageCalls = 0
  on('session.usage', () => {
    usageCalls++
    const window = usageCalls === 1 ? 200000 : 1000000

    return {
      value: {
        startedAt: 0,
        context: {
          window,
          tokens: 80000,
          percent: 8,
          breakdown: { autoCompactThreshold: window / 2, isAutoCompactEnabled: true },
        },
        rateLimits: [],
      },
    }
  })
  on('session.measure', ($, e) => ({ changed: e.changed }))

  await $.session.start(START as never)
  const changedWindow = {
    ...measure(8, 8, 63),
    context: { window: 1000000, tokens: 80000, percent: 8 },
  }
  await $.session.measure(changedWindow as never)
  await $.session.measure(changedWindow as never)

  expect(usageCalls).toBe(2)
})

test('浅色外观：工作底纹隐藏，不叠加深色描边或标签颜色', ZH, async () => {
  const source = bandSvg(EMPTY_BARS, true, 1100)
  expect(source).toContain('@media (prefers-color-scheme:light){.ultra-dither{display:none}}')
  expect(source).not.toContain('@media (prefers-color-scheme:light){.gauges text{')
  expect(source).not.toContain('@media (prefers-color-scheme:light){.mlab,.sub,.pct,.dim{')
})

test('休息时：不画紫色像素背景，Clawd 保持待机外观', ZH, async () => {
  const parts = bandSvgParts(EMPTY_BARS, false, 1100)
  const source = parts.gauges + parts.clawd
  expect(source).not.toContain('ultra-dither')
  expect(parts.gauges).toContain('viewBox="0 0 980 80"')
  expect(parts.clawd).toContain('viewBox="0 0 120 80"')
  expect(source).toContain('class="clawd"')
  expect(source).toContain('class="hop idle"')
  expect(source).toContain('class="shadow idle"')
  expect(source).not.toContain('class="clawd working')
  expect(source).not.toContain('@keyframes od')
})

test('滚动数字：静止位只画一个数字，只有发生变化的位带滚轮和裁切', () => {
  const snap = (context: number, session = 8, weekly = 63) => ({
    contextPercent: context,
    contextTokens: context * 2000,
    contextWindow: 200000,
    session: { percent: session },
    weekly: { percent: weekly },
    cache: { rate: 92, read: 900000, write: 50000, fresh: 50000, turnRate: 92 },
  })
  const stable = bandSvg({ from: snap(42), to: snap(42) } as unknown as Bars, false, 1100)
  const moving = bandSvg({ from: snap(41), to: snap(42) } as unknown as Bars, false, 1100)

  expect(stable).not.toContain('<clipPath id="cod')
  expect(stable).not.toContain('@keyframes od')
  expect(moving.match(/<clipPath id="cod/g)?.length).toBe(1)
  expect(moving).toContain('@keyframes odc1{')
  expect(moving).not.toContain('@keyframes ods')
})

test('缓存倒计时：共用定位样式，六十分钟精确显示，长 TTL 最多六十个分钟步进', () => {
  const bars = {
    from: null,
    to: {
      contextPercent: 42,
      contextTokens: 84000,
      contextWindow: 200000,
      session: { percent: 8 },
      weekly: { percent: 63 },
      cache: { rate: 92, read: 900000, write: 50000, fresh: 50000, turnRate: 92 },
    },
  } as unknown as Bars
  const sixty = bandSvg(bars, false, 1100, false, 'zh', undefined, { remainMs: 60 * 60000, ttlMs: 60 * 60000 })
  const long = bandSvg(bars, false, 1100, false, 'zh', undefined, { remainMs: 24 * 60 * 60000, ttlMs: 24 * 60 * 60000 })
  const sixtyGroup = sixty.match(/<g class="tm" transform="translate\([^"]+\)" style="font-size:9px">([\s\S]*?)<\/g>/)
  const longGroup = long.match(/<g class="tm" transform="translate\([^"]+\)" style="font-size:9px">([\s\S]*?)<\/g>/)
  const sixtyPosition = sixty.match(/<g class="tm" transform="translate\(([\d.]+) ([\d.]+)\)" style="font-size:9px">/)

  expect(sixtyGroup).not.toBeNull()
  expect(sixtyPosition).not.toBeNull()
  expect((sixtyGroup?.[1].match(/<text\b/g) ?? []).length).toBe(61)
  expect(sixtyGroup?.[1]).toContain('>60分</text>')
  expect(sixtyGroup?.[1]).toContain('>1分</text>')
  expect(sixtyGroup?.[1]).toContain('>已过期</text>')
  expect(sixtyGroup?.[1]).not.toMatch(/<text[^>]*\s[xy]=/)
  expect((longGroup?.[1].match(/<text\b/g) ?? []).length).toBe(62)
  expect(longGroup?.[1]).toContain('>1440分</text>')
  expect(longGroup?.[1]).toContain('>60分</text>')
})

test('样式分块：普通展开不带细条、倒计时或万圣节样式，按需渲染才追加', () => {
  const plain = bandSvg(EMPTY_BARS, false, 1100)
  const mini = bandSvg(EMPTY_BARS, false, 1100, true)
  const timer = bandSvg(EMPTY_BARS, false, 1100, false, 'zh', undefined, { remainMs: 60000, ttlMs: 60000 })
  const halloween = bandSvg(EMPTY_BARS, false, 1100, false, 'zh', { level: 2, title: 'Clawd', halloween: true })

  expect(plain).toContain('.num{font-size:12px;')
  expect(plain).not.toContain('.mlab{font-size:13px;')
  expect(plain).not.toContain('.tm{font-weight:600;')
  expect(plain).not.toContain('@keyframes beg{')
  expect(mini).toContain('.mlab{font-size:13px;')
  expect(mini).not.toContain('.num{font-size:12px;')
  expect(timer).toContain('.tm{font-weight:600;')
  expect(timer).toContain('@media (prefers-color-scheme:light){.tm,.tm.cold{fill:#C2603F}')
  expect(halloween).toContain('@keyframes beg{')
  expect(halloween).toContain('@media (prefers-color-scheme:light){.hw-q{fill:#C2603F}')
})

test('工具活动：展开图标替代浮动字形，细条仅在图标和首个读数之间留得下间距时显示', () => {
  const activity: Activity = { kind: 'working', icon: 'terminal' }
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
    Number(miniAtMinClawd?.[1]) + (MINI_WALK_X + Number(miniAtMinIcon?.[1]) + 7 * Number(miniAtMinIcon?.[3])) * Number(miniAtMinClawd?.[2])
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

test('浅色像素装饰：近白图块保留深色填色并提供浅色对比类', () => {
  const spinner = bandSvg(EMPTY_BARS, false, 1100, false, 'zh', undefined, undefined, { kind: 'working', icon: 'spinner' })
  expect(spinner).toContain('class="activity-pixel pixel-w"')
  expect(spinner).toContain('.activity-pixel.pixel-w{fill:#F0EEE6}')
  expect(spinner).toContain('.activity-pixel.pixel-w,.activity-pixel.pixel-s{fill:#4D4A43}')
  expect(spinner).toContain('.activity-pixel.pixel-t{fill:#377C60}')
  expect(spinner).not.toContain('fill="#F0EEE6"')
  const miniSpinner = bandSvg(EMPTY_BARS, false, 1100, true, 'zh', undefined, undefined, { kind: 'working', icon: 'spinner' })
  expect(miniSpinner).toContain('class="activity-pixel pixel-w"')

  const sleeping = bandSvg(EMPTY_BARS, false, 1100, false, 'zh', undefined, undefined, { kind: 'sleep' })
  expect(sleeping).toContain('class="sleep-z-pixel"')
  expect(sleeping).toContain('.sleep-z-pixel{fill:#F0EEE6}')
  expect(sleeping).toContain('.sleep-z-pixel{fill:#4D4A43}')
  expect(sleeping).not.toContain('fill="#F0EEE6"')

  const stressed = bandSvg({ from: null, to: { session: { percent: 95 } } } as unknown as Bars, false, 1100)
  expect(stressed).toContain('class="sweat"')
  expect(stressed).toContain('.sweat{fill:#8FD0FF}')
  expect(stressed).toContain('.sweat{fill:#2D7FB8}')

  const tantrum = bandSvg(EMPTY_BARS, false, 1100, false, 'zh', undefined, undefined, { kind: 'reaction', reaction: 'tantrum' })
  expect(tantrum).toContain('class="steam-pixel-light"')
  expect(tantrum).toContain('.tantrum-steam .steam-pixel-light{fill:#D4D1C9}')
  expect(tantrum).toContain('.tantrum-steam .steam-pixel-light{fill:#5E5B54}')

  const testFail = bandSvg(EMPTY_BARS, false, 1100, false, 'zh', undefined, undefined, { kind: 'reaction', reaction: 'test-fail', icon: 'cross' })
  expect(testFail).toContain('class="sweat"')
  expect(testFail).toContain('.sweat{fill:#8FD0FF}')
  expect(testFail).toContain('.sweat{fill:#2D7FB8}')
  const testPass = bandSvg(EMPTY_BARS, false, 1100, false, 'zh', undefined, undefined, { kind: 'reaction', reaction: 'test-pass', icon: 'check' })
  expect(testPass).toContain('class="reaction-pixel-blue"')
  expect(testPass).toContain('.reaction-pixel-green{fill:#4B765D}')
  const done = bandSvg(EMPTY_BARS, false, 1100, false, 'zh', undefined, undefined, { kind: 'done' })
  expect(done).toContain('class="done-sparkle-pixel"')
  expect(done).toContain('.done-sparkle-pixel{fill:#8A5B00}')

  const winterMorning = { level: 1, title: 'Clawd Lv.1', mood: moodAt(new Date(2026, 0, 15, 8))! }
  const winter = bandSvg(EMPTY_BARS, false, 1100, false, 'zh', winterMorning)
  expect(winter).toContain('class="mood-snow-bright"')
  expect(winter).toContain('class="mood-snow-cool"')
  expect(winter).toContain('.mood-snow-bright{fill:#F4F2EC}')
  expect(winter).toContain('.mood-snow-bright{fill:#5B6B79}')
  expect(winter).toContain('class="mood-coffee-cup"')
  expect(winter).toContain('class="mood-coffee-handle"')
  expect(winter).toContain('.mood-coffee-cup{fill:#E7DDD0}')
  expect(winter).toContain('.mood-coffee-cup{fill:#5A4638}')
  expect(winter).toContain('.mood-steam{stroke:#6B6862}')
  expect(winter).not.toContain('fill="#F4F2EC"')
  expect(winter).not.toContain('fill="#DDE8F2"')
  const winterMini = bandSvg(EMPTY_BARS, false, 1100, true, 'zh', winterMorning)
  expect(winterMini).toContain('class="mood-coffee-cup"')
  expect(winterMini).not.toContain('fill="#E7DDD0"')

  const spring = bandSvg(EMPTY_BARS, false, 1100, false, 'zh', { level: 1, title: 'Clawd Lv.1', mood: moodAt(new Date(2026, 3, 15, 12))! })
  expect(spring).toContain('class="mood-petal-pink"')
  expect(spring).toContain('.mood-petal-pink{fill:#A74254}')
  const autumn = bandSvg(EMPTY_BARS, false, 1100, false, 'zh', { level: 1, title: 'Clawd Lv.1', mood: moodAt(new Date(2026, 9, 15, 12))! })
  expect(autumn).toContain('class="mood-autumn-amber"')
  expect(autumn).toContain('.mood-autumn-amber{fill:#8A4F0A}')
  const summer = bandSvg(EMPTY_BARS, false, 1100, false, 'zh', { level: 1, title: 'Clawd Lv.1', mood: moodAt(new Date(2026, 6, 15, 12))! })
  expect(summer).toContain('class="mood-sun-highlight"')
  expect(summer).toContain('.mood-sun-highlight{fill:#8A5B00}')
  const newYear = bandSvg(EMPTY_BARS, false, 1100, false, 'zh', { level: 1, title: 'Clawd Lv.1', mood: moodAt(new Date(2026, 11, 31, 12))! })
  expect(newYear).toContain('class="mood-fireworks"')
  expect(newYear).toContain('.mood-blue{fill:#3C6F92}')

  const christmas = bandSvg(EMPTY_BARS, false, 1100, false, 'zh', { level: 1, title: 'Clawd Lv.1', mood: moodAt(new Date(2026, 11, 25, 12))! })
  expect(christmas).toContain('class="mood-paper-white"')
  expect(christmas).toContain('.mood-paper-white{fill:#F4F2EC}')
  expect(christmas).toContain('.mood-paper-white{fill:#514E47}')
  expect(christmas).not.toContain('fill="#F4F2EC"')

  const halloween = bandSvg(EMPTY_BARS, false, 1100, false, 'zh', { level: 1, title: 'Clawd Lv.1', halloween: true, askAgo: 0 } as never)
  expect(halloween).toContain('class="halloween-paper"')
  expect(halloween).toContain('class="halloween-neutral"')
  expect(halloween).toContain('class="halloween-gold"')
  expect(halloween).toContain('class="halloween-pink"')
  expect(halloween).toContain('class="halloween-orange"')
  expect(halloween).toContain('class="halloween-blue"')
  expect(halloween).toContain('.halloween-paper{fill:#514E47}')
  expect(halloween).toContain('.halloween-neutral{fill:#77746C}')
  expect(halloween).toContain('.halloween-pink[opacity=".55"]{opacity:1}')
  expect(halloween).toContain('.halloween-orange{fill:#B65B00}')
})

test('活动和反应覆盖时段、季节与节日装扮，睡眠仍可显示', () => {
  const pet = { level: 10, title: 'Clawd Lv.10', mood: moodAt(new Date(2026, 11, 25, 8))! }
  const active: { isWorking: boolean; activity: Activity }[] = [
    { isWorking: true, activity: { kind: 'working', icon: 'terminal' } },
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
  const expanded = bandSvgParts(EMPTY_BARS, true, 1100)
  const mini = bandSvgParts(EMPTY_BARS, true, 1100, true)
  for (const source of [expanded.clawd, expanded.gauges, mini.clawd, mini.gauges]) {
    expect(source.length).toBeLessThan(131072)
  }
})

test('SVG 尺寸：五环变化、工作图标和万圣节倒计时装扮均控制在四万五千字符内', () => {
  const snap = (n: number) => ({
    contextPercent: n,
    contextTokens: n * 2000,
    contextWindow: 200000,
    session: { percent: n, resetsAt: '2026-10-15T16:00:00.000Z' },
    weekly: { percent: Math.min(100, n + 8), resetsAt: '2026-10-20T12:00:00.000Z' },
    fable: { percent: Math.min(100, n + 14), resetsAt: '2026-10-20T12:00:00.000Z' },
    cache: { rate: 92, read: 900000, write: 50000, fresh: 50000, turnRate: 92 },
  })
  const moving = { from: snap(49), to: snap(100) } as unknown as Bars
  const idleSnap = snap(100)
  const idle = bandSvgParts({ from: idleSnap, to: idleSnap } as unknown as Bars, false, 1400)
  const halloweenMood = { level: 6, title: 'Clawd Lv.6', halloween: true, askAgo: 0, mood: moodAt(new Date(2026, 9, 31, 8)) }
  const working = bandSvgParts(moving, true, 1400, false, 'zh', halloweenMood, undefined, { kind: 'working', icon: 'terminal' })
  const decorated = bandSvgParts(moving, false, 1400, false, 'zh', halloweenMood, { remainMs: 3600000, ttlMs: 3600000 })

  expect(working.clawd).toContain('class="activity-icon terminal"')
  expect(working.gauges).toContain('class="ultra-dither"')
  expect(working.clawd).toContain('class="ultra-dither"')
  expect(decorated.clawd).toContain('id="hwtimer"')
  expect(decorated.clawd).toContain('class="mood-coffee"')
  expect(decorated.gauges).toContain('class="tm"')
  expect(decorated.gauges).toContain('Fable')
  expect(Math.max(idle.clawd.length, idle.gauges.length, working.clawd.length, working.gauges.length, decorated.clawd.length, decorated.gauges.length)).toBeLessThan(45000)
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
  await $.command.run({ command: 'clawd', args: '' } as never)

  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  expect(JSON.stringify(await ui.drawn())).not.toContain('"Client"')
  const svgNodes = await ui.findAll({ type: 'Svg' })
  expect(svgNodes).toHaveLength(2)
  expect(svgNodes[0].props?.width).toBe(120)
  expect(svgNodes[1].props?.width).toBe(948)
  expect(svgNodes.every(node => node.props?.isInteractive === true)).toBe(true)
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

test('一分钟内 AbovePrompt 的 pose-only 重画复用 gauges source 字节串', ZH, async ($, on) => {
  const now = Date.now()
  mock.store(on, {})
  const clock = mock.clock(on, { now })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('turn.complete', ($, e) => ({ text: '', usage: e.usage }))
  on('tool.call', () => ({ result: {} as never }))
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true } as never)
  await $.command.run({ command: 'clawd', args: '' } as never)
  await $.turn.complete({
    answer: 'ok',
    durationMs: 1000,
    isAborted: false,
    turnId: 'pose-memo',
    reason: 'answer',
    usage: { model: 'claude-opus-5-5', input_tokens: 50, output_tokens: 40, cache_read_input_tokens: 900, cache_creation_input_tokens: 50 },
  } as never)
  await clock.advance(6600)

  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  const [clawdBefore, gaugesBefore] = await svgSourcesOf(ui)
  await clock.advance(600)
  await $.tool.call({ tool: 'Bash', command: 'pwd' } as never)
  await ui.redraw()
  const [clawdAfter, gaugesAfter] = await svgSourcesOf(ui)

  expect(gaugesAfter).toBe(gaugesBefore)
  expect(clawdAfter).not.toBe(clawdBefore)
})

test('Clawd：干活时搬出笔记本，额度 ≥90% 冒汗', ZH, async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.command.run({ command: 'clawd', args: '' } as never)
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
  await $.command.run({ command: 'clawd', args: '' } as never)
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

test('主回合：提示、读数、完成和七秒内计时器的 state.set 总量不超过七次且没有空写', ZH, async ($, on) => {
  const clock = mock.clock(on, { now: new Date(2026, 9, 15, 12).getTime() })
  mock.store(on, {})
  const writes: { key: string; value: unknown; previous: unknown }[] = []
  on('state.set', ($, e, next) => {
    writes.push({ key: e.key, value: e.value, previous: e.previous })

    return next(e)
  })
  on('session.id', () => ({ value: 'main-turn' }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, tokens: 80000, percent: 40 }, rateLimits: [] } }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('prompt.submit', ($, e) => ({ text: e.text, origin: e.origin }))
  on('turn.complete', ($, e) => ({ text: '', usage: e.usage }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.authorize', () => ({ value: null }))
  await $.session.start(START as never)
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  writes.length = 0

  await $.prompt.submit({ text: 'continue', asUser: true } as never)
  await $.session.measure(measure(42, 8, 63))
  await $.turn.complete({
    answer: 'ok',
    durationMs: 1000,
    isAborted: false,
    turnId: 'write-count',
    reason: 'answer',
    usage: { model: 'claude-opus-5-5', input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  } as never)
  await clock.advance(7000)
  await ui.redraw()

  // 七次有效写入：bars（session.measure）、cache、warm、report、pet、bars（turn.complete）、week。
  expect(writes.length).toBeLessThanOrEqual(7)
  expect(writes.every(write => JSON.stringify(write.value) !== JSON.stringify(write.previous))).toBe(true)
})

test('排布均匀：左右留白相等，从预留工具图标后的 Clawd 边缘计算间距', ZH, async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  // 故意用长短差很多的文字：上下文副标题短，每周额度副标题长
  await $.session.measure(measure(42, 8, 63))
  await $.command.run({ command: 'clawd', args: '' } as never)
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  const src = String((await svgOf(ui)).props?.source)
  const blocks = [...src.matchAll(new RegExp(`<rect x="([\\d.]+)" y="0" width="([\\d.]+)" height="${H}" fill="transparent"\\/>`, 'g'))].map(m => [Number(m[1]), Number(m[2])])
  expect(blocks).toHaveLength(4)
  const near = (a: number, b: number) => Math.abs(a - b) < 0.6
  const reservedEdge = 22 + 16 * 4.5 + ACTIVITY_LAYOUT_RESERVE
  const gaps = [blocks[0][0] - reservedEdge, ...[1, 2, 3].map(i => blocks[i][0] - (blocks[i - 1][0] + blocks[i - 1][1]))]
  for (const g of gaps) expect(near(g, gaps[0])).toBe(true)
  // 右边留白 = 左边留白（22）
  expect(src).toContain('transform="translate(22 ')
  expect(near(1068 - (blocks[3][0] + blocks[3][1]), 22)).toBe(true)
  // 各块宽度跟着文字走，不再强行等宽（上下文按悬停详情「84,000 tokens」留宽，比 5 小时额度那块宽）
  expect(blocks[0][1] > blocks[1][1]).toBe(true)
})

test('100% 放进圆环：三位数去掉 %、换小字号', ZH, async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.complete', ($, e) => ({ text: '', usage: e.usage }))
  await $.session.measure(measure(42, 8, 63))
  await $.turn.complete(turn(500, 0, 0))
  await $.command.run({ command: 'clawd', args: '' } as never)
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  const src = String((await svgOf(ui)).props?.source)
  expect(String((await svgOf(ui)).props?.alt)).toContain('缓存命中 100%')
  // 另外三个两位数以内的圆环各有一个 %，100 的那个没有
  expect(src.match(/class="pct"/g)?.length).toBe(3)
  expect(src).toContain('class="num sm"')
})

test('折叠：数据刷新保持细条；▲ 和 /clawd 展开，▼ 和 /clawd 收起', ZH, async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure(measure(42, 8, 63))
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })

  const mini = await svgOf(ui)
  expect(mini.props?.height).toBe(H_MINI)
  expect(String(mini.props?.source)).toContain(' mini"')
  expect(String(mini.props?.source)).toContain('class="mlab">缓存命中')
  // 细条也跟着 App 外观走
  expect(String(mini.props?.source)).toContain('style="color-scheme:light dark;background:transparent"')
  expect(String(mini.props?.source)).toContain('.mtrack{fill:#E8E5DC}')
  expect((await ui.find({ key: 'toggle' }))?.props?.label).toBe('▲')

  // 按「展开」→ 一直展开
  await ui.press({ key: 'toggle' })
  await ui.redraw()
  expect((await svgOf(ui)).props?.height).toBe(H)

  // 按「收起」→ 立刻收起
  await ui.press({ key: 'toggle' })
  await ui.redraw()
  expect((await svgOf(ui)).props?.height).toBe(H_MINI)

  // 收起时有新读数仍保持细条
  await $.session.measure(measure(57, 8, 63))
  await ui.redraw()
  expect((await svgOf(ui)).props?.height).toBe(H_MINI)

  // /clawd：展开后保持展开，再次运行收起
  await $.command.run({ command: 'clawd', args: '' } as never)
  await ui.redraw()
  expect((await svgOf(ui)).props?.height).toBe(H)
  await $.command.run({ command: 'clawd', args: '' } as never)
  await ui.redraw()
  expect((await svgOf(ui)).props?.height).toBe(H_MINI)
})

test('细条排布均匀：左右留白相等，从预留工具图标后的 Clawd 边缘计算间距', ZH, async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure(measure(42, 8, 63))
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  const src = String((await svgOf(ui)).props?.source)
  const items = [...src.matchAll(new RegExp(`<rect x="([\\d.]+)" y="0" width="([\\d.]+)" height="${H_MINI}" fill="transparent"\\/>`, 'g'))].map(m => [Number(m[1]), Number(m[2])])
  expect(items).toHaveLength(4)
  const near = (a: number, b: number) => Math.abs(a - b) < 0.6
  const miniReservedEdge = 14 + 26 * 3 + 17 // MINI_X + MINI_LAYOUT_W + MINI_ACTIVITY_RESERVE
  const gaps = [items[0][0] - miniReservedEdge, ...[1, 2, 3].map(i => items[i][0] - (items[i - 1][0] + items[i - 1][1]))]
  for (const g of gaps) expect(near(g, gaps[0])).toBe(true)
  expect(src).toContain('transform="translate(14 ')
  expect(near(1068 - (items[3][0] + items[3][1]), 14)).toBe(true)
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
  await $.command.run({ command: 'clawd', args: '' } as never)
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

test('英文界面：四块仍然左右留白相等，从预留工具图标后的 Clawd 边缘计算间距', EN, async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure(measure(42, 8, 63))
  await $.command.run({ command: 'clawd', args: '' } as never)
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  const src = String((await svgOf(ui)).props?.source)
  const blocks = [...src.matchAll(new RegExp(`<rect x="([\\d.]+)" y="0" width="([\\d.]+)" height="${H}" fill="transparent"\\/>`, 'g'))].map(m => [Number(m[1]), Number(m[2])])
  const near = (a: number, b: number) => Math.abs(a - b) < 0.6
  const reservedEdge = 22 + 16 * 4.5 + ACTIVITY_LAYOUT_RESERVE
  const gaps = [blocks[0][0] - reservedEdge, ...[1, 2, 3].map(i => blocks[i][0] - (blocks[i - 1][0] + blocks[i - 1][1]))]
  for (const g of gaps) expect(near(g, gaps[0])).toBe(true)
  expect(src).toContain('transform="translate(22 ')
  expect(near(1068 - (blocks[3][0] + blocks[3][1]), 22)).toBe(true)
})

test('信息栏渲染出错：回退到后续渲染器', ZH, async ($, on) => {
  mock.store(on, {})
  mock.clock(on)
  on('state.get', () => ({ deny: 'state read failed' }))
  let fallbackCalls = 0
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    fallbackCalls++
    const { Text } = $.ui.resolve(e)

    return <Text>fallback</Text>
  })

  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  expect(fallbackCalls).toBe(1)
  expect(await ui.find({ type: 'Text', text: 'fallback' })).toBeDefined()
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

test('跟随系统：启动不等待慢语言检测，检测完成后信息栏切换中文', AUTO, async ($, on) => {
  mock.store(on, {})
  mock.clock(on)
  mock.env(on, {})
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))

  let release!: () => void
  let markDetectionStarted!: () => void
  let markChineseStored!: () => void
  const gate = new Promise<void>(resolve => (release = resolve))
  const detectionStarted = new Promise<void>(resolve => (markDetectionStarted = resolve))
  const chineseStored = new Promise<void>(resolve => (markChineseStored = resolve))
  on('process.run', async () => {
    markDetectionStarted()
    await gate

    return { value: { exitCode: 0, stdout: '(\n    "zh-Hans-CN",\n    en\n)\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('state.set', ($, e, next) => {
    if (e.key === 'lang' && e.value === 'zh') markChineseStored()

    return next(e)
  })

  const sessionStart = $.session.start(START as never)
  await detectionStarted
  let startTimeout!: ReturnType<typeof setTimeout>
  const resolvedWhileDetectionPending = await Promise.race([
    sessionStart.then(() => true),
    new Promise<boolean>(resolve => {
      startTimeout = setTimeout(() => resolve(false), 100)
    }),
  ])
  clearTimeout(startTimeout)
  release()
  await sessionStart
  await chineseStored

  expect(resolvedWhileDetectionPending).toBe(true)
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  expect(String((await svgOf(ui)).props?.alt)).toContain('上下文')
})

test('放松模式：缓存命中 ≥90% 戴墨镜；同时额度告急则只冒汗不戴墨镜', ZH, async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.complete', ($, e) => ({ text: '', usage: e.usage }))
  await $.session.measure(measure(42, 8, 63))
  await $.turn.complete(turn(95, 0, 5))
  await $.command.run({ command: 'clawd', args: '' } as never)
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
  await $.command.run({ command: 'clawd', args: '' } as never)
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  expect(String((await svgOf(ui)).props?.source)).not.toMatch(/class="clawd[^"]* chill"/)
})

test('放松模式 + 干活：墨镜和干活两种状态同时挂在 Clawd 上（干活时墨镜推到头顶）', ZH, async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.complete', ($, e) => ({ text: '', usage: e.usage }))
  await $.session.measure(measure(42, 8, 63))
  await $.turn.complete(turn(95, 0, 5))
  await $.command.run({ command: 'clawd', args: '' } as never)
  const ui = await $.ui.mount({ ...BAND(true), surface: 'desktop' })
  const src = String((await svgOf(ui)).props?.source)
  expect(src).toMatch(/class="clawd working[^"]* chill"/)
  expect(src).toContain('.chill.working .shades{animation:none;transform:translateY(-1.9px)}')
})

test('放松模式 + 睡眠或完成：眼睛静止闭合；待你状态仍保持睁眼', () => {
  const chillBars: Bars = {
    from: null,
    to: {
      contextPercent: 20,
      contextTokens: 40000,
      contextWindow: 200000,
      session: { percent: 10 },
      weekly: { percent: 20 },
      cache: { rate: 92, read: 920, write: 40, fresh: 40 },
    },
  }
  const sleeping = bandSvg(chillBars, false, 900, false, 'zh', undefined, undefined, { kind: 'sleep' })
  const done = bandSvg(chillBars, false, 900, false, 'zh', undefined, undefined, { kind: 'done' })
  const needsYou = bandSvg(chillBars, false, 900, false, 'zh', undefined, undefined, { kind: 'needs-you', icon: 'bang' })
  const reaction = bandSvg(chillBars, false, 900, false, 'zh', undefined, undefined, { kind: 'reaction', reaction: 'oops', icon: 'cross' })

  expect(sleeping).toContain('.sleep .eyes{opacity:0;animation:none}')
  expect(done).toContain('.done .eyes{opacity:0;animation:none}')
  expect(sleeping).toContain('.sleep .shades{opacity:0;animation:none}')
  expect(done).toContain('.done .shades{opacity:0;animation:none}')
  expect(needsYou).toContain('.needs-you .eyes{opacity:1;animation:none;transform:scale(1.25);transform-origin:center}')
  expect(needsYou).toContain('.needs-you .shades{opacity:0;animation:none}')
  expect(reaction).toContain('.reaction .eyes,.reaction .shades{opacity:0;animation:none}')
})

test('悬停换上的详情（如「84,000 tokens」）比副标题长时，这一块按详情留宽，不压分隔线、不出右边界', EN, async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.complete', ($, e) => ({ text: '', usage: e.usage }))
  await $.session.measure(measure(42, 8, 63))
  await $.turn.complete(turn(990000, 140000, 5000))
  await $.command.run({ command: 'clawd', args: '' } as never)
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
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.complete', ($, e) => ({ text: '', usage: e.usage }))
  await $.session.measure(measure(42, 8, 63))
  await $.turn.complete(turn(990000, 140000, 5000))
  await $.command.run({ command: 'clawd', args: '' } as never)
  const seen = new Set<string>()
  for (const cols of [140, 115, 105, 70, 58, 45, 40]) {
    const band = { ...BAND(false), props: { ...BAND(false).props, bodyColumns: cols }, viewport: { columns: cols, rows: 40 }, surface: 'desktop' as const }
    const svg = await svgOf(await $.ui.mount(band))
    const width = Number(svg.props?.width)
    // 可用宽度 ≈ 每列 8px；SVG + 按钮（44）不超过它（最窄 398 的下限只在极窄时才起作用）
    if (cols * 8 - 8 >= MIN_BAND_W_WITH_ACTIVITY + 44) expect(width + 44).toBeLessThanOrEqual(cols * 8 - 8)
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
  await $.command.run({ command: 'clawd', args: '' } as never)
  for (const cols of [140, 70, 58, 45]) {
    const band = { ...BAND(false), props: { ...BAND(false).props, bodyColumns: cols }, viewport: { columns: cols, rows: 40 }, surface: 'desktop' as const }
    const svg = await svgOf(await $.ui.mount(band))
    const width = Number(svg.props?.width)
    const items = [...String(svg.props?.source).matchAll(new RegExp(`<rect x="([\\d.]+)" y="0" width="([\\d.]+)" height="${H_MINI}" fill="transparent"\\/>`, 'g'))].map(m => Number(m[1]) + Number(m[2]))
    expect(items).toHaveLength(4)
    expect(Math.max(...items)).toBeLessThanOrEqual(width - 14 + 0.6)
  }
})
