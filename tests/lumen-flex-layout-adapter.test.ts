import { expect, test } from 'bun:test'
import { desktopPaneForComponent } from '../packages/app-react/src/lumen-flex-layout-adapter'

test('desktop projection exposes only the three shell pane components', () => {
  const panes = { projects: 'projects', workspace: 'workspace', 'session-tool': 'tool' } as const
  expect(desktopPaneForComponent('sidebar', panes)).toBe('projects')
  expect(desktopPaneForComponent('page', panes)).toBe('workspace')
  expect(desktopPaneForComponent('tool', panes)).toBe('tool')
  expect(desktopPaneForComponent('unknown', panes)).toBeNull()
  expect(desktopPaneForComponent(undefined, panes)).toBeNull()
})
