import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiPromptInputProvider,
  type HbarAppUiPromptInputContent,
} from '../packages/hbar-app-ui/src/index'
import { HbarAppUiPromptProvider } from '../packages/hbar-app-ui/src/catalog'
import { createPrompt2ReferenceFixture } from './fixtures/hbar-app-ui-prompt-input-2-reference-fixture'
import { createPrompt3ReferenceFixture } from './fixtures/hbar-app-ui-prompt-input-3-reference-fixture'
import { HBAR_APP_UI_PROMPT_INPUT_FIXTURES } from './fixtures/hbar-app-ui-prompt-input-fixtures'

const sourceComposer = {
  value: 'Unused legacy composer',
  labels: HBAR_APP_UI_PROMPT_INPUT_FIXTURES.composerLabels,
  attachments: [],
  submitting: false,
  uploading: false,
  canSubmit: false,
  canStop: false,
  onChange() {},
  onRemoveAttachment() {},
  onSubmit() {},
  onStop() {},
}

function renderReference(
  variant: 2 | 3,
  referenceViewModel: NonNullable<HbarAppUiPromptInputContent['referenceViewModel']>,
) {
  const content: HbarAppUiPromptInputContent = {
    ...HBAR_APP_UI_PROMPT_INPUT_FIXTURES,
    referenceViewModel,
  }
  const component = getHbarAppUiVariant('prompt-input', variant).component
  return renderToStaticMarkup(
    createElement(HbarAppUiPromptInputProvider, {
      content,
      children: createElement(HbarAppUiPromptProvider, {
        content: sourceComposer,
        children: createElement(component, {}),
      }),
    }),
  )
}

describe('prompt input 2–3 practical reference views', () => {
  test('renders the populated tools prompt with host model/search state and fixed source token copy', () => {
    const fixture = createPrompt2ReferenceFixture()
    const html = renderReference(2, { content: fixture })

    expect(html).toContain('data-hbar-app-ui-component="hbar-app-ui-prompt-input-2"')
    expect(html).toContain('Refactor the checkout flow to use the new pricing service.')
    expect(html).toContain('aria-label="Model: Atlas"')
    expect(html).toContain('356 / 8K')
    expect(html).toContain('data-hbar-app-ui-action="search-toggle"')
    expect(html).toContain('>Search</button>')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('aria-label="Send"')
    expect(html).toContain('Responses can be inaccurate: check anything important.')
    expect(html).not.toContain('Prompt box')
    expect(html.match(/Responses can be inaccurate/g)).toHaveLength(1)
  })

  test('keeps the hero composer before all four source suggestions and localizes its content', () => {
    const fixture = createPrompt3ReferenceFixture()
    const html = renderReference(3, { content: fixture })

    expect(html).toContain('<h2>What do you want to build?</h2>')
    expect(html).toContain('Describe it in a sentence and get a working first draft.')
    expect(html.indexOf('<h2>')).toBeLessThan(html.indexOf('<textarea'))
    expect(html.indexOf('<textarea')).toBeLessThan(html.indexOf('data-suggestion-id="landing-page"'))
    expect(html.match(/data-suggestion-id=/g)).toHaveLength(4)
    expect(html).toContain('Landing page')
    expect(html).toContain('Analytics dashboard')
    expect(html).toContain('Storefront')
    expect(html).toContain('Onboarding flow')
    expect(html).toContain('aria-label="Send"')
    expect(html).toMatch(/aria-label="Send"[^>]*disabled/)
    expect(html).not.toContain('Recent prompts')

    const localized = renderReference(3, { content: createPrompt3ReferenceFixture('zh') })
    expect(localized).toContain('你想构建什么？')
    expect(localized).toContain('随便问问')
    expect(localized).not.toContain('What do you want to build?')
  })

  test('preserves controlled host drafts and handles empty, duplicate, stale and over-bound content', () => {
    const tools = createPrompt2ReferenceFixture()
    const projected = renderReference(2, {
      content: {
        ...tools,
        composer: { ...tools.composer!, draft: 'Host-controlled replacement draft' },
        searchEnabled: false,
        modelId: 'stale-model',
        models: [tools.models[0]!, { id: 'atlas', label: 'Duplicate Atlas' }],
      },
    })
    expect(projected).toContain('Host-controlled replacement draft')
    expect(projected).toContain('aria-pressed="false"')
    expect(projected).toContain('aria-label="Model: Atlas"')
    expect(projected).not.toContain('Duplicate Atlas')

    const hero = createPrompt3ReferenceFixture()
    const overflow = renderReference(3, {
      content: {
        ...hero,
        suggestions: [
          ...hero.suggestions,
          { id: 'extra-1', label: 'Host option one', draft: 'One', icon: 'page' },
          { id: 'extra-2', label: 'Host option two', draft: 'Two', icon: 'chart' },
          { id: 'landing-page', label: 'Duplicate', draft: 'Duplicate draft', icon: 'store' },
        ],
      },
    })
    expect(overflow).toContain('Host option one')
    expect(overflow).toContain('Host option two')
    expect(overflow).not.toContain('Duplicate draft')

    const empty = renderReference(3, {
      content: { ...hero, suggestions: [] },
    })
    expect(empty).toContain('data-hbar-app-ui-region="suggestions"')
    expect(empty).not.toContain('data-suggestion-id=')
  })
})
