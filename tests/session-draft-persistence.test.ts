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
  expect(restoreSessionDrafts({ 'session-a': { ...draft, revision: -1 } })).toEqual({})
  expect(restoreSessionDrafts({ 'session-a': { ...draft, text: 'x'.repeat(200_001) } })).toEqual({})
  expect(serializeSessionDrafts({ 'session-a': { ...draft, text: 'x'.repeat(1_000_001) } })).toBeNull()
})
