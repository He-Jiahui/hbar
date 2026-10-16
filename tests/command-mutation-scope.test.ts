import { expect, test } from 'bun:test'
import { mkdtemp, rename, mkdir, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, isAbsolute } from 'node:path'
import { z } from 'zod'
import { defineCommand, describeCommand } from '@hbar/commands'
import type {
  CommandExecutionIntent,
  CommandExecutionReceipt,
  CommandExecutionUpdate,
} from '@hbar/contracts/command-execution'
import { Storage, createPathLayout, ensurePathLayout, isDurableSessionEvent } from '@hbar/storage'
import { SessionLogWriter } from '../packages/storage/src/session-log-writer'
import { CommandMutationAdmission } from '../apps/host/src/command-mutation-admission'
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
  z.strictObject({}),
  z.unknown(),
)
const inline = (value: unknown) => ({ kind: 'inline' as const, json: JSON.stringify(value) })
async function failure(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation
  } catch (error) {
    return error
  }
  throw new Error('Expected mutation to be rejected')
}

async function fixture() {
  const prefix = 'hbar-command-mutation-scope-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  await ensurePathLayout(layout)
  let storage = new Storage(layout.database, layout)
  await storage.call('ready')
  const workspace = await storage.call('createWorkspace', root, 'Source task')
  const session = await storage.call('createSessionCommand', {
    workspaceId: workspace.id,
    actorId: 'task-actor',
    idempotencyKey: 'create',
  })
  const run = await storage.call('enqueue', session.id, 'root-run', { text: 'Root task', images: [] }, 'fixture')
  await storage.call('claim', session.id)
  async function child(parent = { session, run }) {
    const session = await storage.call('createSession', workspace.id, 'Derived task', parent.session.id, {
      kind: 'run',
      runId: parent.run.id,
    })
    const run = await storage.call(
      'enqueue',
      session.id,
      'child-run',
      { text: 'Child task', images: [] },
      'fixture',
      undefined,
      undefined,
      parent.run.id,
    )
    await storage.call('claim', session.id)
    return { session, run }
  }
  function intent(source: { session: { id: string }; run: { id: string } }, key = 'write'): CommandExecutionIntent {
    return {
      sessionId: source.session.id,
      actorId: 'task-actor',
      runId: source.run.id,
      callId: key,
      operationKey: key,
      invocation: {
        protocol: 1,
        commandId: definition.metadata.id,
        commandVersion: 1,
        requestId: key,
        idempotencyKey: key,
        input: {},
      },
      expectation: { descriptor: describeCommand(definition), input: {} },
    }
  }
  async function update(receipt: CommandExecutionReceipt, change: CommandExecutionUpdate['change']) {
    return storage.call('commandExecutionUpdate', {
      sessionId: receipt.sessionId,
      actorId: receipt.actorId,
      operationKey: receipt.operationKey,
      expectedRevision: receipt.revision,
      change,
    })
  }
  return {
    root,
    layout,
    workspace,
    session,
    run,
    child,
    intent,
    update,
    get storage() {
      return storage
    },
    async rebuild() {
      await storage.close()
      await rename(layout.database, join(root, `projection-${crypto.randomUUID()}.sqlite`))
      storage = new Storage(layout.database, layout)
      await storage.call('ready')
    },
    async close() {
      await storage.close()
      await removeOwnedTestDirectory(root, prefix)
    },
  }
}

test('original task guards fence parent, sibling and grandchild mutations and survive a canonical-log rebuild', async () => {
  const f = await fixture()
  try {
    const child = await f.child(),
      sibling = await f.child(),
      grandchild = await f.child(child)
    const intent = f.intent(child)
    let receipt = (await f.storage.call('commandExecutionAccept', intent)).receipt
    const metadata = { sessionId: child.session.id, runId: child.run.id, operationKey: 'write', reason: 'pending' }
    expect((await f.storage.call('commandExecutionPending', f.session.id)).items).toMatchObject([metadata])
    expect(isDurableSessionEvent('run.commandMutation.fixture')).toBe(true)
    const unrelated = await f.storage.call('createSessionCommand', {
      workspaceId: f.workspace.id,
      actorId: 'task-actor',
      idempotencyKey: 'unrelated',
    })
    const unrelatedRun = await f.storage.call(
      'enqueue',
      unrelated.id,
      'unrelated-run',
      { text: 'Independent', images: [] },
      'fixture',
    )
    await new CommandMutationAdmission(f.storage).assertAllowed({ sessionId: unrelated.id, runId: unrelatedRun.id })
    await f.rebuild()
    for (const source of [{ session: f.session, run: f.run }, sibling, grandchild]) {
      expect(
        await failure(
          new CommandMutationAdmission(f.storage).assertAllowed({ sessionId: source.session.id, runId: source.run.id }),
        ),
      ).toMatchObject({ code: 'COMMAND_RESULT_UNCONFIRMED' })
    }
    await new CommandMutationAdmission(f.storage).assertAllowed(
      { sessionId: child.session.id, runId: child.run.id },
      intent,
    )
    receipt = await f.update(receipt, {
      kind: 'bind',
      owner: { kind: 'host', instanceId: 'fixture', jobId: 'never-dispatched' },
    })
    receipt = await f.update(receipt, {
      kind: 'logical',
      payload: inline({ ok: false, error: { code: 'RESULT_UNKNOWN', message: 'Inspect original owner' } }),
    })
    expect((await f.storage.call('commandExecutionPending', f.session.id)).items[0]?.revision).toBe(receipt.revision)
    await f.update(receipt, {
      kind: 'settled',
      physical: {
        status: 'failed',
        executionStarted: false,
        payload: inline({ error: { code: 'NOT_STARTED', message: 'Fixture command was never dispatched' } }),
      },
    })
    await f.rebuild()
    expect((await f.storage.call('commandExecutionPending', f.session.id)).items).toEqual([])
    for (const source of [{ session: f.session, run: f.run }, sibling, grandchild])
      await new CommandMutationAdmission(f.storage).assertAllowed({
        sessionId: source.session.id,
        runId: source.run.id,
      })
  } finally {
    await f.close()
  }
})

