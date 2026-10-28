import { atom, read } from 'claude-code'
import type { Atom, EngineInterface, ModelUsage, PluginState, Register, SessionContextUsage, SessionRateLimit, StateRef, Timer } from 'claude-code'

import type { Activity, AgentState, Bars, CacheStat, CacheTotals, Pet, ReactionKind, Report, SessionCost, Snap, Week, Window } from '../types'
import {
  bandAlt,
  bandSvgParts,
  type CacheTimer,
  type BandSvgParts,
  H,
  H_MINI,
  MIN_BAND_W_WITH_ACTIVITY,
  MIN_BAND_W_WITH_COST_AND_ACTIVITY,
  MIN_BAND_W_WITH_FABLE_AND_COST_AND_ACTIVITY,
  MIN_BAND_W_WITH_FABLE_AND_ACTIVITY,
  formatCost,
  type PetView,
  tokensText,
} from './band'
import { canReplaceActivity, iconForTool, isFrustratedPrompt, reactionForToolResult, updateTantrumWindow } from './activity'
import { CARD_H, CARD_W, type CardData, cardAlt, cardSvg } from './card'
import { type Lang, type LangChoice, langFromTags, parseAppleLanguages, T, weekday } from './i18n'
import { moodAt } from './mood'
import { mergePetProgress, type Achievement, isHalloween, levelOf, NEW_PET, normalize, onTurn, threshold } from './pet'
import { addTurn, isStale, LEDGER_PREFIX, mergeLedgers, partialSince, SINCE_KEY, sumWeek, toLedger } from './weekly'

type UsagePetAtomKey = keyof PluginState['usage-pet'] & string
type UsagePetAtom<K extends UsagePetAtomKey, T> = Atom<T> & { readonly ref: StateRef<'usage-pet', K> }
type ActivityFrame = Activity & { owner?: number; previous?: ActivityFrame }
type ToolBurst = { owner: number; calls: Set<number>; frame?: ActivityFrame; timer?: Timer; generation: number }

// Limit retained SVG time values across host remounts; reuse stays source-stable within the window.
const GAUGE_SOURCE_MEMO_MAX_AGE_MS = 60_000
let previousGaugeSvg: (Pick<BandSvgParts, 'gauges' | 'gaugesKey'> & { createdAt: number }) | undefined

const barsRef = { plugin: 'usage-pet', key: 'bars' } as const
const cacheRef = { plugin: 'usage-pet', key: 'cache' } as const
const pinnedRef = { plugin: 'usage-pet', key: 'pinned' } as const
const ditherRef = { plugin: 'usage-pet', key: 'dither' } as const
const langRef = { plugin: 'usage-pet', key: 'lang' } as const
const petRef = { plugin: 'usage-pet', key: 'pet' } as const
const reportRef = { plugin: 'usage-pet', key: 'report' } as const
const activityRef = { plugin: 'usage-pet', key: 'activity' } as const
const agentsRef = { plugin: 'usage-pet', key: 'agents' } as const
const askRef = { plugin: 'usage-pet', key: 'ask' } as const
const warmRef = { plugin: 'usage-pet', key: 'warm' } as const
const weekRef = { plugin: 'usage-pet', key: 'week' } as const

const barsAtom = atom(barsRef, { from: null, to: null } as Bars) as UsagePetAtom<'bars', Bars>

const cacheAtom = atom(cacheRef, { read: 0, write: 0, fresh: 0 } as CacheTotals) as UsagePetAtom<'cache', CacheTotals>

// 展开 / 收起：只由用户通过按钮或 /clawd 切换；pinned 键保留以沿用已有用户选择
const pinnedAtom = atom(pinnedRef, false) as UsagePetAtom<'pinned', boolean>
// 紫色像素点阵：用户选择跨会话保留；默认开启
const ditherAtom = atom(ditherRef, true) as UsagePetAtom<'dither', boolean>
// 界面语言：session.start 时定下来（/config 选了就用选的，auto 就跟随系统）
const langAtom = atom(langRef, 'en' as Lang) as UsagePetAtom<'lang', Lang>
// 养成：跨会话的那份在 $.store 的 PET_KEY；这里留一份给信息栏画
const petAtom = atom(petRef, NEW_PET as Pet) as UsagePetAtom<'pet', Pet>
const NEW_REPORT: Report = { startedAt: 0, turns: 0, toolCalls: 0, files: [], output: 0, earned: [] }
const reportAtom = atom(reportRef, NEW_REPORT) as UsagePetAtom<'report', Report>
const activityAtom = atom(activityRef, { kind: 'idle' } as Activity) as UsagePetAtom<'activity', Activity>
const EMPTY_AGENTS: AgentState = { count: 0, rows: [] }
const agentsAtom = atom(agentsRef, EMPTY_AGENTS) as UsagePetAtom<'agents', AgentState>
const MAX_ACTIVITY_DEPTH = 8
const TOOL_RESTORE_MS = 300
const MIN_POSE_MS = 600
const AGENT_REFRESH_MS = 1000
const AGENT_POLL_MS = 5000
const MAX_AGENT_ROWS = 6
// 子代理状态只保存展示字段；刷新请求合并，避免每次工具调用都重绘。
let agentRefreshTimer: Timer | undefined
let agentPollTimer: Timer | undefined
let agentRefreshRunning = false
let agentRefreshInFlight = false
let agentRefreshQueued = false
let agentGeneration = 0
let lastAgentRefreshAt: number | undefined
let runningAgentCount = 0
let activityFrame: ActivityFrame = { kind: 'idle' }
let activityOwner = 0
const activeActivityOwners = new Set<number>()
let toolCallOwner = 0
let toolBurst: ToolBurst | undefined
const SLEEP_AFTER_MS = 10 * 60000
const DONE_MS = 6000
const REACTION_MS: Record<ReactionKind, number> = { 'test-pass': 6000, 'test-fail': 6000, oops: 3000, tantrum: 8000 }
const TANTRUM_WINDOW_MS = 20 * 60000
let sleepTimer: Timer | undefined
let sleepGeneration = 0
let lastActivityAt = 0
let mainTurnActive = false
let tantrumTimes: number[] = [] // Keep timestamps only; submitted prompt text is never retained.
let compactThresholdSnapshot: { window: number; threshold?: number } | undefined

function debugError($: EngineInterface, label: string, error: unknown) {
  try {
    $.ui.log(`usage-pet: ${label}: ${String(error)}`, { to: 'debug' })
  } catch {
    // Logging must never change the result of an observed event.
  }
}

async function safeBookkeeping($: EngineInterface, label: string, run: () => Promise<void> | void) {
  try {
    await run()
  } catch (error) {
    debugError($, label, error)
  }
}

async function compactThresholdForWindow($: EngineInterface, window: number): Promise<number | undefined> {
  if (compactThresholdSnapshot?.window === window) return compactThresholdSnapshot.threshold

  // 窗口变化时重读一次；把失败也记为当前窗口，避免每次测量都重复调用。
  compactThresholdSnapshot = { window }
  try {
    const usage = await $.session.usage({ breakdown: 'summary' })
    const threshold = usage.context.window === window ? usage.context.breakdown?.autoCompactThreshold : undefined
    compactThresholdSnapshot = { window, threshold }

    return threshold
  } catch (error) {
    debugError($, 'reading auto-compact threshold failed', error)

    return undefined
  }
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => deepEqual(item, right[index]))
  }

  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const keys = Object.keys(leftRecord).filter(key => leftRecord[key] !== undefined)
  const rightKeys = Object.keys(rightRecord).filter(key => rightRecord[key] !== undefined)
  if (keys.length !== rightKeys.length) return false

  return keys.every(key => Object.prototype.hasOwnProperty.call(rightRecord, key) && deepEqual(leftRecord[key], rightRecord[key]))
}

function readUsagePetAtom($: EngineInterface, key: UsagePetAtomKey) {
  switch (key) {
    case 'bars': return $.state.get(barsRef)
    case 'cache': return $.state.get(cacheRef)
    case 'pinned': return $.state.get(pinnedRef)
    case 'dither': return $.state.get(ditherRef)
    case 'lang': return $.state.get(langRef)
    case 'pet': return $.state.get(petRef)
    case 'report': return $.state.get(reportRef)
    case 'activity': return $.state.get(activityRef)
    case 'agents': return $.state.get(agentsRef)
    case 'ask': return $.state.get(askRef)
    case 'warm': return $.state.get(warmRef)
    case 'week': return $.state.get(weekRef)
  }
}

