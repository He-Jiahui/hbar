import { expect, test } from 'bun:test'
import { CommandError, CommandRegistry } from '@hbar/commands'
import { runAcceptedSchema, type RunAccepted } from '@hbar/contracts/commands/run'
import type { SessionDraftState } from '@hbar/app-runtime'
import { createDrafts } from '../packages/app-runtime/src/drafts'

function emptyDraft(sessionId: string): SessionDraftState {
  return {
    sessionId,
    text: '',
    mentions: [],
    workspaceContexts: [],
    attachments: [],
    attachmentTransfers: [],
    uploading: 0,
    uploadError: null,
    revision: 0,
    status: 'idle',
    error: null,
    lastOperationId: null,
  }
}

test('session draft initialization reclaims only pristine entries at the bounded limit', () => {
  const local = new CommandRegistry()
  const initialDrafts: Record<string, SessionDraftState> = {}
  for (let index = 0; index < 96; index++) initialDrafts[`empty-${index}`] = emptyDraft(`empty-${index}`)
  initialDrafts.authored = { ...emptyDraft('authored'), text: 'Keep authored text', revision: 2 }
  initialDrafts.recovering = {
    ...emptyDraft('recovering'),
    text: 'Keep pending recovery',
    status: 'unknown',
    pendingSubmission: { key: 'receipt-key', revision: 1, matchesDraft: true, detached: false },
  }
  initialDrafts.failed = { ...emptyDraft('failed'), text: 'Keep failed input', status: 'failed', error: 'NETWORK' }
  initialDrafts.receipt = { ...emptyDraft('receipt'), lastOperationId: 'operation-1' }
  const drafts = createDrafts(local, undefined, undefined, () => {}, () => false, undefined, undefined, undefined, initialDrafts)

  try {
    drafts.ensure('active')
    expect(Object.keys(drafts.reader.getSnapshot())).toHaveLength(100)
    expect(drafts.reader.getSnapshot()['empty-0']).toBeUndefined()
    expect(drafts.reader.getSnapshot()['empty-1']).toBeDefined()
    expect(drafts.reader.getSnapshot()).toMatchObject({
      active: { text: '', status: 'idle' },
      authored: { text: 'Keep authored text' },
      recovering: { text: 'Keep pending recovery', status: 'unknown' },
      failed: { text: 'Keep failed input', status: 'failed', error: 'NETWORK' },
      receipt: { lastOperationId: 'operation-1' },
    })

    const fullOfAuthoredDrafts: Record<string, SessionDraftState> = {}
    for (let index = 0; index < 100; index++) {
      const sessionId = `owned-${index}`
      fullOfAuthoredDrafts[sessionId] = { ...emptyDraft(sessionId), text: `Draft ${index}`, revision: 1 }
    }
    const blockedLocal = new CommandRegistry()
    const blocked = createDrafts(
      blockedLocal,
      undefined,
      undefined,
      () => {},
      () => false,
      undefined,
      undefined,
      undefined,
      fullOfAuthoredDrafts,
    )
    try {
      const before = blocked.reader.getSnapshot()
      expect(() => blocked.ensure('overflow')).toThrow('Too many session drafts are open')
      expect(blocked.reader.getSnapshot()).toBe(before)
      expect(Object.keys(blocked.reader.getSnapshot())).toHaveLength(100)
    } finally {
      blocked.dispose()
      blockedLocal.dispose()
    }
  } finally {
    drafts.dispose()
    local.dispose()
  }
})

