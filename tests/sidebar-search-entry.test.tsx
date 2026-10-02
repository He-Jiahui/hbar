import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { SidebarSearchEntry } from '../packages/app-react/src/sidebar-search-entry'
import { getShellCopy } from '../apps/web/src/shell-copy'

test('the independent Search trigger renders host copy, shortcut and dialog state without nested controls', () => {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const copy = getShellCopy(locale).shell
    for (const open of [false, true]) {
      const label = locale === 'zh-CN' ? `${copy.searchChats}并定位工程中的完整会话历史` : copy.searchChats
      const html = renderToStaticMarkup(
        <SidebarSearchEntry label={label} shortcut={copy.searchShortcut} open={open} onOpen={() => {}} />,
      )
      expect(html).toContain(label)
      expect(html).toContain(copy.searchShortcut)
      expect(html).toContain('aria-haspopup="dialog"')
      expect(html).toContain(`aria-expanded="${open}"`)
      expect(html).toContain('data-lumen-indicator="none"')
      expect(html.match(/<button/g)).toHaveLength(1)
      expect(html).toMatch(/<kbd\b[^>]*aria-hidden="true"[^>]*>/)
    }
  }
})
