import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { LumenPromptReferenceViewModel } from '@lumen/app-ui/catalog'
import { getHbarAppUiVariant, HbarAppUiPromptInputProvider } from '../packages/hbar-app-ui/src/index'
import { HbarAppUiPromptProvider } from '../packages/hbar-app-ui/src/catalog'
import { createPrompt1ReferenceFixture } from './fixtures/hbar-app-ui-prompt-input-1-reference-fixture'
import { HBAR_APP_UI_PROMPT_INPUT_FIXTURES } from './fixtures/hbar-app-ui-prompt-input-fixtures'

function render(viewModel: LumenPromptReferenceViewModel) {
  return renderToStaticMarkup(
    createElement(HbarAppUiPromptInputProvider, {
      content: { ...HBAR_APP_UI_PROMPT_INPUT_FIXTURES, referenceViewModel: viewModel },
      children: createElement(HbarAppUiPromptProvider, {
        content: {
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
        },
        children: createElement(getHbarAppUiVariant('prompt-input', 1).component, {}),
      }),
    }),
  )
}

describe('rich Prompt Input reference', () => {
  test('renders native message, removable attachments and host model/effort controls without a demo heading', () => {
    const html = render({ content: createPrompt1ReferenceFixture() })
    expect(html).toContain('data-hbar-app-ui-component="hbar-app-ui-prompt-input-1"')
    expect(html).toContain('role="combobox"')
    expect(html).toContain('aria-label="Message"')
    expect(html).toContain('auth-service.ts')
    expect(html).toContain('billing-invoice-4021.pdf')
    expect(html).toContain('aria-label="Remove auth-service.ts"')
    expect(html).toContain('aria-label="Model: Atlas"')
    expect(html).toContain('aria-label="Reasoning effort: Medium"')
    expect(html).toContain('aria-label="Record voice"')
    expect(html).toContain('Type / to run a command')
    expect(html).not.toMatch(/aria-label="Send"[^>]*disabled/)
    expect(html).not.toContain('Prompt box')
  })

  test('respects controlled empty/long data and localized copy without duplicating IDs', () => {
    const source = createPrompt1ReferenceFixture('zh')
    const empty = render({
      content: { ...source, composer: { ...source.composer!, attachments: [], draft: '' }, models: [] },
    })
    expect(empty).toMatch(/aria-label="发送"[^>]*disabled/)
    expect(empty).toContain('aria-label="消息"')
    expect(empty).not.toContain('auth-service.ts')
    const draft = '/ Long host draft '.repeat(80)
    const populated = render({
      content: {
        ...source,
        composer: {
          ...source.composer!,
          draft,
          attachments: [...source.composer!.attachments, source.composer!.attachments[0]!],
        },
      },
      onDraftChange() {},
    })
    expect(populated).toContain(draft)
    expect(populated.match(/data-attachment-id="auth-service"/g)).toHaveLength(1)
    expect(populated).toContain('role="listbox"')
    expect(populated).toContain('总结当前内容')
    expect(populated).not.toContain('Ask anything')
  })
})
