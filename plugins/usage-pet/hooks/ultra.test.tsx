import type { SessionRateLimit } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import type { Bars } from '../types'
import { bandSvgParts } from './band'

// 已验证的 Ultra 账号实测（2.1.317，10 月 Max 20x 改名 Ultra 后）：响应里只有 seven_day，没有 five_hour

const START = { cwd: '/tmp', surface: 'desktop' as const, isInteractive: true }
const BAND = (surface: 'desktop' | 'terminal') => ({
  plugin: 'usage-pet',
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 12, bodyColumns: 140, scroll: { offset: 0, bodyRows: 12 }, view: {} },
  viewport: { columns: 140, rows: 40 },
  surface,
})
// 读数里的倒计时读插件时钟，而 mock.clock 的默认值是 epoch 0。固定插件时钟并按它给 resetsAt，
// 否则「还剩 N 天 H 小时」会随真实时间变化，H 正好是 5 时还会撞上下面断言里的「5 小时」。
const NOW = new Date(2026, 10, 25, 12).getTime()
const FIVE: SessionRateLimit = { kind: 'five_hour', percentUsed: 8, resetsAt: new Date(NOW + 50 * 60000).toISOString() }
const WEEK: SessionRateLimit = { kind: 'seven_day', percentUsed: 50, resetsAt: new Date(NOW + 3 * 86400000).toISOString() }
const measure = (rateLimits: SessionRateLimit[]) => ({
  context: { window: 200000, tokens: 84000, percent: 42 },
  rateLimits,
  changed: ['context', 'rateLimits'] as ('context' | 'rateLimits')[],
})

type Harness = Parameters<TestBody>
// 自己用 Map 当 store：测试要直接看插件写了什么，还要用它模拟「上一个会话留下的记录」
function fakeStore(on: Harness[1], entries: Record<string, unknown>) {
  const data = new Map<string, unknown>(Object.entries(entries))
  on('store.get', ($, e) => ({ value: data.get(e.key) }))
  on('store.set', ($, e) => {
    data.set(e.key, e.value)

    return { value: undefined }
  })
  on('store.delete', ($, e) => {
    data.delete(e.key)

    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...data.keys()] }))

  return data
}

