import type { Register } from 'claude-code'

const RULE = [
  'Conversational replies to the user MUST be written in Chinese. This includes short acknowledgements and final summaries, and it holds even after long English tool output, skill text, hook context or task notifications.',
  'Everything written for other people or systems MUST stay in English: code, comments, commit messages, identifiers, commands, file paths, PR descriptions and PR comments/replies, Jira tickets and comments, Slack messages and drafts, Teams messages.',
].join('\n')

const REMINDER = '提醒：对用户的对话回复一律用中文；写给他人或系统的内容（代码、提交、PR、Jira、Slack、Teams 等）保持英文。'

// Origins that are not the user talking to us: leave these prompts untouched.
const SKIP_ORIGINS = new Set([
  'peer',
  'peer-send-message',
  'coordinator',
  'observer',
  'observer-activity',
  'projects-relay',
])

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    if (SKIP_ORIGINS.has(e.origin.kind)) return next(e)
    return next({ ...e, context: [...(e.context ?? []), `${RULE}\n${REMINDER}`] })
  })
}
