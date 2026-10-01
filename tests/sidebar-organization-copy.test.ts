import { expect, test } from 'bun:test'
import { workspaceSortCopy } from '../apps/web/src/workspace-sort-copy'
import { getShellCopy } from '../apps/web/src/shell-copy'

test('sidebar organization and time status copy comes from each host locale', () => {
  const en = workspaceSortCopy('en-US')
  const zh = workspaceSortCopy('zh-CN')
  expect(en.organization).toEqual({
    organize: 'Organize sidebar',
    byProject: 'By project',
    recentProjects: 'Recent projects',
    byTime: 'By time',
  })
  expect(zh.organization.byTime).toBe('按时间')
  expect(Object.keys(en.time.groups)).toEqual(['running', 'today', 'yesterday', 'last7Days', 'last30Days', 'earlier'])
  expect(Object.keys(zh.time.groups)).toEqual(Object.keys(en.time.groups))
  expect(en.time.execution.idle).toBe('')
  expect(zh.time.execution.waiting_approval).toBe('等待授权')
  expect(en.time.execution.cancelRequested).toBe('Stopping')
  expect(en.time.showTime).not.toBe(en.time.showProjects)
  expect(zh.updating).toBe('正在更新侧栏…')
  expect(en.updating).toBe('Updating sidebar…')
  expect(getShellCopy('zh-CN').commandPalette.resolve('commands.workspace.sidebar.list.title')).toBe('列出侧栏项目')
  expect(getShellCopy('en-US').commandPalette.resolve('commands.session.activity.global.list.title')).toBe(
    'List cross-project session activity',
  )
})
