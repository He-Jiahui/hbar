import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarPreSessionApprovalPicker } from '@hbar/app-react'
import { getShellCopy } from '../apps/web/src/shell-copy'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`pre-session approval uses the Host-owned execution vocabulary: ${locale}`, () => {
    const labels = getShellCopy(locale).session.permissionPicker
    const html = renderToStaticMarkup(
      <HbarPreSessionApprovalPicker
        choice="inherit"
        hostDefault="ask"
        sessionLabel={getShellCopy(locale).preSession.hero.title}
        labels={labels}
        onChoose={async () => undefined}
      />,
    )
    expect(html).toContain(labels.trigger(labels.inheritedTrigger(labels.options.ask.label)))
    for (const choice of ['ask', 'deny', 'allow', 'inherit'] as const)
      expect(html).toContain(labels.options[choice].description)
    expect(html).not.toContain(labels.plan.label)
    expect(html).toContain('data-tier="sm"')
    expect(html).toContain('data-tier="md"')
  })
}
