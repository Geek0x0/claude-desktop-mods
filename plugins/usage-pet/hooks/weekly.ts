// 近 7 天用了多少 tokens：插件自己记账（引擎只给当前会话的用量，没有历史）。
// 每个会话在 $.store 里只写自己那一份（键 tok:<会话 id>），按小时累计；显示时把所有会话加起来。
// 这样几个会话同时开着也不会互相覆盖（$.store 没有「按版本写入」，整份读写会丢数）。
// 按小时记：「最近 7 天」就是从现在往回 168 小时，跟每个人的周额度从哪天开始算无关。
import type { ModelUsage } from 'claude-code'

import type { Cell, Ledger, WeekTotals } from '../types'

export const HOUR_MS = 3600000
export const WEEK_HOURS = 7 * 24
// 记账多留一天再删，免得刚好压在 7 天边上的那一小时被提前删掉
const KEEP_HOURS = WEEK_HOURS + 24
export const LEDGER_PREFIX = 'tok:'
// 第一次记账的那一小时：不满 7 天时界面写「x 月 x 日起」，不假装是完整的一周
export const SINCE_KEY = 'tokSince'

export const hourOf = (ms: number) => Math.floor(ms / HOUR_MS)

// 一轮的用量记进这一小时，顺手删掉 8 天前的格子
export function addTurn(ledger: Ledger, now: number, u: ModelUsage): Ledger {
  const hour = hourOf(now)
  const next: Ledger = {}
  for (const [h, cell] of Object.entries(ledger)) {
    if (Number(h) > hour - KEEP_HOURS) {
      next[h] = cell
    }
  }
  const [fresh, write, read, output] = next[hour] ?? [0, 0, 0, 0]
  next[hour] = [fresh + u.input_tokens, write + u.cache_creation_input_tokens, read + u.cache_read_input_tokens, output + u.output_tokens]

  return next
}

// 各会话的账按小时合并成一份（会话里只留这一份，画的时候再按当前时间截出最近 7 天）
export function mergeLedgers(ledgers: Ledger[]): Ledger {
  const out: Ledger = {}
  for (const ledger of ledgers) {
    for (const [h, cell] of Object.entries(ledger)) {
      const sum = out[h] ?? [0, 0, 0, 0]
      out[h] = [sum[0] + cell[0], sum[1] + cell[1], sum[2] + cell[2], sum[3] + cell[3]]
    }
  }

  return out
}

// 最近 168 小时（含当前这一小时）的合计
export function sumWeek(ledgers: Ledger[], now: number, since: number): WeekTotals {
  const from = hourOf(now) - WEEK_HOURS
  const t: WeekTotals = { total: 0, fresh: 0, write: 0, read: 0, output: 0, since }
  for (const ledger of ledgers) {
    for (const [h, [fresh, write, read, output]] of Object.entries(ledger)) {
      if (Number(h) > from) {
        t.fresh += fresh
        t.write += write
        t.read += read
        t.output += output
      }
    }
  }
  t.total = t.fresh + t.write + t.read + t.output

  return t
}

// 这份账最近一次记账在 8 天前：会话早就结束了，可以删
export function isStale(ledger: Ledger, now: number): boolean {
  const newest = Math.max(-Infinity, ...Object.keys(ledger).map(Number))

  return newest <= hourOf(now) - KEEP_HOURS
}

// store 里读出来的东西不一定是这个形状（手改过、旧版本写的）：不像就当空账
export function toLedger(value: unknown): Ledger {
  if (typeof value !== 'object' || value === null) {
    return {}
  }
  const out: Ledger = {}
  for (const [h, cell] of Object.entries(value)) {
    if (/^\d+$/.test(h) && Array.isArray(cell) && cell.length === 4 && cell.every(n => typeof n === 'number' && Number.isFinite(n))) {
      out[h] = cell as Cell
    }
  }

  return out
}

// 记账开始不满 7 天：返回开始那天（给界面写「x 月 x 日起」），满了就是 undefined
export function partialSince(since: number, now: number): Date | undefined {
  return since > 0 && hourOf(now) - hourOf(since) < WEEK_HOURS ? new Date(since) : undefined
}