function writeUsagePetAtom($: EngineInterface, key: UsagePetAtomKey, value: unknown, version: number) {
  switch (key) {
    case 'bars': return $.state.set(barsRef, value as Bars, { ifVersion: version })
    case 'cache': return $.state.set(cacheRef, value as CacheTotals, { ifVersion: version })
    case 'pinned': return $.state.set(pinnedRef, value as boolean, { ifVersion: version })
    case 'dither': return $.state.set(ditherRef, value as boolean, { ifVersion: version })
    case 'lang': return $.state.set(langRef, value as Lang, { ifVersion: version })
    case 'pet': return $.state.set(petRef, value as Pet, { ifVersion: version })
    case 'report': return $.state.set(reportRef, value as Report, { ifVersion: version })
    case 'activity': return $.state.set(activityRef, value as Activity, { ifVersion: version })
    case 'agents': return $.state.set(agentsRef, value as AgentState, { ifVersion: version })
    case 'ask': return $.state.set(askRef, value as number, { ifVersion: version })
    case 'warm': return $.state.set(warmRef, value as number, { ifVersion: version })
    case 'week': return $.state.set(weekRef, value as Week, { ifVersion: version })
  }
}

async function updateIfChanged<K extends UsagePetAtomKey, T>(
  $: EngineInterface,
  target: UsagePetAtom<K, T>,
  change: (current: T) => T,
): Promise<T> {
  while (true) {
    const { value, version } = await readUsagePetAtom($, target.ref.key)
    const current = (value === undefined ? target.initial : value) as T
    const next = change(current)
    if (deepEqual(current, next)) return current

    const result = await writeUsagePetAtom($, target.ref.key, next, version)
    if (result.isSet) return next
  }
}

function capActivityFrame(frame: ActivityFrame | undefined, depth = MAX_ACTIVITY_DEPTH): ActivityFrame {
  if (!frame || depth <= 0) return { kind: 'idle' }
  const { previous, ...current } = frame
  if (!previous || depth <= 1) return current

  return { ...current, previous: capActivityFrame(previous, depth - 1) }
}

function restoreActivity(frame: ActivityFrame | undefined, depth = MAX_ACTIVITY_DEPTH): ActivityFrame {
  if (!frame || depth <= 0) return { kind: 'idle' }

  let head: ActivityFrame | undefined = frame
  let skipped = 0
  while (head && skipped < depth && (head.kind === 'needs-you' || (head.owner !== undefined && !activeActivityOwners.has(head.owner)))) {
    head = head.previous
    skipped++
  }
  if (!head || skipped >= depth) return { kind: 'idle' }

  const { previous, ...current } = head
  if (!previous || depth <= 1) return current

  return { ...current, previous: restoreActivity(previous, depth - 1) }
}

function visibleActivity(frame: ActivityFrame): Activity {
  return {
    kind: frame.kind,
    ...(frame.icon !== undefined ? { icon: frame.icon } : {}),
    ...(frame.reaction !== undefined ? { reaction: frame.reaction } : {}),
  }
}

// activity atom 只由内存里的 activityFrame 写：按上次写出的值去重，并合并最短停留期内的快速变化
// （在别的钩子帧里读到的可能还是旧值，比较会误判成「没变」而漏写）
let publishedActivity: Activity | undefined
let lastActivityWriteAt: number | undefined
let activityPublishTimer: Timer | undefined
let activityPublishGeneration = 0

function cancelActivityPublishTimer($: EngineInterface, label: string) {
  const timer = activityPublishTimer
  activityPublishTimer = undefined
  activityPublishGeneration++
  try {
    timer?.cancel()
  } catch (error) {
    debugError($, label, error)
  }
}

async function writeActivity($: EngineInterface, next: Activity, at: number): Promise<Activity> {
  publishedActivity = next
  lastActivityWriteAt = at
  await $.state.set(activityRef, next)

  return visibleActivity(activityFrame)
}

async function publishActivity($: EngineInterface): Promise<Activity> {
  let next = visibleActivity(activityFrame)
  if (publishedActivity && deepEqual(publishedActivity, next)) return next

  const now = await clockNow($)
  next = visibleActivity(activityFrame)
  if (publishedActivity && deepEqual(publishedActivity, next)) return next

  const elapsed = lastActivityWriteAt === undefined ? MIN_POSE_MS : now - lastActivityWriteAt
  if (elapsed < MIN_POSE_MS) {
    if (!activityPublishTimer) {
      const generation = ++activityPublishGeneration
      try {
        activityPublishTimer = $.clock.after(MIN_POSE_MS - elapsed, () => {
          if (generation !== activityPublishGeneration) return

          activityPublishTimer = undefined
          void safeBookkeeping($, 'activity pose publish timer failed', async () => {
            await publishActivity($)
          })
        })
      } catch (error) {
        debugError($, 'activity pose publish timer setup failed', error)

        return writeActivity($, next, now)
      }
    }

    return visibleActivity(activityFrame)
  }

  cancelActivityPublishTimer($, 'activity pose publish timer cancel failed')

  return writeActivity($, next, now)
}

function setActivityFrame($: EngineInterface, frame: ActivityFrame) {
  activityFrame = capActivityFrame(frame)

  return publishActivity($)
}

function isPromptDropped(result: unknown): boolean {
  return typeof result === 'object' && result !== null && 'drop' in result
}

function previousActivity(current: ActivityFrame): ActivityFrame {
  return restoreActivity(current.kind === 'needs-you' || current.kind === 'done' || current.kind === 'sleep' ? current.previous : current)
}

async function armSleepTimer($: EngineInterface, since = lastActivityAt) {
  sleepTimer?.cancel()
  sleepTimer = undefined
  const generation = ++sleepGeneration
  if (mainTurnActive) {
    return
  }
  const remaining = Math.max(0, since + SLEEP_AFTER_MS - (await clockNow($)))
  try {
    sleepTimer = $.clock.after(remaining, () => {
      if (generation !== sleepGeneration) {
        return
      }
      sleepTimer = undefined
      if (mainTurnActive) {
        return
      }
      const current = activityFrame.kind === 'needs-you' ? activityFrame : restoreActivity(activityFrame)
      if (generation !== sleepGeneration || mainTurnActive || !canReplaceActivity(current, 'sleep')) return

      void setActivityFrame($, { kind: 'sleep', previous: previousActivity(current) })
    })
  } catch {
    sleepTimer = undefined
  }
}

async function noteActivity($: EngineInterface) {
  lastActivityAt = await clockNow($)
  await armSleepTimer($, lastActivityAt)
}

async function needsYou($: EngineInterface, icon: 'bang' | 'question'): Promise<number | undefined> {
  const owner = ++activityOwner
  const previous = previousActivity(activityFrame)
  if (!canReplaceActivity(previous, 'needs-you')) return undefined

  await setActivityFrame($, { kind: 'needs-you', icon, owner, previous: restoreActivity(previous) })

  return owner
}

async function clearNeedsYou($: EngineInterface, owner: number): Promise<boolean> {
  const current = activityFrame
  const restored = removeActivityOwner(current, owner)
  if (restored === current) return false

  await setActivityFrame($, restored)

  return true
}

async function noteFrustration($: EngineInterface): Promise<boolean> {
  const now = await clockNow($)
  const result = updateTantrumWindow(tantrumTimes, now, true, TANTRUM_WINDOW_MS)
  tantrumTimes = result.timestamps

  return result.trigger
}

async function showReaction($: EngineInterface, reaction: ReactionKind) {
  const owner = ++activityOwner
  activeActivityOwners.add(owner)
  const icon: Activity['icon'] = reaction === 'test-pass' ? 'check' : reaction === 'tantrum' ? undefined : 'cross'
  const current = activityFrame.kind === 'needs-you' ? activityFrame : restoreActivity(activityFrame)
  if (!canReplaceActivity(current, 'reaction')) {
    activeActivityOwners.delete(owner)
    return
  }
  const previous = restoreActivity(current.kind === 'reaction' ? current.previous : current)
  await setActivityFrame($, { kind: 'reaction', reaction, icon, owner, previous })

  try {
    $.clock.after(REACTION_MS[reaction], () => {
      activeActivityOwners.delete(owner)
      if (activityFrame.kind === 'reaction' && activityFrame.owner === owner) void setActivityFrame($, restoreActivity(activityFrame.previous))
    })
  } catch {
    activeActivityOwners.delete(owner)
    if (activityFrame.kind === 'reaction' && activityFrame.owner === owner) await setActivityFrame($, restoreActivity(activityFrame.previous))
  }
}

