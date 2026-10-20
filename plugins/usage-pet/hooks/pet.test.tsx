import { expect, mock, test } from 'claude-code/testing'
import type { PromptSubmitInput, SessionCompactInput } from 'claude-code'

import { mergePetProgress, NEW_PET, levelOf, normalize, onTurn, threshold } from './pet'

const ZH = { options: { language: 'zh' } }
const START = { cwd: '/tmp', surface: 'desktop' as const, isInteractive: true }
const BAND = {
  plugin: 'usage-pet',
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 140, scroll: { offset: 0, bodyRows: 12 }, view: {} },
  viewport: { columns: 140, rows: 40 },
  surface: 'desktop' as const,
}

const at = (y: number, m: number, d: number, h = 14) => new Date(y, m - 1, d, h, 0, 0)

// ───────── 纯函数：等级、经验、连续天数、成就 ─────────

test('等级门槛：0 / 100 / 300 / 600 / 1000 …，正好到门槛就升级', () => {
  expect([0, 99, 100, 299, 300, 999, 1000, 4499, 4500].map(levelOf)).toEqual([1, 1, 2, 2, 3, 4, 5, 9, 10])
  expect(threshold(10)).toBe(4500)
})

test('经验：每轮 +10，命中 ≥90% 再 +5，每天第一轮再 +20', () => {
  const day1 = onTurn(NEW_PET, { now: at(2026, 10, 5), turnRate: 50, maxLimit: 10 }).pet
  expect(day1.xp).toBe(30)
  const again = onTurn(day1, { now: at(2026, 10, 5, 15), turnRate: 95, maxLimit: 10 }).pet
  expect(again.xp).toBe(45)
  expect(again.turns).toBe(2)
})

test('连续天数：隔天 +1，断一天回到 1，同一天不变', () => {
  const d1 = onTurn(NEW_PET, { now: at(2026, 10, 5), maxLimit: 0 }).pet
  const sameDay = onTurn(d1, { now: at(2026, 10, 5, 23), maxLimit: 0 }).pet
  const d2 = onTurn(sameDay, { now: at(2026, 10, 6), maxLimit: 0 }).pet
  const gap = onTurn(d2, { now: at(2026, 10, 8), maxLimit: 0 }).pet
  expect([d1.streak, sameDay.streak, d2.streak, gap.streak]).toEqual([1, 1, 2, 1])
  // 跨月也算连续
  const endOfMonth = onTurn({ ...NEW_PET, streak: 4, lastDay: '2026-10-31' }, { now: at(2026, 11, 1), maxLimit: 0 }).pet
  expect(endOfMonth.streak).toBe(5)
})

test('成就只解锁一次；升级事件带上这一级解锁的装扮', () => {
  const first = onTurn({ ...NEW_PET, xp: 95 }, { now: at(2026, 10, 5, 2), turnRate: 99.2, maxLimit: 96 })
  expect(first.events).toEqual([
    { kind: 'level', level: 2, gear: 'sprout' },
    { kind: 'achievement', id: 'cache-99' },
    { kind: 'achievement', id: 'night-owl' },
    { kind: 'achievement', id: 'close-call' },
  ])
  const second = onTurn(first.pet, { now: at(2026, 10, 5, 3), turnRate: 99.5, maxLimit: 97 })
  expect(second.events).toEqual([])
})

test('一轮跨过好几级：每一级都报（Lv4 没有装扮）', () => {
  const { events } = onTurn({ ...NEW_PET, xp: 990, lastDay: '2026-10-05' }, { now: at(2026, 10, 5), maxLimit: 0 })
  expect(events).toEqual([{ kind: 'level', level: 5, gear: 'cap' }])
  const jump = onTurn({ ...NEW_PET, xp: 280 }, { now: at(2026, 10, 5), maxLimit: 0 })
  expect(jump.events.filter(e => e.kind === 'level')).toEqual([{ kind: 'level', level: 3, gear: 'bowtie' }])
})

test('store 里读出来的脏数据补齐成完整的 Pet', () => {
  expect(normalize(undefined)).toEqual(NEW_PET)
  expect(normalize({ xp: -5, turns: 'x', streak: 3, achievements: ['a', 1] })).toEqual({ xp: 0, turns: 0, streak: 3, lastDay: undefined, achievements: ['a'] })
})

test('跨会话合并养成：经验和回合取较大值，成就合并并保留较新的日期', () => {
  expect(
    mergePetProgress(
      { xp: 130, turns: 12, streak: 3, lastDay: '2026-10-14', achievements: ['cache-99'] },
      { xp: 125, turns: 13, streak: 4, lastDay: '2026-10-15', achievements: ['close-call'] },
    ),
  ).toEqual({ xp: 130, turns: 13, streak: 4, lastDay: '2026-10-15', achievements: ['cache-99', 'close-call'] })
})

// ───────── 接进插件：store、等级、信息栏、战报 ─────────

type Harness = Parameters<Parameters<typeof test>[1]>
// 测试里的「核心」应答都要在第一次调用 $ 之前注册：beneath 传进来
async function start(
  $: Harness[0],
  on: Harness[1],
  stored: Record<string, unknown>,
  beneath?: (on: Harness[1]) => void,
  capturePrompt?: (event: PromptSubmitInput) => void,
  dropPrompt = false,
) {
  mock.store(on, stored)
  const clock = mock.clock(on)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('prompt.submit', ($, e) => {
    capturePrompt?.(e)

    return dropPrompt ? { drop: 'discarded by test stand-in' } : { text: e.text, origin: e.origin }
  })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('turn.complete', ($, e) => ({ text: '', usage: e.usage }))
  const toasts: string[] = []
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  beneath?.(on)
  const sessionResult = await $.session.start(START as never)

  return { toasts, clock, sessionResult }
}

const turn = (read: number, write: number, fresh: number) => ({
  answer: 'ok',
  durationMs: 1000,
  isAborted: false,
  turnId: `t${read}`,
  reason: 'answer' as const,
  usage: { model: 'claude-opus-5-5', input_tokens: fresh, output_tokens: 40, cache_read_input_tokens: read, cache_creation_input_tokens: write },
})

