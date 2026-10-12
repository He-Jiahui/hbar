import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { getHbarAppUiVariant, HbarAppUiAiChatProvider } from '../packages/hbar-app-ui/src/index'
import { HBAR_APP_UI_AI_CHAT_FIXTURES } from './fixtures/hbar-app-ui-ai-chat-fixtures'
import { createAiChat1ReferenceFixture } from './fixtures/hbar-app-ui-ai-chat-1-reference-fixture'
import type { LumenAiChatThreadReferenceContent } from '@lumen/app-ui/catalog'

function render(content: LumenAiChatThreadReferenceContent) {
  return renderToStaticMarkup(
    createElement(HbarAppUiAiChatProvider, {
      content: { ...HBAR_APP_UI_AI_CHAT_FIXTURES, referenceViewModel: { content } },
      children: createElement(getHbarAppUiVariant('ai-chat', 1).component, {}),
    }),
  )
}
describe('AI Chat 1 reference conversation', () => {
  test('preserves reasoning/tool disclosures, inline source tags and composer attachment', () => {
    const output = render(createAiChat1ReferenceFixture())
    expect(output.match(/data-message-id=/g)).toHaveLength(4)
    expect(output).toContain('Revenue assistant')
    expect(output).toContain('Thought for 4s')
    expect(output).toContain('aria-expanded="false"')
    expect(output).toContain('Searched 1,284 refunds')
    expect(output).toContain('Billing events')
    expect(output).toContain('refunds-week-24.csv')
    expect(output).not.toContain('Workspace assistant')
  })
  test('supports localized, duplicate, empty and over-bound pane content without silently discarding messages', () => {
    const content = createAiChat1ReferenceFixture('zh')
    expect(render(content)).toContain('收入分析助手')
    const message = content.messages[0]
    if (!message) throw new Error('Expected the reference fixture to contain a message')
    expect(render({ ...content, messages: [message, message] }).match(/data-message-id=/g)).toHaveLength(1)
    expect(render({ ...content, messages: [] })).toContain('暂无消息')
    const messages = Array.from({ length: 81 }, (_, index) => ({
      ...message,
      id: `message-${index}`,
      parts: [{ kind: 'text' as const, text: '很长的本地化消息内容用于确认宿主提供的数据正常换行。'.repeat(4) }],
    }))
    expect(render({ ...content, messages }).match(/data-message-id=/g)).toHaveLength(81)
    expect(render({ ...content, messages })).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
  })
})
