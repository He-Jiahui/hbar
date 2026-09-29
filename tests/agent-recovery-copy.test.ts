import { expect, test } from 'bun:test'
import { getShellCopy } from '../apps/web/src/shell-copy'

test('Agent recovery errors explain safe next actions in both supported locales', () => {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const error = getShellCopy(locale).agents.error
    for (const code of [
      'PERSISTENCE_UNAVAILABLE',
      'INVALID_PERSISTED_STATE',
      'PERSISTENCE_LIMIT',
      'IDEMPOTENCY_CONFLICT',
    ]) {
      const message = error(code)
      expect(message.length).toBeGreaterThan(20)
      expect(message).not.toContain(code)
    }
  }
})