test('快速切换三个工具姿势：立即写第一个，只写停留结束时的最后一个', ZH, async ($, on) => {
  const activityWrites: { kind: string; icon?: string }[] = []
  let releaseTools!: () => void
  let markBashStarted!: () => void
  let markReadStarted!: () => void
  let markEditStarted!: () => void
  const toolGate = new Promise<void>(resolve => (releaseTools = resolve))
  const bashStarted = new Promise<void>(resolve => (markBashStarted = resolve))
  const readStarted = new Promise<void>(resolve => (markReadStarted = resolve))
  const editStarted = new Promise<void>(resolve => (markEditStarted = resolve))
  const { clock } = await start($, on, {}, on => {
    on('state.set', ($, e, next) => {
      if (e.key === 'activity') activityWrites.push(e.value as (typeof activityWrites)[number])

      return next(e)
    })
    on('tool.call', async ($, e) => {
      if (e.tool === 'Bash') markBashStarted()
      if (e.tool === 'Read') markReadStarted()
      if (e.tool === 'Edit') markEditStarted()
      await toolGate

      return { result: {} as never }
    })
  })
  activityWrites.length = 0
  await clock.advance(600)

  const bash = $.tool.call({ tool: 'Bash', agentId: 'sub-1' } as never)
  await bashStarted
  const read = $.tool.call({ tool: 'Read', agentId: 'sub-1' } as never)
  await readStarted
  const edit = $.tool.call({ tool: 'Edit', agentId: 'sub-1' } as never)
  await editStarted
  expect(activityWrites).toEqual([{ kind: 'working', icon: 'terminal' }])

  await clock.advance(599)
  expect(activityWrites).toEqual([{ kind: 'working', icon: 'terminal' }])
  await clock.advance(1)
  expect(activityWrites).toEqual([
    { kind: 'working', icon: 'terminal' },
    { kind: 'working', icon: 'pencil' },
  ])

  releaseTools()
  await Promise.all([bash, read, edit])
  expect(activityWrites).toEqual([
    { kind: 'working', icon: 'terminal' },
    { kind: 'working', icon: 'pencil' },
  ])
})

test('姿势停留期结束后孤立的变化立即写入', ZH, async ($, on) => {
  const activityWrites: { kind: string; icon?: string }[] = []
  const { clock } = await start($, on, {}, on => {
    on('state.set', ($, e, next) => {
      if (e.key === 'activity') activityWrites.push(e.value as (typeof activityWrites)[number])

      return next(e)
    })
    on('tool.call', () => ({ result: {} as never }))
  })
  activityWrites.length = 0
  await clock.advance(600)

  await $.tool.call({ tool: 'Bash', agentId: 'sub-1' } as never)
  expect(activityWrites).toEqual([{ kind: 'working', icon: 'terminal' }])
})

// 关掉节日装扮：万圣节期间头顶是巫师帽，看不到小芽
test('通知：会话开始、升级和解锁成就都不弹提示，等级和成就仍出现在信息栏和战报卡', { options: { language: 'zh', seasonal: 'off' } }, async ($, on) => {
  const { toasts } = await start($, on, { pet: { xp: 95, turns: 9, streak: 1, lastDay: '2000-01-01', achievements: [] } }, on =>
    on('session.surfaces', () => ({ value: ['desktop'] })),
  )
  expect(toasts).toEqual([])

  await $.turn.complete(turn(9900, 0, 100))
  expect(toasts).toEqual([])

  await $.command.run({ command: 'clawd', args: '' } as never)
  const band = await $.ui.mount(BAND)
  const bandSvg = String((await band.findAll({ type: 'Svg' }))[0].props?.source)
  expect(bandSvg).toContain('<title>Clawd Lv.2 · 经验 130 / 300')

  const card = await $.ui.mount({ plugin: 'usage-pet', component: 'Pane', requestId: 'clawd-card', props: {}, viewport: { columns: 100, rows: 40 }, surface: 'desktop' } as never)
  const cardSvg = String((await card.findAll({ type: 'Svg' }))[0].props?.source)
  expect(cardSvg).toContain('class="chip">缓存大师</text>')
  expect(toasts).toEqual([])
})

test('子代理的回合不涨经验', ZH, async ($, on) => {
  await start($, on, { pet: { xp: 95, turns: 0, streak: 0, achievements: [] } })
  await $.turn.complete({ ...turn(50, 0, 50), agentId: 'sub-1' })
  await $.command.run({ command: 'clawd', args: '' } as never)
  const ui = await $.ui.mount(BAND)
  expect(String((await ui.findAll({ type: 'Svg' }))[0].props?.source)).toContain('<title>Clawd Lv.1 · 经验 95 / 100')
})

test('agent.spawn 和子代理工具调用刷新徽标，回合结束后移除并列出已转义的悬停行', ZH, async ($, on) => {
  let listed: { id: string; type: string; description: string; status: string }[] = []
  const spawnResult = { model: 'claude-sonnet-4', agentId: 'sub-1' }
  const description = `read <root> & "config" ${'x'.repeat(50)}`
  const { clock } = await start($, on, {}, on => {
    on('agent.list', () => ({ value: listed }))
    on('agent.spawn', () => spawnResult)
    on('tool.call', () => ({ result: {} as never }))
  })
  await clock.advance(0)

  listed = [{ id: 'sub-1', type: 'Explore <fast>', description, status: 'running' }]
  expect(await $.agent.spawn({ prompt: 'Inspect the project' } as never)).toEqual(spawnResult)
  await $.tool.call({ tool: 'Read', agentId: 'sub-1' } as never)
  await clock.advance(1000)

  await $.command.run({ command: 'clawd', args: '' } as never)
  const shown = await $.ui.mount(BAND)
  const shownSource = String((await shown.findAll({ type: 'Svg' }))[0].props?.source)
  expect(shownSource).toContain('class="agent-count"')
  expect(shownSource).toContain('子代理：1 个运行中')
  const expectedRow = `● Explore &lt;fast&gt; · read &lt;root&gt; &amp; &quot;config&quot; ${'x'.repeat(24)}…`
  expect(shownSource).toContain(expectedRow)

  listed = [{ id: 'sub-1', type: 'Explore <fast>', description, status: 'completed' }]
  await $.turn.complete({ ...turn(0, 0, 0), agentId: 'sub-1' } as never)
  await clock.advance(1000)
  const hidden = await $.ui.mount(BAND)
  const hiddenSource = String((await hidden.findAll({ type: 'Svg' }))[0].props?.source)
  expect(hiddenSource).not.toContain('class="agent-count"')
  expect(hiddenSource).not.toContain('子代理：1 个运行中')
})

test('agent.list 失败时保留空状态且不影响会话启动', ZH, async ($, on) => {
  const { clock } = await start($, on, {}, on => {
    on('agent.list', () => {
      throw new Error('agent list unavailable')
    })
  })
  await clock.advance(0)

  const ui = await $.ui.mount(BAND)
  const source = String((await ui.findAll({ type: 'Svg' }))[0].props?.source)
  expect(source).not.toContain('class="agent-count"')
  expect(source).not.toContain('Subagents:')
})

