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
        planMode="default"
        planAvailable
        hostDefault="ask"
        sessionLabel={getShellCopy(locale).preSession.hero.title}
        labels={labels}
        onChoose={async () => undefined}
        onPlanMode={async () => undefined}
      />,
    )
    expect(html).toContain(labels.trigger(labels.inheritedTrigger(labels.options.ask.label)))
    expect(html).toContain(labels.inheritedTrigger(labels.options.ask.label))
    expect(html).toContain('data-text-context="control.label"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('role="dialog"')
    expect(html).not.toContain('role="menuitemradio"')
    expect(html).toContain('data-tier="sm"')
  })

  test(`pre-session Plan remains a separate, localized execution mode: ${locale}`, () => {
    const labels = getShellCopy(locale).session.permissionPicker
    const html = renderToStaticMarkup(
      <HbarPreSessionApprovalPicker
        choice="ask"
        planMode="plan"
        planAvailable
        hostDefault="ask"
        sessionLabel={getShellCopy(locale).preSession.hero.title}
        labels={labels}
        onChoose={async () => undefined}
        onPlanMode={async () => undefined}
      />,
    )
    expect(html).toContain(labels.trigger(labels.plan.label))
    expect(html).toContain('data-text-context="control.label"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('role="dialog"')
    expect(html).toContain('data-choice="plan"')
  })

  test(`pre-session menu does not advertise unsupported Host Plan mode: ${locale}`, () => {
    const labels = getShellCopy(locale).session.permissionPicker
    const html = renderToStaticMarkup(
      <HbarPreSessionApprovalPicker
        choice="inherit"
        planMode="default"
        planAvailable={false}
        hostDefault={null}
        sessionLabel={getShellCopy(locale).preSession.hero.title}
        labels={labels}
        onChoose={async () => undefined}
        onPlanMode={async () => undefined}
      />,
    )
    expect(html).not.toContain(labels.plan.label)
    expect(html).toContain(labels.options.inherit.label)
  })
}
