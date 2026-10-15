import { expect, test } from 'claude-code/testing'

import { canReplaceActivity, iconForTool, isFrustrated, reactionForToolResult } from './activity'

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

test('普通工具错误会触发失误反应，但拒绝调用不会', () => {
  expect(reactionForToolResult('Read', '', { result: 'read failed', isError: true })).toBe('oops')
  expect(reactionForToolResult('Bash', '', { result: { exitCode: 2 } })).toBe('oops')
  expect(reactionForToolResult('Bash', '', { deny: 'blocked', isError: true })).toBe(undefined)
})

test('烦躁识别：匹配常见英文和中文表达', () => {
  expect(['WTF is wrong', 'still not working', '为什么又', '还是不行', '搞什么', '气死'].every(isFrustrated)).toBe(true)
  expect(isFrustrated('Please update the button color')).toBe(false)
})