async function completeActivity($: EngineInterface, aborted: boolean) {
  clearSettledToolBurst()
  if (aborted) {
    const previous = previousActivity(activityFrame)
    await setActivityFrame($, canReplaceActivity(previous, 'idle') ? { kind: 'idle' } : previous)
    return
  }

  const owner = ++activityOwner
  activeActivityOwners.add(owner)
  const previous = previousActivity(activityFrame)
  if (!canReplaceActivity(previous, 'done')) {
    activeActivityOwners.delete(owner)
    return
  }
  await setActivityFrame($, { kind: 'done', owner, previous: restoreActivity(previous) })

  try {
    $.clock.after(DONE_MS, () => {
      activeActivityOwners.delete(owner)
      if (activityFrame.kind === 'done' && activityFrame.owner === owner) void setActivityFrame($, restoreActivity(activityFrame.previous))
    })
  } catch {
    activeActivityOwners.delete(owner)
    if (activityFrame.kind === 'done' && activityFrame.owner === owner) await setActivityFrame($, restoreActivity(activityFrame.previous))
  }
}

function cancelToolRestore(burst: ToolBurst) {
  burst.generation++
  try {
    burst.timer?.cancel()
  } catch {
    // A timer may have fired while a new call was starting; the generation guards its callback.
  }
  burst.timer = undefined
}

function removeActivityOwner(frame: ActivityFrame, owner: number): ActivityFrame {
  if (frame.owner === owner) return restoreActivity(frame.previous)
  if (!frame.previous) return frame

  const previous = removeActivityOwner(frame.previous, owner)
  return previous === frame.previous ? frame : { ...frame, previous }
}

function clearSettledToolBurst() {
  const burst = toolBurst
  if (!burst || burst.calls.size > 0) return

  cancelToolRestore(burst)
  toolBurst = undefined
  activeActivityOwners.delete(burst.owner)
  activityFrame = removeActivityOwner(activityFrame, burst.owner)
}

async function restoreToolBurst($: EngineInterface, burst: ToolBurst, generation: number) {
  if (toolBurst !== burst || burst.generation !== generation || burst.calls.size > 0) return

  burst.timer = undefined
  toolBurst = undefined
  activeActivityOwners.delete(burst.owner)
  activityFrame = removeActivityOwner(activityFrame, burst.owner)
  await publishActivity($)
  await armSleepTimer($, lastActivityAt)
}

async function startToolCallActivity(
  $: EngineInterface,
  tool: string,
  agentId: string | undefined,
  pendingPermission: { tool: string; owner: number } | undefined,
  onStart: (burst: ToolBurst, call: number) => void,
): Promise<{ burst: ToolBurst; call: number }> {
  let burst = toolBurst
  if (!burst) {
    burst = { owner: ++activityOwner, calls: new Set<number>(), generation: 0 }
    toolBurst = burst
  }
  cancelToolRestore(burst)
  const call = ++toolCallOwner
  burst.calls.add(call)
  onStart(burst, call)

  if (pendingPermission && activityFrame.kind === 'needs-you' && activityFrame.owner === pendingPermission.owner && pendingPermission.tool !== tool) {
    return { burst, call }
  }

  const icon = iconForTool(tool)
  if (burst.frame) {
    if (activityFrame.kind === 'working' && activityFrame.owner === burst.owner && activityFrame.icon !== icon) {
      burst.frame = { ...activityFrame, icon }
      await setActivityFrame($, burst.frame)
    }

    return { burst, call }
  }

  const current = activityFrame
  const previous =
    agentId === undefined
      ? previousActivity(current)
      : current.kind === 'sleep' || current.kind === 'done'
        ? restoreActivity(current.previous)
        : restoreActivity(current)
  if (!canReplaceActivity(previous, 'working')) return { burst, call }

  activeActivityOwners.add(burst.owner)
  burst.frame = { kind: 'working', icon, owner: burst.owner, previous: restoreActivity(previous) }
  await setActivityFrame($, burst.frame)

  return { burst, call }
}

async function finishToolCallActivity($: EngineInterface, burst: ToolBurst, call: number) {
  if (toolBurst !== burst) return
  burst.calls.delete(call)
  if (burst.calls.size > 0) return

  const generation = ++burst.generation
  try {
    burst.timer = $.clock.after(TOOL_RESTORE_MS, () => {
      void restoreToolBurst($, burst, generation).catch(error => debugError($, 'tool activity restore failed', error))
    })
  } catch {
    await restoreToolBurst($, burst, generation)
  }
}

// 万圣节讨糖：最近一次答完的时间（0 = 不讨糖）。延迟 6 秒后开始讨，ASK_WINDOW_MS 内有效
const askAtom = atom(askRef, 0) as UsagePetAtom<'ask', number>
// 缓存倒计时：主对话最近一次答完的时间（0 = 这个会话还没答过）。
// 有效期：订阅（有 5 小时 / 每周额度读数）约 1 小时，API 密钥 5 分钟；每次请求重新计时。
// 从「答完」算会比真正的过期时间晚一点（有效期从最后一次请求开始算），所以界面上只到分钟
const warmAtom = atom(warmRef, 0) as UsagePetAtom<'warm', number>
// 近 7 天用量：所有会话的账按小时合并的一份，答完一轮、会话开始时从 $.store 重新合并。
// 留的是按小时的明细不是合计：很久不发消息时，画的时候按当前时间截，数字照样往前滚
const weekAtom = atom(weekRef, { hours: {}, since: 0 } as Week) as UsagePetAtom<'week', Week>
// 同一个会话里主对话和子代理可能同时答完：记账排队一个一个来，免得两次读写交错丢数
let ledgerQueue: Promise<unknown> = Promise.resolve()
const TTL_SUBSCRIPTION_MS = 60 * 60000
const TTL_API_MS = 5 * 60000
const FABLE_REFRESH_MS = 5 * 60000
const FABLE_FETCH_TIMEOUT_MS = 10_000
const ASK_DELAY_MS = 6000
const ASK_WINDOW_MS = 10 * 60000
const PET_KEY = 'pet'
const CARD_PANE = 'clawd-card'
// 改文件的工具：战报里「改动文件」按它们的路径去重计数
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const MAX_FILES = 500
// 展开 / 收起按钮占的宽度（像素），SVG 让出这一截
const BUTTON_W = 44
// 新版桌面端实测按钮会被挤到下一行：每列宽度和按钮外边距都有误差，多留一点余量，宁可信息栏窄一点也不能让按钮换行
const BAND_SAFETY_PX = 40
// 按钮用图标：信息栏往上长，▲ = 往上撑开，▼ = 往下收回。
// 这一对是同一字体里的成对字形，Chrome 实测都是 19×20px、同样居中（⌃⌄ 不是一对，大小差很多）
const ICON_EXPAND = '▲'
const ICON_COLLAPSE = '▼'

const sameSnap = (a: Snap | null, b: Snap | null) => JSON.stringify(a) === JSON.stringify(b)
type FableSession = { lastFetchAt?: number; value?: Window | null; refreshing?: boolean }

function toSnap(context: SessionContextUsage, rateLimits: SessionRateLimit[], cost?: SessionCost): Snap {
  const pick = (kind: string) => {
    const w = rateLimits.find(r => r.kind === kind)
    return w ? { percent: w.percentUsed, resetsAt: w.resetsAt } : undefined
  }

  return {
    contextPercent: context.percent,
    contextTokens: context.tokens,
    contextWindow: context.window,
    session: pick('five_hour'),
    weekly: pick('seven_day'),
    ...(cost ? { cost } : {}),
  }
}

function withClockTimeout<T>($: EngineInterface, start: () => Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    let clockTimer: Timer | undefined
    let systemTimer: ReturnType<typeof setTimeout> | undefined
    const finish = (kind: 'resolve' | 'reject', value: unknown) => {
      if (settled) return
      settled = true
      try {
        clockTimer?.cancel()
      } catch {
        // Clearing a timer must not keep the request promise pending.
      }
      if (systemTimer !== undefined) clearTimeout(systemTimer)
      if (kind === 'resolve') resolve(value as T)
      else reject(value)
    }
    const expire = () => finish('reject', new Error('Fable request timed out'))

    try {
      clockTimer = $.clock.after(timeoutMs, expire)
      if (!clockTimer) systemTimer = setTimeout(expire, timeoutMs)
    } catch {
      systemTimer = setTimeout(expire, timeoutMs)
    }

    let request: Promise<T>
    try {
      request = start()
    } catch (error) {
      finish('reject', error)
      return
    }
    request.then(value => finish('resolve', value), error => finish('reject', error))
  })
}

