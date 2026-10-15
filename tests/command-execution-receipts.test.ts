import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { defineCommand, describeCommand } from '@hbar/commands'
import {
  commandReceiptPayloadSchema,
  commandExecutionIntentSchema,
  commandExecutionOwnerSchema,
  type CommandExecutionIdentity,
  type CommandExecutionIntent,
  type CommandExecutionReceipt,
  type CommandExecutionUpdate,
} from '@hbar/contracts/command-execution'
import { Storage, isDurableSessionEvent } from '@hbar/storage'
import { removeOwnedTestDirectory } from './owned-temp-directory'

const definition = defineCommand(
  {
    id: 'fixture.write',
    version: 1,
    owner: 'fixture',
    execution: 'host',
    kind: 'command',
    stateEffect: 'persistent',
    scope: 'session',
    category: 'fixture',
    titleKey: 'fixture',
    descriptionKey: 'fixture',
    surfaces: ['api'],
    idempotency: 'required',
  },
  z.strictObject({ sessionId: z.string(), path: z.string().default('proof.txt') }),
  z.unknown(),
)
const owner = {
  kind: 'runtime' as const,
  owner: { unitId: 'controller', generation: 1, incarnation: 'owner-a' },
  jobId: 'job-a',
}
const inline = (value: unknown) => ({ kind: 'inline' as const, json: JSON.stringify(value) })
async function failure(action: Promise<unknown>): Promise<unknown> {
  try {
    await action
  } catch (error) {
    return error
  }
  throw new Error('Expected receipt operation to fail')
}
async function fixture() {
  const prefix = 'hbar-command-receipts-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const database = join(root, 'test.sqlite')
  let storage = new Storage(database)
  await storage.call('ready')
  const workspace = await storage.call('createWorkspace', root, 'Command receipt fixture')
  const session = await storage.call('createSessionCommand', {
    workspaceId: workspace.id,
    actorId: 'actor-a',
    idempotencyKey: 'create-session',
  })
  const run = await storage.call('enqueue', session.id, 'first-run', { text: 'write', images: [] }, 'fixture')
  const identity: CommandExecutionIdentity = { sessionId: session.id, actorId: 'actor-a', operationKey: 'write-proof' }
  const input = definition.input.parse({ sessionId: session.id })
  const intent: CommandExecutionIntent = {
    ...identity,
    runId: run.id,
    callId: 'call-a',
    invocation: {
      protocol: 1,
      commandId: definition.metadata.id,
      commandVersion: 1,
      requestId: 'request-a',
      idempotencyKey: 'write-proof',
      input,
    },
    expectation: { descriptor: describeCommand(definition), input },
  }
  return {
    root,
    database,
    session,
    run,
    identity,
    intent,
    get storage() {
      return storage
    },
    async claim() {
      await storage.call('claim', session.id)
    },
    async update(receipt: CommandExecutionReceipt, change: CommandExecutionUpdate['change']) {
      return storage.call('commandExecutionUpdate', { ...identity, expectedRevision: receipt.revision, change })
    },
    async rebuild() {
      await storage.close()
      await rename(database, join(root, 'old-projection.sqlite'))
      storage = new Storage(database)
      await storage.call('ready')
    },
    async close() {
      await storage.close()
      await removeOwnedTestDirectory(root, prefix)
    },
  }
}

