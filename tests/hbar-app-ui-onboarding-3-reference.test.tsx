import { describe, expect, test } from 'bun:test'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenOnboarding03, LumenOnboardingProvider, useLumenOnboardingContent } from '@lumen/app-ui'
import { getHbarAppUiVariant } from '../packages/hbar-app-ui/src/index'
import { Onboarding3PreviewHost } from '../apps/hbar-app-ui-preview/src/Onboarding3PreviewHost'
import { createOnboarding3PreviewFixture } from '../apps/hbar-app-ui-preview/src/onboarding3PreviewFixtures'
import { HBAR_APP_UI_ONBOARDING_FIXTURES } from './fixtures/hbar-app-ui-onboarding-fixtures'

function renderHost(locale: 'en' | 'de' = 'en') {
  const fixture = createOnboarding3PreviewFixture(locale)
  const variant = getHbarAppUiVariant('onboarding', 3)
  const component = createElement(variant.component, {})
  const host = createElement(Onboarding3PreviewHost, {
    content: HBAR_APP_UI_ONBOARDING_FIXTURES,
    spec: variant.spec,
    referenceFixture: fixture,
    onAction: undefined,
    children: createElement(Fragment, null, component, createElement(ParentContentProbe)),
  })

  return renderToStaticMarkup(
    createElement(LumenOnboardingProvider, {
      content: HBAR_APP_UI_ONBOARDING_FIXTURES,
      children: host,
    }),
  )
}

function ParentContentProbe() {
  const content = useLumenOnboardingContent()
  return createElement('output', { 'data-onboarding3-parent-steps': true }, content?.steps?.labels.title)
}

describe('Onboarding 3 reference integration', () => {
  test('routes host-owned checklist copy and progress without replacing parent onboarding content', () => {
    const html = renderHost()

    expect(html).toContain('data-hbar-app-ui-component="hbar-app-ui-onboarding-3"')
    expect(html).toContain('data-lumen-variant="3"')
    expect(html).toContain('data-variant="heading">Get set up</h2>')
    expect(html).toContain('Six things that take about ten minutes and make everything after them easier.')
    expect(html).toContain('role="progressbar" aria-label="Setup progress"')
    expect(html).toContain('2 of 6 done')
    expect(html.match(/data-onboarding3-task-id=/g)).toHaveLength(6)
    expect(html.match(/data-onboarding3-completion/g)).toHaveLength(6)
    expect(html.match(/role="checkbox"/g)).toHaveLength(6)
    expect(html.match(/data-onboarding3-task-action/g)).toHaveLength(6)
    expect(html).toContain('data-onboarding3-task-id="profile"')
    expect(html).toContain('data-onboarding3-task-id="notifications"')
    expect(html).toContain('data-onboarding3-footer')
    expect(html).toContain('<output data-onboarding3-parent-steps="true">Getting started</output>')
  })

  test('localizes task names and accessible checkbox labels while preserving the six-task structure', () => {
    const html = renderHost('de')

    expect(html).toContain('Erste Schritte')
    expect(html).toContain('2 von 6 erledigt')
    expect(html).toContain('aria-label="Als erledigt markieren: Profil vervollständigen"')
    expect(html.match(/data-onboarding3-task-id=/g)).toHaveLength(6)
    expect(html).toContain('<output data-onboarding3-parent-steps="true">Getting started</output>')
  })

  test('keeps the generic checklist renderer when a reference host projection is absent', () => {
    const html = renderToStaticMarkup(
      createElement(LumenOnboardingProvider, {
        content: HBAR_APP_UI_ONBOARDING_FIXTURES,
        children: createElement(LumenOnboarding03, {}),
      }),
    )

    expect(html).not.toContain('data-onboarding3-task-id')
    expect(html).toContain('data-lumen-variant="3"')
  })
})