async function setup($: Harness[0], on: Harness[1], entries: Record<string, unknown> = {}, opening: SessionRateLimit[] = []) {
  const store = fakeStore(on, entries)
  mock.clock(on, { now: NOW })
  mock.env(on, {})
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: opening } }))
  on('session.authorize', () => ({ value: null }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('turn.complete', ($, e) => ({ text: '', usage: e.usage }))
  on('ui.log', () => ({ value: undefined }))
  await $.session.start(START as never)

  return store
}

// 这些断言都走真实回显：measure → $.state 序列化 → ui.render → SVG，不是直接调 bandSvg。
// 桌面端默认收起成细条，先跑 /clawd 展开；SVG 拆成 Clawd 和读数两块，断言时拼起来看。
const svgOf = async ($: Harness[0], surface: 'desktop' | 'terminal' = 'desktop') => {
  const nodes = await (await $.ui.mount(BAND(surface))).findAll({ type: 'Svg' })
  const source = nodes.map(node => String(node.props?.source)).join('')
  // 读数那块（第二块 Svg）才带信息栏的 alt；第一块是 Clawd 自己的
  const alt = String(nodes[nodes.length - 1]?.props?.alt)

  return { source, alt }
}
const ZH = { options: { language: 'zh' } }

test('展开：没有 5 小时额度就画三项，没有空圆环，分隔线两条且坐标合法', ZH, async ($, on) => {
  await setup($, on)
  await $.session.measure(measure([WEEK]) as never)
  await $.command.run({ command: 'clawd', args: '' } as never)
  const { source, alt } = await svgOf($)
  expect(source).not.toContain('5 小时额度')
  expect(source).not.toContain('暂无读数')
  expect(source).toContain('每周额度')
  expect(source.match(/class="sep"/g)).toHaveLength(2)
  expect(source).not.toContain('NaN')
  expect(alt).toBe('上下文 42%，每周额度 50%，缓存命中 —；Claude 在休息')
})

test('收起成细条：同样只有三项', ZH, async ($, on) => {
  await setup($, on)
  await $.session.measure(measure([WEEK]) as never)
  const { source } = await svgOf($)
  expect(source).toContain('class="mlab"')
  expect(source).not.toContain('5小时')
  expect(source.match(/class="mval"/g)).toHaveLength(3)
})

test('终端：只有上下文和每周两个读数', ZH, async ($, on) => {
  await setup($, on)
  await $.session.measure(measure([WEEK]) as never)
  const ui = await $.ui.mount(BAND('terminal'))
  const percents = await ui.findAll({ type: 'Text', text: /%$/ })
  expect(percents.map(t => t.text)).toEqual(['42%', '50%'])
  // 空读数显示成「—」，不以 % 结尾：上面那条抓不到，要单独看标签
  expect(await ui.findAll({ type: 'Text', text: /5 小时/ })).toEqual([])
})

test('Max / Pro：两个额度都有，还是四项，不写任何记录', ZH, async ($, on) => {
  const store = await setup($, on)
  await $.session.measure(measure([FIVE, WEEK]) as never)
  await $.command.run({ command: 'clawd', args: '' } as never)
  const { source } = await svgOf($)
  expect(source).toContain('5 小时额度')
  expect(source.match(/class="sep"/g)).toHaveLength(3)
  expect(store.has('noFiveHour')).toBe(false)
})

test('刚开的会话还没有任何读数：不知道套餐时保留四项', ZH, async ($, on) => {
  await setup($, on)
  await $.session.measure(measure([]) as never)
  await $.command.run({ command: 'clawd', args: '' } as never)
  expect((await svgOf($)).source).toContain('5 小时额度')
})

test('新会话第一次回复之前：记得上次没有 5 小时额度，一开始就不画空圆环', ZH, async ($, on) => {
  await setup($, on, { noFiveHour: true })
  await $.session.measure(measure([]) as never)
  await $.command.run({ command: 'clawd', args: '' } as never)
  expect((await svgOf($)).source).not.toContain('5 小时额度')
})

test('第一次发现没有 5 小时额度：记下来，留给下一个会话', ZH, async ($, on) => {
  const store = await setup($, on)
  await $.session.measure(measure([WEEK]) as never)
  expect(store.get('noFiveHour')).toBe(true)
})

test('记录写不进去：这次照样不画空圆环，不让 store 的问题弄坏信息栏', ZH, async ($, on) => {
  // store.set 必然失败
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => {
    throw new Error('store set failed')
  })
  on('store.keys', () => ({ value: [] }))
  on('store.delete', () => ({ value: undefined }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  const logs: string[] = []
  on('ui.log', ($, e) => {
    logs.push(e.text)

    return { value: undefined }
  })
  await $.session.measure(measure([WEEK]) as never)
  const { source } = await svgOf($)
  expect(source).not.toContain('5 小时额度')
  expect(logs.join()).toContain('读写 5 小时额度记录失败')
})

test('换回有 5 小时额度的套餐（或窗口过期后下一次回复带回来）：圆环回来，记录改回去', ZH, async ($, on) => {
  const store = await setup($, on, { noFiveHour: true }, [WEEK])
  await $.command.run({ command: 'clawd', args: '' } as never)
  expect((await svgOf($)).source).not.toContain('5 小时额度')
  await $.session.measure(measure([FIVE, WEEK]) as never)
  const { source } = await svgOf($)
  expect(source).toContain('5 小时额度')
  expect(store.get('noFiveHour')).toBe(false)
})

test('窄窗口：没有 5 小时额度时按优先级收，保留上下文与每周额度', () => {
  const bars = {
    from: null,
    to: {
      contextPercent: 42,
      contextTokens: 84000,
      contextWindow: 200000,
      weekly: { percent: 50 },
      cache: { rate: 92, read: 900, write: 50, fresh: 50 },
      noFiveHour: true,
    },
  } as unknown as Bars
  // 270 正好是只放得下两块的最小宽度（band.test.tsx 窄窗口用例的下限）
  const parts = bandSvgParts(bars, false, 270, false, 'zh', undefined, undefined, undefined, 0)

  expect(parts.hidden).toHaveLength(1)
  expect(parts.hidden[0]).toContain('缓存命中')
  expect(parts.gauges).toContain('<title>上下文')
  expect(parts.gauges).toContain('<title>每周额度')
  expect(parts.gauges).not.toContain('5 小时额度')
})