async function fetchFable($: EngineInterface): Promise<Window | null | undefined> {
  const auth = await $.session.authorize()
  if (!auth) {
    return undefined
  }

  const response = await withClockTimeout(
    $,
    () =>
      $.http.fetch('https://api.anthropic.com/api/oauth/usage', {
        auth: auth.handle,
        headers: { 'anthropic-beta': 'oauth-2025-04-20' },
      }),
    FABLE_FETCH_TIMEOUT_MS,
  )
  if (typeof response.status !== 'number' || response.status < 200 || response.status >= 300) {
    return undefined
  }

  const body = JSON.parse(response.text) as { limits?: unknown } | null
  if (!body || !Array.isArray(body.limits)) {
    return undefined
  }

  const limit = body.limits.find((entry: unknown) => {
    if (!entry || typeof entry !== 'object') {
      return false
    }
    const row = entry as { kind?: unknown; scope?: { model?: { display_name?: unknown } | null } | null }
    const name = row.scope?.model?.display_name

    return row.kind === 'weekly_scoped' && typeof name === 'string' && name.toLowerCase().startsWith('fable')
  }) as { percent?: unknown; resets_at?: unknown } | undefined
  if (!limit) {
    return null
  }
  if (typeof limit?.percent !== 'number' || !Number.isFinite(limit.percent) || typeof limit.resets_at !== 'string') {
    return undefined
  }

  const resetAt = Date.parse(limit.resets_at)
  if (!Number.isFinite(resetAt)) {
    return undefined
  }

  return { percent: limit.percent, resetsAt: new Date(resetAt).toISOString() }
}

const pct1 = (part: number, total: number) => Math.round((part / total) * 1000) / 10

function turnRate(u: ModelUsage): number | undefined {
  const total = u.cache_read_input_tokens + u.cache_creation_input_tokens + u.input_tokens

  return total > 0 ? pct1(u.cache_read_input_tokens, total) : undefined
}

function cacheStat(c: CacheTotals): CacheStat | undefined {
  const total = c.read + c.write + c.fresh

  return total > 0 ? { rate: pct1(c.read, total), read: c.read, write: c.write, fresh: c.fresh, turnRate: c.turnRate } : undefined
}

// 桌面端每列约 8 CSS 像素（mod-ferro 实测），用来把 SVG 的宽度对齐信息栏
const PX_PER_COLUMN = 8

// 桌面端任何状态变化都会重画整条、SVG 动画从头播（anthropics/claude-code#99211），
// 所以滚动播完后把 from 收成 to，之后的重画就是静止的最终值，不会重播滚动。

// 插件跑在独立环境里，没有 process.platform；Windows 一定有 OS=Windows_NT
async function isWindows($: EngineInterface): Promise<boolean> {
  return (await $.env.get('OS')) === 'Windows_NT'
}

// Windows 的 PowerShell 5.1（系统自带，不用另装）。-Sta：剪贴板要求单线程套间
const POWERSHELL = ['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Sta']

// 跟随系统语言：环境变量 → 系统语言（macOS 读 AppleLanguages，Windows 读显示语言）→ JS 运行时默认语言 → 英文
// （桌面 App 启动的会话里 LANG 往往是空的，所以要去问系统）
async function detectLang($: EngineInterface): Promise<Lang> {
  // 引擎要求变量名写成字面量（validate 才能列出插件读了哪些环境变量）
  const values = [await $.env.get('LC_ALL'), await $.env.get('LC_MESSAGES'), await $.env.get('LANG'), await $.env.get('LANGUAGE')]
  for (const value of values) {
    const lang = value ? langFromTags(value.split(':')) : undefined
    if (lang) {
      return lang
    }
  }
  try {
    if (await isWindows($)) {
      // Windows 显示语言，如 zh-CN、en-US
      const { exitCode, stdout } = await $.process.run([...POWERSHELL, '-Command', '(Get-UICulture).Name'], { timeoutMs: 5000 })
      const lang = exitCode === 0 ? langFromTags([stdout]) : undefined
      if (lang) {
        return lang
      }
    } else {
      const { exitCode, stdout } = await $.process.run(['defaults', 'read', '-g', 'AppleLanguages'], { timeoutMs: 3000 })
      const lang = exitCode === 0 ? langFromTags(parseAppleLanguages(stdout)) : undefined
      if (lang) {
        return lang
      }
    }
  } catch {
    // 问不到系统（不是 macOS / Windows，或命令起不来）：往下走
  }
  try {
    return langFromTags([Intl.DateTimeFormat().resolvedOptions().locale]) ?? 'en'
  } catch {
    return 'en'
  }
}

// /config 指定了语言就直接用（切换立刻生效）；auto 才用 session.start 探测到的
async function langOf($: EngineInterface, choice: LangChoice): Promise<Lang> {
  return choice === 'zh' || choice === 'en' ? choice : read($, langAtom)
}

async function record($: EngineInterface, snap: Omit<Snap, 'fable'> & { fable?: Window | null }, newSession = false) {
  const previous = await read($, barsAtom)
  const fable = snap.fable === null ? undefined : snap.fable ?? previous.to?.fable
  const cost = snap.cost ?? (newSession ? undefined : previous.to?.cost)
  const full: Snap = { ...snap, ...(cost ? { cost } : {}), fable, cache: cacheStat(await read($, cacheAtom)) }
  let changed = false
  await updateIfChanged($, barsAtom, bars => {
    changed = !sameSnap(bars.to, full)
    return changed ? { from: bars.to, to: full } : bars
  })
  if (changed) {
    $.clock.after(1300, () => void updateIfChanged($, barsAtom, bars => (sameSnap(bars.from, bars.to) ? bars : { from: bars.to, to: bars.to })))
  }
}

async function updateFableOnLatestBars($: EngineInterface, fable: Window | null) {
  let changed = false
  await updateIfChanged($, barsAtom, bars => {
    changed = false
    if (!bars.to) {
      return bars
    }
    const to = { ...bars.to }
    if (fable === null) delete to.fable
    else to.fable = fable
    if (sameSnap(bars.to, to)) {
      return bars
    }
    changed = true

    return { from: bars.to, to }
  })
  if (!changed) return

  try {
    $.clock.after(1300, () => void updateIfChanged($, barsAtom, bars => (sameSnap(bars.from, bars.to) ? bars : { from: bars.to, to: bars.to })))
  } catch {
    // The current Fable value is already on bars; the settle animation timer is optional.
  }
}

function refreshFable($: EngineInterface, state: FableSession) {
  if (state.refreshing) {
    return
  }
  state.refreshing = true

  void (async () => {
    try {
      const now = await clockNow($)
      if (state.lastFetchAt !== undefined && now - state.lastFetchAt < FABLE_REFRESH_MS) {
        return
      }
      state.lastFetchAt = now

      const fable = await fetchFable($)
      if (fable === undefined) {
        return
      }
      state.value = fable
      await updateFableOnLatestBars($, fable)
    } catch {
      // Fable 是可选额度；授权、网络或响应出错时保留上次读数。
    } finally {
      state.refreshing = false
    }
  })()
}

// 缓存还热多久：没答过就不显示
function cacheTimer(warmAt: number, bars: Bars, now: number): CacheTimer | undefined {
  if (warmAt <= 0) {
    return undefined
  }
  const ttlMs = bars.to?.session || bars.to?.weekly ? TTL_SUBSCRIPTION_MS : TTL_API_MS

  return { remainMs: Math.min(ttlMs, warmAt + ttlMs - now), ttlMs, startedAt: warmAt }
}

// 这个会话自己那份账的键；拿不到会话 id（不该发生）就记在一个公共键上
async function ledgerKey($: EngineInterface): Promise<string> {
  try {
    return LEDGER_PREFIX + (await $.session.id())
  } catch {
    return `${LEDGER_PREFIX}unknown`
  }
}

function serially<R>(fn: () => Promise<R>): Promise<R> {
  const run = ledgerQueue.then(fn, fn)
  ledgerQueue = run.catch(() => undefined)

  return run
}

// 一轮的用量记进这个会话的账（主对话、子代理都算）
async function logTurn($: EngineInterface, u: ModelUsage, now: number) {
  await serially(async () => {
    const key = await ledgerKey($)
    await $.store.set(key, addTurn(toLedger(await $.store.get(key)), now, u))
    if (!(Number(await $.store.get(SINCE_KEY)) > 0)) {
      await $.store.set(SINCE_KEY, now)
    }
  })
}

// 把所有会话的账加起来；8 天没记过账的别的会话顺手删掉
async function updateWeekDisplay($: EngineInterface, next: Week, now: number) {
  await updateIfChanged($, weekAtom, current =>
    (['zh', 'en'] as const).every(lang => weekLine(current, lang, now) === weekLine(next, lang, now)) ? current : next,
  )
}

