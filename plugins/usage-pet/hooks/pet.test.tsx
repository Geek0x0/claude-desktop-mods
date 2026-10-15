import { expect, mock, test } from 'claude-code/testing'
import type { PromptSubmitInput, SessionCompactInput } from 'claude-code'

import { NEW_PET, levelOf, normalize, onTurn, threshold } from './pet'

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

// ───────── 接进插件：store、等级、信息栏、战报 ─────────

type Harness = Parameters<Parameters<typeof test>[1]>
// 测试里的「核心」应答都要在第一次调用 $ 之前注册：beneath 传进来
async function start(
  $: Harness[0],
  on: Harness[1],
  stored: Record<string, unknown>,
  beneath?: (on: Harness[1]) => void,
  capturePrompt?: (event: PromptSubmitInput) => void,
) {
  mock.store(on, stored)
  const clock = mock.clock(on)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('prompt.submit', ($, e) => {
    capturePrompt?.(e)

    return { text: e.text, origin: e.origin }
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
  await $.session.start(START as never)

  return { toasts, clock }
}

const turn = (read: number, write: number, fresh: number) => ({
  answer: 'ok',
  durationMs: 1000,
  isAborted: false,
  turnId: `t${read}`,
  reason: 'answer' as const,
  usage: { model: 'claude-opus-5-5', input_tokens: fresh, output_tokens: 40, cache_read_input_tokens: read, cache_creation_input_tokens: write },
})

// 关掉节日装扮：万圣节期间头顶是巫师帽，看不到小芽
test('通知：会话开始、升级和解锁成就都不弹提示，等级和成就仍出现在信息栏和战报卡', { options: { language: 'zh', seasonal: 'off' } }, async ($, on) => {
  const { toasts } = await start($, on, { pet: { xp: 95, turns: 9, streak: 1, lastDay: '2000-01-01', achievements: [] } }, on =>
    on('session.surfaces', () => ({ value: ['desktop'] })),
  )
  expect(toasts).toEqual([])

  await $.turn.complete(turn(9900, 0, 100))
  expect(toasts).toEqual([])

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
  const ui = await $.ui.mount(BAND)
  expect(String((await ui.findAll({ type: 'Svg' }))[0].props?.source)).toContain('<title>Clawd Lv.1 · 经验 95 / 100')
})

test('工具调用期间显示工具图标，完成后恢复工作字形并透传工具结果', ZH, async ($, on) => {
  let release!: () => void
  let markStarted!: () => void
  const gate = new Promise<void>(resolve => (release = resolve))
  const started = new Promise<void>(resolve => (markStarted = resolve))
  await start($, on, {}, on => {
    on('tool.call', async () => {
      markStarted()
      await gate
      return { result: { marker: 'unchanged' } as never }
    })
  })

  const pending = $.tool.call({ tool: 'Bash', command: 'pwd' } as never)
  await started
  const workingBand = { ...BAND, props: { ...BAND.props, isWorking: true, bodyColumns: 20 } }
  const during = await $.ui.mount(workingBand as never)
  const duringSvgNode = (await during.findAll({ type: 'Svg' }))[0]
  const duringSvg = String(duringSvgNode.props?.source)

  expect(duringSvg).toContain('class="activity-icon terminal"')
  expect(duringSvg).toContain('<g class="laptop">')
  expect(duringSvgNode.props?.width).toBe(398)

  release()
  expect(await pending).toEqual({ result: { marker: 'unchanged' } })

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
  await start($, on, {}, on => {
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

  const bash = $.tool.call({ tool: 'Bash', command: 'pwd' } as never)
  await bashStarted
  const read = $.tool.call({ tool: 'Read', file_path: '/tmp/a' } as never)
  await readStarted
  const workingBand = { ...BAND, props: { ...BAND.props, isWorking: true } }
  const newest = await $.ui.mount(workingBand as never)
  expect(String((await newest.findAll({ type: 'Svg' }))[0].props?.source)).toContain('class="activity-icon magnifier"')

  releaseBash()
  await bash
  const afterOlder = await $.ui.mount(workingBand as never)
  expect(String((await afterOlder.findAll({ type: 'Svg' }))[0].props?.source)).toContain('class="activity-icon magnifier"')

  releaseRead()
  await read
  const afterAll = await $.ui.mount(workingBand as never)
  const afterAllSvg = String((await afterAll.findAll({ type: 'Svg' }))[0].props?.source)
  expect(afterAllSvg).not.toContain('class="activity-icon magnifier"')
  expect(afterAllSvg).not.toContain('class="activity-icon terminal"')
})

test('权限请求：只观察并透传结果，悬而未决时不会被在途工具图标覆盖', ZH, async ($, on) => {
  let release!: () => void
  let markStarted!: () => void
  const gate = new Promise<void>(resolve => (release = resolve))
  const started = new Promise<void>(resolve => (markStarted = resolve))
  const permissionResult = { additionalContext: ['permission result unchanged'] }
  await start($, on, {}, on => {
    on('tool.call', async ($, e) => {
      if (e.tool === 'Bash') {
        markStarted()
        await gate
      }
      return { result: { tool: e.tool } as never }
    })
    on('classic.PermissionRequest', () => permissionResult)
  })

  const bash = $.tool.call({ tool: 'Bash', command: 'sleep 1' } as never)
  await started
  expect(await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'sleep 1' } } as never)).toEqual(permissionResult)

  const waiting = await $.ui.mount(BAND)
  const waitingSvg = String((await waiting.findAll({ type: 'Svg' }))[0].props?.source)
  expect(waitingSvg).toContain('class="activity-icon bang"')
  expect(waitingSvg).not.toContain('class="activity-icon terminal"')

  release()
  await bash
  const afterBash = await $.ui.mount(BAND)
  expect(String((await afterBash.findAll({ type: 'Svg' }))[0].props?.source)).toContain('class="activity-icon bang"')

  await $.tool.call({ tool: 'Read', file_path: '/tmp/a' } as never)
  const afterRead = await $.ui.mount(BAND)
  const afterReadSvg = String((await afterRead.findAll({ type: 'Svg' }))[0].props?.source)
  expect(afterReadSvg).not.toContain('class="activity-icon bang"')
  expect(afterReadSvg).not.toContain('class="activity-icon magnifier"')
})

test('问题和计划：工具调用显示问号或感叹号，提示提交和主回合结束时清除', ZH, async ($, on) => {
  await start($, on, {}, on => on('tool.call', ($, e) => ({ result: { tool: e.tool } as never })))

  await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as never)
  let ui = await $.ui.mount(BAND)
  let src = String((await ui.findAll({ type: 'Svg' }))[0].props?.source)
  expect(src).toContain('class="activity-icon question"')

  await $.prompt.submit({ text: 'please continue', asUser: true } as never)
  ui = await $.ui.mount(BAND)
  src = String((await ui.findAll({ type: 'Svg' }))[0].props?.source)
  expect(src).not.toContain('class="activity-icon question"')

  await $.tool.call({ tool: 'ExitPlanMode', plan: 'ready' } as never)
  ui = await $.ui.mount(BAND)
  src = String((await ui.findAll({ type: 'Svg' }))[0].props?.source)
  expect(src).toContain('class="activity-icon bang"')

  await $.turn.complete(turn(0, 0, 0))
  ui = await $.ui.mount(BAND)
  src = String((await ui.findAll({ type: 'Svg' }))[0].props?.source)
  expect(src).not.toContain('class="activity-icon bang"')
  expect(src).toContain('class="clawd done')
})

