import { expect, mock, test } from 'claude-code/testing'

import type { Bars } from '../types'
import { bandAlt, bandSvg, MIN_BAND_W, MIN_BAND_W_WITH_FABLE } from './band'
import { CHANGELOG } from './changelog'

const gaugeCount = (svg: string) => svg.match(/<g class="g(?: enter)?"/g)?.length ?? 0

test('Fable 每周额度排在每周额度后作为第五个圆环，并出现在收起模式、alt 文本和 Clawd 紧张状态中', () => {
  const bars = {
    from: null,
    to: {
      contextPercent: 20,
      contextTokens: 40000,
      contextWindow: 200000,
      session: { percent: 30 },
      weekly: { percent: 40 },
      fable: { percent: 28, resetsAt: '2026-10-19T10:00:00.044Z' },
      cache: { rate: 92, read: 900, write: 50, fresh: 50 },
    },
  } as unknown as Bars
  const svg = bandSvg(bars, false, MIN_BAND_W_WITH_FABLE, false, 'en')

  expect(gaugeCount(svg)).toBe(5)
  const trackXs = [...svg.matchAll(/<circle cx="([\d.]+)" cy="40" r="26" class="track"\/>/g)].map(match => Number(match[1]))
  expect(trackXs).toHaveLength(5)
  expect(trackXs[4] + 28.5).toBeLessThanOrEqual(MIN_BAND_W_WITH_FABLE - 22)
  expect(svg.indexOf('<title>Weekly 40%')).toBeLessThan(svg.indexOf('<title>Fable weekly 28%'))
  expect(bandSvg(bars, false, MIN_BAND_W_WITH_FABLE, true, 'en')).toContain('<title>Fable weekly 28%')
  expect(bandAlt(bars.to, false, 'en')).toBe('Context 20%, 5-hour 30%, Weekly 40%, Fable weekly 28%, Cache hit 92%; Claude is resting')

  const stressed = { ...bars, to: { ...bars.to, fable: { percent: 90 } } }
  expect(bandSvg(stressed, false, MIN_BAND_W_WITH_FABLE, false, 'en')).toContain('class="clawd stressed"')
})

test('没有 Fable 时保持原有四个圆环和 alt 文本', () => {
  const bars: Bars = {
    from: null,
    to: { contextPercent: 20, contextTokens: 40000, contextWindow: 200000, session: { percent: 30 }, weekly: { percent: 40 }, cache: { rate: 92, read: 900, write: 50, fresh: 50 } },
  }

  expect(gaugeCount(bandSvg(bars, false, 1100, false, 'en'))).toBe(4)
  expect(bandAlt(bars.to, false, 'en')).toBe('Context 20%, 5-hour 30%, Weekly 40%, Cache hit 92%; Claude is resting')
})

const START = { cwd: '/tmp', surface: 'desktop' as const, isInteractive: true }
const BAND = {
  plugin: 'usage-pet',
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 140, scroll: { offset: 0, bodyRows: 12 }, view: {} },
  viewport: { columns: 140, rows: 40 },
  surface: 'desktop' as const,
}
const NARROW_BAND = { ...BAND, props: { ...BAND.props, bodyColumns: 30 } }
const MEASURE = {
  context: { window: 200000, tokens: 84000, percent: 42 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 8, resetsAt: '2026-10-15T20:50:00.044Z' },
    { kind: 'seven_day', percentUsed: 63, resetsAt: '2026-10-18T20:50:00.044Z' },
  ],
  changed: ['context', 'rateLimits'] as ('context' | 'rateLimits')[],
}

type Harness = Parameters<Parameters<typeof test>[1]>

type UsageResponse = { status: number; text: string }

const fableResponse = (percent: number) => ({
  status: 200,
  text: JSON.stringify({
    limits: [
      { kind: 'weekly_all', group: 'weekly', percent: 28, resets_at: '2026-10-18T20:50:00.044Z', scope: null },
      { kind: 'weekly_scoped', group: 'weekly', percent: 8, resets_at: '2026-10-19T10:00:00.044Z', scope: { model: { display_name: 'Claude Sonnet' } } },
      { kind: 'weekly_scoped', group: 'weekly', percent, resets_at: '2026-10-19T10:00:00.044Z', scope: { model: { display_name: 'fAbLe Extended' } } },
    ],
  }),
})

