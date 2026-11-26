import { expect, test } from 'claude-code/testing'

test('submit adds the rule and reminder for user origins; skips peer origins', async ($, on) => {
  on('prompt.submit', (_: unknown, e: any) => ({ text: e.text, origin: e.origin, context: e.context }))

  const user: any = await $.prompt.submit({ text: 'hi', origin: { kind: 'user' } } as never)
  expect(user.context.length).toBe(1)
  expect(user.context[0]).toContain('MUST be written in Chinese')
  expect(user.context[0]).toContain('提醒')
  const peer: any = await $.prompt.submit({ text: 'hi', origin: { kind: 'peer' } } as never)
  expect(peer.context ?? []).toEqual([])
})
