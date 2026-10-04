import { describe, expect, test } from 'bun:test'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenOnboarding07, LumenOnboardingProvider, useLumenOnboardingContent } from '@lumen/app-ui'
import { getHbarAppUiVariant } from '../packages/hbar-app-ui/src/index'
import { Onboarding7PreviewHost } from '../apps/hbar-app-ui-preview/src/Onboarding7PreviewHost'
import { createOnboarding7PreviewFixture } from '../apps/hbar-app-ui-preview/src/onboarding7PreviewFixtures'
import { HBAR_APP_UI_ONBOARDING_FIXTURES } from './fixtures/hbar-app-ui-onboarding-fixtures'

function ParentContentProbe() {
  const content = useLumenOnboardingContent()
  return createElement('output', { 'data-onboarding7-parent-steps': true }, content?.steps?.labels.title)
}

function renderHost(locale: 'en' | 'de' | 'de-long' = 'en') {
  const fixture = createOnboarding7PreviewFixture(locale)
  const variant = getHbarAppUiVariant('onboarding', 7)
  const host = createElement(Onboarding7PreviewHost, {
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

describe('Onboarding 7 reference integration', () => {
  test('projects source form semantics, values and private switch without inventing a stepper', () => {
    const html = renderHost()
    expect(html).toContain('<form')
    expect(html).toContain('data-hbar-app-ui-component="hbar-app-ui-onboarding-7"')
    expect(html).toContain('Create your workspace')
    expect(html).toContain('for="hbar-app-ui-onboarding-7-workspace-name"')
    expect(html).toContain('value="Northwind"')
    expect(html).toContain('value="northwind"')
    expect(html).toContain('northwind.app/')
    expect(html).toContain('<select')
    expect(html.match(/<option/g)).toHaveLength(3)
    expect(html).toContain('value="eu-central" selected=""')
    expect(html).toContain('role="switch" aria-label="Private workspace" aria-checked="true"')
    expect(html).toContain('data-onboarding7-back')
    expect(html).toContain('type="submit"')
    expect(html).toContain('<output data-onboarding7-parent-steps="true">Getting started</output>')
    expect(html).not.toContain('<nav')
  })

  test('keeps German and extended labels host-owned with all controls present', () => {
    const de = renderHost('de')
    expect(de).toContain('Erstelle deinen Arbeitsbereich')
    expect(de).toContain('Europa (eu-central)')
    const long = renderHost('de-long')
    expect(long).toContain('international verteilten Teams')
    expect(long).toContain('Mit der Einrichtung des Arbeitsbereichs fortfahren')
    expect(long.match(/<option/g)).toHaveLength(3)
    expect(long).toContain('role="switch"')
  })

  test('retains generic slug renderer without reference content', () => {
    const html = renderToStaticMarkup(
      createElement(LumenOnboardingProvider, {
        content: HBAR_APP_UI_ONBOARDING_FIXTURES,
        children: createElement(LumenOnboarding07, {}),
      }),
    )
    expect(html).not.toContain('data-onboarding7-name')
    expect(html).toContain('data-lumen-variant="7"')
  })
})
