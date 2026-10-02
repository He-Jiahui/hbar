import { expect, test } from 'bun:test'
import { conversationSelectionCopy } from '../apps/web/src/conversation-selection-copy'

test('conversation selection action and recovery copy are host-owned in both locales', () => {
  const english = conversationSelectionCopy((_, en) => en)
  const chinese = conversationSelectionCopy((zh) => zh)
  expect(english.addToChat).toBe('Add to chat')
  expect(chinese.addToChat).toBe('添加到聊天')
  expect(english.addError('STALE_TARGET')).toContain('Select the text again')
  expect(chinese.addError('VERSION_CONFLICT')).toContain('重新选择')
  expect(english.addError('BUSY')).toContain('Remove a reference first')
  expect(chinese.addError('INVALID_INPUT')).toContain('缩短选区')
  expect(english.addError('CAPABILITY_UNAVAILABLE')).toContain('Reopen the conversation')
})

test('unexpected failures use actionable copy without exposing arbitrary error details', () => {
  const english = conversationSelectionCopy((_, en) => en)
  const chinese = conversationSelectionCopy((zh) => zh)
  expect(english.addError('private path/token details')).toContain('Your draft is preserved')
  expect(english.addError('private path/token details')).not.toContain('private path/token details')
  expect(chinese.addError('EXECUTION_FAILED')).toContain('原草稿已保留')
})