async function setup($: Harness[0], on: Harness[1], responses: UsageResponse[] = [], authorize: unknown = { handle: 'test-oauth-handle' }) {
  const network = { fetches: 0 }
  mock.store(on, { lastSeenVersion: CHANGELOG[0].version })
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 15, 12) })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, tokens: 84000, percent: 42 }, rateLimits: [] } }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('turn.complete', ($, e) => ({ text: '', usage: e.usage }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.authorize', () => ({ value: authorize }))
  on('http.fetch', () => {
    const response = responses[Math.min(network.fetches, responses.length - 1)] ?? { status: 200, text: '{"limits":[]}' }
    network.fetches++

    return { value: response }
  })
  await $.session.start(START as never)
  await $.session.measure(MEASURE)

  return { clock, network }
}

test('session.start 读取大小写不敏感的 Fable 每周额度，后续用量更新仍保留它', { options: { language: 'en' } }, async ($, on) => {
  const { network, clock } = await setup($, on, [fableResponse(31), { status: 200, text: '{"limits":[]}' }])
  await Promise.resolve()
  await $.session.measure(MEASURE)
  expect(network.fetches).toBe(1)
  await $.turn.complete({ answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer', usage: { model: 'claude-opus-5-5', input_tokens: 50, output_tokens: 40, cache_read_input_tokens: 900, cache_creation_input_tokens: 50 } } as never)
  expect(network.fetches).toBe(1)
  await clock.advance(5 * 60000)
  await $.turn.complete({ answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't2', reason: 'answer', usage: { model: 'claude-opus-5-5', input_tokens: 50, output_tokens: 40, cache_read_input_tokens: 900, cache_creation_input_tokens: 50 } } as never)
  await Promise.resolve()
  await $.session.measure(MEASURE)
  expect(network.fetches).toBe(2)

  const ui = await $.ui.mount(BAND)
  const svg = String((await ui.findAll({ type: 'Svg' }))[0].props?.source)
  expect(svg).toContain('<title>Fable weekly 31%')
  expect(String((await ui.findAll({ type: 'Svg' }))[0].props?.alt)).toContain('Fable weekly 31%')

  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await terminal.find({ type: 'Text', text: 'Fable weekly' })).toBeDefined()
  expect(await terminal.find({ type: 'Text', text: '31%' })).toBeDefined()

  const narrow = await $.ui.mount(NARROW_BAND)
  expect((await narrow.findAll({ type: 'Svg' }))[0].props?.width).toBe(MIN_BAND_W_WITH_FABLE)
})

test('没有第一方授权时跳过 Fable 请求，普通信息栏仍正常显示', { options: { language: 'en' } }, async ($, on) => {
  const { network } = await setup($, on, [], null)

  const ui = await $.ui.mount(NARROW_BAND)
  const svg = (await ui.findAll({ type: 'Svg' }))[0]
  expect(network.fetches).toBe(0)
  expect(svg.props?.width).toBe(MIN_BAND_W)
  expect(gaugeCount(String(svg.props?.source))).toBe(4)
  expect(String(svg.props?.alt)).not.toContain('Fable')
})

test('Fable 用量请求失败时不影响普通信息栏', { options: { language: 'en' } }, async ($, on) => {
  const { network } = await setup($, on, [{ status: 503, text: 'unavailable' }])

  const ui = await $.ui.mount(BAND)
  const svg = (await ui.findAll({ type: 'Svg' }))[0]
  expect(network.fetches).toBe(1)
  expect(gaugeCount(String(svg.props?.source))).toBe(4)
  expect(String(svg.props?.alt)).not.toContain('Fable')
})

test('Fable 用量 JSON 格式错误时不影响普通信息栏', { options: { language: 'en' } }, async ($, on) => {
  const { network } = await setup($, on, [{ status: 200, text: '{' }])

  const ui = await $.ui.mount(BAND)
  const svg = (await ui.findAll({ type: 'Svg' }))[0]
  expect(network.fetches).toBe(1)
  expect(gaugeCount(String(svg.props?.source))).toBe(4)
  expect(String(svg.props?.alt)).not.toContain('Fable')
})
