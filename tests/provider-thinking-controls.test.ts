import { expect, test } from 'bun:test'
import { normalizeProviderThinkingLevels } from '../packages/app-react/src/lumen-provider-editor'

test('provider thinking level drafts can remove and re-add a non-default level', () => {
  expect(normalizeProviderThinkingLevels(['off', 'low'], 'off')).toEqual(['off', 'low'])
  expect(normalizeProviderThinkingLevels(['off'], 'off')).toEqual(['off'])
  expect(normalizeProviderThinkingLevels(['off', 'high'], 'off')).toEqual(['off', 'high'])
})

test('provider thinking level drafts keep the current default selected', () => {
  expect(normalizeProviderThinkingLevels(['low', 'high'], 'medium')).toBeNull()
  expect(normalizeProviderThinkingLevels(['high'], 'low')).toBeNull()
  expect(normalizeProviderThinkingLevels([], 'off')).toBeNull()
})
