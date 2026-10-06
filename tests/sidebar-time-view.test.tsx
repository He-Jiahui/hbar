import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenText } from '@lumen/app-ui'
import { SidebarTimeView } from '@hbar/app-react'
import { getShellCopy } from '../apps/web/src/shell-copy'

test('time view keeps project, parent-session and subagent levels in document order', () => {
  const html = renderToStaticMarkup(
    <SidebarTimeView
      groups={[{ id: 'today', sessionIds: ['parent-a', 'parent-b', 'parent-a-child'] }]}
      labels={getShellCopy('zh-CN').shell.sort.time.groups}
      projectExpanded={() => true}
      onProjectExpandedChange={() => {}}
      projectForSession={(sessionId) => ({
        id: sessionId === 'parent-b' ? 'project-b' : 'project-a',
        label: sessionId === 'parent-b' ? '项目 B' : '项目 A',
      })}
      renderProject={(project) => <LumenText>{project.label}</LumenText>}
      renderSession={(sessionId) => <LumenText data-session-id={sessionId}>{sessionId}</LumenText>}
    />,
  )

  expect(html.indexOf('data-sidebar-level="project"')).toBeGreaterThan(-1)
  expect(html.match(/data-sidebar-level="project"/g)).toHaveLength(2)
  expect(html.match(/data-sidebar-level="parent-sessions"/g)).toHaveLength(2)
  expect(html.match(/role="treeitem"/g)).toHaveLength(2)
  expect(html.match(/aria-level="1"/g)).toHaveLength(2)
  expect(html.indexOf('项目 A')).toBeLessThan(html.indexOf('parent-a'))
  expect(html.indexOf('项目 B')).toBeLessThan(html.indexOf('parent-b'))
})