test('快速子代理工具调用每秒最多刷新两次且只写入变化后的徽标状态', ZH, async ($, on) => {
  const listed = [{ id: 'sub-1', type: 'Explore', description: 'inspect files', status: 'running' }]
  const agentWrites: unknown[] = []
  let listCalls = 0
  const { clock } = await start($, on, {}, on => {
    on('agent.list', () => {
      listCalls++
      return { value: listed }
    })
    on('state.set', ($, e, next) => {
      if (e.key === 'agents') agentWrites.push(e.value)

      return next(e)
    })
    on('tool.call', () => ({ result: {} as never }))
  })
  await clock.advance(0)
  const callsAtStart = listCalls
  agentWrites.length = 0

  for (let index = 0; index < 10; index++) {
    await $.tool.call({ tool: 'Read', file_path: `/tmp/${index}`, agentId: 'sub-1' } as never)
  }
  await clock.advance(1000)

  expect(listCalls - callsAtStart).toBeLessThanOrEqual(2)
  expect(agentWrites.length).toBeLessThanOrEqual(2)
})

test('子代理回合：七天显示的圆整数不变时不写周用量 atom', ZH, async ($, on) => {
  const weekWrites: unknown[] = []
  const { clock } = await start($, on, {}, on => {
    on('session.id', () => ({ value: 'week-rounding' }))
    on('state.set', ($, e, next) => {
      if (e.key === 'week') weekWrites.push(e.value)

      return next(e)
    })
  })

  await $.turn.complete({ ...turn(0, 0, 8_410_000), agentId: 'sub-1' })
  expect(weekWrites.length).toBe(1)
  await $.turn.complete({ ...turn(0, 0, 100), agentId: 'sub-2' })
  expect(weekWrites.length).toBe(1)
  await $.turn.complete({ ...turn(0, 0, 100_000), agentId: 'sub-3' })
  expect(weekWrites.length).toBe(2)
})

test('主提示被后续钩子丢弃后：十分钟后仍进入睡眠', ZH, async ($, on) => {
  const { clock } = await start($, on, {}, undefined, undefined, true)
  await $.command.run({ command: 'clawd', args: '' } as never)
  expect(await $.prompt.submit({ text: 'discard this', asUser: true } as never)).toEqual({ drop: 'discarded by test stand-in' })

  await clock.advance(600_000)
  const ui = await $.ui.mount(BAND)
  expect(String((await ui.findAll({ type: 'Svg' }))[0].props?.source)).toMatch(/class="clawd[^\"]* sleep"/)
})

test('会话启动记账失败：仍只调用后续一次并原样透传结果', ZH, async ($, on) => {
  mock.store(on, {})
  mock.clock(on)
  on('session.usage', () => {
    throw new Error('usage stand-in failed')
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  let nextCalls = 0
  on('session.start', ($, e) => {
    nextCalls++

    return { cwd: e.cwd }
  })

  const result = await $.session.start(START as never)
  expect(result).toEqual({ cwd: START.cwd })
  expect(nextCalls).toBe(1)
})

test('观察钩子：atom 读写失败时仍原样透传提示、权限、工具、压缩和回合结果', ZH, async ($, on) => {
  const permissionResult = { additionalContext: ['permission unchanged'] }
  const toolResult = { result: { marker: 'tool unchanged' } as never }
  const compactResult = { messages: [{ role: 'user', text: 'summary', toolUses: [] }], tokensBefore: 100, tokensAfter: 50 }
  const { sessionResult } = await start($, on, {}, on => {
    on('state.get', () => {
      throw new Error('state read failed')
    })
    on('state.set', () => {
      throw new Error('state write failed')
    })
    on('classic.PermissionRequest', () => ({ value: permissionResult }))
    on('tool.call', () => toolResult)
    on('session.compact', () => compactResult as never)
  })
  expect(sessionResult).toEqual({ cwd: START.cwd })

  const prompt = await $.prompt.submit({ text: 'continue', asUser: true } as never)
  expect(prompt).toMatchObject({ text: 'continue' })
  expect(await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'true' } } as never)).toEqual({ value: permissionResult })
  expect(await $.tool.call({ tool: 'Bash', command: 'true' } as never)).toEqual(toolResult)
  expect(await $.session.compact({
    trigger: 'plugin',
    instructions: 'keep this summary',
    messages: [{ role: 'user', text: 'hello', toolUses: [] }],
  } as never)).toEqual(compactResult)
  const turnInput = turn(1, 0, 1)
  const turnResult = await $.turn.complete(turnInput)
  expect(turnResult).toEqual({ text: '', usage: turnInput.usage })
})

test('并行会话升级：写入前重读并合并另一会话刚写入的进度', ZH, async ($, on) => {
  const before = { xp: 95, turns: 9, streak: 1, lastDay: '2000-01-01', achievements: [] }
  const concurrent = { xp: 200, turns: 50, streak: 6, lastDay: '2999-01-01', achievements: ['close-call'] }
  const data = new Map<string, unknown>([['pet', before]])
  let petReads = 0
  let writtenPet: unknown
  mock.clock(on)
  on('store.get', ($, e) => {
    if (e.key === 'pet') {
      petReads++

      return { value: petReads >= 3 ? concurrent : before }
    }

    return { value: data.get(e.key) }
  })
  on('store.set', ($, e) => {
    data.set(e.key, e.value)
    if (e.key === 'pet') writtenPet = e.value

    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...data.keys()] }))
  on('session.authorize', () => ({ value: null }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('turn.complete', ($, e) => ({ text: '', usage: e.usage }))
  await $.session.start(START as never)
  await $.turn.complete(turn(9900, 0, 100))

  const saved = writtenPet as { xp: number; turns: number; streak: number; lastDay?: string; achievements: string[] }
  expect(saved.xp).toBe(200)
  expect(saved.turns).toBe(50)
  expect(saved.streak).toBe(6)
  expect(saved.lastDay).toBe('2999-01-01')
  expect(saved.achievements.includes('cache-99')).toBe(true)
  expect(saved.achievements.includes('close-call')).toBe(true)
})

test('工具调用期间显示工具图标，完成后恢复工作字形并透传工具结果', ZH, async ($, on) => {
  let release!: () => void
  let markStarted!: () => void
  const gate = new Promise<void>(resolve => (release = resolve))
  const started = new Promise<void>(resolve => (markStarted = resolve))
  const { clock } = await start($, on, {}, on => {
    on('tool.call', async () => {
      markStarted()
      await gate
      return { result: { marker: 'unchanged' } as never }
    })
  })
  await $.command.run({ command: 'clawd', args: '' } as never)
  await clock.advance(600)

  const pending = $.tool.call({ tool: 'Bash', command: 'pwd' } as never)
  await started
  const workingBand = { ...BAND, props: { ...BAND.props, isWorking: true, bodyColumns: 20 } }
  const during = await $.ui.mount(workingBand as never)
  const duringSvgs = await during.findAll({ type: 'Svg' })
  const duringSvgNode = duringSvgs[0]
  const duringSvg = String(duringSvgNode.props?.source)

  expect(duringSvg).toContain('class="activity-icon terminal"')
  expect(duringSvg).toContain('<g class="laptop">')
  expect((duringSvgs[0].props?.width as number) + (duringSvgs[1].props?.width as number)).toBe(398)

  release()
  expect(await pending).toEqual({ result: { marker: 'unchanged' } })

  await clock.advance(600)
  const after = await $.ui.mount(workingBand as never)
  const afterSvg = String((await after.findAll({ type: 'Svg' }))[0].props?.source)
  expect(afterSvg).not.toContain('class="activity-icon terminal"')
  expect(afterSvg).toContain('class="glyph"')
})