test('task guards retain nested unknown failures and bound metadata across descendants and direct commands', async () => {
  const f = await fixture()
  try {
    const child = await f.child()
    let receipt = (await f.storage.call('commandExecutionAccept', f.intent(child))).receipt
    receipt = await f.update(receipt, {
      kind: 'bind',
      owner: { kind: 'host', instanceId: 'fixture', jobId: 'lost-owner' },
    })
    await f.update(receipt, {
      kind: 'settled',
      physical: {
        status: 'failed',
        executionStarted: true,
        payload: inline({ error: { code: 'IPC_DISCONNECTED', message: 'Original nested owner is unavailable' } }),
      },
    })
    expect((await f.storage.call('commandExecutionPending', f.session.id)).items).toMatchObject([
      { reason: 'unconfirmed_failure' },
    ])
    for (let index = 0; index < 63; index++)
      await f.storage.call('commandExecutionAccept', f.intent(child, `child-${index}`))
    await f.storage.call('commandExecutionAccept', f.intent({ session: f.session, run: f.run }, 'direct'))
    const pending = await f.storage.call('commandExecutionPending', f.session.id)
    expect(pending.items).toHaveLength(64)
    expect(pending.hasMore).toBe(true)
    const durations = []
    for (let index = 0; index < 16; index++) {
      const started = performance.now()
      await f.storage.call('commandExecutionPending', f.session.id)
      durations.push(performance.now() - started)
    }
    durations.sort((left, right) => left - right)
    console.info(
      JSON.stringify({
        event: 'task-command-metadata-read-latency',
        samples: durations.length,
        unconfirmed: 65,
        p95Ms: durations.at(15),
        maxMs: durations.at(-1),
      }),
    )
    expect(Object.keys(pending.items[0] ?? {}).sort()).toEqual([
      'actorId',
      'commandId',
      'operationKey',
      'reason',
      'revision',
      'runId',
      'sessionId',
    ])
    expect(
      await failure(
        new CommandMutationAdmission(f.storage, () => true).assertAllowed({ sessionId: f.session.id, runId: f.run.id }),
      ),
    ).toMatchObject({ code: 'COMMAND_RESULT_UNCONFIRMED' })
  } finally {
    await f.close()
  }
})

test('real Storage and node unknown-outcome codes remain restrictions in both direct and inherited scopes', async () => {
  const f = await fixture()
  try {
    const child = await f.child()
    for (const code of ['EFFECT_UNKNOWN', 'STORAGE_RESULT_UNKNOWN', 'STORAGE_TIMEOUT', 'NODE_CONFIRMATION_UNKNOWN']) {
      for (const source of [{ session: f.session, run: f.run }, child]) {
        let receipt = (await f.storage.call('commandExecutionAccept', f.intent(source, code))).receipt
        receipt = await f.update(receipt, {
          kind: 'bind',
          owner: { kind: 'host', instanceId: 'fixture', jobId: `${code}-${source.session.id}` },
        })
        await f.update(receipt, {
          kind: 'settled',
          physical: {
            status: 'failed',
            executionStarted: true,
            payload: inline({ error: { code, message: 'Reconcile the nested operation' } }),
          },
        })
      }
    }
    const pending = await f.storage.call('commandExecutionPending', f.session.id)
    expect(pending.items).toHaveLength(8)
    expect(pending.items.every((item) => item.reason === 'unconfirmed_failure')).toBe(true)
    expect((await f.storage.call('commandExecutionPending', child.session.id)).items).toHaveLength(4)
  } finally {
    await f.close()
  }
})

test('a partial child-journal failure retains the durable original-task restriction even without a source receipt', async () => {
  const f = await fixture()
  let childLog: string | undefined, heldLog: string | undefined
  try {
    const child = await f.child()
    const writer = new SessionLogWriter(f.layout.sessions)
    childLog = writer.file(f.workspace.id, child.session.id, Date.now())
    heldLog = join(f.root, 'held-child.jsonl')
    for (const path of [childLog, heldLog]) {
      const within = relative(f.root, path)
      if (isAbsolute(within) || within.startsWith('..')) throw new Error('Log fault must stay inside the owned fixture')
    }
    await rename(childLog, heldLog)
    await mkdir(childLog)
    const intent = f.intent(child)
    expect(await failure(f.storage.call('commandExecutionAccept', intent))).toMatchObject({
      code: 'STORAGE_RESULT_UNKNOWN',
    })
    await f.storage.close()
    await rmdir(childLog)
    await rename(heldLog, childLog)
    childLog = undefined
    heldLog = undefined
    await f.rebuild()
    expect(
      await f.storage.call('commandExecutionRead', {
        sessionId: intent.sessionId,
        actorId: intent.actorId,
        operationKey: intent.operationKey,
      }),
    ).toBeNull()
    expect((await f.storage.call('commandExecutionPending', f.session.id)).items).toMatchObject([
      { sessionId: child.session.id, operationKey: 'write', reason: 'pending' },
    ])
    expect(
      await failure(
        new CommandMutationAdmission(f.storage).assertAllowed({ sessionId: child.session.id, runId: child.run.id }),
      ),
    ).toMatchObject({ code: 'COMMAND_RESULT_UNCONFIRMED' })
  } finally {
    await f.storage.close()
    if (childLog && heldLog) {
      await rmdir(childLog)
      await rename(heldLog, childLog)
    }
    await f.close()
  }
})
