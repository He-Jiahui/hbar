import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  HbarAppUiConversation,
  HbarAppUiPromptComposer,
  HbarAppUiMessage,
} from '../packages/hbar-app-ui/src/production'
import { getPromptCopy, getMessageCopy } from './fixtures/hbar-app-ui-host-copy'

describe('host-controlled conversation components', () => {
  test('renders host attachments, localized controls and a failure without clearing the draft', () => {
    const markup = renderToStaticMarkup(
      createElement(HbarAppUiPromptComposer, {
        value: 'Keep this draft after a failed request',
        labels: getPromptCopy('en-US', false, false),
        attachments: [
          { id: 'file-a', kind: 'file', name: 'An intentionally long file name for a translated attachment.txt' },
        ],
        submitting: false,
        uploading: false,
        canSubmit: true,
        canStop: false,
        canAddAttachments: true,
        error: 'Host unavailable',
        onChange() {},
        onAddAttachments() {},
        onRemoveAttachment() {},
        onSubmit() {},
        onStop() {},
      }),
    )
    expect(markup).toContain('Keep this draft after a failed request')
    expect(markup).toContain('Host unavailable')
    expect(markup).toContain('Remove file An intentionally long file name')
    expect(markup).toContain('aria-label="Add attachment"')
    expect(markup).not.toContain('brief.md')
  })
  test('renders system messages and names supplied by the current locale', () => {
    const copy = getMessageCopy('en-US')
    const markup = renderToStaticMarkup(
      createElement(HbarAppUiMessage, {
        id: 'notice',
        role: 'system',
        author: copy.assistant,
        avatar: copy.assistantAvatar,
        copyLabel: copy.copy,
        children: 'Host message',
      }),
    )
    expect(markup).toContain('message-system')
    expect(markup).toContain('Host message')
    expect(markup).not.toContain('<button')
  })
  test('supports one host page header while keeping activity inside the conversation timeline', () => {
    const markup = renderToStaticMarkup(
      createElement(HbarAppUiConversation, {
        title: 'Localized conversation name',
        header: null,
        messages: [],
        empty: createElement('p', null, 'Host empty state'),
        beforeMessages: createElement('button', null, 'Load host history'),
        afterMessages: createElement('section', { 'aria-label': 'Run activity' }, 'Host activity'),
        composer: createElement('form', null, 'Host composer'),
      }),
    )
    expect(markup).toContain('aria-label="Localized conversation name"')
    expect(markup).not.toContain('<h2>Localized conversation name</h2>')
    expect(markup).toContain('hbar-app-ui-conversation-content')
    expect(markup.indexOf('Load host history')).toBeLessThan(markup.indexOf('Host empty state'))
    expect(markup.indexOf('Host empty state')).toBeLessThan(markup.indexOf('Host activity'))
    expect(markup.indexOf('Host activity')).toBeLessThan(markup.indexOf('Host composer'))
  })
})
