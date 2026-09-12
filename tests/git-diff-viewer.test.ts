import { expect, test } from 'bun:test'
import { parseUnifiedDiff } from '../apps/web/src/git-diff-parser'

test('unified diff parser builds before and after documents', () => {
  expect(parseUnifiedDiff('diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,2 +1,2 @@\n-old()\n+new()\n keep()')).toEqual({ before: 'old()\nkeep()', after: 'new()\nkeep()' })
  expect(parseUnifiedDiff('not a patch')).toBeNull()
})
