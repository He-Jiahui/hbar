import { expect, test } from 'bun:test'
import {
  conversationSelectionMenuPosition,
  conversationMessageExpectedText,
  conversationSelectionQuoteProblem,
  conversationSelectionSubmission,
  intersectConversationSelectionRects,
  isConversationSelectionKeyboardKey,
} from '../packages/app-react/src/conversation-selection-model'

test('conversation selection snapshot joins only authored text blocks in canonical order', () => {
  const text = conversationMessageExpectedText([
    { type: 'text', text: 'First paragraph.' },
    { type: 'thinking', text: 'private reasoning' },
    { type: 'tool_call', callId: 'call', name: 'search', args: {} },
    { type: 'text', text: 'Second paragraph.' },
    { type: 'image', artifact: { id: 'a'.repeat(64), name: 'photo.png', mime: 'image/png', size: 1 } },
  ])
  expect(text).toBe('First paragraph.\n\nSecond paragraph.')
})

test('selection action captures the exact visible quote, source snapshot and opened draft revision', () => {
  expect(
    conversationSelectionSubmission({
      sessionId: 'source-session',
      messageId: 'assistant-message',
      expectedText: 'Original Markdown **reply**',
      quote: '  rendered reply  ',
      expectedRevision: 7,
      maxQuoteLength: 20_000,
    }),
  ).toEqual({
    sessionId: 'source-session',
    messageId: 'assistant-message',
    expectedText: 'Original Markdown **reply**',
    quote: 'rendered reply',
    expectedRevision: 7,
  })
})

test('selection rejects blank, stale-empty, over-bound and invalid-revision inputs without truncating the quote', () => {
  const base = {
    sessionId: 'session',
    messageId: 'message',
    expectedText: 'authored source',
    expectedRevision: 0,
    maxQuoteLength: 3,
  }
  expect(conversationSelectionSubmission({ ...base, quote: '  ' })).toBeNull()
  expect(conversationSelectionSubmission({ ...base, expectedText: '', quote: 'ok' })).toBeNull()
  expect(conversationSelectionSubmission({ ...base, expectedRevision: -1, quote: 'ok' })).toBeNull()
  expect(conversationSelectionQuoteProblem('abc', 3)).toBeNull()
  expect(conversationSelectionQuoteProblem('abcd', 3)).toBe('INPUT_TOO_LARGE')
  expect(conversationSelectionSubmission({ ...base, quote: 'abcd' })).toBeNull()
})

test('shift selection recognizes only browser text extension keys outside editing and IME', () => {
  expect(
    isConversationSelectionKeyboardKey({ key: 'ArrowRight', shiftKey: true, isComposing: false, editing: false }),
  ).toBe(true)
  expect(isConversationSelectionKeyboardKey({ key: 'Enter', shiftKey: true, isComposing: false, editing: false })).toBe(
    false,
  )
  expect(
    isConversationSelectionKeyboardKey({ key: 'ArrowLeft', shiftKey: true, isComposing: true, editing: false }),
  ).toBe(false)
  expect(isConversationSelectionKeyboardKey({ key: 'Home', shiftKey: true, isComposing: false, editing: true })).toBe(
    false,
  )
})

test('selection anchor and action stay inside the visible transcript pane', () => {
  const pane = { left: 12, top: 240, right: 308, bottom: 720 }
  expect(intersectConversationSelectionRects({ left: 20, top: 180, right: 120, bottom: 200 }, pane)).toBeNull()
  const visible = intersectConversationSelectionRects({ left: 270, top: 680, right: 320, bottom: 700 }, pane)
  expect(visible).toEqual({ left: 270, top: 680, right: 308, bottom: 700 })
  if (!visible) throw new Error('Expected the partial selection to intersect the transcript pane')
  const position = conversationSelectionMenuPosition(visible, pane, { width: 120, height: 44 })
  expect(position).toEqual({ left: 180, top: 626 })
})
