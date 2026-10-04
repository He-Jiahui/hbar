import { expect, test } from 'bun:test'
import type { FileWorkspacePreviewState } from '@hbar/app-runtime'
import { filePreviewOwnsFailure } from '../packages/app-react/src/file-preview-feedback'

const preview: FileWorkspacePreviewState = {
  id: 'original-reader',
  kind: 'document',
  path: 'folder/A.md',
  documentMode: 'preview',
  document: {
    path: 'folder/A.md',
    baseline: 'confirmed',
    draft: 'confirmed',
    sha256: 'a'.repeat(64),
    status: 'failed',
    error: 'DISCONNECTED',
    pendingText: null,
  },
}
const entry = { previews: [preview], activePreviewId: preview.id }
test('canonical reader errors own an exact UUID or file path even when command rejection loses its code', () => {
  expect(filePreviewOwnsFailure(entry, 'fileWorkspace.refreshPreview', { previewId: preview.id })).toBe(true)
  expect(filePreviewOwnsFailure(entry, 'fileWorkspace.openEntry', { path: 'folder/A.md', directory: false })).toBe(true)
  expect(filePreviewOwnsFailure(entry, 'fileWorkspace.openEntry', { path: 'folder\\A.md', directory: false })).toBe(
    true,
  )
})
test('an old reader error cannot swallow another path capacity error or a reopened preview failure', () => {
  expect(filePreviewOwnsFailure(entry, 'fileWorkspace.openEntry', { path: 'folder/C.md', directory: false })).toBe(
    false,
  )
  expect(filePreviewOwnsFailure(entry, 'fileWorkspace.refreshPreview', { previewId: 'reopened-reader' })).toBe(false)
  expect(filePreviewOwnsFailure(entry, 'fileWorkspace.openEntry', { path: preview.path, directory: true })).toBe(false)
  expect(
    filePreviewOwnsFailure({ ...entry, activePreviewId: null }, 'fileWorkspace.refreshPreview', {
      previewId: preview.id,
    }),
  ).toBe(false)
  expect(filePreviewOwnsFailure(entry, 'fileWorkspace.refreshPreview', null)).toBe(false)
})
test('worktree and staged failures at the same path remain different reader targets', () => {
  const diff: FileWorkspacePreviewState = {
    id: 'diff',
    kind: 'diff',
    path: preview.path,
    cwd: '/workspace',
    originalPath: null,
    diff: {
      path: preview.path,
      cached: false,
      status: 'error',
      text: 'confirmed diff',
      truncated: false,
      error: 'DISCONNECTED',
    },
  }
  const diffEntry = { previews: [diff], activePreviewId: diff.id }
  expect(filePreviewOwnsFailure(diffEntry, 'fileWorkspace.openChange', { path: preview.path, cached: false })).toBe(
    true,
  )
  expect(filePreviewOwnsFailure(diffEntry, 'fileWorkspace.openChange', { path: preview.path, cached: true })).toBe(
    false,
  )
  expect(filePreviewOwnsFailure(diffEntry, 'fileWorkspace.openEntry', { path: preview.path, directory: false })).toBe(
    false,
  )
})
