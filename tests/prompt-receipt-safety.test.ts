import { expect, test } from 'bun:test'
import { CommandRegistry } from '@hbar/commands'
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
