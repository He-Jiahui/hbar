import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiPromptInputProvider,
  type HbarAppUiPromptInputContent,
} from '../packages/hbar-app-ui/src/index'
import type { LumenPromptReferenceContent } from '@lumen/app-ui'
import { HbarAppUiPromptProvider } from '../packages/hbar-app-ui/src/catalog'
import { HBAR_APP_UI_PROMPT_INPUT_FIXTURES } from './fixtures/hbar-app-ui-prompt-input-fixtures'
import { createPrompt6ReferenceFixture } from './fixtures/hbar-app-ui-prompt-input-6-reference-fixture'
import { createPrompt7ReferenceFixture } from './fixtures/hbar-app-ui-prompt-input-7-reference-fixture'

const compatibilityComposer = {
  value: '',
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

function renderReference(variant: 6 | 7, content: LumenPromptReferenceContent) {
  const promptContent: HbarAppUiPromptInputContent = {
    ...HBAR_APP_UI_PROMPT_INPUT_FIXTURES,
    referenceViewModel: { content },
  }
  return renderToStaticMarkup(
    createElement(HbarAppUiPromptInputProvider, {
      content: promptContent,
      children: createElement(HbarAppUiPromptProvider, {
        content: compatibilityComposer,
        children: createElement(getHbarAppUiVariant('prompt-input', variant).component, {}),
      }),
    }),
  )
}

function count(markup: string, fragment: string) {
  return markup.split(fragment).length - 1
}

describe('hbar-app-ui prompt input reference variants 6–7', () => {
  test('renders selected context as Host-owned removable chips and an accessible source combobox', () => {
    const content = createPrompt6ReferenceFixture()
    const markup = renderReference(6, content)
    expect(markup).toContain('auth-service.ts')
    expect(markup).toContain('billing')
    expect(markup).toContain('Dana Whitfield')
    expect(count(markup, 'class="lumen-prompt-scope-chip"')).toBe(3)
    expect(count(markup, 'data-hbar-app-ui-action="remove-source"')).toBe(3)
    expect(markup).toContain('role="combobox"')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain('aria-autocomplete="list"')
    expect(markup).toContain('Add context')
    expect(markup).toContain('Type @ to pull a file, person, or channel into context.')
    expect(markup).toContain('aria-label="Send"')
    expect(markup).toContain('disabled=""')
  })

  test('preserves overflow host selections and handles empty and duplicate source data explicitly', () => {
    const fixture = createPrompt6ReferenceFixture()
    const overCapacity = renderReference(6, {
      ...fixture,
      selectedSourceIds: [...fixture.sources.map((source) => source.id), 'dana-whitfield'],
    })
    expect(count(overCapacity, 'class="lumen-prompt-scope-chip"')).toBe(7)
    expect(overCapacity).toMatch(/<button[^>]*disabled=""[^>]*data-hbar-app-ui-action="open-context-picker"/)

    const empty = renderReference(6, { ...fixture, sources: [], selectedSourceIds: [] })
    expect(empty).not.toContain('class="lumen-prompt-scope-chip"')
    expect(empty).toContain('Add context')

    const duplicates = renderReference(6, {
      ...fixture,
      sources: [...fixture.sources, fixture.sources[0]!, { id: '', label: 'Blank' }],
      selectedSourceIds: ['auth-service', 'auth-service', 'billing-channel', 'dana-whitfield'],
    })
    expect(count(duplicates, 'class="lumen-prompt-scope-chip"')).toBe(3)
  })

  test('keeps mode, environment, and model state Host-controlled with mode-specific copy and keyboard hints', () => {
    const content = createPrompt7ReferenceFixture()
    if (!content.composer) {
      throw new Error('The Prompt 7 fixture must include its composer.')
    }
    const markup = renderReference(7, content)
    expect(count(markup, 'data-hbar-app-ui-action="mode-select"')).toBe(3)
    expect(markup).toContain('aria-pressed="true" data-mode-id="agent"')
    expect(markup).toContain('Plan and run tools to work through the task end to end.')
    expect(markup).toContain('Environment: Local')
    expect(markup).toContain('Model: Atlas')
    expect(markup).toContain('Enter')
    expect(markup).toContain('to send')
    expect(markup).toContain('Shift Enter')
    expect(markup).toContain('for a new line')
    expect(markup).toContain('aria-label="Send"')
    expect(markup).toContain('disabled=""')

    const changed = renderReference(7, {
      ...content,
      modeId: 'edit',
      environmentId: 'remote',
      modelId: 'quill',
      composer: { ...content.composer, draft: 'Refactor the segment title' },
    })
    expect(changed).toContain('aria-pressed="true" data-mode-id="edit"')
    expect(changed).toContain('Propose focused changes to the current segment.')
    expect(changed).toContain('Environment: Remote')
    expect(changed).toContain('Model: Quill')
    expect(changed).not.toContain('aria-label="Send" title="Send" disabled=""')
  })

  test('localizes controls and recovers stale or duplicate mode selections without dropping content', () => {
    const localized = renderReference(7, createPrompt7ReferenceFixture('zh'))
    expect(localized).toContain('请在此处描述你希望助手协助完成的任务')
    expect(localized).toContain('代理')
    expect(localized).toContain('规划并运行工具，逐步完成整个任务。')
    expect(localized).toContain('换行')
    expect(localized).not.toContain('Ask anything')

    const fixture = createPrompt7ReferenceFixture()
    const stale = renderReference(7, {
      ...fixture,
      modeId: 'missing',
      environmentId: 'missing',
      modelId: 'missing',
      modes: [...fixture.modes, fixture.modes[1]!],
    })
    expect(count(stale, 'data-hbar-app-ui-action="mode-select"')).toBe(3)
    expect(stale).toContain('aria-pressed="true" data-mode-id="ask"')
    expect(stale).toContain('Environment: Local')
    expect(stale).toContain('Model: Atlas')
  })
})
