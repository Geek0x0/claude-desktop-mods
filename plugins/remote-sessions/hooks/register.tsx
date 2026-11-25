import { atom, read, update } from 'claude-code'
import type { CoreEngineInterface as Engine, Register, Timer } from 'claude-code'

import type { Sess } from '../types'

type Row = { sessionId?: string; title?: string; cwd?: string; isRunning?: boolean; remoteControlActive?: boolean }

const PANE = 'remote-sessions'
// Change a tag when its value's fields change: it declines what an earlier version stored.
const sessions = atom({ plugin: 'remote-sessions', key: 'sessions' } as const, [], { shape: 'sessions-1' })
const error = atom({ plugin: 'remote-sessions', key: 'error' } as const, '', { shape: 'error-1' })
const updatedAt = atom({ plugin: 'remote-sessions', key: 'updatedAt' } as const, 0, { shape: 'updatedAt-1' })
const busy = atom({ plugin: 'remote-sessions', key: 'busy' } as const, [], { shape: 'busy-1' })

const msg = (err: unknown) => (err instanceof Error ? err.message : String(err))

const callText = async ($: Engine, tool: string, args: Record<string, unknown>) => {
  const r = await $.mcp.call('ccd_session_mgmt', tool, args)
  const text = r.content.find(b => b.type === 'text')?.text ?? ''
  if (r.isError) throw new Error(text || 'tool error')
  return text
}
const call = async ($: Engine, tool: string, args: Record<string, unknown>) => {
  const text = await callText($, tool, args)
  try { return JSON.parse(text) } catch { throw new Error(`${tool} 返回非 JSON：${text}`) }
}

// every session with Remote Control on, this one included
const fetchOn = async ($: Engine): Promise<Sess[]> => {
  const list: Row[] = await call($, 'list_sessions', { limit: 50 }) // ponytail: 200 rows overflow the MCP result token cap; page via $.fs on the spill file if older sessions matter
  const self: Row = await call($, 'get_session', { session_id: 'self' })
  return [...list.map(r => ({ r, me: false })), { r: self, me: true }]
    .filter(x => x.r.remoteControlActive)
    .map(({ r, me }) => ({
      id: me ? 'self' : r.sessionId ?? '',
      title: r.title ?? '(untitled)',
      cwd: (r.cwd ?? '').replace(/^\/home\/[^/]+/, '~'),
      isRunning: !!r.isRunning,
      me,
    }))
}

const refresh = async ($: Engine) => {
  try {
    const list = await fetchOn($)
    await update($, sessions, () => list)
    await update($, error, () => '')
    await update($, updatedAt, () => Date.now())
  } catch (err) {
    await update($, error, () => msg(err))
  }
}

const turnOff = async ($: Engine, s: Sess) => {
  await callText($, 'set_remote_control', { session_id: s.id, enabled: false })
}

let timer: Timer | undefined

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'remote-sessions',
      description: 'Open a pane of sessions with Remote Control on; `off [keyword]` turns it off',
    })
    return next(e)
  })

  on('command.run', { command: 'remote-sessions' }, async ($, e) => {
    const args = (e.args ?? '').trim()
    const m = args.match(/^off(?:\s+(.+))?$/)
    if (args && !m) return { text: '用法：/remote-sessions [off [关键字]]' }
    if (!m) {
      await $.ui.open({ id: PANE, title: 'Remote Control' })
      await refresh($)
      timer?.cancel()
      // ponytail: the timer cannot see a pane the person closed; it stops itself at the first tick that finds the pane gone
      timer = $.clock.every(30_000, async () => {
        if ((await $.ui.panes()).some(p => p.id === PANE)) await refresh($)
        else timer?.cancel()
      })
      return { text: 'Remote Control 面板已打开' }
    }
    try {
      const kw = m[1]?.toLowerCase()
      const hit = (await fetchOn($)).filter(s => !kw || s.title.toLowerCase().includes(kw))
      if (!hit.length) return { text: '没有匹配的、开着 Remote Control 的会话' }
      const out = await Promise.all(hit.map(async s => {
        try {
          return `• ${s.title} → ${await callText($, 'set_remote_control', { session_id: s.id, enabled: false })}`
        } catch (err) {
          return `• ${s.title} → 失败：${msg(err)}`
        }
      }))
      await refresh($)
      return { text: `已处理 ${hit.length} 个会话：\n${out.join('\n')}` }
    } catch (err) {
      return { text: `查询失败：${msg(err)}` }
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const [list, err, at, busyIds] = await Promise.all([read($, sessions), read($, error), read($, updatedAt), read($, busy)])
    const close = async (s: Sess) => {
      await update($, busy, ids => [...ids, s.id])
      let failed = ''
      try {
        await turnOff($, s)
      } catch (er) {
        failed = `${s.title}：${msg(er)}`
      }
      await update($, busy, ids => ids.filter(id => id !== s.id))
      await refresh($)
      if (failed) await update($, error, () => failed) // keep this row's failure over the refresh's clean slate
    }
    if (e.props.placement === 'widget') {
      return <Text><Text color={list.length > 0 ? 'success' : 'inactive'}>●</Text> <Text dimColor>Remote · {list.length}</Text></Text>
    }
    return (
      <Box flexDirection="column" rowGap="md" padding="md">
        <Box justifyContent="space-between" alignItems="center">
          <Text size="footnote" dimColor>
            {list.length} 个会话开启{at > 0 ? ` · 更新于 ${new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
          </Text>
          <Button key="refresh" plain dimColor onPress={() => refresh($)}>↻ 刷新</Button>
        </Box>
        {err !== '' && <Text size="footnote" color="error">{err}</Text>}
        {list.length === 0 && err === '' && (
          <Box flexDirection="column" alignItems="center" paddingY="xl" rowGap="xs">
            <Text color="inactive">○</Text>
            <Text dimColor>没有会话开着 Remote Control</Text>
          </Box>
        )}
        {list.map(s => (
          <Box
            key={s.id}
            borderStyle="round"
            borderDimColor
            hover={{ borderColor: 'promptBorder' }}
            paddingX="md"
            paddingY="sm"
            gap="md"
            alignItems="center"
          >
            <Box flexDirection="column" flexGrow={1} rowGap="xs">
              <Box gap="sm" alignItems="center">
                <Text color={s.isRunning ? 'success' : 'inactive'}>●</Text>
                <Text weight="medium" wrap="truncate-end" maxLines={1}>{s.title}</Text>
                {s.me && (
                  <Box backgroundColor="subtle" paddingX="sm">
                    <Text size="caption">当前</Text>
                  </Box>
                )}
              </Box>
              <Text size="footnote" dimColor wrap="truncate-middle" maxLines={1}>{s.cwd}</Text>
            </Box>
            {busyIds.includes(s.id)
              ? <Text size="caption" dimColor>关闭中…</Text>
              : <Button key={`close-${s.id}`} plain dimColor hover={{ color: 'error' }} onPress={() => close(s)}>关闭</Button>}
          </Box>
        ))}
      </Box>
    )
  })
}
