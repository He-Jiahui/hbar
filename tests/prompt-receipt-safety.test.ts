import { expect, test } from 'bun:test'
import { CommandError, CommandRegistry } from '@hbar/commands'
import { runAcceptedSchema, type RunAccepted } from '@hbar/contracts/commands/run'
import { createDrafts } from '../packages/app-runtime/src/drafts'

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