test('command intents require an authenticated active Run and atomically deduplicate canonical inputs', async () => {
  const f = await fixture()
  try {
    expect(await failure(f.storage.call('commandExecutionAccept', f.intent))).toMatchObject({
      code: 'COMMAND_SOURCE_INACTIVE',
    })
    await f.claim()
    expect(await failure(f.storage.call('commandExecutionAccept', { ...f.intent, actorId: 'forged' }))).toMatchObject({
      code: 'EXECUTION_PRINCIPAL_SOURCE',
    })
    const accepted = await Promise.all([
      f.storage.call('commandExecutionAccept', f.intent),
      f.storage.call('commandExecutionAccept', {
        ...f.intent,
        callId: 'call-repeated',
        invocation: {
          ...f.intent.invocation,
          requestId: 'request-repeated',
          input: { path: 'proof.txt', sessionId: f.session.id },
        },
      }),
    ])
    expect(accepted.map((item) => item.created)).toEqual([true, false])
    expect(accepted[0]?.receipt).toEqual(accepted[1]?.receipt)
    expect(accepted[1]?.receipt.callId).toBe('call-a')
    const changed = { sessionId: f.session.id, path: 'other.txt' }
    expect(
      await failure(
        f.storage.call('commandExecutionAccept', {
          ...f.intent,
          invocation: { ...f.intent.invocation, input: changed },
          expectation: { ...f.intent.expectation, input: changed },
        }),
      ),
    ).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    expect(
      await failure(
        f.storage.call('commandExecutionAccept', {
          ...f.intent,
          invocation: { ...f.intent.invocation, input: changed },
        }),
      ),
    ).toMatchObject({ code: 'COMMAND_PREPARATION_STALE' })
    expect(await f.storage.call('commandExecutionRead', { ...f.identity, actorId: 'actor-b' })).toBeNull()
    const clientIntent = { ...f.intent, operationKey: 'client-target', target: { clientId: 'client-a', generation: 2 } }
    expect(commandExecutionIntentSchema.safeParse(clientIntent).success).toBe(true)
    expect(
      commandExecutionOwnerSchema.safeParse({ kind: 'client', ...clientIntent.target, jobId: 'job-client' }).success,
    ).toBe(true)
    expect(
      commandExecutionIntentSchema.safeParse({ ...clientIntent, target: { ...clientIntent.target, generation: '2' } })
        .success,
    ).toBe(false)
    await f.storage.call('commandExecutionAccept', clientIntent)
    expect(
      await failure(
        f.storage.call('commandExecutionAccept', {
          ...clientIntent,
          target: { ...clientIntent.target, generation: 3 },
        }),
      ),
    ).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    await f.storage.call('requestCancel', f.run.id)
    expect(
      await failure(f.storage.call('commandExecutionAccept', { ...f.intent, operationKey: 'after-stop' })),
    ).toMatchObject({ code: 'COMMAND_SOURCE_CANCELLED' })
    await f.storage.call('setRun', f.run.id, 'completed')
    expect((await f.storage.call('commandExecutionAccept', f.intent)).created).toBe(false)
    expect(
      await failure(f.storage.call('commandExecutionAccept', { ...f.intent, operationKey: 'new-operation' })),
    ).toMatchObject({ code: 'COMMAND_SOURCE_INACTIVE' })
  } finally {
    await f.close()
  }
})

