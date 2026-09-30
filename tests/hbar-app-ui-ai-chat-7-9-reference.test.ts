import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiAiChatProvider,
  type HbarAppUiAiChatContent,
} from '../packages/hbar-app-ui/src/index'
import { HBAR_APP_UI_AI_CHAT_FIXTURES } from './fixtures/hbar-app-ui-ai-chat-fixtures'
import { createAiChat7ReferenceFixture } from './fixtures/hbar-app-ui-ai-chat-7-reference-fixture'
import { createAiChat8ReferenceFixture } from './fixtures/hbar-app-ui-ai-chat-8-reference-fixture'
import { createAiChat9ReferenceFixture } from './fixtures/hbar-app-ui-ai-chat-9-reference-fixture'
import type { LumenAiChatReferenceContent } from '@lumen/app-ui'

function renderReference(variant: 7 | 8 | 9, content: LumenAiChatReferenceContent) {
  const hostContent: HbarAppUiAiChatContent = {
    ...HBAR_APP_UI_AI_CHAT_FIXTURES,
    referenceViewModel: { content },
  }
  return renderToStaticMarkup(
    createElement(HbarAppUiAiChatProvider, {
      content: hostContent,
      children: createElement(getHbarAppUiVariant('ai-chat', variant).component, {}),
    }),
  )
}

function count(markup: string, fragment: string) {
  return markup.split(fragment).length - 1
}

describe('hbar-app-ui ai chat reference variants 7–9', () => {
  test('renders the complete source list, cited conversation, and controlled selection state', () => {
    const content = createAiChat7ReferenceFixture()
    const markup = renderReference(7, content)
    expect(markup).toContain('Q3 retention review')
    expect(markup).toContain('6 sources · cited')
    expect(markup).toContain('Pinned sources')
    expect(count(markup, 'data-hbar-app-ui-action="source-select"')).toBe(10)
    expect(count(markup, 'class="lumen-ai-chat-reference-message"')).toBe(8)
    expect(count(markup, 'class="lumen-ai-chat-reference-citation"')).toBe(9)
    expect(markup).not.toContain('artifact-open')

    const selected = renderReference(7, { ...content, selectedSourceId: 'churn-analysis' })
    expect(selected).toContain('aria-pressed="true"')
    expect(selected).toContain('data-hbar-app-ui-target="churn-analysis"')
    const expectedTargets = ['q3-board-deck', 'revenue-model', 'churn-analysis', 'renewals-export']
    for (const message of content.messages) {
      for (const part of message.parts) {
        if (part.kind === 'citation') {
          const target = expectedTargets[Number(part.label) - 1]
          if (!target) throw new Error('The fixture contains an unknown citation number')
          expect(part.sourceId).toBe(target)
        }
      }
    }
  })

  test('keeps voice feedback fixed and Host controlled without starting real capture', () => {
    const listening = renderReference(8, createAiChat8ReferenceFixture())
    expect(listening).toContain('Listening · 0:25')
    expect(listening).toContain('Pull the three designs from the shared folder')
    expect(count(listening, 'data-level=')).toBe(28)
    expect(count(listening, 'data-hbar-app-ui-action="attachment-remove"')).toBe(3)
    expect(listening).toContain('Stop recording')
    expect(listening).toContain('Tap to stop')
    expect(listening).toMatch(/<button[^>]*disabled=""[^>]*data-hbar-app-ui-action="voice-send"/)
    expect(listening).not.toContain('MediaRecorder')

    const stopped = renderReference(8, { ...createAiChat8ReferenceFixture(), phase: 'stopped' })
    expect(stopped).toContain('Stopped · 0:25')
    expect(stopped).toContain('Resume recording')
    expect(stopped).toMatch(/<button[^>]*data-hbar-app-ui-action="voice-send"/)
    expect(stopped).not.toMatch(/<button[^>]*disabled=""[^>]*data-hbar-app-ui-action="voice-send"/)
  })

  test('keeps model label, subtitle, and disclaimer synchronized with the selected Host model', () => {
    const atlas = renderReference(9, createAiChat9ReferenceFixture())
    expect(atlas).toContain('Depot capacity model')
    expect(atlas).toContain('Atlas · Balanced')
    expect(atlas).toContain('Reply, or pick a different model below')
    expect(atlas).toContain('Atlas runs on Meridian Labs. Answers can be wrong')
    expect(count(atlas, 'class="lumen-ai-chat-reference-message"')).toBe(6)
    expect(atlas).toContain('lumen-ai-chat-reference-icon')

    const quill = renderReference(9, { ...createAiChat9ReferenceFixture(), selectedModelId: 'quill' })
    expect(quill).toContain('Quill · Fast')
    expect(quill).toContain('Quill runs on Meridian Labs. Answers can be wrong')
    expect(quill).toContain('aria-label="Model" aria-haspopup="listbox" aria-expanded="false" aria-controls=')
  })

  test('localizes visible labels and handles stale/duplicate host IDs without truncating content', () => {
    const localized = renderReference(7, createAiChat7ReferenceFixture('zh'))
    expect(localized).toContain('Q3 留存率复盘')
    expect(localized).toContain('固定来源')
    expect(localized).not.toContain('Pinned sources')

    const base = createAiChat9ReferenceFixture()
    const malformed = renderReference(9, {
      ...base,
      selectedModelId: 'missing',
      models: [...base.models, base.models[0]!, { id: '', label: 'Blank' }],
    })
    expect(count(malformed, 'role="option"')).toBe(0)
    expect(malformed).toContain('Auto · Balanced')
    expect(count(malformed, 'class="lumen-ai-chat-reference-message"')).toBe(6)
  })
})
