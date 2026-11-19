import { expect, test } from 'claude-code/testing'

const PLAN = '/repo/docs/superpowers/plans/x.md'

function stand(on: any, answer: string | Error, submitted: string[], asks: string[], tool: object = { result: {} }) {
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('tool.call', (_: unknown, e: any) => {
    if (e.tool !== 'AskUserQuestion') return tool
    const question = e.questions[0].question
    asks.push(question)
    return answer instanceof Error ? { deny: answer.message } : { result: { questions: e.questions, answers: { [question]: answer } } }
  })
  on('turn.complete', (_: unknown, e: { usage?: unknown }) => ({ text: '', usage: e.usage }))
  on('prompt.submit', (_: unknown, e: { text: string; origin: unknown }) => {
    submitted.push(e.text)
    return { text: e.text, origin: e.origin }
  })
}

const write = ($: any, file_path: string) => $.tool.call({ tool: 'Write', file_path, content: 'x' })
// The ask runs unawaited after the turn returns, so let it settle.
const done = async ($: any, extra: object = {}) => {
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'complete', ...extra })
  for (let i = 0; i < 50; i++) await $.tool.call({ tool: 'Write', file_path: '/tmp/y', content: '' })
}

test('path matching and error/denied calls', async ($, on) => {
  const submitted: string[] = [], asks: string[] = []
  stand(on, '跳过', submitted, asks)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true } as never)
  await write($, '/repo/docs/superpowers/notes/x.md')
  await write($, '/repo/docs/superpowers/plans/x.txt')
  await write($, '/repo/docs/superpowers/plans/sub/x.md')
  await done($)
  expect(asks).toEqual([])
  await write($, PLAN)
  await done($)
  expect(asks.length).toBe(1)
  expect(asks[0]).toContain(PLAN)
})

test('error result is not recorded', async ($, on) => {
  const submitted: string[] = [], asks: string[] = []
  stand(on, '跳过', submitted, asks, { result: {}, isError: true })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true } as never)
  await write($, PLAN)
  await done($)
  expect(asks).toEqual([])
})

test('denied call is not recorded', async ($, on) => {
  const submitted: string[] = [], asks: string[] = []
  stand(on, '跳过', submitted, asks, { deny: 'no' })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true } as never)
  await write($, PLAN)
  await done($)
  expect(asks).toEqual([])
})

test('审核 submits a fable review prompt; asked once per path', async ($, on) => {
  const submitted: string[] = [], asks: string[] = []
  stand(on, '审核', submitted, asks)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true } as never)
  await write($, PLAN)
  await done($)
  expect(submitted.length).toBe(1)
  expect(submitted[0]).toContain(PLAN)
  expect(submitted[0]).toContain('fable')
  await write($, PLAN)
  await done($)
  expect(asks.length).toBe(1)
})

test('a dismissed ask submits nothing and does not throw', async ($, on) => {
  const submitted: string[] = [], asks: string[] = []
  stand(on, new Error('dismissed'), submitted, asks)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true } as never)
  await write($, PLAN)
  await done($)
  expect(asks.length).toBe(1)
  expect(submitted).toEqual([])
})

test('跳过 submits nothing', async ($, on) => {
  const submitted: string[] = [], asks: string[] = []
  stand(on, '跳过', submitted, asks)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true } as never)
  await write($, PLAN)
  await done($)
  expect(asks.length).toBe(1)
  expect(submitted).toEqual([])
})

test('subagent and aborted turns are ignored', async ($, on) => {
  const submitted: string[] = [], asks: string[] = []
  stand(on, '审核', submitted, asks)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true } as never)
  await write($, PLAN)
  await done($, { agentId: 'a1' })
  await done($, { isAborted: true, reason: 'aborted' })
  expect(asks).toEqual([])
  await done($)
  expect(asks.length).toBe(1)
})
