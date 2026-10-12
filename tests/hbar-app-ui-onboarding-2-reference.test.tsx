import { describe, expect, test } from 'bun:test'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenOnboarding02, LumenOnboardingProvider, LumenOnboarding2Reference, useLumenOnboardingContent } from '@lumen/app-ui/catalog'
import { getHbarAppUiVariant } from '../packages/hbar-app-ui/src/index'
import { Onboarding2PreviewHost } from '../apps/hbar-app-ui-preview/src/Onboarding2PreviewHost'
import { createOnboarding2PreviewFixture } from '../apps/hbar-app-ui-preview/src/onboarding2PreviewFixtures'
import { createOnboarding2PreviewStore } from '../apps/hbar-app-ui-preview/src/onboarding2PreviewStore'
import { HBAR_APP_UI_ONBOARDING_FIXTURES } from './fixtures/hbar-app-ui-onboarding-fixtures'

function renderHost(locale: 'en' | 'de' = 'en') {
  const fixture = createOnboarding2PreviewFixture(locale)
  const variant = getHbarAppUiVariant('onboarding', 2)
  const component = createElement(variant.component, {})
  const host = createElement(Onboarding2PreviewHost, {
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
  return createElement('output', { 'data-onboarding2-parent-steps': true }, content?.steps?.labels.title)
}

function renderRoleReference() {
  const fixture = createOnboarding2PreviewFixture()
  const store = createOnboarding2PreviewStore(fixture.seed)
  store.getState().continueProfile()

  return renderToStaticMarkup(
    createElement(LumenOnboarding2Reference, {
      variantId: 'hbar-app-ui-onboarding-2',
      viewModel: {
        content: fixture.contentFor(store.getState()),
        onProfileFieldChange: () => undefined,
        onContinueProfile: () => undefined,
        onStepNavigationRequest: () => undefined,
        onBackRequest: () => undefined,
        onRoleSelectionRequest: () => undefined,
        onContinueRoleRequest: () => undefined,
      },
    }),
  )
}

describe('Onboarding 2 reference integration', () => {
  test('routes the host-owned Profile draft through the six-step view and preserves parent content', () => {
    const html = renderHost()

    expect(html).toContain('data-hbar-app-ui-component="hbar-app-ui-onboarding-2"')
    expect(html).toContain('data-onboarding2-step="profile"')
    expect(html).toContain('data-onboarding2-step-list')
    expect(html.match(/data-onboarding2-step-id=/g)).toHaveLength(6)
    expect(html).toContain('Step 1 of 6')
    expect(html).toContain('Set up your profile')
    expect(html).toContain('data-onboarding2-field="full-name"')
    expect(html).toContain('value="Sam Rivera"')
    expect(html).toContain('data-onboarding2-field="job-title"')
    expect(html).toContain('value="Product Lead"')
    expect(html).toContain('data-onboarding2-continue-profile')
    expect(html).toContain('<output data-onboarding2-parent-steps="true">Getting started</output>')
  })

  test('keeps parent English onboarding while projecting localized stepper copy', () => {
    const html = renderHost('de')

    expect(html).toContain('Schritt 1 von 6')
    expect(html).toContain('Richten Sie Ihr Profil ein')
    expect(html).toContain('Weiter')
    expect(html).toContain('<output data-onboarding2-parent-steps="true">Getting started</output>')
  })

  test('renders only the evidenced Role page transition and keeps Product checked', () => {
    const html = renderRoleReference()

    expect(html).toContain('data-onboarding2-step="role"')
    expect(html).toContain('Step 2 of 6')
    expect(html).toContain('What do you work on?')
    expect(html).toContain('role="radiogroup" aria-label="Role"')
    expect(html.match(/role="radio"/g)).toHaveLength(4)
    expect(html).toContain('data-onboarding2-role="product"')
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('data-onboarding2-back')
    expect(html).toContain('data-onboarding2-continue-role')
  })

  test('retains the generic onboarding variant when no reference host projection is provided', () => {
    const html = renderToStaticMarkup(
      createElement(LumenOnboardingProvider, {
        content: HBAR_APP_UI_ONBOARDING_FIXTURES,
        children: createElement(LumenOnboarding02, {}),
      }),
    )

    expect(html).not.toContain('data-onboarding2-step-list')
    expect(html).toContain('data-lumen-variant="2"')
  })
})
