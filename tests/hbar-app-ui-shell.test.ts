import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarAppUiNavigation, HbarAppUiWorkbenchShell } from '../packages/hbar-app-ui/src/production'
import { SHELL_FIXTURE } from './fixtures/hbar-app-ui-shell-fixtures'
import { getWorkbenchCopy } from '../apps/web/src/app-ui-locale'

describe('host-owned application shell', () => {
  test('uses host copy and preserves an explicitly missing workspace selection', () => {
    const labels = getWorkbenchCopy('en-US').shell
    const markup = renderToStaticMarkup(
      createElement(HbarAppUiWorkbenchShell, {
        ...SHELL_FIXTURE,
        labels: { ...labels, workspace: 'A deliberately long translated workspace selector' },
        workspaceId: 'removed',
        sidebarOpen: true,
        children: null,
        onToggleSidebar() {},
        onWorkspaceChange() {},
        onAddWorkspace() {},
        onOpenCommands() {},
      }),
    )
    expect(markup).toContain('A deliberately long translated workspace selector')
    expect(markup).toContain('value="" disabled="" selected=""')
    expect(markup).not.toContain('value="atlas" selected')
    expect(markup).toContain('Open command palette')
  })

  test('navigation renders empty, single and duplicate records without invented selection', () => {
    const render = (items: typeof SHELL_FIXTURE.navigation) =>
      renderToStaticMarkup(createElement(HbarAppUiNavigation, { items, label: 'Navigation', onSelect() {} }))
    expect(render([])).not.toContain('<button')
    const first = SHELL_FIXTURE.navigation[0]!
    const markup = render([first, { ...first, label: 'Updated session label' }])
    expect(markup.match(/<button/g)).toHaveLength(1)
    expect(markup).toContain('Updated session label')
    expect(markup).not.toContain('aria-current')
    expect(render(SHELL_FIXTURE.navigation).match(/<button/g)).toHaveLength(4)
  })
})
