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
  /\b(flutter test|dart test|npm (run )?test|pnpm (run )?test|yarn test|bun test|npx (jest|vitest)|jest|vitest|pytest|go test|cargo test|gradlew?( \S+)* test|mvn test|dotnet test|rspec|phpunit|deno test)\b/
const INSTALL_CMD =
  /\b(npm|pnpm|yarn|bun) (i|install|add)\b|\bpip install\b|\bcargo add\b|\b(dart|flutter) pub add\b/
const FRUSTRATED =
  /\b(wtf|wth|ffs|omg|ugh+|argh+|damn|dammit|shit|crap|still (not|broken|failing|wrong|doesn'?t)|doesn'?t work|not working|does not work|why (is|does|won'?t|isn'?t)|seriously|come on|cmon|stupid|useless|i said|what the|nope|scheiss\w*|verdammt|gopf\w*|huere\w*|chabis|nid (gange|funktioniert)|geit nid|funktioniert (immer no |immer noch )?(nid|nicht)|isch kaputt)\b|!!+|\?\?+|\?!|!\?|为什么又|还是不行|搞什么|气死|怎么又|怎么还是|一直不行|为什么还不/iu

export function isFrustrated(text: string): boolean {
  if (FRUSTRATED.test(text)) return true
  const shouty = text.match(/\b[A-ZÄÖÜ]{4,}\b/g) ?? []

  return shouty.length >= 2
}

function nonZeroExit(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false
  const record = result as { exitCode?: unknown; exit_code?: unknown }

  return [record.exitCode, record.exit_code].some(code => typeof code === 'number' && code !== 0)
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
): ReactionKind | undefined {
  if (outcome.deny !== undefined) return undefined

  const isTest = (tool === 'Bash' || tool === 'PowerShell') && TEST_CMD.test(command) && !INSTALL_CMD.test(command)
  const isError = outcome.isError === true || nonZeroExit(outcome.result)
  if (isTest) return isError || reportsFailedTests(outputOf(outcome)) ? 'test-fail' : 'test-pass'

  return isError ? 'oops' : undefined
}
