import { describe, expect, test } from 'bun:test'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenOnboarding05, LumenOnboardingProvider, useLumenOnboardingContent } from '@lumen/app-ui/catalog'
import { getHbarAppUiVariant } from '../packages/hbar-app-ui/src/index'
import { Onboarding5PreviewHost } from '../apps/hbar-app-ui-preview/src/Onboarding5PreviewHost'
import { createOnboarding5PreviewFixture } from '../apps/hbar-app-ui-preview/src/onboarding5PreviewFixtures'
import { HBAR_APP_UI_ONBOARDING_FIXTURES } from './fixtures/hbar-app-ui-onboarding-fixtures'

function ParentContentProbe() {
  const content = useLumenOnboardingContent()
  return createElement('output', { 'data-onboarding5-parent-steps': true }, content?.steps?.labels.title)
}

function renderHost(locale: 'en' | 'de' | 'de-long' = 'en') {
  const fixture = createOnboarding5PreviewFixture(locale)
  const variant = getHbarAppUiVariant('onboarding', 5)
  const host = createElement(Onboarding5PreviewHost, {
    content: HBAR_APP_UI_ONBOARDING_FIXTURES,
    spec: variant.spec,
    referenceFixture: fixture,
    onAction: undefined,
    children: createElement(Fragment, null, createElement(variant.component, {}), createElement(ParentContentProbe)),
  })
  return renderToStaticMarkup(
    createElement(LumenOnboardingProvider, { content: HBAR_APP_UI_ONBOARDING_FIXTURES, children: host }),
  )
}

describe('Onboarding 5 reference integration', () => {
  test('projects source-shaped invite link, two per-ID rows and independent actions', () => {
    const html = renderHost()
    expect(html).toContain('data-hbar-app-ui-component="hbar-app-ui-onboarding-5"')
    expect(html).toContain('<h2')
    expect(html).toContain('Invite your team')
    expect(html).toContain('northwind.app/join/9f2c-41ab')
    expect(html).toContain('data-onboarding5-invitation-id="invite-priya"')
    expect(html).toContain('data-onboarding5-invitation-id="invite-empty"')
    expect(html.match(/type="email"/g)).toHaveLength(2)
    expect(html.match(/<select/g)).toHaveLength(2)
    expect(html.match(/data-onboarding5-remove=/g)).toHaveLength(2)
    for (const action of ['copy', 'add', 'skip', 'send']) expect(html).toContain(`data-onboarding5-${action}`)
    expect(html).toContain('<output data-onboarding5-parent-steps="true">Getting started</output>')
  })

  test('keeps localized and long host copy rather than embedding source strings in the renderer', () => {
    const de = renderHost('de')
    expect(de).toContain('Team einladen')
    expect(de).toContain('Weitere hinzufügen')
    expect(de).not.toContain('Invite your team')
    const long = renderHost('de-long')
    expect(long).toContain('Laden Sie alle Personen ein')
    expect(long).toContain('Arbeitsbereichsadministratorin oder -administrator')
  })

  test('retains generic renderer outside the source-specific host projection', () => {
    const html = renderToStaticMarkup(
      createElement(LumenOnboardingProvider, {
        content: HBAR_APP_UI_ONBOARDING_FIXTURES,
        children: createElement(LumenOnboarding05, {}),
      }),
    )
    expect(html).not.toContain('data-onboarding5-invitation-list')
    expect(html).toContain('data-lumen-variant="5"')
  })
})
