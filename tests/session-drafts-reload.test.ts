import { expect, test } from 'bun:test'
import {
  createAppRuntime,
  restoreSessionDrafts,
  serializeSessionDrafts,
  type ClientJsonValue,
  type ClientPersistencePort,
} from '@hbar/app-runtime'
import type { RunCommandPort } from '../packages/app-runtime/src/types'
import type { RunAccepted } from '@hbar/contracts/commands/run'
import { createWebStartupRuntime } from '../apps/web/src/startup-runtime'

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
  sessionId: '00000000-0000-4000-8000-000000000003',
  text: '恢复后的草稿',
  mentions: [],
  workspaceContexts: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      workspaceId: '00000000-0000-4000-8000-000000000002',
      path: 'src/main.ts',
      kind: 'source-selection' as const,
      lineStart: 1,
      lineEnd: 1,
      quote: 'draft context',
      sha256: 'a'.repeat(64),
    },
  ],
  attachments: [
    { kind: 'file' as const, artifact: { id: 'a'.repeat(64), name: 'notes.txt', mime: 'text/plain', size: 2 } },
  ],
  attachmentTransfers: [],
  uploading: 0,
  uploadError: null,
  revision: 7,
  status: 'unknown' as const,
  error: 'TIMEOUT',
  lastOperationId: '00000000-0000-4000-8000-000000000004',
  pendingSubmission: { key: 'receipt-a', revision: 7, matchesDraft: true, detached: false },
}

test('reloaded Host A restores draft content and reconciles the original receipt once', async () => {
  const storage = memory()
  const saved = serializeSessionDrafts({ [draft.sessionId]: draft })
  expect(saved).not.toBeNull()
  await storage.write('drafts:host-a', JSON.parse(saved!) as ClientJsonValue)
  let receipt: RunAccepted | null = null
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
  expect(first.view.state.drafts.getSnapshot()[draft.sessionId]).toMatchObject(draft)
  expect(await first.view.commands.execute('draft.reconcileSubmission', { sessionId: draft.sessionId })).toBeNull()
  expect(receiptReads).toBe(1)
  receipt = {
    status: 'accepted',
    commandId: 'run.submit',
    commandVersion: 1,
    requestId: 'request-a',
    operationId: '00000000-0000-4000-8000-000000000004',
    sessionId: draft.sessionId,
    idempotencyKey: 'receipt-a',
    acceptedAt: 1,
  }
  const accepted = await first.view.commands.execute('draft.reconcileSubmission', { sessionId: draft.sessionId })
  expect(accepted).toMatchObject({ idempotencyKey: 'receipt-a' })
  expect(first.view.state.drafts.getSnapshot()[draft.sessionId]).toMatchObject({ status: 'idle', text: '' })
  expect(receiptReads).toBe(2)
  first.dispose()
})

test('Host B restore remains empty and corrupt or oversized snapshots are discarded', () => {
  const saved = serializeSessionDrafts({ [draft.sessionId]: draft })
  expect(restoreSessionDrafts(JSON.parse(saved!))).toMatchObject({ [draft.sessionId]: draft })
  expect(restoreSessionDrafts({ version: 99, value: { [draft.sessionId]: draft } })).toBeUndefined()
  expect(restoreSessionDrafts({ [draft.sessionId]: { ...draft, text: 'x'.repeat(200_001) } })).toBeUndefined()
})

test('the actual startup owner writes authored drafts and restores them before a new Host A view mounts', async () => {
  const stored = new Map<string, string>()
  let instance = 0
  const owner = () =>
    createWebStartupRuntime({
      endpointId: 'same-endpoint',
      isKnownSettingsGroup: () => false,
      bootstrap: () => ({ status: 'ready', revision: 0, persisted: false, restoreError: null, values: {} }),
      createRuntime: (hostId, _settings, initialDrafts) =>
        createAppRuntime({
          instanceId: `owner-${instance++}`,
          hostId: hostId ?? 'pending',
          directory,
          ...(initialDrafts ? { initialDrafts } : {}),
        }),
      draftPersistence: {
        read: (hostId) => {
          const value = stored.get(hostId)
          return value ? restoreSessionDrafts(JSON.parse(value)) : undefined
        },
        write: (hostId, drafts) => {
          const value = serializeSessionDrafts(drafts)
          if (value) stored.set(hostId, value)
        },
      },
      appearancePort: (runtime) => ({
        save: async () => {
          throw new Error('unused')
        },
        reset: async () => {
          throw new Error('unused')
        },
        refresh: async () => runtime.view.state.preferences.getSnapshot(),
      }),
      disposeConnection: () => undefined,
    })
  const before = owner()
  before.confirmHost('host-a')
  await before.store
    .getState()
    .runtime.view.commands.execute('draft.setText', { sessionId: draft.sessionId, text: draft.text })
  expect(stored.has('host-a')).toBe(true)
  before.dispose()
  const after = owner()
  after.confirmHost('host-a')
  expect(after.store.getState().runtime.view.state.drafts.getSnapshot()[draft.sessionId]).toMatchObject({
    text: draft.text,
    revision: 1,
    status: 'idle',
  })
  after.confirmHost('host-b')
  expect(after.store.getState().runtime.view.state.drafts.getSnapshot()).toEqual({})
  after.dispose()
})