test('主回合完成：完成姿势停留六秒，中断和子代理不显示完成状态', ZH, async ($, on) => {
  const { clock } = await start($, on, {})
  const ui = await $.ui.mount(BAND)

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

  await $.tool.call({ tool: 'Read', file_path: '/tmp/a' } as never)
  await ui.redraw()
  expect(String((await ui.findAll({ type: 'Svg' }))[0].props?.source)).not.toMatch(/class="clawd[^\"]* sleep"/)
  await clock.advance(600_000)
  await ui.redraw()
  expect(String((await ui.findAll({ type: 'Svg' }))[0].props?.source)).toMatch(/class="clawd[^\"]* sleep"/)

  await $.prompt.submit({ text: 'wake up', asUser: true } as never)
  await ui.redraw()
  expect(String((await ui.findAll({ type: 'Svg' }))[0].props?.source)).not.toMatch(/class="clawd[^\"]* sleep"/)
})

test('上下文压缩：期间显示压扁姿势，结束后恢复并透传压缩结果', ZH, async ($, on) => {
  let release!: () => void
  let markStarted!: () => void
  const gate = new Promise<void>(resolve => (release = resolve))
  const started = new Promise<void>(resolve => (markStarted = resolve))
  const compactResult = { messages: [{ role: 'user', text: 'summary', toolUses: [] }], tokensBefore: 120, tokensAfter: 60 }
  await start($, on, {}, on => {
    on('session.compact', async () => {
      markStarted()
      await gate
      return compactResult as never
    })
  })

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
  const ui = await $.ui.mount(BAND)

  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  await ui.redraw()
  let src = String((await ui.findAll({ type: 'Svg' }))[0].props?.source)
  expect(src).toMatch(/class="clawd[^\"]*\breaction test-pass\b/)
  expect(src).toContain('class="activity-icon check"')
  expect(src).toContain('class="reaction-confetti"')

  await clock.advance(6000)
  await ui.redraw()
  await $.tool.call({ tool: 'Bash', command: 'npm install vitest' } as never)
  await ui.redraw()
  src = String((await ui.findAll({ type: 'Svg' }))[0].props?.source)
  expect(src).not.toMatch(/class="clawd[^\"]*\breaction\b/)

  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  await ui.redraw()
  src = String((await ui.findAll({ type: 'Svg' }))[0].props?.source)
  expect(src).toMatch(/class="clawd[^\"]*\breaction test-fail\b/)
  expect(src).toContain('class="activity-icon cross"')
  expect(src).toContain('class="sweat"')
  await clock.advance(6000)
  await ui.redraw()
  expect(String((await ui.findAll({ type: 'Svg' }))[0].props?.source)).not.toMatch(/class="clawd[^\"]*\breaction\b/)
})

test('失误反应：工具错误显示叉叉，拒绝调用不显示失误', ZH, async ($, on) => {
  const { clock } = await start($, on, {}, on => {
    on('tool.call', ($, e) =>
      e.tool === 'Read' ? { result: 'read failed' as never, isError: true } : { deny: 'blocked' },
    )
  })
  const ui = await $.ui.mount(BAND)

  await $.tool.call({ tool: 'Read', file_path: '/tmp/missing' } as never)
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
})

test('烦躁提示：二十分钟内第三次触发跺脚，八秒后恢复并原样透传提示词', ZH, async ($, on) => {
  let forwarded: PromptSubmitInput | undefined
  const { clock } = await start($, on, {}, undefined, e => (forwarded = e))
  const ui = await $.ui.mount(BAND)
  const prompts = ['为什么又坏了？', '还是不行，继续试', '搞什么，还是不行']

  const firstAttachments = [{ type: 'document' as const, filename: 'feedback.txt' }]
  const first = await $.prompt.submit({ text: prompts[0], asUser: true, attachments: firstAttachments } as never)
  expect(first).toMatchObject({ text: prompts[0] })
  expect(forwarded).toMatchObject({
    text: prompts[0],
    attachments: firstAttachments,
  })
  await clock.advance(10 * 60_000)
  const second = await $.prompt.submit({ text: prompts[1], asUser: true } as never)
  expect(second).toMatchObject({ text: prompts[1] })
  await ui.redraw()
  expect(String((await ui.findAll({ type: 'Svg' }))[0].props?.source)).not.toMatch(/class="clawd[^\"]*\breaction tantrum\b/)

  await clock.advance(9 * 60_000)
  const third = await $.prompt.submit({ text: prompts[2], asUser: true } as never)
  expect(third).toMatchObject({ text: prompts[2] })
  await ui.redraw()
  let src = String((await ui.findAll({ type: 'Svg' }))[0].props?.source)
  expect(src).toMatch(/class="clawd[^\"]*\breaction tantrum\b/)
  expect(src).toContain('class="angry-eyes"')
  expect(src).toContain('class="tantrum-steam"')

  await clock.advance(8000)
  await ui.redraw()
  expect(String((await ui.findAll({ type: 'Svg' }))[0].props?.source)).not.toMatch(/class="clawd[^\"]*\breaction tantrum\b/)
  await $.prompt.submit({ text: 'still not working', asUser: true } as never)
  await $.prompt.submit({ text: '气死了', asUser: true } as never)
  await ui.redraw()
  expect(String((await ui.findAll({ type: 'Svg' }))[0].props?.source)).not.toMatch(/class="clawd[^\"]*\breaction tantrum\b/)
})

test('烦躁识别关闭：tantrums=off 时仍透传提示词但不触发跺脚', { options: { language: 'zh', tantrums: ' OFF ' } }, async ($, on) => {
  await start($, on, {})
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
  const ui = await $.ui.mount(BAND)
  const src = String((await ui.findAll({ type: 'Svg' }))[0].props?.source)
  expect(src).not.toContain('class="mood-')
})

test('反应优先级：测试失败反应不会覆盖待处理的权限请求', ZH, async ($, on) => {
  const permissionResult = { additionalContext: ['permission result unchanged'] }
  let release!: () => void
  let markStarted!: () => void
  const gate = new Promise<void>(resolve => (release = resolve))
  const started = new Promise<void>(resolve => (markStarted = resolve))
  await start($, on, {}, on => {
    on('classic.PermissionRequest', () => permissionResult)
    on('tool.call', async () => {
      markStarted()
      await gate

      return { result: { stdout: '1 failed', exitCode: 1 } as never }
    })
  })

  const tool = $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  await started
  expect(await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'npm test' } } as never)).toEqual(permissionResult)
  release()
  await tool
  const ui = await $.ui.mount(BAND)
  const src = String((await ui.findAll({ type: 'Svg' }))[0].props?.source)
  expect(src).toContain('class="activity-icon bang"')
  expect(src).not.toMatch(/class="clawd[^\"]*\breaction test-fail\b/)
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
