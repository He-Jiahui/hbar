import { expect, test } from 'bun:test'
import { CommandError, CommandRegistry } from '@hbar/commands'
import { createDrafts } from '../packages/app-runtime/src/drafts'
import { serializeMentions } from '../packages/app-runtime/src/composer-mentions'
import type { RunCommandPort } from '@hbar/app-runtime'

const mention = { start: 7, end: 15, label: 'file.ts', path: 'src/file.ts', workspaceId: 'w1', directory: false }

test('only captured mention spans serialize; identical handwritten text remains literal', () => {
  expect(serializeMentions('Review @file.ts and @file.ts', [mention], 'w1')).toBe('Review @"src/file.ts" and @file.ts')
  expect(() => serializeMentions('Review @file.ts', [mention], 'w2')).toThrow(CommandError)
  expect(() => serializeMentions('Review @fileXts', [mention], 'w1')).toThrow(CommandError)
  expect(serializeMentions('Review @file.ts', [], 'w1')).toBe('Review @file.ts')
  for (const path of ['/etc/passwd', '../outside', 'src//bad', 'C:/windows', 'a/./b', 'a/../b', 'a\\b', 'a\u0000b']) {
    expect(() => serializeMentions('Review @file.ts', [{ ...mention, path }], 'w1')).toThrow(CommandError)
  }
})

test('draft revisions bind text and mentions atomically; edits invalidate structured authority', async () => {
  const local = new CommandRegistry()
  const drafts = createDrafts(
    local,
    undefined,
    undefined,
    () => {},
    () => false,
  )
  try {
    await local.execute('draft.setContent', {
      sessionId: 's1',
      text: 'Review @file.ts',
      mentions: [mention],
      expectedRevision: 0,
    })
    expect(drafts.serializeSubmission('s1', 1, 'w1', 'Review @file.ts')).toBe('Review @"src/file.ts"')
    await expect(
      local.execute('draft.setContent', { sessionId: 's1', text: 'bad', mentions: [mention], expectedRevision: 1 }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(
      local.execute('draft.setContent', { sessionId: 's1', text: 'late', mentions: [], expectedRevision: 0 }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
    await local.execute('draft.setText', { sessionId: 's1', text: 'Review @file.ts!' })
    expect(drafts.reader.getSnapshot().s1?.mentions).toEqual([])
    expect(drafts.serializeSubmission('s1', 2, 'w1', 'Review @file.ts!')).toBe('Review @file.ts!')
    await expect(
      Promise.resolve().then(() => drafts.serializeSubmission('s1', 1, 'w1', 'Review @file.ts')),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
  } finally {
    drafts.dispose()
    local.dispose()
  }
})

test('accepted and uncertain Run receipts settle only their original structured mention draft', async () => {
  const local = new CommandRegistry()
  let sends = 0
  let unknown = false
  let receipt: import('@hbar/contracts/commands/run').RunAccepted | null = null
  const run: RunCommandPort = {
    async execute(_name, input, options) {
      sends += 1
      const target = input as { sessionId: string; input: { text: string } }
      expect(target.input.text).toBe('Review @"src/file.ts"')
      receipt = {
        status: 'accepted',
        commandId: 'run.submit',
        commandVersion: 1,
        requestId: crypto.randomUUID(),
        idempotencyKey: options?.idempotencyKey ?? '',
        operationId: crypto.randomUUID(),
        sessionId: target.sessionId,
        acceptedAt: Date.now(),
      }
      if (unknown) throw new CommandError('RESULT_UNKNOWN', 'Reply lost after acceptance')
      return receipt
    },
    async getReceipt() {
      return receipt
    },
  }
  const drafts = createDrafts(
    local,
    run,
    undefined,
    () => {},
    () => false,
  )
  try {
    const submit = () =>
      drafts.executeRun('run.submit', {
        sessionId: 's1',
        modelId: 'model',
        input: { text: 'Review @"src/file.ts"', images: [] },
      })
    await local.execute('draft.setContent', {
      sessionId: 's1',
      text: 'Review @file.ts',
      mentions: [mention],
      expectedRevision: 0,
    })
    await submit()
    expect(drafts.reader.getSnapshot().s1).toMatchObject({ text: '', mentions: [], status: 'idle' })
    unknown = true
    const nextRevision = drafts.reader.getSnapshot().s1!.revision
    await local.execute('draft.setContent', {
      sessionId: 's1',
      text: 'Review @file.ts',
      mentions: [mention],
      expectedRevision: nextRevision,
    })
    await expect(submit()).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(drafts.reader.getSnapshot().s1).toMatchObject({
      text: 'Review @file.ts',
      mentions: [mention],
      status: 'unknown',
    })
    expect(sends).toBe(2)
    await local.execute('draft.setContent', {
      sessionId: 's1',
      text: 'Review @file.ts more',
      mentions: [mention],
      expectedRevision: drafts.reader.getSnapshot().s1!.revision,
    })
    await local.execute('draft.reconcileSubmission', { sessionId: 's1' })
    expect(sends).toBe(2)
    expect(drafts.reader.getSnapshot().s1).toMatchObject({
      text: 'Review @file.ts more',
      mentions: [mention],
      status: 'idle',
    })
  } finally {
    drafts.dispose()
    local.dispose()
  }
})
