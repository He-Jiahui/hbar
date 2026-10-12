import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { HbarAppUiAiChatContent } from '../packages/hbar-app-ui/src/index'
import type { LumenAiChatReferenceContent } from '@lumen/app-ui/catalog'
import { getHbarAppUiVariant, HbarAppUiAiChatProvider } from '../packages/hbar-app-ui/src/index'
import { createAiChat2ReferenceFixture } from './fixtures/hbar-app-ui-ai-chat-2-reference-fixture'
import { createAiChat3ReferenceFixture } from './fixtures/hbar-app-ui-ai-chat-3-reference-fixture'
import { createAiChat4ReferenceFixture } from './fixtures/hbar-app-ui-ai-chat-4-reference-fixture'
import { HBAR_APP_UI_AI_CHAT_FIXTURES } from './fixtures/hbar-app-ui-ai-chat-fixtures'

function renderReference(variant: 2 | 3 | 4, reference: LumenAiChatReferenceContent): string {
  const content: HbarAppUiAiChatContent = {
    ...HBAR_APP_UI_AI_CHAT_FIXTURES,
    referenceViewModel: { content: reference },
  }
  const component = getHbarAppUiVariant('ai-chat', variant).component
  return renderToStaticMarkup(
    createElement(HbarAppUiAiChatProvider, {
      content,
      children: createElement(component, {}),
    }),
  )
}

describe('AI Chat 2–4 source reference views', () => {
  test('renders the artifact thread with all versions, code/document controls, and a controlled composer', () => {
    const fixture = createAiChat2ReferenceFixture()
    const html = renderReference(2, fixture)

    expect(html).toContain('data-hbar-app-ui-component="hbar-app-ui-ai-chat-2"')
    expect(html).toContain('Build assistant')
    expect(html).toContain('pricing-table.tsx')
    expect(html).toContain('Here is a responsive pricing table with Starter, Growth, and Scale.')
    expect(html.match(/data-message-id=/g)).toHaveLength(6)
    expect(html.match(/data-artifact-version-id=/g)).toHaveLength(3)
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*data-artifact-version-id="v3"/)
    expect(html).toContain('data-hbar-app-ui-action="artifact-mode-code"')
    expect(html).toContain('data-hbar-app-ui-action="artifact-mode-document"')
    expect(html).toContain('data-hbar-app-ui-region="artifact-content"')
    expect(html).toContain('Ask anything')
    expect(html).toContain('data-hbar-app-ui-action="artifact-copy"')
    expect(html).toContain('data-hbar-app-ui-action="artifact-download"')
  })

  test('keeps the embedded assistant compact, localized, and free of an attachment action', () => {
    const fixture = createAiChat3ReferenceFixture('zh')
    const html = renderReference(3, fixture)

    expect(html).toContain('助手')
    expect(html).toContain('就绪')
    expect(html).toContain('总结最新的发布说明')
    expect(html).toContain('每个控件都可通过键盘操作')
    expect(html.match(/data-message-id=/g)).toHaveLength(6)
    expect(html).toContain('aria-label="发送"')
    expect(html).not.toContain('添加附件')
    expect(html).not.toContain('Assistant')
  })

  test('renders context model, token meter, settings intent and onboarding conversation', () => {
    const fixture = createAiChat4ReferenceFixture()
    const html = renderReference(4, fixture)

    expect(html).toContain('Onboarding analysis')
    expect(html).toContain('Model: Atlas')
    expect(html).toContain('12.4k / 32k tokens')
    expect(html).toContain('role="meter"')
    expect(html).toContain('aria-label="Conversation settings"')
    expect(html).toContain('data-hbar-app-ui-action="conversation-settings"')
    expect(html).toContain('Compare our onboarding completion rate to last quarter.')
    expect(html).toContain('Onboarding completion reached 71% this quarter')
    expect(html).toContain('Add attachment')
    expect(fixture.models).toHaveLength(3)
  })

  test('handles empty, duplicate, over-bound and stale selections without dropping host content', () => {
    const base = createAiChat2ReferenceFixture()
    const firstMessage = base.messages[0]
    if (!firstMessage) throw new Error('The source fixture needs an initial user message.')
    const duplicate = { ...firstMessage, parts: [{ kind: 'text' as const, text: 'duplicate should be removed' }] }
    const overBound = {
      ...base,
      messages: [
        ...base.messages,
        ...Array.from({ length: 24 }, (_, index) => ({
          id: `additional-${index + 1}`,
          side: 'assistant' as const,
          parts: [{ kind: 'text' as const, text: `Host message ${index + 1}` }],
        })),
        duplicate,
      ],
      artifact: { ...base.artifact, selectedVersionId: 'missing' },
    }
    const overflowHtml = renderReference(2, overBound)
    expect(overflowHtml).toContain('Host message 24')
    expect(overflowHtml).not.toContain('duplicate should be removed')
    expect(overflowHtml).toMatch(/<button[^>]*aria-pressed="true"[^>]*data-artifact-version-id="v3"/)

    const emptyHtml = renderReference(2, { ...base, messages: [], artifact: { ...base.artifact, versions: [] } })
    expect(emptyHtml).toContain('No messages')
    expect(emptyHtml).toContain('No preview content is available for this version.')
    expect(emptyHtml).not.toContain('data-message-id=')

    const staleModel = { ...createAiChat4ReferenceFixture(), selectedModelId: 'missing-model' }
    const contextHtml = renderReference(4, staleModel)
    expect(contextHtml).toContain('aria-label="Model: Atlas"')
  })
})
