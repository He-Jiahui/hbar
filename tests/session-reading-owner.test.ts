import { expect, test } from 'bun:test'
import { createAppRuntime } from '@hbar/app-runtime'
import {
  isConversationReadingOwner,
  isConversationReadingAtPosition,
} from '../packages/app-react/src/session-reading-position'

test('reading settle deadline accepts only the same message within a sub-line range', () => {
  const saved = { messageId: 'original', messageOffset: -10, atEnd: false }
  expect(isConversationReadingAtPosition({ ...saved, messageOffset: -3.4 }, saved, 16)).toBe(true)
  expect(isConversationReadingAtPosition({ ...saved, messageOffset: 6 }, saved, 16)).toBe(false)
  expect(isConversationReadingAtPosition({ ...saved, messageId: 'neighbour' }, saved, 16)).toBe(false)
  expect(isConversationReadingAtPosition({ ...saved, messageId: null }, saved, 16)).toBe(false)
  expect(isConversationReadingAtPosition(saved, saved, Number.NaN)).toBe(false)
})

test('reading callbacks reject a replaced Host runtime even when all tab identities are equal', () => {
  const directory = {
    async execute() {
      throw new Error('No directory reads expected')
    },
  }
  const first = createAppRuntime({ instanceId: 'first', hostId: 'first-host', directory })
  const replacement = createAppRuntime({ instanceId: 'replacement', hostId: 'replacement-host', directory })
  const target = { workspaceId: 'workspace', sessionId: 'session', sourceTabInstanceKey: 'tab-instance' }
  try {
    const current = { runtime: replacement.view, target }
    expect(isConversationReadingOwner(current, first.view, target)).toBe(false)
    expect(isConversationReadingOwner(current, replacement.view, target)).toBe(true)
    expect(isConversationReadingOwner({ ...current, target: null }, replacement.view, target)).toBe(false)
    for (const field of ['workspaceId', 'sessionId', 'sourceTabInstanceKey'] as const)
      expect(
        isConversationReadingOwner(
          { ...current, target: { ...target, [field]: 'different' } },
          replacement.view,
          target,
        ),
      ).toBe(false)
    expect(first.view.conversationReading.read(target)).toBeNull()
    expect(replacement.view.conversationReading.read(target)).toBeNull()
  } finally {
    first.dispose()
    replacement.dispose()
  }
})
