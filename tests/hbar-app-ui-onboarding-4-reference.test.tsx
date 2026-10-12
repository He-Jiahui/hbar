import { describe, expect, test } from 'bun:test'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenOnboarding04, LumenOnboardingProvider, useLumenOnboardingContent } from '@lumen/app-ui/catalog'
import { getHbarAppUiVariant } from '../packages/hbar-app-ui/src/index'
import { Onboarding4PreviewHost } from '../apps/hbar-app-ui-preview/src/Onboarding4PreviewHost'
import { createOnboarding4PreviewFixture } from '../apps/hbar-app-ui-preview/src/onboarding4PreviewFixtures'
import { HBAR_APP_UI_ONBOARDING_FIXTURES } from './fixtures/hbar-app-ui-onboarding-fixtures'

function renderHost(locale: 'en' | 'de' = 'en') {
  const fixture = createOnboarding4PreviewFixture(locale)
  const variant = getHbarAppUiVariant('onboarding', 4)
  const component = createElement(variant.component, {})
  const host = createElement(Onboarding4PreviewHost, {
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
  return createElement('output', { 'data-onboarding4-parent-steps': true }, content?.steps?.labels.title)
}

describe('Onboarding 4 reference integration', () => {
  test('projects all six use cases and four sizes while preserving parent onboarding content', () => {
    const html = renderHost()

    expect(html).toContain('data-hbar-app-ui-component="hbar-app-ui-onboarding-4"')
    expect(html).toContain('data-lumen-variant="4"')
    expect(html).toContain('Step 2 of 4')
    expect(html).toContain('What will you use this for first?')
    expect(html).toContain('role="radiogroup" aria-label="Primary use case"')
    expect(html.match(/role="radio"/g)).toHaveLength(6)
    expect(html.match(/data-onboarding4-team-size=/g)).toHaveLength(4)
    expect(html).toContain('data-onboarding4-use-case-id="run-sprints"')
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('data-onboarding4-team-size="2-10"')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('data-onboarding4-back')
    expect(html).toContain('data-onboarding4-continue')
    expect(html).toContain('<output data-onboarding4-parent-steps="true">Getting started</output>')
  })

  test('localizes use-case cards and team sizes without changing the choice contract', () => {
    const html = renderHost('de')

    expect(html).toContain('Schritt 2 von 4')
    expect(html).toContain('Wofür möchten Sie den Arbeitsbereich zuerst nutzen?')
    expect(html).toContain('Sprints durchführen')
    expect(html).toContain('Nur ich')
    expect(html.match(/role="radio"/g)).toHaveLength(6)
    expect(html.match(/data-onboarding4-team-size=/g)).toHaveLength(4)
    expect(html).toContain('<output data-onboarding4-parent-steps="true">Getting started</output>')
  })

  test('keeps the generic onboarding renderer when no reference projection is supplied', () => {
    const html = renderToStaticMarkup(
      createElement(LumenOnboardingProvider, {
        content: HBAR_APP_UI_ONBOARDING_FIXTURES,
        children: createElement(LumenOnboarding04, {}),
      }),
    )

    expect(html).not.toContain('data-onboarding4-use-case-list')
    expect(html).toContain('data-lumen-variant="4"')
  })
})
