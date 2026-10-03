import { expect, test } from 'bun:test'
import {
  createAppRuntime,
  restoreSessionDrafts,
  serializeSessionDrafts,
  type ClientJsonValue,
  type ClientPersistencePort,
} from '@hbar/app-runtime'
import type { RunCommandPort } from '../packages/app-runtime/src/types'

const directory = { execute: async () => ({ items: [], nextCursor: null }) }

function memory(): ClientPersistencePort & { value: ClientJsonValue | null } {
  let value: ClientJsonValue | null = null
  return {
    get value() {
      return value
    },
    read: async () => value,
    write: async (_key, next) => {
      value = next
    },
    remove: async () => {
      value = null
    },
  }
}

const draft = {
  sessionId: 'session-a',
  text: '恢复后的草稿',
  mentions: [],
  workspaceContexts: [{ id: 'context-a', workspaceId: 'workspace-a', path: 'src', kind: 'directory' as const }],
  attachments: [
    { kind: 'file' as const, artifact: { id: 'a'.repeat(64), name: 'notes.txt', mimeType: 'text/plain', size: 2 } },
  ],
  attachmentTransfers: [],
  uploading: 0,
  uploadError: null,
  revision: 7,
  status: 'unknown' as const,
  error: 'TIMEOUT',
  lastOperationId: 'operation-a',
  pendingSubmission: { key: 'receipt-a', revision: 7, matchesDraft: true, detached: false },
}

test('reloaded Host A restores draft content and reconciles the original receipt once', async () => {
  const storage = memory()
  const saved = serializeSessionDrafts({ 'session-a': draft })
  expect(saved).not.toBeNull()
  await storage.write('drafts:host-a', JSON.parse(saved!) as ClientJsonValue)
  let receipt: unknown = null
  let receiptReads = 0
  const run: RunCommandPort = {
    execute: async () => {
      throw new Error('reloaded unknown draft must not resubmit')
    },
    getReceipt: async (_sessionId, key) => {
      receiptReads++
      expect(key).toBe('receipt-a')
      return receipt
    },
  }
  const restored = restoreSessionDrafts(await storage.read('drafts:host-a'))
  const first = createAppRuntime({ instanceId: 'reload-a', hostId: 'host-a', directory, run, initialDrafts: restored })
  expect(first.view.state.drafts.getSnapshot()['session-a']).toMatchObject(draft)
  expect(await first.view.commands.execute('draft.reconcileSubmission', { sessionId: 'session-a' })).toBeNull()
  expect(receiptReads).toBe(1)
  receipt = {
    status: 'accepted',
    commandId: 'run.submit',
    commandVersion: 1,
    requestId: 'request-a',
    operationId: 'operation-a',
    sessionId: 'session-a',
    idempotencyKey: 'receipt-a',
    acceptedAt: 1,
  }
  const accepted = await first.view.commands.execute('draft.reconcileSubmission', { sessionId: 'session-a' })
  expect(accepted).toMatchObject({ idempotencyKey: 'receipt-a' })
  expect(first.view.state.drafts.getSnapshot()['session-a']).toMatchObject({ status: 'idle', text: '' })
  expect(receiptReads).toBe(2)
  first.dispose()
})

test('Host B restore remains empty and corrupt or oversized snapshots are discarded', () => {
  const saved = serializeSessionDrafts({ 'session-a': draft })
  expect(restoreSessionDrafts(JSON.parse(saved!))).toMatchObject({ 'session-a': draft })
  expect(restoreSessionDrafts({ version: 99, value: { 'session-a': draft } })).toEqual({})
  expect(restoreSessionDrafts({ 'session-a': { ...draft, text: 'x'.repeat(200_001) } })).toEqual({})
})
