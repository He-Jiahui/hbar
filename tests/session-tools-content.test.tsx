import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarSessionToolsMenu, type SessionSecondaryTool } from '../packages/app-react/src/session-tools-menu'
import { getShellCopy } from '../apps/web/src/shell-copy'

test('four fixed tool actions retain complete host names and their distinct selected IDs', () => {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const copy = getShellCopy(locale).session.tools
    const labels = {
      ...copy,
      goals: copy.goals.repeat(8),
      agents: copy.agents.repeat(8),
      monitoring: copy.monitoring.repeat(8),
      settings: copy.settings.repeat(8),
    }
    for (const selected of [null, 'goals', 'agents', 'monitoring'] satisfies readonly (SessionSecondaryTool | null)[]) {
      const html = renderToStaticMarkup(
        <HbarSessionToolsMenu
          labels={labels}
          selected={selected}
          disabled={false}
          onToggleTool={() => {}}
          onSettings={() => {}}
        />,
      )
      expect(html.match(/role="menuitemcheckbox"/g)).toHaveLength(3)
      expect(html.match(/role="menuitem"/g)).toHaveLength(1)
      expect(html.match(/data-text-context="collection.title"/g)).toHaveLength(4)
      expect(html.match(/aria-checked="true"/g)?.length ?? 0).toBe(selected === null ? 0 : 1)
      for (const id of ['goals', 'agents', 'monitoring', 'settings'] as const) expect(html).toContain(labels[id])
      expect(html).toContain('data-text-context="control.label"')
      expect(html).toContain('aria-expanded="false"')
      expect(html).not.toContain('popover="auto"')
      expect(html).not.toContain('session-tools-menu-left')
    }
  }
})

test('disabled tool navigation keeps its original labels and does not invent an active choice', () => {
  const labels = getShellCopy('zh-CN').session.tools
  const html = renderToStaticMarkup(
    <HbarSessionToolsMenu labels={labels} selected={null} disabled onToggleTool={() => {}} onSettings={() => {}} />,
  )
  expect(html.match(/disabled=""/g)).toHaveLength(5)
  expect(html).toContain('data-selected="false"')
  expect(html).not.toContain('aria-checked="true"')
})
