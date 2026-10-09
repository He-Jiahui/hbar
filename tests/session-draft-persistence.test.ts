import { expect, test } from 'bun:test'
import { restoreSessionDrafts, serializeSessionDrafts } from '../packages/app-runtime/src/drafts'

const draft = {
  sessionId: 'session-a',
  text: 'Keep this draft',
  mentions: [],
  workspaceContexts: [],
  attachments: [],
  attachmentTransfers: [],
  uploading: 0,
  uploadError: null,
  revision: 4,
  status: 'unknown' as const,
  error: 'RESULT_UNKNOWN',
  lastOperationId: 'operation-a',
  pendingSubmission: { key: 'receipt-a', revision: 4, matchesDraft: true, detached: false },
}

test('session draft persistence restores bounded unknown receipt ownership', () => {
  const encoded = serializeSessionDrafts({ 'session-a': draft })
  expect(encoded).not.toBeNull()
  expect(restoreSessionDrafts(JSON.parse(encoded!))).toEqual({ 'session-a': draft })
})

test('session draft persistence rejects malformed and oversized records', () => {
  expect(restoreSessionDrafts({ version: 1, drafts: { 'session-a': { ...draft, revision: -1 } } })).toEqual({})
  expect(
    restoreSessionDrafts({ version: 1, drafts: { 'session-a': { ...draft, text: 'x'.repeat(200_001) } } }),
  ).toEqual({})
  expect(restoreSessionDrafts({ version: 2, drafts: {} })).toBeUndefined()
  expect(
    restoreSessionDrafts({ version: 1, drafts: { 'session-a': { ...draft, mentions: [{ start: 0, end: 999 }] } } }),
  ).toEqual({})
  expect(serializeSessionDrafts({ 'session-a': { ...draft, text: 'x'.repeat(1_000_001) } })).toBeNull()
})

test('an interrupted attachment restores its original hash and reservation as unknown without an active upload', () => {
  const upload = { sourceId: 'selected-source', sha256: 'a'.repeat(64), name: 'draft.txt', mime: 'text/plain', size: 4 }
  const transfer = {
    id: 'reservation',
    ownerRevision: 4,
    originalOperationId: null,
    name: upload.name,
    mime: upload.mime,
    size: upload.size,
    kind: 'file' as const,
    status: 'uploading' as const,
    upload,
    confirmed: null,
    error: null,
  }
  const serialized = serializeSessionDrafts({
    'session-a': { ...draft, attachmentTransfers: [transfer], uploading: 1 },
  })
  if (!serialized) throw new Error('Fixture did not serialize')
  const restored = restoreSessionDrafts(JSON.parse(serialized))?.['session-a']
  expect(restored?.attachmentTransfers[0]).toEqual({ ...transfer, status: 'unknown', error: 'RESULT_UNKNOWN' })
  expect(restored?.uploading).toBe(0)
  expect(restored?.pendingSubmission).toEqual(draft.pendingSubmission)
})