test('receipts preserve exact owners and immutable results, reconcile late settlement, and survive canonical rebuild', async () => {
  const f = await fixture()
  try {
    await f.claim()
    let receipt = (await f.storage.call('commandExecutionAccept', f.intent)).receipt
    expect(await failure(f.update(receipt, { kind: 'acknowledged' }))).toMatchObject({ code: 'COMMAND_JOB_ACTIVE' })
    expect(
      await failure(f.update(receipt, { kind: 'logical', payload: inline({ ok: true, result: 'early' }) })),
    ).toMatchObject({ code: 'COMMAND_OWNER_REQUIRED' })
    receipt = await f.update(receipt, { kind: 'bind', owner })
    const bound = receipt
    expect(await failure(f.update(receipt, { kind: 'bind', owner: { ...owner, jobId: 'other-job' } }))).toMatchObject({
      code: 'COMMAND_OWNER_CONFLICT',
    })
    receipt = await f.update(receipt, {
      kind: 'uncertain',
      error: { code: 'RESULT_UNKNOWN', message: 'Transport interrupted' },
    })
    await f.rebuild()
    expect(await f.storage.call('commandExecutionRead', f.identity)).toEqual(receipt)
    expect(receipt.physical).toBeNull()
    expect(
      await failure(f.update(bound, { kind: 'logical', payload: inline({ ok: true, result: 'stale' }) })),
    ).toMatchObject({ code: 'COMMAND_RECEIPT_REVISION_CONFLICT' })
    receipt = await f.update(receipt, {
      kind: 'logical',
      payload: inline({ ok: false, error: { code: 'RESULT_UNKNOWN', message: 'Timed out' } }),
    })
    const logical = receipt.logical
    receipt = await f.update(receipt, {
      kind: 'settled',
      physical: {
        status: 'succeeded',
        executionStarted: true,
        payload: inline({ status: 'succeeded', executionStarted: true, result: { text: '中文🎯', created: true } }),
      },
    })
    expect(receipt.logical).toEqual(logical)
    expect(receipt.uncertainty).toBeNull()
    expect(await f.update(bound, { kind: 'bind', owner })).toEqual(receipt)
    expect(
      await failure(
        f.update(receipt, {
          kind: 'settled',
          physical: {
            status: 'failed',
            executionStarted: true,
            payload: inline({ error: 'changed' }),
          },
        }),
      ),
    ).toMatchObject({ code: 'COMMAND_RECEIPT_CONFLICT' })
    receipt = await f.update(receipt, { kind: 'acknowledged' })
    expect(receipt.acknowledgedAt).toBeNumber()
    expect(await f.update(bound, { kind: 'acknowledged' })).toEqual(receipt)
    await f.rebuild()
    expect(await f.storage.call('commandExecutionRead', f.identity)).toEqual(receipt)
    expect((await f.storage.call('commandExecutionAccept', f.intent)).receipt).toEqual(receipt)
    expect(
      (await f.storage.call('events', f.session.id, 0, 100))
        .filter((event) => event.type.startsWith('run.commandExecution.'))
        .every((event) => isDurableSessionEvent(event.type)),
    ).toBe(true)
  } finally {
    await f.close()
  }
})

test('receipt payloads reject truncated and oversized JSON and unknown artifact metadata without changing the record', async () => {
  expect(commandReceiptPayloadSchema.safeParse({ kind: 'inline', json: '{"partial":' }).success).toBe(false)
  expect(commandReceiptPayloadSchema.safeParse({ kind: 'inline', json: '1e999' }).success).toBe(false)
  expect(
    commandReceiptPayloadSchema.safeParse({ kind: 'inline', json: '['.repeat(65) + '0' + ']'.repeat(65) }).success,
  ).toBe(false)
  expect(commandReceiptPayloadSchema.safeParse(inline('中'.repeat(30_000))).success).toBe(false)
  expect(
    commandReceiptPayloadSchema.safeParse({
      kind: 'artifacts',
      sha256: 'a'.repeat(64),
      bytes: 1,
      chunks: [{ id: 'b'.repeat(64), name: 'chunk.bin', mime: 'application/octet-stream', size: 2 }],
    }).success,
  ).toBe(false)
  const f = await fixture()
  try {
    await f.claim()
    let receipt = (await f.storage.call('commandExecutionAccept', f.intent)).receipt
    receipt = await f.update(receipt, { kind: 'bind', owner })
    expect(
      await failure(
        f.update(receipt, {
          kind: 'logical',
          payload: {
            kind: 'artifacts',
            sha256: 'a'.repeat(64),
            bytes: 2,
            chunks: [{ id: 'b'.repeat(64), name: 'chunk.bin', mime: 'application/octet-stream', size: 2 }],
          },
        }),
      ),
    ).toMatchObject({ code: 'COMMAND_RECEIPT_ARTIFACT' })
    expect(await f.storage.call('commandExecutionRead', f.identity)).toEqual(receipt)
    const db = new Database(f.database, { readonly: true, strict: true })
    try {
      expect(
        db
          .query<{ detail: string }, [string, string]>(
            'EXPLAIN QUERY PLAN SELECT sessionId,runId,data FROM events WHERE sessionId=? AND type=? ORDER BY seq DESC LIMIT 1',
          )
          .all(f.session.id, 'run.commandExecution.fixture')
          .some((row) => row.detail.includes('events_session_type_seq')),
      ).toBe(true)
      expect(db.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
      expect(db.query('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      db.close()
    }
  } finally {
    await f.close()
  }
})