test('并行工具调用：较早调用结束时保留最新图标，全部结束后不残留旧图标', ZH, async ($, on) => {
  let releaseBash!: () => void
  let releaseRead!: () => void
  let markBashStarted!: () => void
  let markReadStarted!: () => void
  const bashGate = new Promise<void>(resolve => (releaseBash = resolve))
  const readGate = new Promise<void>(resolve => (releaseRead = resolve))
  const bashStarted = new Promise<void>(resolve => (markBashStarted = resolve))
  const readStarted = new Promise<void>(resolve => (markReadStarted = resolve))
  const { clock } = await start($, on, {}, on => {
    on('tool.call', async ($, e) => {
      if (e.tool === 'Bash') {
        markBashStarted()
        await bashGate
      } else {
        markReadStarted()
        await readGate
      }
      return { result: {} as never }
    })
  })
  await $.command.run({ command: 'clawd', args: '' } as never)
  await clock.advance(600)

  const bash = $.tool.call({ tool: 'Bash', command: 'pwd' } as never)
  await bashStarted
  const read = $.tool.call({ tool: 'Read', file_path: '/tmp/a' } as never)
  await readStarted
  await clock.advance(600)
  const workingBand = { ...BAND, props: { ...BAND.props, isWorking: true } }
  const newest = await $.ui.mount(workingBand as never)
  expect(String((await newest.findAll({ type: 'Svg' }))[0].props?.source)).toContain('class="activity-icon magnifier"')

  releaseBash()
  await bash
  const afterOlder = await $.ui.mount(workingBand as never)
  expect(String((await afterOlder.findAll({ type: 'Svg' }))[0].props?.source)).toContain('class="activity-icon magnifier"')

  releaseRead()
  await read
  const beforeRestore = await $.ui.mount(workingBand as never)
  expect(String((await beforeRestore.findAll({ type: 'Svg' }))[0].props?.source)).toContain('class="activity-icon magnifier"')

  await clock.advance(600)
  const afterAll = await $.ui.mount(workingBand as never)
  const afterAllSvg = String((await afterAll.findAll({ type: 'Svg' }))[0].props?.source)
  expect(afterAllSvg).not.toContain('class="activity-icon magnifier"')
  expect(afterAllSvg).not.toContain('class="activity-icon terminal"')
})

test('子代理工具突发：十个同图标含重叠与快速连续调用只写一次工作态和一次延迟恢复', ZH, async ($, on) => {
  const activityWrites: { value: { kind: string; icon?: string; owner?: number; previous?: unknown }; previous: unknown }[] = []
  let releasePair!: () => void
  let markPairStarted!: () => void
  let started = 0
  const pairGate = new Promise<void>(resolve => (releasePair = resolve))
  const pairStarted = new Promise<void>(resolve => (markPairStarted = resolve))
  const { clock } = await start($, on, {}, on => {
    on('state.set', ($, e, next) => {
      if (e.key === 'activity') activityWrites.push({ value: e.value as (typeof activityWrites)[number]['value'], previous: e.previous })

      return next(e)
    })
    on('tool.call', async () => {
      started++
      if (started <= 2) {
        if (started === 2) markPairStarted()
        await pairGate
      }

      return { result: {} as never }
    })
  })
  activityWrites.length = 0
  await clock.advance(600)

  const overlapping = [0, 1].map(i => $.tool.call({ tool: 'Bash', command: `printf ${i}`, agentId: 'sub-1' } as never))
  await pairStarted
  expect(activityWrites.length).toBe(1)
  expect(activityWrites[0]?.value.kind).toBe('working')
  expect(activityWrites[0]?.value.icon).toBe('terminal')
  expect(activityWrites[0]?.value.owner).toBe(undefined)
  expect(activityWrites[0]?.value.previous).toBe(undefined)

  releasePair()
  await Promise.all(overlapping)
  for (let i = 2; i < 10; i++) {
    await $.tool.call({ tool: 'Bash', command: `printf ${i}`, agentId: 'sub-1' } as never)
  }
  expect(activityWrites.length).toBe(1)

  await clock.advance(600)
  expect(activityWrites.length).toBe(2)
  expect(activityWrites[1]?.value.kind).toBe('idle')
  expect(activityWrites.every(write => JSON.stringify(write.value) !== JSON.stringify(write.previous))).toBe(true)
})

test('子代理工具突发：快速切换只写最后图标，结束后统一恢复', ZH, async ($, on) => {
  const activityWrites: { value: { kind: string; icon?: string }; previous: unknown }[] = []
  let releaseFinalRead!: () => void
  let markFinalReadStarted!: () => void
  const finalReadGate = new Promise<void>(resolve => (releaseFinalRead = resolve))
  const finalReadStarted = new Promise<void>(resolve => (markFinalReadStarted = resolve))
  const { clock } = await start($, on, {}, on => {
    on('state.set', ($, e, next) => {
      if (e.key === 'activity') activityWrites.push({ value: e.value as (typeof activityWrites)[number]['value'], previous: e.previous })

      return next(e)
    })
    on('tool.call', async ($, e) => {
      if (e.tool === 'Read' && (e as unknown as { file_path?: string }).file_path === '/tmp/final') {
        markFinalReadStarted()
        await finalReadGate
      }

      return { result: {} as never }
    })
  })
  activityWrites.length = 0
  await clock.advance(600)

  for (const tool of ['Bash', 'Read', 'Bash', 'Bash']) {
    await $.tool.call({ tool, agentId: 'sub-1' } as never)
  }
  const finalRead = $.tool.call({ tool: 'Read', file_path: '/tmp/final', agentId: 'sub-1' } as never)
  await finalReadStarted

  await clock.advance(600)
  expect(activityWrites.map(write => write.value.icon)).toEqual(['terminal', 'magnifier'])
  expect(activityWrites.every(write => write.value.kind === 'working')).toBe(true)

  releaseFinalRead()
  await finalRead
  await clock.advance(600)
  expect(activityWrites.length).toBe(3)
  expect(activityWrites[2]?.value.kind).toBe('idle')
  expect(activityWrites.every(write => JSON.stringify(write.value) !== JSON.stringify(write.previous))).toBe(true)
})

