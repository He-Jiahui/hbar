import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenOnboarding02, LumenOnboardingProvider } from '@lumen/app-ui'
import { getHbarAppUiVariant } from '../packages/hbar-app-ui/src/index'
import { Onboarding1PreviewHost } from '../apps/hbar-app-ui-preview/src/Onboarding1PreviewHost'
import { createOnboarding1PreviewFixture } from '../apps/hbar-app-ui-preview/src/onboarding1PreviewFixtures'
import { HBAR_APP_UI_ONBOARDING_FIXTURES } from './fixtures/hbar-app-ui-onboarding-fixtures'

function renderFixture(locale: 'en' | 'de' = 'en') {
  const fixture = createOnboarding1PreviewFixture(locale)
  const variant = getHbarAppUiVariant('onboarding', 1)
  const component = createElement(variant.component, {})
  const host = createElement(Onboarding1PreviewHost, {
    content: HBAR_APP_UI_ONBOARDING_FIXTURES,
    spec: variant.spec,
    referenceFixture: fixture,
    onAction: undefined,
    children: component,
  })

  return renderToStaticMarkup(
    createElement(LumenOnboardingProvider, {
      content: HBAR_APP_UI_ONBOARDING_FIXTURES,
      children: host,
    }),
  )
}

describe('Onboarding 1 reference integration', () => {
  test('renders host data through a labelled profile form and directory aside', () => {
    const html = renderFixture()

    expect(html).toContain('data-hbar-app-ui-component="hbar-app-ui-onboarding-1"')
    expect(html).toContain('<form class="lumen-onboarding1-form-pane" aria-label="Set up your profile">')
    expect(html).toContain('<aside class="lumen-onboarding1-preview-pane" aria-label="Directory preview">')
    expect(html).toContain('data-onboarding1-full-name')
    expect(html).toContain('value="Sam Rivera"')
    expect(html).toContain('data-onboarding1-job-title')
    expect(html).toContain('value="Product Engineer"')
    expect(html).toContain('data-onboarding1-timezone')
    expect(html).toContain('value="berlin" selected=""')
    expect(html).toContain('data-onboarding1-product-updates')
    expect(html).toContain('checked=""')
    expect(html).toContain('Directory preview')
    expect(html).toContain('Berlin')
    expect(html).toContain('Subscribed')
    expect(html).not.toContain('Theme')
  })

  test('uses localized host copy and leaves the existing onboarding content available', () => {
    const localizedHtml = renderFixture('de')
    expect(localizedHtml).toContain('Profil einrichten')
    expect(localizedHtml).toContain('Vollständiger Name')
    expect(localizedHtml).toContain('Weiter')

    const parentSteps = HBAR_APP_UI_ONBOARDING_FIXTURES.steps
    if (!parentSteps) throw new Error('Expected existing Onboarding step content.')
    const parentHtml = renderToStaticMarkup(
      createElement(LumenOnboardingProvider, {
        content: HBAR_APP_UI_ONBOARDING_FIXTURES,
        children: createElement(Onboarding1PreviewHost, {
          content: HBAR_APP_UI_ONBOARDING_FIXTURES,
          spec: getHbarAppUiVariant('onboarding', 1).spec,
          referenceFixture: createOnboarding1PreviewFixture(),
          onAction: undefined,
          children: createElement(LumenOnboarding02, {}),
        }),
      }),
    )
    expect(parentHtml).toContain(parentSteps.labels.title)
  })
})
