import { expect, test } from 'bun:test'
import { parseUnifiedDiff } from '../apps/web/src/git-diff-parser'

test('unified diff parser builds before and after documents', () => {
  expect(parseUnifiedDiff('diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,2 +1,2 @@\n-old()\n+new()\n keep()')).toEqual({ before: 'old()\nkeep()', after: 'new()\nkeep()' })
  expect(parseUnifiedDiff('not a patch')).toBeNull()
})

test('unified diff parser preserves rename and binary metadata', () => {
  expect(parseUnifiedDiff('diff --git a/old.ts b/new.ts\nsimilarity index 100%\nrename from old.ts\nrename to new.ts')).toEqual({
    before: '',
    after: '',
    kind: 'rename',
    oldPath: 'old.ts',
    newPath: 'new.ts',
  })
  expect(parseUnifiedDiff('diff --git a/logo.png b/logo.png\nBinary files a/logo.png and b/logo.png differ')).toEqual({
    before: '',
    after: '',
    kind: 'binary',
    oldPath: 'logo.png',
    newPath: 'logo.png',
  })
})

test('unified diff parser marks bounded output as truncated', () => {
  expect(parseUnifiedDiff('@@ -1 +1 @@\n-old\n+new', { truncated: true })).toMatchObject({ before: 'old', after: 'new', truncated: true })
})
