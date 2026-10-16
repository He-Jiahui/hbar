import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { defineCommand, describeCommand } from '@hbar/commands'
import type { CommandExecutionReceipt, CommandExecutionUpdate } from '@hbar/contracts/command-execution'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout, Storage, type StoragePort } from '@hbar/storage'
import { CommandMutationAdmission } from '../apps/host/src/command-mutation-admission'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { removeOwnedTestDirectory } from './owned-temp-directory'

const definition = defineCommand(
  {
    id: 'fixture.notStarted',
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

async function failure(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation
  } catch (error) {
    return error
  }
  throw new Error('Expected mutation admission to be rejected')
}

async function pending(storage: StoragePort, root: string) {
  const workspace = await storage.call('createWorkspace', root, 'Mutation admission')
  const session = await storage.call('createSessionCommand', {
    workspaceId: workspace.id,
    actorId: 'fixture-actor',
    idempotencyKey: 'create',
  })
  const run = await storage.call(
    'enqueue',
    session.id,
    'old-run',
    { text: 'Never dispatched', images: [] },
    'local-fixture',
  )
  await storage.call('claim', session.id)
  const accepted = await storage.call('commandExecutionAccept', {
    sessionId: session.id,
    actorId: 'fixture-actor',
    runId: run.id,
    callId: 'old-call',
    operationKey: 'old-key',
    invocation: {
      protocol: 1,
      commandId: definition.metadata.id,
      commandVersion: 1,
      requestId: 'old-request',
      idempotencyKey: 'old-key',
      input: {},
    },
    expectation: { descriptor: describeCommand(definition), input: {} },
  })
  async function update(receipt: CommandExecutionReceipt, change: CommandExecutionUpdate['change']) {
    return storage.call('commandExecutionUpdate', {
      sessionId: session.id,
      actorId: 'fixture-actor',
      operationKey: 'old-key',
      expectedRevision: receipt.revision,
      change,
    })
  }
  return { session, run, receipt: accepted.receipt, update }
}

test('the Host mutation gate reads durable facts and only exempts a known original call in its current Run', async () => {
  const prefix = 'hbar-command-mutation-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const storage = new Storage(join(root, 'state.sqlite'))
  await storage.call('ready')
  try {
    const f = await pending(storage, root)
    const context = { sessionId: f.session.id, runId: f.run.id }
    expect(await failure(new CommandMutationAdmission(storage).assertAllowed(context))).toMatchObject({
      code: 'COMMAND_RESULT_UNCONFIRMED',
    })
    const gate = new CommandMutationAdmission(
      storage,
      (item, runId) => item.runId === runId && item.reason === 'pending',
    )
    await gate.assertAllowed(context)
    expect(await failure(gate.assertAllowed({ ...context, runId: 'later-run' }))).toMatchObject({
      code: 'COMMAND_RESULT_UNCONFIRMED',
    })
    await new CommandMutationAdmission(storage).assertAllowed(context, f.receipt)
    const bound = await f.update(f.receipt, {
      kind: 'bind',
      owner: { kind: 'host', instanceId: 'fixture', jobId: 'not-dispatched' },
    })
    await f.update(bound, {
      kind: 'settled',
      physical: {
        status: 'failed',
        executionStarted: false,
        payload: {
          kind: 'inline',
          json: JSON.stringify({ error: { code: 'NOT_STARTED', message: 'Fixture command was never dispatched' } }),
        },
      },
    })
    await new CommandMutationAdmission(storage).assertAllowed(context)
  } finally {
    await storage.close()
    await removeOwnedTestDirectory(root, prefix)
  }
})

test('a cancelled Host reconciliation read cannot admit a mutation after its storage reply', async () => {
  const prefix = 'hbar-command-mutation-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const storage = new Storage(join(root, 'state.sqlite'))
  await storage.call('ready')
  const controller = new AbortController()
  const cancellable: StoragePort = {
    close: () => storage.close(),
    call: async (method, ...args) => {
      const result = await storage.call(method, ...args)
      controller.abort(new Error('Cancelled during reconciliation'))
      return result
    },
  }
  try {
    expect(
      await failure(
        new CommandMutationAdmission(cancellable).assertAllowed({
          sessionId: 'empty-session',
          runId: 'cancelled-run',
          signal: controller.signal,
        }),
      ),
    ).toMatchObject({ message: 'Cancelled during reconciliation' })
  } finally {
    await storage.close()
    await removeOwnedTestDirectory(root, prefix)
  }
})

test('the production Run gateway blocks builtin writes after an unconfirmed command, permits reads and resumes after proven nonexecution', async () => {
  const prefix = 'hbar-command-mutation-host-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  const runtime = await ProcessHostRuntime.create({
    layout,
    sourceRoot: process.cwd(),
    demo: true,
    workspace: root,
    secrets: new MemorySecrets(),
  })
  try {
    const f = await pending(runtime.storage, root)
    await runtime.storage.call('setRun', f.run.id, 'failed', 'Fixture intent was accepted without dispatch')
    async function run(requestId: string, text: string) {
      const run = await runtime.kernel.submit(
        f.session.id,
        requestId,
        { text, images: [], approval: 'allow' },
        'local-fixture',
      )
      await runtime.waitForIdle()
      return { run, snapshot: await runtime.storage.call('snapshot', f.session.id) }
    }
    const blocked = await run('blocked-write', '/tool write_file {"path":"proof.txt","text":"must wait"}')
    expect(await Bun.file(join(root, 'proof.txt')).exists()).toBe(false)
    expect(
      blocked.snapshot.messages
        .flatMap((message) => message.content)
        .some(
          (block) =>
            block.type === 'tool_result' && block.isError && block.text.includes('requires result reconciliation'),
        ),
    ).toBe(true)
    expect(
      (await runtime.storage.call('events', f.session.id, 0, 2_000)).filter(
        (event) => event.type === 'tool.started' && event.runId === blocked.run.id,
      ),
    ).toHaveLength(0)
    await Bun.write(join(root, 'inspection.txt'), 'Inspection remains available')
    const inspection = await run('allowed-inspection', '/tool read_file {"path":"inspection.txt"}')
    expect(
      inspection.snapshot.messages
        .flatMap((message) => message.content)
        .some(
          (block) =>
            block.type === 'tool_result' && !block.isError && block.text.includes('Inspection remains available'),
        ),
    ).toBe(true)
    const bound = await f.update(f.receipt, {
      kind: 'bind',
      owner: { kind: 'host', instanceId: runtime.snapshot().instanceId, jobId: 'fixture-not-started' },
    })
    await f.update(bound, {
      kind: 'settled',
      physical: {
        status: 'failed',
        executionStarted: false,
        payload: {
          kind: 'inline',
          json: JSON.stringify({ error: { code: 'NOT_STARTED', message: 'Fixture command was never dispatched' } }),
        },
      },
    })
    await run('confirmed-write', '/tool write_file {"path":"proof.txt","text":"confirmed"}')
    expect(await Bun.file(join(root, 'proof.txt')).text()).toBe('confirmed')
    expect(runtime.coordinator.snapshot()).toMatchObject({ sessions: 0, resources: 0, physicalTools: 0 })
  } finally {
    await runtime.close()
    await removeOwnedTestDirectory(root, prefix)
  }
}, 120_000)