test('权限请求：许可工具完成后立即清除感叹号，后续工具图标正常显示', ZH, async ($, on) => {
  let release!: () => void
  let markStarted!: () => void
  const gate = new Promise<void>(resolve => (release = resolve))
  const started = new Promise<void>(resolve => (markStarted = resolve))
  const permissionResult = { additionalContext: ['permission result unchanged'] }
  const { clock } = await start($, on, {}, on => {
    on('tool.call', async ($, e) => {
      if (e.tool === 'Bash') {
        markStarted()
        await gate
      }
      return { result: { tool: e.tool } as never }
    })
    on('classic.PermissionRequest', () => ({ value: permissionResult }))
  })

  await $.command.run({ command: 'clawd', args: '' } as never)
  expect(await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'sleep 1' } } as never)).toEqual({ value: permissionResult })
  await clock.advance(600)

  const waiting = await $.ui.mount(BAND)
  const waitingSvg = String((await waiting.findAll({ type: 'Svg' }))[0].props?.source)
  expect(waitingSvg).toContain('class="activity-icon bang"')
  expect(waitingSvg).not.toContain('class="activity-icon terminal"')

  const bash = $.tool.call({ tool: 'Bash', command: 'sleep 1' } as never)
  await started
  await clock.advance(600)
  release()
  await bash
  const afterBash = await $.ui.mount(BAND)
  const afterBashSvg = String((await afterBash.findAll({ type: 'Svg' }))[0].props?.source)
  expect(afterBashSvg).not.toContain('class="activity-icon bang"')
  expect(afterBashSvg).toContain('class="activity-icon terminal"')

  await clock.advance(600)
  const afterRestore = await $.ui.mount(BAND)
  expect(String((await afterRestore.findAll({ type: 'Svg' }))[0].props?.source)).not.toContain('class="activity-icon bang"')

  await clock.advance(600)
  await $.tool.call({ tool: 'Read', file_path: '/tmp/a' } as never)
  const afterRead = await $.ui.mount(BAND)
  const afterReadSvg = String((await afterRead.findAll({ type: 'Svg' }))[0].props?.source)
  expect(afterReadSvg).not.toContain('class="activity-icon bang"')
  expect(afterReadSvg).toContain('class="activity-icon magnifier"')
})

test('权限请求：工具调用被拒绝时也清除它引起的感叹号', ZH, async ($, on) => {
  const permissionResult = { additionalContext: ['permission denied unchanged'] }
  let release!: () => void
  let markStarted!: () => void
  const gate = new Promise<void>(resolve => (release = resolve))
  const started = new Promise<void>(resolve => (markStarted = resolve))
  const { clock } = await start($, on, {}, on => {
    on('classic.PermissionRequest', () => ({ value: permissionResult }))
    on('tool.call', async ($, e) => {
      if (e.tool === 'Bash') {
        markStarted()
        await gate

        return { deny: 'denied by test stand-in' }
      }

      return { result: {} as never }
    })
  })

  await $.command.run({ command: 'clawd', args: '' } as never)
  const bash = $.tool.call({ tool: 'Bash', command: 'pwd' } as never)
  await started
  expect(await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'pwd' } } as never)).toEqual({ value: permissionResult })
  await clock.advance(600)
  const waiting = await $.ui.mount(BAND)
  expect(String((await waiting.findAll({ type: 'Svg' }))[0].props?.source)).toContain('class="activity-icon bang"')
  release()
  expect(await bash).toEqual({ deny: 'denied by test stand-in' })
  await clock.advance(600)
  const ui = await $.ui.mount(BAND)
  expect(String((await ui.findAll({ type: 'Svg' }))[0].props?.source)).not.toContain('class="activity-icon bang"')
})

test('问题和计划：工具调用显示问号或感叹号，调用结束时清除', ZH, async ($, on) => {
  let releaseQuestion!: () => void
  let releasePlan!: () => void
  let markQuestionStarted!: () => void
  let markPlanStarted!: () => void
  const questionGate = new Promise<void>(resolve => (releaseQuestion = resolve))
  const planGate = new Promise<void>(resolve => (releasePlan = resolve))
  const questionStarted = new Promise<void>(resolve => (markQuestionStarted = resolve))
  const planStarted = new Promise<void>(resolve => (markPlanStarted = resolve))
  const { clock } = await start($, on, {}, on =>
    on('tool.call', async ($, e) => {
      if (e.tool === 'AskUserQuestion') {
        markQuestionStarted()
        await questionGate
      }
      if (e.tool === 'ExitPlanMode') {
        markPlanStarted()
        await planGate
      }

      return { result: { tool: e.tool } as never }
    }),
  )
  await $.command.run({ command: 'clawd', args: '' } as never)
  await clock.advance(600)

  const question = $.tool.call({ tool: 'AskUserQuestion', questions: [] } as never)
  await questionStarted
  let ui = await $.ui.mount(BAND)
  let src = String((await ui.findAll({ type: 'Svg' }))[0].props?.source)
  expect(src).toContain('class="activity-icon question"')
  releaseQuestion()
  await question
  await clock.advance(600)
  ui = await $.ui.mount(BAND)
  src = String((await ui.findAll({ type: 'Svg' }))[0].props?.source)
  expect(src).not.toContain('class="activity-icon question"')

  await $.prompt.submit({ text: 'please continue', asUser: true } as never)
  ui = await $.ui.mount(BAND)
  src = String((await ui.findAll({ type: 'Svg' }))[0].props?.source)
  expect(src).not.toContain('class="activity-icon question"')

  await clock.advance(600)
  const plan = $.tool.call({ tool: 'ExitPlanMode', plan: 'ready' } as never)
  await planStarted
  ui = await $.ui.mount(BAND)
  src = String((await ui.findAll({ type: 'Svg' }))[0].props?.source)
  expect(src).toContain('class="activity-icon bang"')
  releasePlan()
  await plan
  await clock.advance(600)
  ui = await $.ui.mount(BAND)
  src = String((await ui.findAll({ type: 'Svg' }))[0].props?.source)
  expect(src).not.toContain('class="activity-icon bang"')

  await $.turn.complete(turn(0, 0, 0))
  await clock.advance(600)
  ui = await $.ui.mount(BAND)
  src = String((await ui.findAll({ type: 'Svg' }))[0].props?.source)
  expect(src).not.toContain('class="activity-icon bang"')
  expect(src).toContain('class="clawd done')
})

