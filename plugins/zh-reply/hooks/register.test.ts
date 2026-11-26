import { expect, test } from 'claude-code/testing'

test('compose appends one rule section; submit skips peer origins', async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'base', scope: 'session', text: 'x' }, { id: 'zh-reply:rule', scope: 'session', text: 'old' }] }))
  on('prompt.submit', (_: unknown, e: any) => ({ text: e.text, origin: e.origin, context: e.context }))

  const once: any = await $.prompt.compose({ promptModel: 'm' } as never)
  const twice: any = await $.prompt.compose({ promptModel: 'm' } as never)
  for (const r of [once, twice]) {
    expect(r.sections.filter((s: any) => s.id === 'zh-reply:rule').length).toBe(1)
  }

  const user: any = await $.prompt.submit({ text: 'hi', origin: { kind: 'user' } } as never)
  expect(user.context.length).toBe(1)
  const peer: any = await $.prompt.submit({ text: 'hi', origin: { kind: 'peer' } } as never)
  expect(peer.context ?? []).toEqual([])
})
