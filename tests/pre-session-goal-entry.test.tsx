import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarComposerAddMenu, HbarPreSessionApprovalPicker } from '@hbar/app-react'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { preSessionCopy } from '../apps/web/src/pre-session-copy'

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

  test(`Plan conflict is explained in the no-tab Goal menu: ${locale}`, () => {
    const copy = getShellCopy(locale)
    const blocked = preSessionCopy(locale).goalPlanConflict
    const html = renderToStaticMarkup(
      <HbarComposerAddMenu
        labels={copy.session.addMenu}
        canAddFiles={false}
        canOpenSlash={false}
        showSlash={false}
        onOpenSlash={() => undefined}
        goalAction={{
          label: copy.session.intent.goalMenu,
          disabled: true,
          disabledHint: blocked,
          onChoose: () => undefined,
        }}
      />,
    )
    expect(html).toContain(blocked)
    expect(html).toContain('disabled=""')
  })

  test(`prepared Goal explains why no-tab Plan is unavailable: ${locale}`, () => {
    const copy = getShellCopy(locale)
    const blocked = preSessionCopy(locale).planGoalConflict
    const html = renderToStaticMarkup(
      <HbarPreSessionApprovalPicker
        choice="inherit"
        planMode="default"
        planAvailable
        planBlockedReason={blocked}
        hostDefault={null}
        sessionLabel={copy.preSession.hero.title}
        labels={copy.session.permissionPicker}
        onChoose={async () => undefined}
        onPlanMode={async () => undefined}
      />,
    )
    expect(html).toContain(blocked)
    expect(html).toMatch(/data-choice="plan"[^>]*disabled=""/)
  })
}