test('上下文预计算：压缩事件原样透传，不唤醒睡眠状态', ZH, async ($, on) => {
  const compactResult = { messages: [{ role: 'user', text: 'summary', toolUses: [] }], tokensBefore: 100, tokensAfter: 50 }
  const { clock } = await start($, on, {}, on => on('session.compact', () => compactResult as never))
  await $.command.run({ command: 'clawd', args: '' } as never)
  await clock.advance(600_000)

  const compact = await $.session.compact({
    trigger: 'precompute',
    instructions: 'keep this summary',
    messages: [{ role: 'user', text: 'hello', toolUses: [] }],
  } as never)
  expect(compact).toEqual(compactResult)

  const ui = await $.ui.mount(BAND)
  expect(String((await ui.findAll({ type: 'Svg' }))[0].props?.source)).toMatch(/class="clawd[^\"]* sleep"/)
})

test('主回合完成：完成姿势停留六秒，中断和子代理不显示完成状态', ZH, async ($, on) => {
  const { clock } = await start($, on, {})
  await $.command.run({ command: 'clawd', args: '' } as never)
  const ui = await $.ui.mount(BAND)

  await clock.advance(600)
  await $.turn.complete(turn(0, 0, 0))
  await ui.redraw()
  expect(String((await ui.findAll({ type: 'Svg' }))[0].props?.source)).toContain('class="clawd done')
  await clock.advance(6000)
  await ui.redraw()
  expect(String((await ui.findAll({ type: 'Svg' }))[0].props?.source)).not.toMatch(/class="clawd[^\"]* done"/)

  await $.turn.complete({ ...turn(0, 0, 0), isAborted: true, reason: 'aborted' } as never)
  await $.turn.complete({ ...turn(0, 0, 0), agentId: 'sub-1' } as never)
  await ui.redraw()
  expect(String((await ui.findAll({ type: 'Svg' }))[0].props?.source)).not.toContain('class="clawd done')
})

test('十分钟没有活动后进入睡眠，提示提交会唤醒 Clawd', ZH, async ($, on) => {
  const { clock } = await start($, on, {}, on => on('tool.call', () => ({ result: {} as never })))
  await $.command.run({ command: 'clawd', args: '' } as never)
  const ui = await $.ui.mount(BAND)

  await clock.advance(599_999)
  await ui.redraw()
  expect(String((await ui.findAll({ type: 'Svg' }))[0].props?.source)).not.toMatch(/class="clawd[^\"]* sleep"/)
  await clock.advance(1)
  await ui.redraw()
  const asleep = String((await ui.findAll({ type: 'Svg' }))[0].props?.source)
  expect(asleep).toMatch(/class="clawd[^\"]* sleep"/)
  expect(asleep).toContain('class="sleep-eyes"')
  expect(asleep).toContain('class="sleep-z"')

  await clock.advance(600)
  await $.tool.call({ tool: 'Read', file_path: '/tmp/a' } as never)
  await ui.redraw()
  expect(String((await ui.findAll({ type: 'Svg' }))[0].props?.source)).not.toMatch(/class="clawd[^\"]* sleep"/)
  await clock.advance(600_000)
  await ui.redraw()
  expect(String((await ui.findAll({ type: 'Svg' }))[0].props?.source)).toMatch(/class="clawd[^\"]* sleep"/)

  await $.prompt.submit({ text: 'wake up', asUser: true } as never)
  await clock.advance(600)
  await ui.redraw()
  expect(String((await ui.findAll({ type: 'Svg' }))[0].props?.source)).not.toMatch(/class="clawd[^\"]* sleep"/)
})

test('上下文压缩：期间显示压扁姿势，结束后恢复并透传压缩结果', ZH, async ($, on) => {
  let release!: () => void
  let markStarted!: () => void
  const gate = new Promise<void>(resolve => (release = resolve))
  const started = new Promise<void>(resolve => (markStarted = resolve))
  const compactResult = { messages: [{ role: 'user', text: 'summary', toolUses: [] }], tokensBefore: 120, tokensAfter: 60 }
  const { clock } = await start($, on, {}, on => {
    on('session.compact', async () => {
      markStarted()
      await gate
      return compactResult as never
    })
  })
  await $.command.run({ command: 'clawd', args: '' } as never)
  await clock.advance(600)

  const compactInput: SessionCompactInput = {
    trigger: 'plugin',
    instructions: 'keep this summary',
    messages: [{ role: 'user', text: 'hello', toolUses: [] }] as never,
  }
  const compact = $.session.compact(compactInput as never)
  await started
  const during = await $.ui.mount(BAND)
  const duringSvg = String((await during.findAll({ type: 'Svg' }))[0].props?.source)
  expect(duringSvg).toContain('class="clawd compacting')
  expect(duringSvg).toContain('.compacting .hop{transform:scale')

  release()
  expect(await compact).toEqual(compactResult)
  await clock.advance(600)
  const after = await $.ui.mount(BAND)
  expect(String((await after.findAll({ type: 'Svg' }))[0].props?.source)).not.toContain('class="clawd compacting')
})

