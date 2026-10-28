import { expect, mock, test } from 'claude-code/testing'

import type { Bars } from '../types'
import { bandAlt, bandSvgParts, formatCost, MIN_BAND_W_WITH_COST_AND_ACTIVITY, MIN_BAND_W_WITH_FABLE_AND_COST_AND_ACTIVITY, minBandWidth } from './band'
import { cardAlt, cardSvg, type CardData } from './card'
import { NEW_PET } from './pet'

const bandSvg = (...args: Parameters<typeof bandSvgParts>) => {
  const { gauges, clawd } = bandSvgParts(...args)
  return gauges + clawd
}

const EN = { options: { language: 'en' } }
const BARS = {
  from: null,
  to: {
    contextPercent: 20,
    contextTokens: 40000,
    contextWindow: 200000,
    session: { percent: 30 },
    weekly: { percent: 40 },
    cache: { rate: 92, read: 900, write: 50, fresh: 50 },
    cost: { usd: 0.24 },
  },
} as unknown as Bars

test('会话费用：展开、细条和辅助文本显示 API 费用', () => {
  const expanded = bandSvg(BARS, false, 1100, false, 'zh')
  const mini = bandSvg(BARS, false, 1100, true, 'en')

  expect(expanded).toContain('class="cost-badge"')
  expect(expanded).toContain('class="cost-glyph"')
  expect(expanded).toContain('>费用</text>')
  expect(expanded).toContain('>$0.24</text>')
  expect(expanded).toContain('>本会话</text>')
  expect(expanded).toContain('.cost-badge{fill:url(#grad-ok)')
  expect(expanded).toContain('@media (prefers-color-scheme:light){.cost-badge{stroke:#C2603F}')
  expect(expanded.indexOf('<title>Cache hit')).toBeLessThan(expanded.indexOf('<title>费用 $0.24'))
  expect(mini).toContain('<title>Cost $0.24')
  expect(mini).toContain('>Cost</text>')
  expect(mini).toContain('>$0.24</text>')
  const miniCost = mini.slice(mini.indexOf('<title>Cost $0.24'))
  expect(miniCost.slice(0, miniCost.indexOf('</g>'))).not.toContain('mfill')
  expect(bandAlt(BARS.to, false, 'en')).toBe('Context 20%, 5-hour 30%, Weekly 40%, Cache hit 92%, Cost $0.24; Claude is resting')
  expect(bandAlt(BARS.to, false, 'zh')).toBe('上下文 20%，5 小时额度 30%，每周额度 40%，缓存命中 92%，费用 $0.24；Claude 在休息')
  expect(formatCost(123.456)).toBe('$123.46')
})

test('费用块：在最窄布局占一个完整块宽，最小宽度同时计入 Fable 和工具图标', () => {
  const narrow = bandSvg(BARS, false, MIN_BAND_W_WITH_COST_AND_ACTIVITY, false, 'en')
  const badge = narrow.match(/<circle cx="([\d.]+)" cy="[\d.]+" r="26" class="cost-badge"\/>/)

  expect(MIN_BAND_W_WITH_COST_AND_ACTIVITY).toBe(462)
  expect(MIN_BAND_W_WITH_FABLE_AND_COST_AND_ACTIVITY).toBe(526)
  expect(badge).not.toBeNull()
  expect(Number(badge?.[1]) + 28.5).toBeLessThanOrEqual(MIN_BAND_W_WITH_COST_AND_ACTIVITY - 22)
})

test('没有费用：信息栏输出保持旧样式和旧 alt 文本', () => {
  const noCost: Bars = {
    from: null,
    to: { contextPercent: 20, contextTokens: 40000, contextWindow: 200000, session: { percent: 30 }, weekly: { percent: 40 }, cache: { rate: 92, read: 900, write: 50, fresh: 50 } },
  }
  const parts = bandSvgParts(noCost, false, 1100, false, 'en', undefined, undefined, undefined, 0)

  expect(parts.clawd.length).toBe(10884)
  expect(parts.gauges.length).toBe(13131)
  expect(fingerprint(parts.clawd)).toBe(3898783688)
  expect(fingerprint(parts.gauges)).toBe(712157436)
  expect(parts.gauges).not.toContain('cost-badge')
  expect(bandAlt(noCost.to, false, 'en')).toBe('Context 20%, 5-hour 30%, Weekly 40%, Cache hit 92%; Claude is resting')
})