test.each(['malformed', 'session', 'key'] as const)(
  'ordinary %s acceptance retains the original draft until its exact receipt is verified',
  async (mismatch) => {
    const local = new CommandRegistry()
    let accepted: RunAccepted | null = null
    let wrongReceipt = true
    const sentKeys: (string | undefined)[] = []
    const drafts = createDrafts(
      local,
      {
        async execute(_name, _input, options) {
          sentKeys.push(options?.idempotencyKey)
          accepted = runAcceptedSchema.parse({
            status: 'accepted',
            commandId: 'run.submit',
            commandVersion: 1,
            requestId: 'request',
            idempotencyKey: options?.idempotencyKey,
            operationId: 'operation',
            sessionId: 'a',
            acceptedAt: 1,
          })
          if (mismatch === 'malformed') return { status: 'accepted' }
          return { ...accepted, ...(mismatch === 'session' ? { sessionId: 'b' } : { idempotencyKey: 'another-key' }) }
        },
        async getReceipt(sessionId, key) {
          expect(sessionId).toBe('a')
          const originalKey = sentKeys[0]
          if (originalKey === undefined) throw new Error('Run submission did not capture an idempotency key')
          expect(key).toBe(originalKey)
          return accepted && wrongReceipt ? { ...accepted, idempotencyKey: 'another-key' } : accepted
        },
      },
      undefined,
      () => {},
      () => false,
    )
    try {
      await local.execute('draft.setText', { sessionId: 'a', text: 'Keep this original draft' })
      await expect(
        drafts.executeRun('run.submit', {
          sessionId: 'a',
          modelId: 'model',
          input: { text: 'Keep this original draft', images: [], files: [] },
        }),
      ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
      expect(drafts.reader.getSnapshot().a).toMatchObject({ text: 'Keep this original draft', status: 'unknown' })
      await expect(local.execute('draft.reconcileSubmission', { sessionId: 'a' })).rejects.toMatchObject({
        code: 'RESULT_UNKNOWN',
      })
      expect(drafts.reader.getSnapshot().a).toMatchObject({ text: 'Keep this original draft', status: 'unknown' })
      wrongReceipt = false
      expect(await local.execute('draft.reconcileSubmission', { sessionId: 'a' })).toEqual(accepted)
      expect(drafts.reader.getSnapshot().a).toMatchObject({ text: '', status: 'idle', lastOperationId: 'operation' })
      expect(sentKeys).toHaveLength(1)
      const originalKey = sentKeys[0]
      if (originalKey === undefined) throw new Error('Run submission did not capture an idempotency key')
      expect(drafts.getSettledReceipt('a', originalKey)).toEqual(accepted)
      expect(drafts.getSettledReceipt('b', originalKey)).toBeNull()
    } finally {
      drafts.dispose()
      local.dispose()
    }
  },
)

for (const detached of [false, true]) {
  for (const failure of [null, 'CONNECTION_CLOSED', 'EXECUTION_FAILED', 'TIMEOUT'] as const) {
    test(`${detached ? 'detached' : 'ordinary'} acceptance followed by ${failure ?? 'plain Error'} keeps the original receipt owner`, async () => {
      const local = new CommandRegistry()
      let accepted: RunAccepted | null = null
      const sentKeys: string[] = []
      const drafts = createDrafts(
        local,
        {
          async execute(_name, _input, options) {
            const key = options?.idempotencyKey
            if (!key) throw new Error('Missing Run idempotency key')
            sentKeys.push(key)
            accepted = runAcceptedSchema.parse({
              status: 'accepted',
              commandId: 'run.submit',
              commandVersion: 1,
              requestId: 'request',
              idempotencyKey: key,
              operationId: 'operation',
              sessionId: 'a',
              acceptedAt: 1,
            })
            if (failure) throw new CommandError(failure, 'Response lost after Host acceptance')
            throw new Error('Unclassified rejection after Host acceptance')
          },
          async getReceipt(sessionId, key) {
            expect(sessionId).toBe('a')
            expect(sentKeys.includes(key)).toBe(true)
            return accepted
          },
        },
        undefined,
        () => {},
        () => false,
      )
      try {
        await local.execute('draft.setText', { sessionId: 'a', text: 'Original draft' })
        const input = { sessionId: 'a', modelId: 'model', input: { text: 'Original draft', images: [], files: [] } }
        const send = () => (detached ? drafts.executeDetachedRun(input) : drafts.executeRun('run.submit', input))
        await expect(send()).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
        expect(drafts.reader.getSnapshot().a).toMatchObject({ text: 'Original draft', status: 'unknown' })
        await expect(send()).rejects.toMatchObject({ code: 'BUSY' })
        expect(await local.execute('draft.reconcileSubmission', { sessionId: 'a' })).toEqual(accepted)
        expect(sentKeys).toHaveLength(1)
        expect(drafts.reader.getSnapshot().a).toMatchObject({ text: detached ? 'Original draft' : '', status: 'idle' })
      } finally {
        drafts.dispose()
        local.dispose()
      }
    })
  }
}