test('测试工具结果：通过和失败显示六秒反应，安装命令不误报为测试', ZH, async ($, on) => {
  let testRuns = 0
  const pass = { stdout: '4 passed', stderr: '', exitCode: 0 }
  const install = { stdout: 'added 1 package', stderr: '', exitCode: 0 }
  const fail = { stdout: '2 failed', stderr: 'assertion failed', exitCode: 1 }
  const { clock } = await start($, on, {}, on => {
    on('tool.call', ($, e) => {
      if (e.tool !== 'Bash') return { result: {} as never }
      if (e.command === 'npm install vitest') return { result: install as never }
      if (e.command === 'npm test') return { result: (testRuns++ === 0 ? pass : fail) as never }

      return { result: {} as never }
    })
  })
  await $.command.run({ command: 'clawd', args: '' } as never)
  await clock.advance(600)
  const ui = await $.ui.mount(BAND)

  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  await clock.advance(599)
  await ui.redraw()
  let src = String((await ui.findAll({ type: 'Svg' }))[0].props?.source)
  expect(src).not.toMatch(/class="clawd[^\"]*\breaction\b/)
  await clock.advance(1)
  await ui.redraw()
  src = String((await ui.findAll({ type: 'Svg' }))[0].props?.source)
  expect(src).toMatch(/class="clawd[^\"]*\breaction test-pass\b/)
  expect(src).toContain('class="activity-icon check"')
  expect(src).toContain('class="reaction-confetti"')

  await clock.advance(5399)
  await ui.redraw()
  src = String((await ui.findAll({ type: 'Svg' }))[0].props?.source)
  expect(src).toMatch(/class="clawd[^\"]*\breaction test-pass\b/)
  await clock.advance(1)
  await ui.redraw()
  expect(String((await ui.findAll({ type: 'Svg' }))[0].props?.source)).not.toMatch(/class="clawd[^\"]*\breaction\b/)
  await $.tool.call({ tool: 'Bash', command: 'npm install vitest' } as never)
  await ui.redraw()
  src = String((await ui.findAll({ type: 'Svg' }))[0].props?.source)
  expect(src).not.toMatch(/class="clawd[^\"]*\breaction\b/)

  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  await clock.advance(600)
  await ui.redraw()
  src = String((await ui.findAll({ type: 'Svg' }))[0].props?.source)
  expect(src).toMatch(/class="clawd[^\"]*\breaction test-fail\b/)
  expect(src).toContain('class="activity-icon cross"')
  expect(src).toContain('class="sweat"')
  await clock.advance(6000)
  await ui.redraw()
  expect(String((await ui.findAll({ type: 'Svg' }))[0].props?.source)).not.toMatch(/class="clawd[^\"]*\breaction\b/)
})

test('失误反应：工具错误显示叉叉，拒绝与子代理调用不显示失误', ZH, async ($, on) => {
  const { clock } = await start($, on, {}, on => {
    on('tool.call', ($, e) =>
      e.tool === 'Read' ? { result: 'read failed' as never, isError: true } : { deny: 'blocked' },
    )
  })
  await $.command.run({ command: 'clawd', args: '' } as never)
  const ui = await $.ui.mount(BAND)

  await $.tool.call({ tool: 'Read', file_path: '/tmp/missing' } as never)
  await clock.advance(600)
  await ui.redraw()
  let src = String((await ui.findAll({ type: 'Svg' }))[0].props?.source)
  expect(src).toMatch(/class="clawd[^\"]*\breaction oops\b/)
  expect(src).toContain('class="activity-icon cross"')
  expect(src).toContain('.oops .hop{animation:oops-shake')

  await clock.advance(3000)
  await ui.redraw()
  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  await ui.redraw()
  src = String((await ui.findAll({ type: 'Svg' }))[0].props?.source)
  expect(src).not.toMatch(/class="clawd[^\"]*\breaction\b/)

  await $.tool.call({ tool: 'Read', file_path: '/tmp/subagent-missing', agentId: 'sub-agent-1' } as never)
  await ui.redraw()
  src = String((await ui.findAll({ type: 'Svg' }))[0].props?.source)
  expect(src).not.toMatch(/class="clawd[^\"]*\breaction oops\b/)
})

test('烦躁提示：插件代发的强烈文字原样透传但不计数', ZH, async ($, on) => {
  const forwarded: PromptSubmitInput[] = []
  const { clock } = await start($, on, {}, undefined, e => forwarded.push(e))
  await $.command.run({ command: 'clawd', args: '' } as never)
  const ui = await $.ui.mount(BAND)
  const prompts = ['为什么又坏了？', '还是不行，继续试', '搞什么，还是不行']
  const attachments = [{ type: 'document' as const, filename: 'feedback.txt' }]

  for (const [index, text] of prompts.entries()) {
    const result = await $.prompt.submit({ text, asUser: true, ...(index === 0 ? { attachments } : {}) } as never)
    expect(result).toMatchObject({ text })
  }
  expect(forwarded[0].text).toBe(prompts[0])
  expect(forwarded[0].attachments).toEqual(attachments)
  expect(forwarded[2].text).toBe(prompts[2])
  await clock.advance(600)
  await ui.redraw()
  const src = String((await ui.findAll({ type: 'Svg' }))[0].props?.source)
  expect(src).not.toMatch(/class="clawd[^\"]*\breaction tantrum\b/)
})

test('烦躁识别关闭：tantrums=off 时仍透传提示词但不触发跺脚', { options: { language: 'zh', tantrums: ' OFF ' } }, async ($, on) => {
  await start($, on, {})
  await $.command.run({ command: 'clawd', args: '' } as never)
  const prompts = ['为什么又这样', '还是不行', '搞什么']

  for (const text of prompts) {
    expect(await $.prompt.submit({ text, asUser: true } as never)).toMatchObject({ text })
  }
  const ui = await $.ui.mount(BAND)
  const src = String((await ui.findAll({ type: 'Svg' }))[0].props?.source)
  expect(src).not.toMatch(/class="clawd[^\"]*\breaction tantrum\b/)
})

test('节日与季节关闭：seasonal=off 时不画时段、季节或节日装扮', { options: { language: 'zh', seasonal: ' OFF ' } }, async ($, on) => {
  await start($, on, {})
  await $.command.run({ command: 'clawd', args: '' } as never)
  const ui = await $.ui.mount(BAND)
  const src = String((await ui.findAll({ type: 'Svg' }))[0].props?.source)
  expect(src).not.toContain('class="mood-')
})

test('反应优先级：测试失败反应不会覆盖待处理的权限请求', ZH, async ($, on) => {
  const permissionResult = { additionalContext: ['permission result unchanged'] }
  let releaseEdit!: () => void
  let markEditStarted!: () => void
  const editGate = new Promise<void>(resolve => (releaseEdit = resolve))
  const editStarted = new Promise<void>(resolve => (markEditStarted = resolve))
  const { clock } = await start($, on, {}, on => {
    on('classic.PermissionRequest', () => ({ value: permissionResult }))
    on('tool.call', async ($, e) => {
      if (e.tool === 'Edit') {
        markEditStarted()
        await editGate

        return { result: {} as never }
      }

      return { result: { stdout: '1 failed', exitCode: 1 } as never }
    })
  })
  await $.command.run({ command: 'clawd', args: '' } as never)

  const edit = $.tool.call({ tool: 'Edit', file_path: '/tmp/a', old_string: 'a', new_string: 'b' } as never)
  await editStarted
  expect(await $.classic.PermissionRequest({ tool_name: 'Edit', tool_input: { file_path: '/tmp/a' } } as never)).toEqual({ value: permissionResult })
  await clock.advance(600)
  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  const ui = await $.ui.mount(BAND)
  const src = String((await ui.findAll({ type: 'Svg' }))[0].props?.source)
  expect(src).toContain('class="activity-icon bang"')
  expect(src).not.toMatch(/class="clawd[^\"]*\breaction test-fail\b/)

  releaseEdit()
  await edit
  await clock.advance(600)
  const afterEdit = await $.ui.mount(BAND)
  expect(String((await afterEdit.findAll({ type: 'Svg' }))[0].props?.source)).not.toContain('class="activity-icon bang"')
})

test('战报：工具调用计数，改过的文件按路径去重，被拦下的不算；/clawd-card 导出图片', ZH, async ($, on) => {
  const runs: { argv: string[]; stdin?: string }[] = []
  await start($, on, {}, on => {
    mock.env(on, { HOME: '/Users/me' })
    // 测试里的「核心」：Edit / Write 照常完成，Bash rm 被拦
    on('tool.call', ($, e) => (e.tool === 'Bash' ? { deny: 'blocked' } : { result: {} as never }))
    on('process.run', ($, e) => {
      runs.push({ argv: [...e.argv], stdin: e.init?.stdin })
      const out = `/Users/me/Pictures/Clawd Reports/${e.argv[4]}`
      return { value: { exitCode: 0, stdout: out, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    on('ui.open', () => ({ value: { isPlaced: true } }))
  })
  await $.tool.call({ tool: 'Edit', file_path: '/p/a.ts', old_string: 'a', new_string: 'b' } as never)
  await $.tool.call({ tool: 'Edit', file_path: '/p/a.ts', old_string: 'b', new_string: 'c' } as never)
  await $.tool.call({ tool: 'Write', file_path: '/p/b.ts', content: 'x' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/p/c.ts' } as never)
  await $.tool.call({ tool: 'Bash', command: 'rm -rf /' } as never)
  await $.turn.complete(turn(900, 50, 50))

  const res = await $.command.run({ command: 'clawd-card', args: '' } as never)
  expect(String((res as { text?: string }).text)).toContain('Clawd 战报已复制到剪贴板')
  expect(runs).toHaveLength(1)
  expect(runs[0].argv.slice(0, 2)).toEqual(['/bin/sh', '-c'])
  expect(runs[0].argv[4]).toMatch(/^Clawd-report-\d{8}-\d{6}\.png$/)
  // 存到「图片/Clawd Reports」而不是桌面；只留最近 20 张，更早的进废纸篓（只动 Clawd-report-*.png）
  expect(runs[0].argv[2]).toContain('dir="$HOME/Pictures/Clawd Reports"')
  expect(runs[0].argv[2]).not.toContain('Desktop')
  expect(runs[0].argv[2]).toContain('ls -t "$dir"/Clawd-report-*.png | tail -n +21')
  expect(runs[0].argv[2]).toContain('mv "$old" "$HOME/.Trash/"')
  // 导出的是正方形画布（qlmanage 只出正方形），数字对得上：4 次工具调用、2 个文件、1 回合、命中 90%
  const svg = String(runs[0].stdin)
  expect(svg).toContain('width="1200" height="1200"')
  expect(svg).toMatch(/>4<\/text><text[^>]*>工具调用/)
  expect(svg).toMatch(/>2<\/text><text[^>]*>改动文件/)
  expect(svg).toMatch(/>1<\/text><text[^>]*>回合/)
  expect(svg).toMatch(/>90%<\/text><text[^>]*>缓存命中/)

  // 面板里画的是同一张卡（16:9，不是正方形）
  const pane = await $.ui.mount({ plugin: 'usage-pet', component: 'Pane', requestId: 'clawd-card', props: {}, viewport: { columns: 100, rows: 40 }, surface: 'desktop' } as never)
  const card = (await pane.findAll({ type: 'Svg' }))[0]
  expect(card.props?.width).toBe(640)
  expect(card.props?.height).toBe(360)
})

test('导出失败（不是 macOS）：面板照样打开，告诉用户为什么没图', ZH, async ($, on) => {
  await start($, on, {}, on => {
    mock.env(on, {})
    on('process.run', () => ({ value: { exitCode: 127, stdout: '', stderr: 'qlmanage: not found', isStdoutTruncated: false, isStderrTruncated: false } }))
    on('ui.open', () => ({ value: { isPlaced: true } }))
  })
  const res = await $.command.run({ command: 'clawd-card', args: '' } as never)
  expect(String((res as { text?: string }).text)).toContain('没能导出图片：qlmanage: not found')
})

// ───────── Windows ─────────
const WIN_ENV = { OS: 'Windows_NT', TEMP: 'C:\\Users\\me\\AppData\\Local\\Temp' }

test('Windows：/clawd-card 交给 PowerShell 脚本导出（Edge 截图 1200×675），SVG 先写进临时文件', ZH, async ($, on) => {
  const runs: string[][] = []
  const writes: { path: string; text: string }[] = []
  await start($, on, {}, on => {
    mock.env(on, WIN_ENV)
    on('fs.write', ($, e) => {
      writes.push({ path: e.path, text: e.text })
      return { value: undefined }
    })
    on('process.run', ($, e) => {
      runs.push([...e.argv])
      const name = e.argv[e.argv.indexOf('-Name') + 1]
      return { value: { exitCode: 0, stdout: `C:\\Users\\me\\Pictures\\Clawd Reports\\${name}`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    on('ui.open', () => ({ value: { isPlaced: true } }))
  })
  await $.turn.complete(turn(900, 50, 50))

  const res = await $.command.run({ command: 'clawd-card', args: '' } as never)
  expect(String((res as { text?: string }).text)).toContain('Clawd 战报已复制到剪贴板')
  expect(String((res as { text?: string }).text)).toContain('Pictures\\Clawd Reports\\Clawd-report-')
  expect(runs).toHaveLength(1)
  const argv = runs[0]
  expect(argv[0]).toBe('powershell.exe')
  expect(argv).toContain('-Sta')
  expect(argv[argv.indexOf('-File') + 1]).toMatch(/\\hooks\\export-card\.ps1$/)
  expect(argv[argv.indexOf('-Keep') + 1]).toBe('20')
  expect(argv[argv.indexOf('-Name') + 1]).toMatch(/^Clawd-report-\d{8}-\d{6}\.png$/)
  // 写到 TEMP 下的 SVG 就是交给脚本的那个；画布直接是 1200×675、直角
  // 在 macOS 上跑测试时，引擎把 C:\… 当相对路径、前面拼上当前目录，所以写入路径只比结尾
  expect(writes).toHaveLength(1)
  const svgPath = argv[argv.indexOf('-Svg') + 1]
  expect(svgPath.startsWith(`${WIN_ENV.TEMP}\\Clawd-report-`)).toBe(true)
  expect(writes[0].path.endsWith(svgPath)).toBe(true)
  expect(writes[0].text).toContain('width="1200" height="675"')
  expect(writes[0].text).toContain('rx="0" fill="#1C1B1A"')
  expect(writes[0].text).toContain('Microsoft YaHei')
  expect(writes[0].text).toMatch(/>1<\/text><text[^>]*>回合/)
})

test('Windows：导出失败（找不到 Edge / Chrome）时面板照样打开，告诉用户原因', ZH, async ($, on) => {
  await start($, on, {}, on => {
    mock.env(on, WIN_ENV)
    on('fs.write', () => ({ value: undefined }))
    on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: 'Microsoft Edge or Google Chrome not found', isStdoutTruncated: false, isStderrTruncated: false } }))
    on('ui.open', () => ({ value: { isPlaced: true } }))
  })
  const res = await $.command.run({ command: 'clawd-card', args: '' } as never)
  expect(String((res as { text?: string }).text)).toContain('没能导出图片：Microsoft Edge or Google Chrome not found')
})