async function refreshWeek($: EngineInterface, now: number, updateDisplay = true): Promise<Week> {
  const own = await ledgerKey($)
  const ledgers = []
  for (const key of await $.store.keys()) {
    if (!key.startsWith(LEDGER_PREFIX)) {
      continue
    }
    const ledger = toLedger(await $.store.get(key))
    if (key !== own && isStale(ledger, now)) {
      await $.store.delete(key)
    } else {
      ledgers.push(ledger)
    }
  }
  const week: Week = { hours: mergeLedgers(ledgers), since: Number(await $.store.get(SINCE_KEY)) || 0 }
  if (updateDisplay) await updateWeekDisplay($, week, now)

  return week
}

// 「近 7 天 8.4M tokens（…）」；还没记到账就不写
function weekLine(week: Week, lang: Lang, now: number): string | undefined {
  const { total } = sumWeek([week.hours], now, week.since)
  if (total <= 0) {
    return undefined
  }
  const since = partialSince(week.since, now)

  return T[lang].weekTokens(tokensText(total), since ? T[lang].monthDay(since) : undefined)
}

// 终端读数：进度条颜色、重置时间（24 小时内写剩余多久，否则写周几几点）
function termBarColor(percent: number): string {
  return percent >= 95 ? '#E5484D' : percent >= 80 ? '#E8913A' : '#3B7BF0'
}

