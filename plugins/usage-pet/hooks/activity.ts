import type { Activity, ActivityKind, ReactionKind, ToolIcon } from '../types'

export const ACTIVITY_PRIORITY: readonly ActivityKind[] = ['needs-you', 'reaction', 'compacting', 'working', 'done', 'sleep', 'idle']

const rank = (kind: ActivityKind) => ACTIVITY_PRIORITY.indexOf(kind)

export function canReplaceActivity(current: Activity, next: ActivityKind): boolean {
  return rank(current.kind) >= rank(next)
}

export function iconForTool(tool: string): ToolIcon {
  if (tool === 'Bash' || tool === 'PowerShell') return 'terminal'
  if (tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit' || tool === 'NotebookEdit') return 'pencil'
  if (tool === 'Read' || tool === 'Grep' || tool === 'Glob') return 'magnifier'
  if (tool === 'WebFetch' || tool === 'WebSearch') return 'globe'
  if (tool === 'Agent' || tool === 'Task') return 'bolt'
  if (tool.startsWith('mcp__')) return 'mini'
  return 'spinner'
}

const TEST_CMD =
  /^(?:flutter\s+test|dart\s+test|npm\s+(?:run\s+)?test(?:[:.-][\w:.-]+)?|pnpm\s+(?:run\s+)?test(?:[:.-][\w:.-]+)?|yarn\s+test(?:[:.-][\w:.-]+)?|bun\s+test(?:[:.-][\w:.-]+)?|jest|vitest|pytest|go\s+test|cargo\s+test|(?:\.\/)?gradlew?(?:\s+\S+)*\s+test|mvn\s+test|dotnet\s+test|rspec|phpunit|deno\s+test)(?=\s|$)/i
const FRUSTRATED =
  /\b(wtf|wth|ffs|omg|ugh+|argh+|damn|dammit|shit|crap|still (not|broken|failing|wrong|doesn'?t)|doesn'?t work|not working|does not work|seriously|come on|cmon|stupid|useless|i said|what the|nope|scheiss\w*|verdammt|gopf\w*|huere\w*|chabis|nid (gange|funktioniert)|geit nid|funktioniert (immer no |immer noch )?(nid|nicht)|isch kaputt)\b|!!+|\?\?+|\?!|!\?|为什么又|还是不行|搞什么|气死|怎么又|怎么还是|一直不行|为什么还不/iu
const COMMON_ACRONYMS = new Set(['AI', 'API', 'CD', 'CI', 'CLI', 'CPU', 'CSS', 'CRUD', 'DB', 'DNS', 'GPU', 'HTML', 'HTTP', 'HTTPS', 'IDE', 'JSON', 'LLM', 'OS', 'PR', 'REST', 'SDK', 'SQL', 'SSH', 'TCP', 'UDP', 'UI', 'URL', 'UX', 'UUID', 'XML', 'YAML'])

export function isFrustrated(text: string): boolean {
  if (FRUSTRATED.test(text)) return true
  const shouty = (text.match(/(?<![\p{L}\p{N}_])\p{Lu}{2,}(?![\p{L}\p{N}_])/gu) ?? []).filter(word => !COMMON_ACRONYMS.has(word))

  return shouty.length >= 3
}

export function isFrustratedPrompt(text: string, originKind: string): boolean {
  return originKind === 'composer' && isFrustrated(text)
}

export function updateTantrumWindow(
  timestamps: readonly number[],
  now: number,
  matched: boolean,
  windowMs = 20 * 60_000,
): { timestamps: number[]; trigger: boolean } {
  const active = timestamps.filter(at => now - at < windowMs)
  if (matched) active.push(now)
  if (active.length >= 3) return { timestamps: [], trigger: true }

  return { timestamps: active, trigger: false }
}

function exitCodeOf(result: unknown): number | undefined {
  if (!result || typeof result !== 'object') return undefined
  const record = result as { exitCode?: unknown; exit_code?: unknown }

  const code = [record.exitCode, record.exit_code].find(value => typeof value === 'number')

  return typeof code === 'number' ? code : undefined
}

function shellSegments(command: string): string[] {
  const segments: string[] = []
  let quote: "'" | '"' | undefined
  let escaped = false
  let start = 0

  for (let i = 0; i < command.length; i++) {
    const char = command[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\' && quote !== "'") {
      escaped = true
      continue
    }
    if (quote) {
      if (char === quote) quote = undefined
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      continue
    }
    if (char !== '&' && char !== '|' && char !== ';' && char !== '(' && char !== ')' && char !== '\n' && char !== '\r') continue

    const separator = (char === '&' || char === '|') && command[i + 1] === char ? 2 : 1
    segments.push(command.slice(start, i))
    i += separator - 1
    start = i + 1
  }
  segments.push(command.slice(start))

  return segments
}

function stripCommandPrefixes(segment: string): string {
  let command = segment.trim()
  let changed = true

  while (changed) {
    changed = false
    const assignment = /^[A-Za-z_][A-Za-z0-9_]*=(?:"(?:\\.|[^"])*"|'[^']*'|[^\s;|&()]+)(?:\s+|$)/.exec(command)
    if (assignment) {
      command = command.slice(assignment[0].length).trimStart()
      changed = true
      continue
    }

    const wrapper = /^(?:env|command|exec|time)\s+|^(?:npx|bunx)\s+(?:(?:--\S+)\s+)*(?:--\s+)?|^(?:pnpm|npm|yarn|bun)\s+(?:exec|dlx)\s+(?:--\s+)?|^uv\s+run(?:\s+--\S+)*\s+(?:--\s+)?/i.exec(command)
    if (wrapper) {
      command = command.slice(wrapper[0].length).trimStart()
      changed = true
    }
  }

  return command
}

function isTestCommand(command: string): boolean {
  return shellSegments(command).some(segment => TEST_CMD.test(stripCommandPrefixes(segment)))
}

function isBenignProbeCommand(command: string): boolean {
  const segment = [...shellSegments(command)].reverse().find(part => part.trim())
  if (!segment) return false
  const normalized = stripCommandPrefixes(segment)

  return /^(?:grep|rg|egrep|fgrep)(?:\s|$)/i.test(normalized) ||
    /^git\s+diff\s+--quiet(?:\s|$)/i.test(normalized) ||
    /^(?:test|\[)(?:\s|$)/i.test(normalized) ||
    /^(?:cmp|diff)(?:\s|$)/i.test(normalized)
}

function outputOf(outcome: { result?: unknown; text?: string }): string {
  let result = ''
  try {
    result = JSON.stringify(outcome.result ?? '') ?? ''
  } catch {
    // A malformed tool result must not interfere with passing the tool call through.
  }

  return `${outcome.text ?? ''}\n${result}`
}

function reportsFailedTests(output: string): boolean {
  const failed = /(\d+)\s+(tests?\s+)?(failed|failing|failures?)/i.exec(output)

  return (failed !== null && Number(failed[1]) > 0) || /Some tests failed/i.test(output)
}

export function reactionForToolResult(
  tool: string,
  command: string,
  outcome: { deny?: string; isError?: boolean; result?: unknown; text?: string },
  agentId?: string,
): ReactionKind | undefined {
  if (outcome.deny !== undefined || agentId !== undefined) return undefined

  const isTest = (tool === 'Bash' || tool === 'PowerShell') && isTestCommand(command)
  const exitCode = exitCodeOf(outcome.result)
  const benignProbeExit = exitCode === 1 && isBenignProbeCommand(command)
  const isError = !benignProbeExit && (outcome.isError === true || (exitCode !== undefined && exitCode !== 0))
  if (isTest) return isError || reportsFailedTests(outputOf(outcome)) ? 'test-fail' : 'test-pass'

  return isError ? 'oops' : undefined
}
