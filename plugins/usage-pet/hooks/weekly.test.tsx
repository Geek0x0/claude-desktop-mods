import { expect, mock, test } from 'claude-code/testing'

import type { Ledger } from '../types'
import { cardAlt, cardSvg } from './card'
import { NEW_PET } from './pet'
import { addTurn, hourOf, isStale, mergeLedgers, partialSince, SINCE_KEY, sumWeek, toLedger } from './weekly'

const H = 3600000
const DAY = 24 * H
const NOW = new Date(2026, 9, 16, 14, 30).getTime()
const NOW_HOUR = hourOf(NOW)
const USAGE = { input_tokens: 50, output_tokens: 40, cache_read_input_tokens: 900, cache_creation_input_tokens: 50 }

// ───────── 纯函数：怎么记、怎么加 ─────────

test('记账：同一小时累加，8 天前的格子顺手删掉', () => {
  const old: Ledger = { [NOW_HOUR - 8 * 24]: [1, 1, 1, 1], [NOW_HOUR - 3]: [5, 6, 7, 8] }
  const once = addTurn(old, NOW, USAGE)
  const twice = addTurn(once, NOW + 10 * 60000, USAGE)
  expect(twice[NOW_HOUR]).toEqual([100, 100, 1800, 80])
  expect(twice[NOW_HOUR - 3]).toEqual([5, 6, 7, 8])
  expect(twice[NOW_HOUR - 8 * 24]).toBeUndefined()
})

test('最近 7 天 = 往回 168 小时：第 167 小时前的算，第 168 小时前的不算', () => {
  const a: Ledger = { [NOW_HOUR - 167]: [1, 0, 0, 0], [NOW_HOUR - 168]: [1000, 0, 0, 0] }
  const b: Ledger = { [NOW_HOUR]: [0, 2, 3, 4] }
  expect(sumWeek([a, b], NOW, 7)).toEqual({ total: 10, fresh: 1, write: 2, read: 3, output: 4, since: 7 })
  // 合并后再加，结果一样（会话里存的是合并的那份）
  expect(sumWeek([mergeLedgers([a, b])], NOW, 7).total).toBe(10)
  // 过了一小时，第 167 小时前的那格也滑出去了
  expect(sumWeek([a, b], NOW + H, 7).total).toBe(9)
})

test('8 天没记过账的会话算过期；store 里形状不对的当空账', () => {
  expect(isStale({ [NOW_HOUR - 8 * 24]: [1, 1, 1, 1] }, NOW)).toBe(true)
  expect(isStale({ [NOW_HOUR - 8 * 24 + 1]: [1, 1, 1, 1] }, NOW)).toBe(false)
  expect(isStale({}, NOW)).toBe(true)
  expect(toLedger({ 1: [1, 2, 3, 4], x: [1, 2, 3, 4], 2: [1, 2, 3], 3: 'a', 4: [1, 2, 3, Number.NaN] })).toEqual({ 1: [1, 2, 3, 4] })
  expect(toLedger('junk')).toEqual({})
})

test('记账不满 7 天时给出开始日，满了就不写', () => {
  expect(partialSince(NOW - 2 * DAY, NOW)?.getTime()).toBe(NOW - 2 * DAY)
  expect(partialSince(NOW - 7 * DAY, NOW)).toBeUndefined()
  expect(partialSince(0, NOW)).toBeUndefined()
})

test('战报卡：有数字就多一行「近 7 天 · 所有会话」，没有就不画', () => {
  const data = { startedAt: 0, now: 60000, turns: 1, toolCalls: 0, files: 0, tokens: 0, pet: NEW_PET, earned: [] }
  expect(cardSvg({ ...data, week: { total: 8_412_000 } }, 'zh')).toContain('近 7 天 · 所有会话  <tspan class="wk">8.41M tokens</tspan>')
  expect(cardSvg({ ...data, week: { total: 1_200_000_000, since: 'Oct 16' } }, 'en')).toContain('Last 7 days · all sessions (since Oct 16)  <tspan class="wk">1.2B tokens</tspan>')
  expect(cardAlt({ ...data, week: { total: 8_412_000 } }, 'en')).toContain('Last 7 days · all sessions 8.41M tokens')
  expect(cardSvg(data, 'zh')).not.toContain('近 7 天')
})

// ───────── 接进插件：每轮记账，展开时写进 Clawd 的悬停提示 ─────────

const BAND = {
  plugin: 'usage-pet',
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 140, scroll: { offset: 0, bodyRows: 12 }, view: {} },
  viewport: { columns: 140, rows: 40 },
  surface: 'desktop' as const,
}
const TURN = { answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' as const, usage: { model: 'claude-opus-5-5', ...USAGE } }

type Harness = Parameters<Parameters<typeof test>[1]>
// 另一个会话在 2 天前记了 5000，一个早已结束的会话在 10 天前记过账；记账从 10 天前开始
// mock.store 存的是副本、测试里读不回来（同一事件也不能再挂第二个钩子）：自己用一个 Map 当 store，测试能直接看插件写了什么、删了什么
function fakeStore(on: Harness[1], entries: Record<string, unknown>) {
  const data = new Map<string, unknown>(Object.entries(entries).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]))
  const deleted: string[] = []
  on('store.get', ($, e) => ({ value: data.get(e.key) }))
  on('store.set', ($, e) => {
    data.set(e.key, JSON.parse(JSON.stringify(e.value)))

    return { value: undefined }
  })
  on('store.delete', ($, e) => {
    data.delete(e.key)
    deleted.push(e.key)

    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...data.keys()] }))

  return { data, deleted }
}

