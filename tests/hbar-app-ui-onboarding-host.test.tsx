import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useLumenOnboardingContent } from '@lumen/app-ui/catalog'
import { getHbarAppUiVariant } from '../packages/hbar-app-ui/src/index'
import { Onboarding1PreviewHost } from '../apps/hbar-app-ui-preview/src/Onboarding1PreviewHost'
import { Onboarding2PreviewHost } from '../apps/hbar-app-ui-preview/src/Onboarding2PreviewHost'
import { Onboarding3PreviewHost } from '../apps/hbar-app-ui-preview/src/Onboarding3PreviewHost'
import { Onboarding4PreviewHost } from '../apps/hbar-app-ui-preview/src/Onboarding4PreviewHost'
import { Onboarding5PreviewHost } from '../apps/hbar-app-ui-preview/src/Onboarding5PreviewHost'
import { Onboarding6PreviewHost } from '../apps/hbar-app-ui-preview/src/Onboarding6PreviewHost'
import { Onboarding7PreviewHost } from '../apps/hbar-app-ui-preview/src/Onboarding7PreviewHost'
import { createOnboarding1PreviewFixture } from '../apps/hbar-app-ui-preview/src/onboarding1PreviewFixtures'
import { createOnboarding2PreviewFixture } from '../apps/hbar-app-ui-preview/src/onboarding2PreviewFixtures'
import { createOnboarding3PreviewFixture } from '../apps/hbar-app-ui-preview/src/onboarding3PreviewFixtures'
import { createOnboarding4PreviewFixture } from '../apps/hbar-app-ui-preview/src/onboarding4PreviewFixtures'
import { createOnboarding5PreviewFixture } from '../apps/hbar-app-ui-preview/src/onboarding5PreviewFixtures'
import { createOnboarding6PreviewFixture } from '../apps/hbar-app-ui-preview/src/onboarding6PreviewFixtures'
import { createOnboarding7PreviewFixture } from '../apps/hbar-app-ui-preview/src/onboarding7PreviewFixtures'
import { HBAR_APP_UI_ONBOARDING_FIXTURES as input } from './fixtures/hbar-app-ui-onboarding-fixtures'

function ContentKeys() {
  return createElement('span', null, Object.keys(useLumenOnboardingContent() ?? {}).join(','))
}

function trapFixture<T extends object>(fixture: T, label: string): T {
  return new Proxy(fixture, {
    get(_target, property) {
      throw new Error(`${label} fixture was read through ${String(property)}`)
    },
  })
}

describe('active Onboarding preview owners', () => {
  test('only the active rich contract is added to the host content', () => {
    const keys = [
      'profile,steps,checklist,useCase,invite,complete,slug,profileReference',
      'profile,steps,checklist,useCase,invite,complete,slug,stepperReference',
      'profile,steps,checklist,useCase,invite,complete,slug,checklistReference',
      'profile,steps,checklist,useCase,invite,complete,slug,useCaseReference',
      'profile,steps,checklist,useCase,invite,complete,slug,invitationReference',
      'profile,steps,checklist,useCase,invite,complete,slug,completionReference',
      'profile,steps,checklist,useCase,invite,complete,slug,workspaceReference',
    ]
    const html = [
      renderToStaticMarkup(
        createElement(Onboarding1PreviewHost, {
          spec: getHbarAppUiVariant('onboarding', 1).spec,
          content: input,
          referenceFixture: createOnboarding1PreviewFixture(),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(Onboarding2PreviewHost, {
          spec: getHbarAppUiVariant('onboarding', 2).spec,
          content: input,
          referenceFixture: createOnboarding2PreviewFixture(),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(Onboarding3PreviewHost, {
          spec: getHbarAppUiVariant('onboarding', 3).spec,
          content: input,
          referenceFixture: createOnboarding3PreviewFixture(),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(Onboarding4PreviewHost, {
          spec: getHbarAppUiVariant('onboarding', 4).spec,
          content: input,
          referenceFixture: createOnboarding4PreviewFixture(),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(Onboarding5PreviewHost, {
          spec: getHbarAppUiVariant('onboarding', 5).spec,
          content: input,
          referenceFixture: createOnboarding5PreviewFixture(),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(Onboarding6PreviewHost, {
          spec: getHbarAppUiVariant('onboarding', 6).spec,
          content: input,
          referenceFixture: createOnboarding6PreviewFixture(),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(Onboarding7PreviewHost, {
          spec: getHbarAppUiVariant('onboarding', 7).spec,
          content: input,
          referenceFixture: createOnboarding7PreviewFixture(),
          children: createElement(ContentKeys),
        }),
      ),
    ]
    expect(html).toEqual(keys.map((value) => `<span>${value}</span>`))
  })

  test('bypasses the owner for an unrelated category without initializing a provider', () => {
    const html = renderToStaticMarkup(
      createElement(Onboarding1PreviewHost, {
        spec: getHbarAppUiVariant('editor', 1).spec,
        content: input,
        referenceFixture: createOnboarding1PreviewFixture(),
        children: createElement(ContentKeys),
      }),
    )
    expect(html).toBe('<span></span>')
  })

  test('does not read an inactive owner fixture', () => {
    const html = [
      renderToStaticMarkup(
        createElement(Onboarding1PreviewHost, {
          spec: getHbarAppUiVariant('onboarding', 2).spec,
          content: input,
          referenceFixture: trapFixture(createOnboarding1PreviewFixture(), 'onboarding-1'),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(Onboarding2PreviewHost, {
          spec: getHbarAppUiVariant('onboarding', 3).spec,
          content: input,
          referenceFixture: trapFixture(createOnboarding2PreviewFixture(), 'onboarding-2'),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(Onboarding3PreviewHost, {
          spec: getHbarAppUiVariant('onboarding', 4).spec,
          content: input,
          referenceFixture: trapFixture(createOnboarding3PreviewFixture(), 'onboarding-3'),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(Onboarding4PreviewHost, {
          spec: getHbarAppUiVariant('onboarding', 5).spec,
          content: input,
          referenceFixture: trapFixture(createOnboarding4PreviewFixture(), 'onboarding-4'),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(Onboarding5PreviewHost, {
          spec: getHbarAppUiVariant('onboarding', 6).spec,
          content: input,
          referenceFixture: trapFixture(createOnboarding5PreviewFixture(), 'onboarding-5'),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(Onboarding6PreviewHost, {
          spec: getHbarAppUiVariant('onboarding', 7).spec,
          content: input,
          referenceFixture: trapFixture(createOnboarding6PreviewFixture(), 'onboarding-6'),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(Onboarding7PreviewHost, {
          spec: getHbarAppUiVariant('onboarding', 1).spec,
          content: input,
          referenceFixture: trapFixture(createOnboarding7PreviewFixture(), 'onboarding-7'),
          children: createElement(ContentKeys),
        }),
      ),
    ]
    expect(html).toEqual(Array.from({ length: 7 }, () => '<span></span>'))
  })
})
