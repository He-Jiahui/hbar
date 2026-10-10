import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarSessionInterruptionNotice } from '../packages/app-react/src/session-interruption-notice'
import { getShellCopy } from '../apps/web/src/shell-copy'

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`recovered sessions have no interruption notice: ${locale}`, () => {
    expect(
      renderToStaticMarkup(
        <HbarSessionInterruptionNotice
          status={null}
          labels={getShellCopy(locale).session.interruption}
          onOpenStatus={() => {}}
        />,
      ),
    ).toBe('')
  })

  for (const status of ['failed', 'interrupted'] as const)
    test(`an unexpected ${status} end exposes only a status entry: ${locale}`, () => {
      const labels = getShellCopy(locale).session.interruption
      const html = renderToStaticMarkup(
        <HbarSessionInterruptionNotice status={status} labels={labels} onOpenStatus={() => {}} />,
      )
      expect(html).toContain(labels.status[status])
      expect(html).toContain(labels.openStatus)
      expect(html).toContain('role="status"')
      expect(html.match(/<button\b/g)).toHaveLength(1)
      expect(html).not.toContain('hbar-session-run-activity')
      expect(html).not.toContain('hbar-session-run-history')
    })
}
