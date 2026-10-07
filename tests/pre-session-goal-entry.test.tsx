import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarComposerAddMenu, HbarPreSessionApprovalPicker } from '@hbar/app-react'
import { getShellCopy } from '../apps/web/src/shell-copy'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`no-tab add menu offers only the supported localized Goal action: ${locale}`, () => {
    const copy = getShellCopy(locale)
    const html = renderToStaticMarkup(
      <HbarComposerAddMenu
        labels={copy.session.addMenu}
        canAddFiles={false}
        canOpenSlash={false}
        showSlash={false}
        onOpenSlash={() => undefined}
        goalAction={{ label: copy.session.intent.goalMenu, onChoose: () => undefined }}
      />,
    )
    expect(html).toContain(copy.session.addMenu.open)
    expect(html).toContain(copy.session.intent.goalMenu)
    expect(html).not.toContain(copy.session.addMenu.files)
    expect(html).not.toContain(copy.session.addMenu.slash)
    expect(html).toContain('data-tier="md"')
    expect(html).toContain('data-tier="sm"')
  })

  test(`existing session add menu still includes its slash and Goal slot: ${locale}`, () => {
    const copy = getShellCopy(locale)
    const html = renderToStaticMarkup(
      <HbarComposerAddMenu
        labels={copy.session.addMenu}
        canAddFiles={false}
        canOpenSlash
        onOpenSlash={() => undefined}
        goalSlotRef={() => undefined}
      />,
    )
    expect(html).toContain(copy.session.addMenu.slash)
    expect(html).toContain('hbar-composer-add-goal-slot')
  })

  test(`no-tab Goal menu keeps its independent action in Plan setup: ${locale}`, () => {
    const copy = getShellCopy(locale)
    const goalLabel = copy.session.intent.goalMenu
    const html = renderToStaticMarkup(
      <HbarComposerAddMenu
        labels={copy.session.addMenu}
        canAddFiles={false}
        canOpenSlash={false}
        showSlash={false}
        onOpenSlash={() => undefined}
        goalAction={{
          label: goalLabel,
          onChoose: () => undefined,
        }}
      />,
    )
    expect(html).toContain(goalLabel)
    expect(html).not.toMatch(/class="hbar-composer-add-item hbar-composer-add-goal"[^>]*disabled=""/)
  })

  test(`prepared Goal keeps the localized no-tab execution trigger available: ${locale}`, () => {
    const copy = getShellCopy(locale)
    const html = renderToStaticMarkup(
      <HbarPreSessionApprovalPicker
        choice="inherit"
        planMode="default"
        planAvailable
        hostDefault={null}
        sessionLabel={copy.preSession.hero.title}
        labels={copy.session.permissionPicker}
        onChoose={async () => undefined}
        onPlanMode={async () => undefined}
      />,
    )
    expect(html).toContain(copy.session.permissionPicker.trigger(copy.session.permissionPicker.options.inherit.label))
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('disabled=""')
    expect(html).not.toContain('role="dialog"')
  })
}
