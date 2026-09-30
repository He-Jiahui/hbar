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

  test(`no-tab Goal menu describes the explicit replacement of Plan setup: ${locale}`, () => {
    const copy = getShellCopy(locale)
    const replacement = preSessionCopy(locale).goalReplacesPlan
    const html = renderToStaticMarkup(
      <HbarComposerAddMenu
        labels={copy.session.addMenu}
        canAddFiles={false}
        canOpenSlash={false}
        showSlash={false}
        onOpenSlash={() => undefined}
        goalAction={{
          label: replacement,
          onChoose: () => undefined,
        }}
      />,
    )
    expect(html).toContain(replacement)
    expect(html).not.toMatch(/class="hbar-composer-add-item hbar-composer-add-goal"[^>]*disabled=""/)
  })

  test(`prepared Goal keeps no-tab Plan available and explains the replacement: ${locale}`, () => {
    const copy = getShellCopy(locale)
    const replacement = preSessionCopy(locale).planReplacesGoal
    const html = renderToStaticMarkup(
      <HbarPreSessionApprovalPicker
        choice="inherit"
        planMode="default"
        planAvailable
        hostDefault={null}
        sessionLabel={copy.preSession.hero.title}
        labels={{
          ...copy.session.permissionPicker,
          plan: { ...copy.session.permissionPicker.plan, description: replacement },
        }}
        onChoose={async () => undefined}
        onPlanMode={async () => undefined}
      />,
    )
    expect(html).toContain(replacement)
    expect(html).not.toMatch(/data-choice="plan"[^>]*disabled=""/)
  })
}
