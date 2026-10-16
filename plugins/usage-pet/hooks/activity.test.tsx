import { expect, test } from 'claude-code/testing'

import { canReplaceActivity, iconForTool, isFrustrated, isFrustratedPrompt, reactionForToolResult, updateTantrumWindow } from './activity'

test('工具图标：各工具家族使用对应像素图标，未知工具使用转圈图标', () => {
  expect(['Bash', 'PowerShell'].map(iconForTool)).toEqual(['terminal', 'terminal'])
  expect(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].map(iconForTool)).toEqual(['pencil', 'pencil', 'pencil', 'pencil'])
  expect(['Read', 'Grep', 'Glob'].map(iconForTool)).toEqual(['magnifier', 'magnifier', 'magnifier'])
  expect(['WebFetch', 'WebSearch'].map(iconForTool)).toEqual(['globe', 'globe'])
  expect(['Agent', 'Task'].map(iconForTool)).toEqual(['bolt', 'bolt'])
  expect(iconForTool('mcp__calendar__search')).toBe('mini')
  expect(iconForTool('CustomTool')).toBe('spinner')
})

test('活动优先级：高优先级状态保留，工作状态覆盖完成、睡眠和空闲', () => {
  expect(canReplaceActivity({ kind: 'needs-you' }, 'reaction')).toBe(false)
  expect(canReplaceActivity({ kind: 'reaction' }, 'compacting')).toBe(false)
  expect(canReplaceActivity({ kind: 'compacting' }, 'working')).toBe(false)
  expect(canReplaceActivity({ kind: 'done' }, 'working')).toBe(true)
  expect(canReplaceActivity({ kind: 'sleep' }, 'working')).toBe(true)
  expect(canReplaceActivity({ kind: 'idle' }, 'working')).toBe(true)
  expect(canReplaceActivity({ kind: 'working' }, 'idle')).toBe(false)
})

test('测试命令：测试结果区分通过和失败，安装测试工具不算测试', () => {
  expect(reactionForToolResult('Bash', 'npm test', { result: { stdout: '4 passed', exitCode: 0 } })).toBe('test-pass')
  expect(reactionForToolResult('PowerShell', 'pytest', { result: { stdout: '2 failed', exitCode: 0 } })).toBe('test-fail')
  expect(reactionForToolResult('Bash', 'cargo test', { result: { stdout: '', exitCode: 1 } })).toBe('test-fail')
  expect(reactionForToolResult('Bash', 'vitest', { result: {}, isError: true })).toBe('test-fail')
  expect(reactionForToolResult('Bash', 'npm install vitest', { result: { stdout: 'added 1 package', exitCode: 0 } })).toBe(undefined)
  expect(reactionForToolResult('Bash', 'npm install vitest', { result: {}, isError: true })).toBe('oops')
  expect(reactionForToolResult('Bash', 'pip install pytest', { result: { stdout: 'installed', exitCode: 0 } })).toBe(undefined)
  expect(reactionForToolResult('Read', 'npm test', { result: { stdout: '4 passed', exitCode: 0 } })).toBe(undefined)
})

test('测试命令位置：只在 shell 命令位置识别测试运行器', () => {
  const passed = { result: { exitCode: 0 } }
  for (const command of ['npm test', 'npm run test:unit', 'cd x && pytest -q', 'cd x\npytest -q', 'CI=1 npx vitest run', 'pnpm exec vitest run', 'uv run pytest -q', 'uv run -- pytest -q']) {
    expect(reactionForToolResult('Bash', command, passed)).toBe('test-pass')
  }
  for (const command of [
    'cat jest.config.js',
    'ls pytest.ini',
    'git commit -m "vitest"',
    'grep -r "go test" .',
    'echo "npm test; pytest"',
    'npm install vitest',
  ]) {
    expect(reactionForToolResult('Bash', command, passed)).toBe(undefined)
  }
})

test('普通工具错误会触发失误反应，但拒绝调用不会', () => {
  expect(reactionForToolResult('Read', '', { result: 'read failed', isError: true })).toBe('oops')
  expect(reactionForToolResult('Bash', '', { result: { exitCode: 2 } })).toBe('oops')
  expect(reactionForToolResult('Bash', '', { deny: 'blocked', isError: true })).toBe(undefined)
})

test('探测命令：无匹配和文件差异的退出码一不显示失误，真正错误仍显示', () => {
  for (const command of ['grep needle file', 'rg needle file', 'egrep needle file', 'fgrep needle file', 'git diff --quiet', 'test -e missing', '[ -e missing ]', 'cmp a b', 'diff a b']) {
    expect(reactionForToolResult('Bash', command, { result: { exitCode: 1 } })).toBe(undefined)
  }
  expect(reactionForToolResult('Bash', 'rg needle file', { result: { exitCode: 2 } })).toBe('oops')
  expect(reactionForToolResult('Bash', 'npm test', { result: { exitCode: 1 } })).toBe('test-fail')
})

test('子代理工具错误：不触发主 Clawd 的失误反应', () => {
  expect(reactionForToolResult('Read', '', { isError: true }, 'sub-agent-1')).toBe(undefined)
  expect(reactionForToolResult('Read', '', { isError: true })).toBe('oops')
})

test('烦躁识别：匹配常见英文和中文表达', () => {
  expect(['WTF is wrong', 'still not working', '为什么又', '还是不行', '搞什么', '气死'].every(isFrustrated)).toBe(true)
  expect(isFrustrated('why does this keep failing')).toBe(false)
  expect(isFrustrated('WHY BROKEN')).toBe(false)
  expect(isFrustrated('NO WAY THIS')).toBe(true)
  expect(isFrustrated('HTTP JSON HTML')).toBe(false)
  expect(isFrustrated('Please update the button color')).toBe(false)
})

test('烦躁来源：只把本人输入框提交的强烈提示计入次数', () => {
  expect(isFrustratedPrompt('为什么又坏了', 'composer')).toBe(true)
  expect(isFrustratedPrompt('为什么又坏了', 'plugin')).toBe(false)
  expect(isFrustratedPrompt('还是不行', 'bridge')).toBe(false)
})

test('烦躁次数：二十分钟内第三次触发并清空，过期时间不累计', () => {
  let times: number[] = []
  let result = updateTantrumWindow(times, 0, true)
  times = result.timestamps
  expect(result.trigger).toBe(false)
  result = updateTantrumWindow(times, 10 * 60_000, true)
  times = result.timestamps
  expect(result.trigger).toBe(false)
  result = updateTantrumWindow(times, 19 * 60_000, true)
  expect(result.trigger).toBe(true)
  expect(result.timestamps).toEqual([])

  const expired = updateTantrumWindow([0], 20 * 60_000 + 1, true)
  expect(expired.trigger).toBe(false)
  expect(expired.timestamps).toEqual([20 * 60_000 + 1])
})
