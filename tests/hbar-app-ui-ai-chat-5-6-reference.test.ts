import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAiChat, type LumenAiChatAgentsReferenceContent, type LumenAiChatApprovalReferenceContent, type LumenAiChatReferenceViewModel } from '@lumen/app-ui/catalog'
import { HBAR_APP_UI_AI_CHAT_FIXTURES } from './fixtures/hbar-app-ui-ai-chat-fixtures'
import { createAiChat5ReferenceFixture } from './fixtures/hbar-app-ui-ai-chat-5-reference-fixture'
import { createAiChat6ReferenceFixture } from './fixtures/hbar-app-ui-ai-chat-6-reference-fixture'

function renderReference(content: LumenAiChatApprovalReferenceContent | LumenAiChatAgentsReferenceContent): string {
  const viewModel: LumenAiChatReferenceViewModel = { content }
  return renderToStaticMarkup(
    createElement(LumenAiChat, {
      variant: content.variant,
      variantId: `hbar-app-ui-ai-chat-${content.variant}`,
      content: { ...HBAR_APP_UI_AI_CHAT_FIXTURES, referenceViewModel: viewModel },
    }),
  )
}

describe('hbar-app-ui AI Chat 5–6 source reference views', () => {
  test('renders the approval transcript, history, disclosure, and unresolved target-bound actions', () => {
    const content = createAiChat5ReferenceFixture()
    const markup = renderReference(content)

    expect(markup).toContain('data-hbar-app-ui-component="hbar-app-ui-ai-chat-5"')
    expect(markup).toContain('Clean up the staging environment before tomorrow’s demo.')
    expect(markup).toContain('Scanned staging resources')
    expect(markup).toContain('Delete 3 unused API keys from the staging project.')
    expect(markup.match(/data-hbar-app-ui-item-id="approved-[^"]+"/g)).toHaveLength(2)
    expect(markup).toContain('aria-label="Needs approval"')
    expect(markup).toContain('data-hbar-app-ui-action="approve"')
    expect(markup).toContain('data-hbar-app-ui-action="deny"')
    expect(markup).toContain('Show request')
    expect(markup).toMatch(/<details class="lumen-ai-chat-reference-approval-request">/)
    expect(markup).not.toMatch(/<details[^>]* open/)
    expect(markup).not.toContain('data-hbar-app-ui-region="composer"')
    expect(markup).not.toContain('<h1>')
  })

  test('uses Chinese host copy and de-duplicates previous approval IDs', () => {
    const content = createAiChat5ReferenceFixture('zh')
    const duplicate = {
      ...content,
      previousApprovals: [
        ...content.previousApprovals,
        { ...content.previousApprovals[0]!, label: 'Duplicate history item' },
        { id: '', label: 'Blank history item' },
      ],
    }
    const markup = renderReference(duplicate)

    expect(markup).toContain('清理暂存环境')
    expect(markup).toContain('删除密钥')
    expect(markup).toContain('查看请求')
    expect(markup).toContain('需要审批')
    expect(markup).not.toContain('Duplicate history item')
    expect(markup).not.toContain('Blank history item')
    expect(markup.match(/data-hbar-app-ui-item-id="approved-[^"]+"/g)).toHaveLength(2)
  })

  test('renders the authored agent transcript, passive activity, and controlled composer without agent controls', () => {
    const content = createAiChat6ReferenceFixture()
    const markup = renderReference(content)
    const desktopActivity = markup.match(/<aside[^>]*data-hbar-app-ui-region="activity"[^>]*>([\s\S]*?)<\/aside>/)?.[1]

    expect(markup).toContain('data-hbar-app-ui-component="hbar-app-ui-ai-chat-6"')
    expect(markup).toContain('Competitive brief')
    expect(markup).toContain('Planner · 3 agents')
    expect(markup.match(/data-message-id=/g)).toHaveLength(5)
    expect(markup).toContain('data-message-id="planner-scope"')
    expect(markup).toContain('data-message-id="researcher-comparison"')
    expect(markup).toContain('data-message-id="writer-recommendation"')
    expect(desktopActivity?.match(/<li /g)).toHaveLength(11)
    expect(markup).toContain('<summary>Activity</summary>')
    expect(markup).toContain('aria-label="Ask anything"')
    expect(markup).toContain('Regenerate')
    expect(markup).not.toContain('Handoff')
    expect(markup).not.toContain('data-hbar-app-ui-action="handoff"')
  })

  test('localizes long activity copy and keeps duplicate activity records bounded to unique IDs', () => {
    const content = createAiChat6ReferenceFixture('zh')
    const duplicate = {
      ...content,
      activity: [
        ...content.activity,
        { ...content.activity[0]!, detail: 'Duplicate activity' },
        { id: '', label: 'Blank activity', status: '完成' },
      ],
    }
    const markup = renderReference(duplicate)
    const desktopActivity = markup.match(/<aside[^>]*data-hbar-app-ui-region="activity"[^>]*>([\s\S]*?)<\/aside>/)?.[1]

    expect(markup).toContain('竞品简报')
    expect(markup).toContain('活动')
    expect(markup).toContain('发送')
    expect(markup).toContain('Planner · 3 个代理')
    expect(markup).not.toContain('Duplicate activity')
    expect(markup).not.toContain('Blank activity')
    expect(desktopActivity?.match(/<li /g)).toHaveLength(11)
    expect(markup).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
  })
})
