import { expect, test } from 'bun:test'
import { sessionWorkspaceContextCopy } from '../apps/web/src/session-workspace-context-copy'

const context = {
  id: '04a6ab4c-1034-4f5d-9bca-c1e21ec869e3',
  kind: 'diff-comment' as const,
  workspaceId: 'workspace-a',
  path: 'src/components/long-context-path.tsx',
  lineStart: 10,
  lineEnd: 12,
  quote: 'return result',
  cached: false,
  diffSide: 'new' as const,
  hunkId: 'hunk-4',
  note: 'Preserve this fallback.',
}
const selection = {
  id: '14a6ab4c-1034-4f5d-9bca-c1e21ec869e3',
  kind: 'source-selection' as const,
  workspaceId: 'workspace-a',
  path: 'src/components/selection.tsx',
  lineStart: 4,
  lineEnd: 4,
  quote: 'const selected = true',
  sha256: 'a'.repeat(64),
}
const sourceComment = {
  ...selection,
  id: '24a6ab4c-1034-4f5d-9bca-c1e21ec869e3',
  kind: 'source-comment' as const,
  note: 'Keep this source comment.',
}

test('workspace-context copy localizes kind, range, side, disclosure and removal label', () => {
  const english = sessionWorkspaceContextCopy((_, en) => en)
  const chinese = sessionWorkspaceContextCopy((zh) => zh)
  expect(english.label).toBe('Workspace context')
  expect(english.kind(context)).toBe('Diff comment')
  expect(english.location(context)).toBe('src/components/long-context-path.tsx · New · L10–L12')
  expect(english.range(context)).toBe('New · L10–L12')
  expect(english.quoteDisclosure).toBe('Show selected text')
  expect(english.remove(context)).toContain('Remove context')
  expect(english.kind(selection)).toBe('Selected code')
  expect(english.location(selection)).toBe('src/components/selection.tsx · L4')
  expect(english.range(selection)).toBe('L4')
  expect(english.kind(sourceComment)).toBe('Selection comment')
  expect(chinese.kind(context)).toBe('差异批注')
  expect(chinese.location(context)).toContain('新版')
  expect(chinese.range(context)).toBe('新版 · L10–L12')
  expect(chinese.removeError).toContain('无法移除')
})
