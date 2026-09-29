import { describe, expect, test } from 'bun:test'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenOnboarding06, LumenOnboardingProvider, useLumenOnboardingContent } from '@lumen/app-ui'
import { getHbarAppUiVariant } from '../packages/hbar-app-ui/src/index'
import { Onboarding6PreviewHost } from '../apps/hbar-app-ui-preview/src/Onboarding6PreviewHost'
import { createOnboarding6PreviewFixture } from '../apps/hbar-app-ui-preview/src/onboarding6PreviewFixtures'
import { HBAR_APP_UI_ONBOARDING_FIXTURES } from './fixtures/hbar-app-ui-onboarding-fixtures'

function ParentContentProbe() {
  const content = useLumenOnboardingContent()
  return createElement('output', { 'data-onboarding6-parent-steps': true }, content?.steps?.labels.title)
}

function renderHost(locale: 'en' | 'de' | 'de-long' = 'en') {
  const fixture = createOnboarding6PreviewFixture(locale)
  const variant = getHbarAppUiVariant('onboarding', 6)
  const host = createElement(Onboarding6PreviewHost, {
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

describe('Onboarding 6 reference integration', () => {
  test('projects four host summary definition pairs, decorative check and two independent requests', () => {
    const html = renderHost()
    expect(html).toContain('data-hbar-app-ui-component="hbar-app-ui-onboarding-6"')
    expect(html).toContain('<h2')
    expect(html).toContain('Your workspace is ready')
    expect(html).toContain('class="lumen-onboarding6-success" aria-hidden="true"')
    expect(html).toContain('<dl')
    expect(html.match(/<dt/g)).toHaveLength(4)
    expect(html.match(/<dd/g)).toHaveLength(4)
    for (const id of ['workspace', 'members-invited', 'starter-template', 'plan'])
      expect(html).toContain(`data-onboarding6-summary-id="${id}"`)
    expect(html).toContain('data-onboarding6-open')
    expect(html).toContain('data-onboarding6-tour')
    expect(html).toContain('<output data-onboarding6-parent-steps="true">Getting started</output>')
  })

  test('keeps German and long values host-owned without dropping summary terms', () => {
    const de = renderHost('de')
    expect(de).toContain('Dein Arbeitsbereich ist bereit')
    expect(de).toContain('Team-Testphase, 14 Tage')
    const long = renderHost('de-long')
    expect(long).toContain('international verteilte Produktteams')
    expect(long.match(/<dt/g)).toHaveLength(4)
  })

  test('retains the generic renderer when no reference content is supplied', () => {
    const html = renderToStaticMarkup(
      createElement(LumenOnboardingProvider, {
        content: HBAR_APP_UI_ONBOARDING_FIXTURES,
        children: createElement(LumenOnboarding06, {}),
      }),
    )
    expect(html).not.toContain('data-onboarding6-summary')
    expect(html).toContain('data-lumen-variant="6"')
  })
})
