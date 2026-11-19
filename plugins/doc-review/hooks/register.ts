import { update } from 'claude-code'
import type { Register } from 'claude-code'

const DOC = /(^|\/)docs\/superpowers\/(specs|plans)\/[^/]+\.md$/
const pending = { plugin: 'doc-review', key: 'pending' } as const
const asked = { plugin: 'doc-review', key: 'asked' } as const

export const register: Register = on => {
  on('tool.call', { tool: /^(Write|Edit)$/ }, async ($, e, next) => {
    const ran = await next(e)
    const path = (e as { file_path?: string }).file_path
    if (ran.deny === undefined && ran.isError !== true && path !== undefined && DOC.test(path)) {
      await update($, pending, (list: string[] = []) => (list.includes(path) ? list : [...list, path]))
    }
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined || e.isAborted) return ran

    const { value: list = [] } = await $.state.get(pending)
    if (list.length === 0) return ran
    const { value: seen = [] } = await $.state.get(asked)
    const paths = list.filter(p => !seen.includes(p))
    await update($, pending, () => [] as string[])
    if (paths.length === 0) return ran
    await update($, asked, (s: string[] = []) => [...s, ...paths])

    // Not awaited: the turn must not wait for the person's answer.
    void $.ui
      .ask(`派 Fable 子代理审核 ${paths.join('、')}？`, ['审核', '跳过'])
      .then(answer =>
        answer === '审核'
          ? $.prompt.submit({
              text:
                `Dispatch a read-only review subagent via the Agent tool with model: "fable" to review these docs: ${paths.join(', ')}. ` +
                'It should look for gaps, contradictions, ambiguity, unverifiable steps and scope creep, and must not edit anything. ' +
                'Then relay its findings to me and wait for my decision before editing anything.',
            })
          : undefined,
      )
      .catch(() => undefined) // dismissed ask: skip

    return ran
  })
}
