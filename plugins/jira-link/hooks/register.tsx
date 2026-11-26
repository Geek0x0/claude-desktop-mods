import { atom, read, update } from 'claude-code'
import type { CoreEngineInterface as Engine, Register } from 'claude-code'

const tickets = atom({ plugin: 'jira-link', key: 'tickets' } as const, [])
const PANE = 'jira-link'
const MAX = 20
const USAGE =
  'Usage: /jira link <KEY|URL> | /jira unlink <KEY> | /jira show | /jira clear'
const DENIED = /^(UTF|SHA|MD|HTTP|HTTPS|TLS|SSL|ISO|AES|RSA|IPV|RFC|CVE)-/
const WHOLE = /^[A-Z][A-Z0-9]+-\d+$/i

// Every Jira key in text, in order: a bare key, or one in a /browse/ or
// selectedIssue= URL (any case there). Uppercased, deduped. `auto` is for
// free prose: code is dropped first and a bare key must look like a real one.
const URL_KEY = String.raw`(?:\/browse\/|selectedIssue=)([A-Za-z][A-Za-z0-9]+-\d+)`
const LOOSE = String.raw`\b([A-Z][A-Z0-9]+-\d+)\b`
const STRICT = String.raw`(?<![\w-])([A-Z]{2,}-[1-9]\d*)(?![\w-])`
const extract = (text: string, auto = false): string[] => {
  const src = auto ? text.replace(/```[\s\S]*?```|`[^`\n]*`/g, ' ') : text
  const re = new RegExp(`${URL_KEY}|${auto ? STRICT : LOOSE}`, 'g')
  const keys = [...src.matchAll(re)].map(m => (m[1] ?? m[2] ?? '').toUpperCase())

  return [...new Set(keys)]
}

const label = (keys: string[]) =>
  keys.length === 0
    ? undefined
    : `Jira: ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ` +${keys.length - 3}` : ''}`

// Adds the keys not yet linked; answers the new ones and the whole list.
async function add($: Engine, keys: string[]) {
  const have = await read($, tickets)
  const fresh = keys.filter(k => !have.includes(k))
  if (fresh.length === 0) return { fresh, all: have }
  const all = [...have, ...fresh].slice(-MAX)
  await update($, tickets, () => all)

  return { fresh, all }
}

// Removes one key, or every key when none is given; refreshes the status line.
async function drop($: Engine, key?: string) {
  const have = await read($, tickets)
  const left = key ? have.filter(k => k !== key) : []
  if (left.length === have.length) return false
  await update($, tickets, () => left)
  $.ui.status(label(left))

  return true
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'jira',
      description:
        'Link Jira tickets to this session: /jira link KEY|URL, unlink KEY, show, clear',
    })
    $.ui.status(label(await read($, tickets)))

    return next(e)
  })

  on('command.run', { command: 'jira' }, async ($, e) => {
    const [word = '', ...rest] = e.args.trim().split(/\s+/)
    const arg = rest.join(' ')
    const sub = word.toLowerCase()

    if (sub === '' || sub === 'show') {
      const list = await read($, tickets)
      const text = list.length ? list.join('\n') : 'No Jira tickets linked.'
      if (sub === '') return { text }
      const { isPlaced } = await $.ui.open({ id: PANE, title: 'Jira Tickets' })

      return { text: isPlaced ? 'Jira 面板已打开' : text }
    }
    if (sub === 'clear') {
      await drop($)

      return { text: 'Jira links cleared.' }
    }
    if (sub === 'unlink') {
      const key = arg.toUpperCase()
      const list = await read($, tickets)
      if (!WHOLE.test(key)) return { text: USAGE }
      if (!list.includes(key)) return { text: `${key} is not linked.` }
      await drop($, key)

      return { text: `Unlinked ${key}.` }
    }
    // `/jira link X` and the bare `/jira X` alias.
    const input = sub === 'link' ? arg : e.args.trim()
    const key = WHOLE.test(input) ? input.toUpperCase() : extract(input)[0]
    if (!key) return { text: USAGE }

    const { fresh, all } = await add($, [key])
    if (fresh.length === 0) return { text: `${key} is already linked.` }
    $.ui.status(label(all))

    return { text: `Linked ${key}.` }
  })

  on('prompt.submit', async ($, e, next) => {
    if (!e.command) {
      const { fresh, all } = await add(
        $,
        extract(e.text, true).filter(k => !DENIED.test(k)),
      )
      if (fresh.length) {
        $.ui.status(label(all))
        $.ui.toast(`Linked ${fresh.join(', ')} (auto). /jira show to list`)
      }
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, tickets)
    if (e.props.placement === 'widget') return <Text dimColor>Jira · {list.length}</Text>

    return (
      <Box flexDirection="column" rowGap="md" padding="md">
        {list.length === 0 ? (
          <Box flexDirection="column" alignItems="center" paddingY="xl" rowGap="xs">
            <Text>还没有关联 Ticket</Text>
            <Text size="footnote" dimColor>提示词里提到 Ticket 号会自动关联，或用 /jira link KEY</Text>
          </Box>
        ) : (
          // marginX 1 stands for the rows' border, so both edges line up
          <Box justifyContent="space-between" alignItems="center" paddingX="md" marginX={1}>
            <Text size="footnote" dimColor>{list.length} 个 Ticket</Text>
            <Button key="clear" plain dimColor onPress={() => drop($)}>清空</Button>
          </Box>
        )}
        <Box flexDirection="column" rowGap="sm">
          {[...list].reverse().map(key => {
            const cut = key.indexOf('-') + 1

            return (
              <Box
                key={key}
                borderStyle="round"
                borderDimColor
                hover={{ borderColor: 'promptBorder' }}
                paddingX="md"
                paddingY="sm"
                gap="md"
                alignItems="center"
              >
                <Box flexGrow={1}>
                  <Text mono tabular wrap="truncate-end" maxLines={1}>
                    <Text dimColor>{key.slice(0, cut)}</Text>
                    <Text weight="medium">{key.slice(cut)}</Text>
                  </Text>
                </Box>
                <Button key={`unlink-${key}`} plain dimColor hover={{ color: 'error' }} onPress={() => drop($, key)}>移除</Button>
              </Box>
            )
          })}
        </Box>
      </Box>
    )
  })
}