async function setup($: Harness[0], on: Harness[1], since = NOW - 10 * DAY) {
  const store = fakeStore(on, {
    [SINCE_KEY]: since,
    'tok:other': { [NOW_HOUR - 48]: [5000, 0, 0, 0] },
    'tok:old': { [NOW_HOUR - 240]: [9, 9, 9, 9] },
  })
  const clock = mock.clock(on, { now: NOW })
  on('session.id', () => ({ value: 'sess-A' }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('turn.complete', ($, e) => ({ text: '', usage: e.usage }))
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true } as never)

  return { clock, ...store }
}
const clawdTitle = async ($: Harness[0]) => {
  const svg = String((await (await $.ui.mount(BAND)).findAll({ type: 'Svg' }))[0]?.props?.source)

  return svg.match(/<g class="clawd[^"]*"[^>]*><title>([^<]*)<\/title>/)?.[1] ?? ''
}

test('主对话和子代理的每一轮都记，加上别的会话；10 天前那份账删掉', { options: { language: 'en' } }, async ($, on) => {
  const { data, deleted } = await setup($, on)
  await $.command.run({ command: 'clawd', args: '' } as never)
  await $.turn.complete(TURN)
  await $.turn.complete({ ...TURN, turnId: 't2', agentId: 'sub-1' })
  // 5000（别的会话）+ 1040 × 2（主对话、子代理）= 7080 → 7k；少算任何一份都不是 7k
  expect(await clawdTitle($)).toContain('Last 7 days: 7k tokens (all sessions, incl. subagents)')
  // 只写自己那份；别的会话的账不碰；10 天前那份删掉；开始时间已经有了就不再写
  expect(data.get('tok:sess-A')).toEqual({ [NOW_HOUR]: [100, 100, 1800, 80] })
  expect(data.get('tok:other')).toEqual({ [NOW_HOUR - 48]: [5000, 0, 0, 0] })
  expect(data.get(SINCE_KEY)).toBe(NOW - 10 * DAY)
  expect(deleted).toEqual(['tok:old'])
})

test('收起成细条时不写近 7 天（只在展开时写）', { options: { language: 'zh' } }, async ($, on) => {
  await setup($, on)
  await $.command.run({ command: 'clawd', args: '' } as never)
  await $.turn.complete(TURN)
  expect(await clawdTitle($)).toContain('近 7 天 6k tokens（所有会话，含子代理）')
  // 用户再次运行 /clawd 后收成细条
  await $.command.run({ command: 'clawd', args: '' } as never)
  const title = await clawdTitle($)
  expect(title).toContain('Clawd Lv.')
  expect(title).not.toContain('近 7 天')
})

test('很久没发消息：画的时候按当前时间截，别的会话那 5000 过了 7 天就不算了', { options: { language: 'en' } }, async ($, on) => {
  const { clock } = await setup($, on)
  await $.command.run({ command: 'clawd', args: '' } as never)
  await $.turn.complete(TURN)
  expect(await clawdTitle($)).toContain('Last 7 days: 6k tokens')
  // 5 天 1 小时后：2 天前那 5000 已经是 7 天 1 小时前，滑出去；这个会话自己那 1040 还在
  await clock.advance(5 * DAY + H)
  expect(await clawdTitle($)).toContain('Last 7 days: 1k tokens')
})

test('记账不满 7 天：写明从哪天开始记', { options: { language: 'zh' } }, async ($, on) => {
  await setup($, on, NOW - 2 * DAY)
  await $.command.run({ command: 'clawd', args: '' } as never)
  await $.turn.complete(TURN)
  expect(await clawdTitle($)).toContain('近 7 天 6k tokens（所有会话，含子代理，10 月 14 日起记录）')
})

test('第一次记账时记下开始时间', { options: { language: 'en' } }, async ($, on) => {
  const { data } = fakeStore(on, {})
  mock.clock(on, { now: NOW })
  on('session.id', () => ({ value: 'sess-B' }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('turn.complete', ($, e) => ({ text: '', usage: e.usage }))
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true } as never)
  await $.command.run({ command: 'clawd', args: '' } as never)
  await $.turn.complete(TURN)
  expect(data.get(SINCE_KEY)).toBe(NOW)
  expect(await clawdTitle($)).toContain('Last 7 days: 1k tokens (all sessions, incl. subagents; counting since Oct 16)')
})

test('session.start 注册命令失败时仍记录用量快照', { options: { language: 'en' } }, async ($, on) => {
  mock.clock(on, { now: NOW })
  mock.store(on, {})
  on('session.id', () => ({ value: 'start-snapshot' }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('session.authorize', () => ({ value: null }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, tokens: 80000, percent: 40 }, rateLimits: [] } }))
  on('command.register', () => {
    throw new Error('command registration failed')
  })
  const snapshots: unknown[] = []
  on('state.set', ($, e, next) => {
    if (e.key === 'bars') snapshots.push(e.value)

    return next(e)
  })

  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true } as never)

  expect(snapshots.some(value => (value as { to?: { contextPercent?: number } }).to?.contextPercent === 40)).toBe(true)
})

test('主对话和子代理同时答完：两笔都记上，不会一笔盖掉另一笔', { options: { language: 'en' } }, async ($, on) => {
  const { data } = await setup($, on)
  await Promise.all([$.turn.complete(TURN), $.turn.complete({ ...TURN, turnId: 't2', agentId: 'sub-1' })])
  expect(data.get('tok:sess-A')).toEqual({ [NOW_HOUR]: [100, 100, 1800, 80] })
})
