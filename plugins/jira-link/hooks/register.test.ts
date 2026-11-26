import { expect, test } from 'claude-code/testing'

const start = async ($: any, on: any) => {
  const seen: { toast: unknown[] } = { toast: [] }
  on('command.register', () => ({ value: { command: 'jira' } }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('ui.toast', (_: any, e: any) => (seen.toast.push(e.text), { value: undefined }))
  const pane = { isPlaced: true }
  on('ui.open', () => ({
    value: pane.isPlaced ? { isPlaced: true } : { isPlaced: false, reason: 'no surface' },
  }))
  on('prompt.submit', (_: any, e: any) => ({ text: e.text }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  return {
    seen,
    pane,
    jira: async (args: string): Promise<string | undefined> =>
      (
        await $.command.run({
          command: 'jira',
          args,
          origin: { kind: 'composer' },
          presentation: { isFullscreen: false, columns: 80 },
        })
      ).text,
    say: (text: string, command?: unknown) =>
      $.prompt.submit({ text, command, wait: false, origin: { kind: 'composer' } }),
  }
}

test('/jira link, show, unlink, clear', async ($, on) => {
  const { jira } = await start($, on)

  expect(await jira('')).toBe('No Jira tickets linked.')
  expect(await jira('link ff-1')).toBe('Linked FF-1.')
  expect(await jira('FF-2')).toBe('Linked FF-2.')
  expect(await jira('link https://x.atlassian.net/browse/ab-3?x=1')).toBe('Linked AB-3.')
  expect(await jira('link https://x.atlassian.net/board?selectedIssue=CD-4')).toBe('Linked CD-4.')
  expect(await jira('link FF-1')).toBe('FF-1 is already linked.')
  expect(await jira('link nope')).toMatch(/^Usage/)
  expect(await jira('nope')).toMatch(/^Usage/)
  expect(await jira('')).toBe('FF-1\nFF-2\nAB-3\nCD-4')

  expect(await jira('unlink ff-2')).toBe('Unlinked FF-2.')
  expect(await jira('unlink FF-2')).toBe('FF-2 is not linked.')
  expect(await jira('')).toBe('FF-1\nAB-3\nCD-4')

  expect(await jira('clear')).toBe('Jira links cleared.')
  expect(await jira('')).toBe('No Jira tickets linked.')
})

test('prompts auto-link every new key and URL, with one toast', async ($, on) => {
  const { jira, say, seen } = await start($, on)

  await say('UTF-8 and SHA-256 only')
  expect(await jira('')).toBe('No Jira tickets linked.')
  expect(seen.toast).toEqual([])

  await say('regex [A-Z][A-Z0-9]+-\\d+ and A-Z0-9, Z0-9, FF-01, `ABC-12`')
  await say('```\nlog ABC-13\n```')
  expect(await jira('')).toBe('No Jira tickets linked.')
  expect(seen.toast).toEqual([])

  await say('look at FF-123 and https://x.atlassian.net/browse/OPS-9')
  expect(await jira('')).toBe('FF-123\nOPS-9')
  expect(seen.toast).toHaveLength(1)
  await jira('clear')
  seen.toast.length = 0

  await say('see FF-1, OPS-9 and https://x.atlassian.net/browse/ab-3')
  expect(await jira('')).toBe('FF-1\nOPS-9\nAB-3')
  expect(seen.toast).toEqual(['Linked FF-1, OPS-9, AB-3 (auto). /jira show to list'])

  await say('again FF-1 and new FF-2')
  expect(seen.toast.at(-1)).toBe('Linked FF-2 (auto). /jira show to list')

  await say('only FF-1 again')
  expect(seen.toast).toHaveLength(2)

  await say('slash FF-77', { name: 'jira', args: 'FF-77' })
  expect(await jira('')).toBe('FF-1\nOPS-9\nAB-3\nFF-2')
})

test('/jira show opens the pane, or falls back to text', async ($, on) => {
  const { jira, pane } = await start($, on)
  await jira('link FF-1')

  expect(await jira('show')).toBe('Jira 面板已打开')
  expect(await jira('')).toBe('FF-1')

  pane.isPlaced = false
  expect(await jira('show')).toBe('FF-1')
})

const PANE = {
  plugin: 'jira-link',
  component: 'Pane',
  requestId: 'jira-link',
  props: {
    title: 'Jira Tickets',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('the pane lists the tickets, or says none are linked', async ($, on) => {
  const { jira } = await start($, on)
  const mount = () => $.ui.mount({ ...PANE, surface: 'desktop' })

  let ui = await mount()
  expect(await ui.find({ type: 'Text', text: /还没有关联 Ticket/ })).toBeTruthy()
  await ui.unmount()

  await jira('link FF-1')
  await jira('link FF-2')
  ui = await mount()
  expect(await ui.find({ type: 'Text', text: /FF-1/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /FF-2/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /2 个 Ticket/ })).toBeTruthy()
  await ui.unmount()
})