function termReset(resetsAt: string | undefined, lang: Lang): string {
  if (!resetsAt) {
    return ''
  }
  const at = Date.parse(resetsAt)
  if (!Number.isFinite(at)) {
    return ''
  }
  const minutes = Math.max(0, Math.round((at - Date.now()) / 60000))
  if (minutes < 24 * 60) {
    return T[lang].left(minutes < 60 ? minutes : Math.floor(minutes / 60), minutes < 60 ? 'm' : 'hm', minutes % 60)
  }
  const d = new Date(at)

  return T[lang].resetDay(weekday(lang, d.getDay()), `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
}

// 万圣节的日期和讨糖计时读插件时钟：测试用 mock.clock 把日期拨到万圣节前后。
// 测试里没装时钟时退回系统时间（正式运行时时钟一直在）
async function clockNow($: EngineInterface): Promise<number> {
  try {
    return await $.clock.now()
  } catch {
    return Date.now()
  }
}

function cancelAgentRefreshTimer($: EngineInterface, label: string) {
  const timer = agentRefreshTimer
  agentRefreshTimer = undefined
  try {
    timer?.cancel()
  } catch (error) {
    debugError($, label, error)
  }
}

function cancelAgentPollTimer($: EngineInterface, label: string) {
  const timer = agentPollTimer
  agentPollTimer = undefined
  try {
    timer?.cancel()
  } catch (error) {
    debugError($, label, error)
  }
}

function resetAgentRefresh($: EngineInterface) {
  agentGeneration++
  agentRefreshQueued = false
  lastAgentRefreshAt = undefined
  runningAgentCount = 0
  // 保留正在执行的互斥标记，等旧请求收尾后再刷新新会话。
  cancelAgentRefreshTimer($, 'session.start 子代理刷新计时器取消失败')
  cancelAgentPollTimer($, 'session.start 子代理轮询计时器取消失败')
}

function scheduleAgentPoll($: EngineInterface) {
  if (runningAgentCount === 0 || agentPollTimer) return
  const generation = agentGeneration
  try {
    agentPollTimer = $.clock.after(AGENT_POLL_MS, () => {
      if (generation !== agentGeneration) return
      agentPollTimer = undefined
      requestAgentRefresh($)
    })
  } catch (error) {
    debugError($, '设置子代理轮询计时器失败', error)
  }
}

async function refreshAgents($: EngineInterface, generation: number) {
  const listed = await $.agent.list()
  if (!Array.isArray(listed) || generation !== agentGeneration) return

  const running = listed.filter(agent => agent.status === 'running')
  const next: AgentState = {
    count: running.length,
    rows: running.slice(0, MAX_AGENT_ROWS).map(agent => ({
      type: agent.type.replace(/\s+/g, ' ').trim(),
      description: agent.description.replace(/\s+/g, ' ').trim(),
    })),
  }
  await updateIfChanged($, agentsAtom, current => (generation === agentGeneration ? next : current))
  if (generation !== agentGeneration) return

  runningAgentCount = next.count
  if (runningAgentCount > 0) {
    scheduleAgentPoll($)
  } else {
    cancelAgentPollTimer($, '子代理结束后的轮询计时器取消失败')
  }
}

async function pumpAgentRefresh($: EngineInterface) {
  if (agentRefreshRunning || agentRefreshTimer || !agentRefreshQueued) return
  agentRefreshRunning = true
  let waitingForTimer = false
  try {
    const now = await clockNow($)
    if (!agentRefreshQueued) return
    const delay = lastAgentRefreshAt === undefined ? 0 : AGENT_REFRESH_MS - (now - lastAgentRefreshAt)
    if (delay > 0) {
      const generation = agentGeneration
      try {
        agentRefreshTimer = $.clock.after(delay, () => {
          if (generation !== agentGeneration) return
          agentRefreshTimer = undefined
          requestAgentRefresh($)
        })
      } catch (error) {
        debugError($, '设置子代理刷新计时器失败', error)
      }
      waitingForTimer = true

      return
    }

    agentRefreshQueued = false
    agentRefreshInFlight = true
    lastAgentRefreshAt = now
    try {
      await refreshAgents($, agentGeneration)
    } catch (error) {
      debugError($, '读取运行中子代理失败', error)
    } finally {
      agentRefreshInFlight = false
    }
  } finally {
    agentRefreshRunning = false
    if (agentRefreshQueued && !agentRefreshTimer && !waitingForTimer && !agentRefreshInFlight) {
      requestAgentRefresh($)
    } else if (!agentRefreshQueued && !agentRefreshInFlight) {
      scheduleAgentPoll($)
    }
  }
}

function requestAgentRefresh($: EngineInterface) {
  agentRefreshQueued = true
  void safeBookkeeping($, '安排子代理刷新失败', () => pumpAgentRefresh($))
}

// now 来自 $.clock.now()：测试里能把日期拨到万圣节前后
function petView(pet: Pet, lang: Lang, halloween = false, askSince = 0, now = 0, seasonal = true): PetView {
  const level = levelOf(pet.xp)
  const since = now - askSince - ASK_DELAY_MS
  const askAgo = halloween && askSince > 0 && since < ASK_WINDOW_MS ? since / 1000 : undefined
  const title = T[lang].petTitle(level, pet.xp, threshold(level + 1), pet.streak)

  const mood = moodAt(new Date(now), seasonal)

  return { level, title: askAgo === undefined ? title : `${T[lang].askCandy} · ${title}`, halloween, askAgo, ...(mood ? { mood } : {}) }
}

function truncateAgentDescription(description: string): string {
  const chars = Array.from(description)

  return chars.length > 48 ? `${chars.slice(0, 47).join('')}…` : description
}

// 每答完一轮：从 store 读最新的（别的会话可能也在涨经验），算完写回，升级 / 成就弹提示
async function growPet($: EngineInterface, rate: number | undefined) {
  const bars = await read($, barsAtom)
  const maxLimit = Math.max(bars.to?.session?.percent ?? 0, bars.to?.weekly?.percent ?? 0)
  const { pet: updated, events } = onTurn(normalize(await $.store.get(PET_KEY)), { now: new Date(), turnRate: rate, maxLimit })
  const latest = normalize(await $.store.get(PET_KEY))
  const pet = mergePetProgress(updated, latest)
  await $.store.set(PET_KEY, pet)
  await updateIfChanged($, petAtom, () => pet)
  for (const ev of events) {
    if (ev.kind === 'achievement' && !latest.achievements.includes(ev.id)) {
      await updateIfChanged($, reportAtom, r => ({ ...r, earned: [...r.earned, ev.id] }))
    }
  }
}

async function cardData($: EngineInterface, seasonal: boolean, lang: Lang): Promise<CardData> {
  const r = await read($, reportAtom)
  const c = await read($, cacheAtom)
  const bars = await read($, barsAtom)

  return {
    startedAt: r.startedAt || Date.now(),
    now: Date.now(),
    turns: r.turns,
    toolCalls: r.toolCalls,
    files: r.files.length,
    tokens: c.read + c.write + c.fresh + r.output,
    cacheRate: cacheStat(c)?.rate,
    cost: bars.to?.cost?.usd,
    pet: await read($, petAtom),
    earned: r.earned as Achievement[],
    halloween: seasonal && isHalloween(new Date(await clockNow($))),
    week: await cardWeek($, lang),
  }
}

async function cardWeek($: EngineInterface, lang: Lang): Promise<CardData['week']> {
  const now = await clockNow($)
  const week = await read($, weekAtom)
  const { total } = sumWeek([week.hours], now, week.since)
  if (total <= 0) {
    return undefined
  }
  const since = partialSince(week.since, now)

  return { total, since: since ? T[lang].monthDay(since) : undefined }
}

// 导出 PNG（macOS）：qlmanage 把正方形 SVG 渲染成 1200×1200，sips 从正中裁出 1200×675，
// 存到「图片/Clawd Reports」，再用 osascript 放进剪贴板（桌面端的 $.ui.copy 还不支持远程界面，而且只能放文字）。
// 不放桌面：每生成一张就多一个文件，桌面很快乱掉（用户自己会一张张删）。
// 文件夹里只留最近 KEEP_CARDS 张，更早的移进废纸篓（可找回，不直接删），只动本插件命名的文件
const KEEP_CARDS = 20
const EXPORT_SH =
  'set -e; d=$(mktemp -d); trap \'rm -r "$d"\' EXIT; cat > "$d/card.svg"; ' +
  'qlmanage -t -s 1200 -o "$d" "$d/card.svg" >/dev/null 2>&1; ' +
  'dir="$HOME/Pictures/Clawd Reports"; mkdir -p "$dir"; out="$dir/$1"; ' +
  'sips -c 675 1200 "$d/card.svg.png" --out "$out" >/dev/null; ' +
  'osascript -e "set the clipboard to (read (POSIX file \\"$out\\") as «class PNGf»)" >/dev/null; ' +
  `ls -t "$dir"/Clawd-report-*.png | tail -n +${KEEP_CARDS + 1} | while IFS= read -r old; do mv "$old" "$HOME/.Trash/" || true; done; ` +
  'printf %s "$out"'

// 导出 PNG（Windows）：hooks/export-card.ps1 用 Edge（没有就用 Chrome）无头模式把 SVG 截成 1200×675，
// 存到「图片\Clawd Reports」、放进剪贴板，只留最近 KEEP_CARDS 张，更早的移进回收站。
// SVG 先写到临时文件再交给脚本：经 stdin 传给 PowerShell 会按系统代码页解码，中文会乱
async function runWindowsExport($: EngineInterface, svg: string, name: string) {
  const temp = (await $.env.get('TEMP')) ?? (await $.env.get('TMP'))
  if (!temp) {
    throw new Error('TEMP is not set')
  }
  const svgPath = `${temp}\\${name.replace(/\.png$/, '.svg')}`
  await $.fs.write(svgPath, svg)

  return $.process.run(
    [...POWERSHELL, '-File', `${$.plugin.root}\\hooks\\export-card.ps1`, '-Svg', svgPath, '-Name', name, '-Keep', String(KEEP_CARDS)],
    { timeoutMs: 45000 },
  )
}

async function exportCard($: EngineInterface, data: CardData, lang: Lang): Promise<{ path: string } | { error: string }> {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const name = `Clawd-report-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`
  try {
    const { exitCode, stdout, stderr } = (await isWindows($))
      ? await runWindowsExport($, cardSvg(data, lang, 'wide'), name)
      : await $.process.run(['/bin/sh', '-c', EXPORT_SH, 'sh', name], { stdin: cardSvg(data, lang, 'square'), timeoutMs: 30000 })
    if (exitCode !== 0 || !stdout.endsWith(name)) {
      return { error: (stderr || `exit ${exitCode}`).trim().slice(0, 200) }
    }

    return { path: stdout }
  } catch (err) {
    return { error: String(err).slice(0, 200) }
  }
}

export const register: Register = (on, options) => {
  const choice = (options?.language ?? 'auto') as LangChoice
  // 节日装扮：/config 里 seasonal 填 off 就不换（不分大小写、去掉首尾空格；以前是下拉，现在是文本框）
  const seasonal = String(options?.seasonal ?? 'auto').trim().toLowerCase() !== 'off'
  const tantrumsEnabled = String(options?.tantrums ?? 'on').trim().toLowerCase() !== 'off'
  const fableState: FableSession = {}
  let pendingPermission: { tool: string; owner: number } | undefined
  let langDetectionGeneration = 0

  on('session.start', async ($, e, next) => {
    const detectionGeneration = ++langDetectionGeneration
    resetAgentRefresh($)
    await safeBookkeeping($, 'session.start 子代理状态重置失败', async () => {
      await updateIfChanged($, agentsAtom, () => EMPTY_AGENTS)
    })
    compactThresholdSnapshot = undefined
    mainTurnActive = false
    pendingPermission = undefined
    if (toolBurst) cancelToolRestore(toolBurst)
    toolBurst = undefined
    cancelActivityPublishTimer($, 'session.start activity publish timer cancel failed')
    lastActivityWriteAt = undefined
    activeActivityOwners.clear()
    activityFrame = { kind: 'idle' }
    publishedActivity = undefined
    await safeBookkeeping($, 'session.start fable and language setup failed', async () => {
      refreshFable($, fableState)
      // auto 先沿用本地已有语言（首次是英文），系统检测放到后台，不阻塞 session.start。
      let lang: Lang = 'en'
      if (choice === 'zh' || choice === 'en') {
        lang = choice
      } else {
        try {
          lang = await read($, langAtom)
        } catch (err) {
          debugError($, 'reading the current language failed', err)
        }
      }
      await updateIfChanged($, langAtom, () => lang)
      if (choice !== 'zh' && choice !== 'en') {
        void detectLang($)
          .then(async detected => {
            if (detectionGeneration !== langDetectionGeneration) return
            await updateIfChanged($, langAtom, current => (current === detected ? current : detected))
          })
          .catch(err => debugError($, 'language detection failed', err))
      }
    })

    await safeBookkeeping($, 'session.start pet and report load failed', async () => {
      // 养成数据从 store 读进来；战报从这个会话第一次加载开始计时（重载插件不重置）
      try {
        const pet = normalize(await $.store.get(PET_KEY))
        await updateIfChanged($, petAtom, () => pet)
      } catch (err) {
        $.ui.log(`usage-pet: 读养成数据失败：${String(err)}`, { to: 'debug' })
      }
      await updateIfChanged($, reportAtom, r => (r.startedAt ? r : { ...r, startedAt: Date.now() }))
    })

    await safeBookkeeping($, 'session.start command registration failed', async () => {
      await $.command.register({
        name: 'clawd',
        description: 'Clawd band: expand / collapse · 展开 / 收起',
        immediate: true,
      })
      await $.command.register({ name: 'clawd-dither', description: 'Clawd band: purple pixel dither on / off · 紫色像素点阵 开 / 关', immediate: true })
      await $.command.register({ name: 'clawd-card', description: `${T.en.cardCommand} · ${T.zh.cardCommand}` })
    })

    await safeBookkeeping($, 'session.start usage seed failed', async () => {
      // summary：本地估算，不发请求；只用它的 apiUsage（上一次回复的用量）给还没读数的缓存垫底
      const u = await $.session.usage({ breakdown: 'summary' })
      const compactAt = u.context.breakdown?.autoCompactThreshold
      compactThresholdSnapshot = { window: u.context.window, threshold: compactAt }
      const last = u.context.breakdown?.apiUsage
      const totals = await read($, cacheAtom)
      if (last && totals.read + totals.write + totals.fresh === 0) {
        await updateIfChanged($, cacheAtom, () => ({
          read: last.cache_read_input_tokens,
          write: last.cache_creation_input_tokens,
          fresh: last.input_tokens,
          turnRate: turnRate(last),
        }))
      }
      await record($, { ...toSnap(u.context, u.rateLimits, u.cost), ...(compactAt === undefined ? {} : { compactAt }), fable: fableState.value }, true)
    })

    await safeBookkeeping($, '读近 7 天用量失败', async () => {
      await refreshWeek($, await clockNow($))
    })

    await safeBookkeeping($, 'session.start tantrum reset failed', () => {
      tantrumTimes = []
    })

    await safeBookkeeping($, 'session.start activity reset failed', async () => {
      await setActivityFrame($, { kind: 'idle' })
    })

    await safeBookkeeping($, 'session.start activity timestamp reset failed', async () => {
      await noteActivity($)
    })

    const result = await next(e)
    requestAgentRefresh($)

    return result
  })

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    requestAgentRefresh($)

    return result
  })

  on('prompt.submit', async ($, e, next) => {
    const isMainPrompt = !e.text.trim().startsWith('/')
    mainTurnActive = isMainPrompt
    pendingPermission = undefined
    await safeBookkeeping($, 'prompt.submit bookkeeping failed', async () => {
      await noteActivity($)
      await setActivityFrame($, previousActivity(activityFrame))
      if (isMainPrompt && tantrumsEnabled && isFrustratedPrompt(e.text, e.origin.kind) && (await noteFrustration($))) {
        await showReaction($, 'tantrum')
      }
    })
    let result!: Awaited<ReturnType<typeof next>>
    let resolved = false
    try {
      result = await next(e)
      resolved = true
    } finally {
      await safeBookkeeping($, 'prompt.submit cleanup failed', async () => {
        if (isMainPrompt && (!resolved || isPromptDropped(result))) {
          mainTurnActive = false
        }
        await armSleepTimer($, lastActivityAt)
      })
    }

    return result
  })

  on('classic.PermissionRequest', async ($, e, next) => {
    let owner: number | undefined
    const tool = String((e as unknown as { tool_name?: unknown }).tool_name ?? '')
    await safeBookkeeping($, 'PermissionRequest bookkeeping failed', async () => {
      await noteActivity($)
      owner = await needsYou($, 'bang')
      if (owner !== undefined && tool) {
        pendingPermission = { tool, owner }
      }
    })
    let resolved = false
    try {
      const result = await next(e)
      resolved = true

      return result
    } finally {
      await safeBookkeeping($, 'PermissionRequest cleanup failed', async () => {
        if (!resolved && owner !== undefined) {
          if (pendingPermission?.owner === owner) pendingPermission = undefined
          await clearNeedsYou($, owner)
        }
        await armSleepTimer($, lastActivityAt)
      })
    }
  })

  // 每轮结束累计缓存 token（只算主循环，子代理有自己的缓存）
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      mainTurnActive = false
      pendingPermission = undefined
    }
    let sleepTimerArmed = false
    let weekToDisplay: Week | undefined
    let weekAt: number | undefined
    let shouldRecordBars = false
    await safeBookkeeping($, 'turn.complete bookkeeping failed', async () => {
      refreshFable($, fableState)
      const u = e.usage
      // 近 7 天用量：主对话和子代理的每一轮都记（这里不分缓存归属，只算花了多少）
      try {
        const now = await clockNow($)
        if (u) {
          await logTurn($, u, now)
        }
        weekToDisplay = await refreshWeek($, now, false)
        weekAt = now
      } catch (err) {
        $.ui.log(`usage-pet: 记近 7 天用量失败：${String(err)}`, { to: 'debug' })
      }
      if (e.agentId === undefined && u) {
        await updateIfChanged($, cacheAtom, c => ({
          read: c.read + u.cache_read_input_tokens,
          write: c.write + u.cache_creation_input_tokens,
          fresh: c.fresh + u.input_tokens,
          turnRate: turnRate(u) ?? c.turnRate,
        }))
        shouldRecordBars = (await read($, barsAtom)).to !== null
      }
      if (e.agentId === undefined) {
        const doneAt = await clockNow($)
        await updateIfChanged($, warmAtom, () => doneAt)
        await updateIfChanged($, reportAtom, r => ({ ...r, turns: r.turns + 1, output: r.output + (u?.output_tokens ?? 0) }))
        const now = await clockNow($)
        if (seasonal && isHalloween(new Date(now)) && !e.isAborted) {
          await updateIfChanged($, askAtom, () => now)
        }
        try {
          await growPet($, u ? turnRate(u) : undefined)
        } catch (err) {
          $.ui.log(`usage-pet: 养成更新失败：${String(err)}`, { to: 'debug' })
        }
        await completeActivity($, e.isAborted || e.reason === 'aborted')
        await noteActivity($)
        sleepTimerArmed = true
      }
      if (e.agentId === undefined && shouldRecordBars) {
        const bars = await read($, barsAtom)
        if (bars.to) {
          await record($, { ...bars.to, fable: fableState.value === undefined ? bars.to.fable : fableState.value })
        }
      }
      if (weekToDisplay && weekAt !== undefined) {
        await updateWeekDisplay($, weekToDisplay, weekAt)
      }
    })
    if (e.agentId === undefined && !sleepTimerArmed) {
      await safeBookkeeping($, 'turn.complete sleep timer recovery failed', async () => armSleepTimer($, lastActivityAt))
    }

    let result!: Awaited<ReturnType<typeof next>>
    try {
      result = await next(e)
    } finally {
      requestAgentRefresh($)
    }

    return result
  })

  // 战报：工具调用次数（含子代理），改过的文件按路径去重；被拦下的不算
  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) requestAgentRefresh($)
    const needsIcon =
      e.agentId === undefined ? (e.tool === 'AskUserQuestion' ? 'question' : e.tool === 'ExitPlanMode' ? 'bang' : undefined) : undefined
    const activityOwnerAtStart = activityOwner
    let needsOwner: number | undefined
    let burst: ToolBurst | undefined
    let burstCall: number | undefined
    let ran!: Awaited<ReturnType<typeof next>>
    await safeBookkeeping($, 'tool.call bookkeeping failed', async () => {
      await noteActivity($)
      const permission = pendingPermission
      if (permission?.tool === e.tool && (await clearNeedsYou($, permission.owner)) && pendingPermission === permission) {
        pendingPermission = undefined
      }
      if (needsIcon) {
        const current = activityFrame
        if (!(pendingPermission && current.kind === 'needs-you' && current.owner === pendingPermission.owner)) {
          needsOwner = await needsYou($, needsIcon)
        }
        return
      }

      await startToolCallActivity($, e.tool, e.agentId, pendingPermission, (startedBurst, startedCall) => {
        burst = startedBurst
        burstCall = startedCall
      })
    })
    try {
      ran = await next(e)
    } finally {
      await safeBookkeeping($, 'tool.call cleanup failed', async () => {
        if (burst && burstCall !== undefined) await finishToolCallActivity($, burst, burstCall)
        const permission = pendingPermission
        if (permission?.tool === e.tool && permission.owner > activityOwnerAtStart) {
          pendingPermission = undefined
          await clearNeedsYou($, permission.owner)
        }
        if (needsOwner !== undefined) {
          await clearNeedsYou($, needsOwner)
        }
        await armSleepTimer($, lastActivityAt)
      })
    }

    await safeBookkeeping($, 'tool.call result bookkeeping failed', async () => {
      if (!('deny' in ran && ran.deny !== undefined)) {
        const input = e as unknown as { command?: unknown; file_path?: unknown; notebook_path?: unknown }
        const path = EDIT_TOOLS.has(e.tool) ? (input.file_path ?? input.notebook_path) : undefined
        await updateIfChanged($, reportAtom, r => ({
          ...r,
          toolCalls: r.toolCalls + 1,
          files: typeof path === 'string' && !r.files.includes(path) && r.files.length < MAX_FILES ? [...r.files, path] : r.files,
        }))
      }

      const input = e as unknown as { command?: unknown }
      const reaction = reactionForToolResult(e.tool, String(input.command ?? ''), ran, e.agentId)
      if (reaction) {
        await showReaction($, reaction)
      }
    })

    return ran
  })

  on('session.compact', async ($, e, next) => {
    if (e.agentId !== undefined || (e as unknown as { trigger?: unknown }).trigger === 'precompute') {
      return next(e)
    }

    const owner = ++activityOwner
    let applied = false
    let result!: Awaited<ReturnType<typeof next>>
    await safeBookkeeping($, 'session.compact bookkeeping failed', async () => {
      await noteActivity($)
      const current = activityFrame
      const previous =
        current.kind === 'needs-you'
          ? current
          : restoreActivity(current.kind === 'done' || current.kind === 'sleep' ? current.previous : current)
      if (!canReplaceActivity(previous, 'compacting')) return

      applied = true
      activeActivityOwners.add(owner)
      await setActivityFrame($, { kind: 'compacting', owner, previous })
    })
    try {
      result = await next(e)
    } finally {
      await safeBookkeeping($, 'session.compact cleanup failed', async () => {
        activeActivityOwners.delete(owner)
        if (applied && activityFrame.kind === 'compacting' && activityFrame.owner === owner) {
          await setActivityFrame($, restoreActivity(activityFrame.previous))
        }
        await armSleepTimer($, lastActivityAt)
      })
    }

    return result
  })

  on('command.run', { command: 'clawd-card' }, async $ => {
    const lang = await langOf($, choice)
    await $.ui.open({ id: CARD_PANE, title: T[lang].card.title })
    const out = await exportCard($, await cardData($, seasonal, lang), lang)

    return { text: 'path' in out ? T[lang].cardSaved(out.path) : T[lang].cardOnlyShown(out.error) }
  })

  on('ui.render', { component: 'Pane', requestId: CARD_PANE }, async ($, e) => {
    const lang = await langOf($, choice)
    const data = await cardData($, seasonal, lang)
    if (e.surface === 'terminal') {
      const { Text } = $.ui.resolve(e)

      return <Text>{cardAlt(data, lang)}</Text>
    }
    const { Svg } = $.ui.resolve(e)
    const width = Math.min(CARD_W, Math.max(320, (e.viewport?.columns ?? 80) * PX_PER_COLUMN - 24))

    return <Svg source={cardSvg(data, lang)} alt={cardAlt(data, lang)} width={width} height={Math.round((width * CARD_H) / CARD_W)} />
  })

  on('command.run', { command: 'clawd' }, async $ => {
    const pinned = !(await read($, pinnedAtom))
    await updateIfChanged($, pinnedAtom, () => pinned)

    const t = T[await langOf($, choice)]

    return { text: pinned ? t.pinned : t.autoCollapse }
  })

  on('command.run', { command: 'clawd-dither' }, async ($, e) => {
    const arg = String(e.args ?? '').trim().toLowerCase()
    const dither = arg === 'on' || arg === '开'
      ? true
      : arg === 'off' || arg === '关'
        ? false
        : !(await read($, ditherAtom))
    await updateIfChanged($, ditherAtom, () => dither)

    const t = T[await langOf($, choice)]

    return { text: dither ? t.ditherOn : t.ditherOff }
  })

  on('session.measure', async ($, e, next) => {
    await safeBookkeeping($, 'session.measure bookkeeping failed', async () => {
      const compactAt = await compactThresholdForWindow($, e.context.window)
      await record($, { ...toSnap(e.context, e.rateLimits, e.cost), ...(compactAt === undefined ? {} : { compactAt }), fable: fableState.value })
    })

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    let passthrough = false
    try {
      passthrough = e.props.hasSurvey || (e.surface !== 'desktop' && e.surface !== 'terminal')
    } catch (error) {
      debugError($, 'AbovePrompt render failed', error)

      return next(e)
    }
    if (passthrough) {
      return next(e)
    }

    try {
      const bars = await read($, barsAtom)
      const lang = await langOf($, choice)
      const now = await clockNow($)
      const pet = petView(await read($, petAtom), lang, seasonal && isHalloween(new Date(now)), await read($, askAtom), now, seasonal)

      if (e.surface === 'desktop') {
        // 桌面端的 Client 在 2.1.286 上一律 10 秒超时（缺 CSP nonce，同见 #99211），所以桌面只用 Svg
        const { Box, Button, Svg } = $.ui.resolve(e)
        const activity = await read($, activityAtom)
        const agents = await read($, agentsAtom)
        // 不设大下限：以前最少 560px，窗口窄时信息栏比可用宽度还宽，按钮就被挤到下一行。
        // 窄了由 bandSvgParts 自己逐级收（去副标题 → 只剩圆环），按钮始终在同一行右侧
        // Clawd 工具图标的空间始终保留，避免姿势变化挪动圆环
        const hasFable = bars.to?.fable !== undefined
        const hasCost = bars.to?.cost !== undefined
        const minimumWidth = hasFable
          ? hasCost ? MIN_BAND_W_WITH_FABLE_AND_COST_AND_ACTIVITY : MIN_BAND_W_WITH_FABLE_AND_ACTIVITY
          : hasCost ? MIN_BAND_W_WITH_COST_AND_ACTIVITY : MIN_BAND_W_WITH_ACTIVITY
        const width = Math.max(minimumWidth, e.props.bodyColumns * PX_PER_COLUMN - 8 - BUTTON_W - BAND_SAFETY_PX)
        const pinned = await read($, pinnedAtom)
        const dither = await read($, ditherAtom)
        const isMini = !pinned
        // 近 7 天用量只在展开时写进 Clawd 的悬停提示：收起时是一条细条，不放
        const week = isMini ? undefined : weekLine(await read($, weekAtom), lang, now)
        const titleLines = [week ? `${pet.title} · ${week}` : pet.title]
        if (agents.count > 0) {
          titleLines.push(T[lang].agentsRunning(agents.count))
          titleLines.push(
            ...agents.rows.map(row => `● ${row.type} · ${truncateAgentDescription(row.description)}`),
          )
          if (agents.count > agents.rows.length) titleLines.push(`+${agents.count - agents.rows.length} …`)
        }
        const shown = agents.count > 0 || week ? { ...pet, title: titleLines.join('\n') } : pet
        const parts = bandSvgParts(
          bars,
          e.props.isWorking,
          width,
          isMini,
          lang,
          shown,
          cacheTimer(await read($, warmAtom), bars, now),
          activity,
          now,
          agents.count,
          dither,
        )
        let gaugesSource = parts.gauges
        if (
          previousGaugeSvg &&
          previousGaugeSvg.gaugesKey === parts.gaugesKey &&
          now >= previousGaugeSvg.createdAt &&
          now - previousGaugeSvg.createdAt < GAUGE_SOURCE_MEMO_MAX_AGE_MS
        ) {
          gaugesSource = previousGaugeSvg.gauges
        } else {
          previousGaugeSvg = { gaugesKey: parts.gaugesKey, gauges: gaugesSource, createdAt: now }
        }
        // 按钮只切换用户选择的展开状态；按的那一刻重新读取，避免用旧的渲染状态
        const toggle = async () => {
          const expanded = !(await read($, pinnedAtom))
          await updateIfChanged($, pinnedAtom, () => expanded)
        }

        return (
          <Box flexDirection="row" alignItems="center" flexWrap="nowrap">
            <Svg
              key="clawd"
              source={parts.clawd}
              alt={pet.title}
              width={parts.cut}
              height={isMini ? H_MINI : H}
              isInteractive
            />
            <Svg
              key="gauges"
              source={gaugesSource}
              alt={bandAlt(bars.to, e.props.isWorking, lang)}
              width={width - parts.cut}
              height={isMini ? H_MINI : H}
              isInteractive
            />
            <Button key="toggle" label={isMini ? ICON_EXPAND : ICON_COLLAPSE} plain onPress={() => void toggle()} />
          </Box>
        )
      }

      const { Box, Text } = $.ui.resolve(e)
      const snap = bars.to
      const t = T[lang]
      // 终端画上下文、额度读数和缓存：标签、右侧注释和百分比，下面一条进度条。
      // 以前用 Client 加载 stats.tsx 做数字滚动，但 Anthropic 插件目录的扫描器认不出它的路径、拦下提交，所以改成直接画
      const meter = (key: string, label: string, percent: number | undefined, note: string) => {
        const p = Math.min(100, Math.max(0, percent ?? 0))

        return (
          <Box key={key} flexDirection="column" flexGrow={1} flexShrink={1} minWidth={18}>
            <Box flexDirection="row" justifyContent="space-between" columnGap={1}>
              <Text wrap="truncate">{label}</Text>
              <Box flexDirection="row" columnGap={1}>
                <Text dimColor wrap="truncate">
                  {note}
                </Text>
                <Text>{percent === undefined ? '—' : `${Math.round(percent)}%`}</Text>
              </Box>
            </Box>
            <Box width="100%" height={1} backgroundColor="#80808033">
              <Box width={`${Math.round(p)}%`} height={1} backgroundColor={termBarColor(p)} />
            </Box>
          </Box>
        )
      }
      const ctxNote = snap?.contextTokens !== undefined ? `${tokensText(snap.contextTokens)} / ${tokensText(snap.contextWindow)}` : ''

      return (
        <Box paddingX={1} flexDirection="row" columnGap={3}>
          {meter('ctx', t.context, snap?.contextPercent, ctxNote)}
          {meter('session', t.session, snap?.session?.percent, termReset(snap?.session?.resetsAt, lang))}
          {meter('weekly', t.weekly, snap?.weekly?.percent, termReset(snap?.weekly?.resetsAt, lang))}
          {snap?.fable ? meter('fable', t.fable, snap.fable.percent, termReset(snap.fable.resetsAt, lang)) : null}
          {snap?.cost ? (
            <Box key="cost" flexDirection="column" flexGrow={1} flexShrink={1} minWidth={18}>
              <Box flexDirection="row" justifyContent="space-between" columnGap={1}>
                <Text wrap="truncate">{t.cost}</Text>
                <Text>{formatCost(snap.cost.usd)}</Text>
              </Box>
              <Text dimColor wrap="truncate">
                {t.thisSession}
              </Text>
            </Box>
          ) : null}
        </Box>
      )
    } catch (error) {
      debugError($, 'AbovePrompt render failed', error)

      return next(e)
    }
  })
}