test('报告卡：图片卡和终端卡都显示本会话费用', () => {
  const data = {
    startedAt: 0,
    now: 60000,
    turns: 1,
    toolCalls: 0,
    files: 0,
    tokens: 0,
    cost: 0.24,
    pet: NEW_PET,
    earned: [],
  } as unknown as CardData
  const zhCard = cardSvg(data, 'zh')
  const enCard = cardSvg(data, 'en', 'wide')
  const enSquare = cardSvg(data, 'en', 'square')

  expect(zhCard).toContain('>$0.24</text><text x="388" y="238" class="l">费用</text>')
  expect(enCard).toContain('>$0.24</text><text x="388" y="238" class="l">Cost</text>')
  expect(enCard).toContain('width="1200" height="675"')
  expect(enSquare).toContain('>$0.24</text><text x="388" y="238" class="l">Cost</text>')
  expect(zhCard).not.toContain('x="44" y="332"')
  expect(cardAlt(data, 'zh')).toContain('费用 $0.24')
  expect(cardAlt(data, 'en')).toContain('Cost $0.24')
  const noCost = { ...data, cost: undefined }
  const noCostPane = cardSvg(noCost, 'en')
  const noCostWide = cardSvg(noCost, 'en', 'wide')
  for (const source of [noCostPane, noCostWide]) {
    expect(source).toContain('<text x="268" y="128" class="v">')
    expect(source).toContain('<text x="388" y="128" class="v">1</text>')
    expect(source).toContain('<text x="508" y="128" class="v">0</text>')
    expect(source).toContain('<text x="268" y="206" class="v">0</text>')
    expect(source).toContain('<text x="388" y="206" class="v">0</text>')
    expect(source).toContain('<text x="508" y="206" class="v">—</text>')
    expect(source).not.toContain('>Cost</text>')
  }
  expect(cardAlt(noCost, 'en')).not.toContain('Cost $0.24')
})

const START = { cwd: '/tmp', surface: 'desktop' as const, isInteractive: true }
const BAND = {
  plugin: 'usage-pet',
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 140, scroll: { offset: 0, bodyRows: 12 }, view: {} },
  viewport: { columns: 140, rows: 40 },
  surface: 'desktop' as const,
}
const MEASURE = {
  context: { window: 200000, tokens: 40000, percent: 20 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 30, resetsAt: '2026-10-15T20:50:00.044Z' },
    { kind: 'seven_day', percentUsed: 40, resetsAt: '2026-10-18T20:50:00.044Z' },
  ],
  changed: ['context', 'rateLimits'] as ('context' | 'rateLimits')[],
}
const PANES = (surface: 'desktop' | 'terminal') => ({
  plugin: 'usage-pet',
  component: 'Pane' as const,
  requestId: 'clawd-card',
  props: {},
  viewport: { columns: 100, rows: 40 },
  surface,
})

test('费用来源：读取 session.usage，按 session.measure 更新并在无费用的新记录中保留', EN, async ($, on) => {
  let barWrites = 0
  mock.store(on, {})
  mock.clock(on, { now: new Date(2026, 9, 15, 12).getTime() })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, tokens: 40000, percent: 20 }, rateLimits: [], cost: { usd: 0.24 } } }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.authorize', () => ({ value: null }))
  on('http.fetch', () => ({ value: { status: 200, text: '{"limits":[]}' } }))
  on('state.set', ($, e, next) => {
    if (String(e.key).includes('bars')) barWrites++

    return next(e)
  })
  await $.session.start(START as never)
  await $.session.measure(MEASURE as never)
  await $.command.run({ command: 'clawd', args: '' } as never)
  barWrites = 0

  const band = async () => String((await (await $.ui.mount(BAND)).findAll({ type: 'Svg' }))[1].props?.source)
  expect(await band()).toContain('>$0.24</text>')
  const narrow = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 30 } })
  const narrowSvgs = await narrow.findAll({ type: 'Svg' })
  expect(narrowSvgs[0].props?.width).toBe(120)
  expect(narrowSvgs[0].props?.width as number + (narrowSvgs[1].props?.width as number)).toBe(minBandWidth(2))
  await $.session.measure({ ...MEASURE, cost: { usd: 1.25 } } as never)
  expect(barWrites).toBe(1)
  expect(await band()).toContain('>$1.25</text>')
  await $.session.measure(MEASURE as never)
  expect(barWrites).toBe(1)
  expect(await band()).toContain('>$1.25</text>')

  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const labels = (await terminal.findAll({ type: 'Text' })).map(node => String(node.text))
  expect(labels.join(' ')).toContain('Cost')
  expect(labels.join(' ')).toContain('$1.25')

  const card = await $.ui.mount(PANES('desktop'))
  expect(String((await card.findAll({ type: 'Svg' }))[0].props?.source)).toContain('>$1.25</text><text x="388" y="238" class="l">Cost</text>')
  const terminalCard = await $.ui.mount(PANES('terminal'))
  expect(String((await terminalCard.findAll({ type: 'Text' }))[0].text)).toContain('Cost $1.25')
})

function fingerprint(source: string): number {
  let hash = 2166136261
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619)
  return hash >>> 0
}
