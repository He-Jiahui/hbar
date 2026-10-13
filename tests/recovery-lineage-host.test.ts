import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarClient, createOperationWatcher, createRunCommandClient } from '@hbar/client'
import type { SessionEvent } from '@hbar/contracts'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout } from '@hbar/storage'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { startServer } from '../apps/host/src/server'
import { waitForRun } from '../apps/cli/src/runtime'

async function until(check: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 30_000
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error('Recovery lineage did not settle')
    await Bun.sleep(20)
  }
}
test('CLI and an operation-only SDK watcher follow the same interrupted identity to its real successor terminal result', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-lineage-'))
  const runtime = await ProcessHostRuntime.create({
    layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
    demo: true,
    workspace: root,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(runtime.kernel, { port: 0, runtime, controller: runtime.controller })
  const cli = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  const observer = new HbarClient(
    `http://127.0.0.1:${host.server.port}`,
    (await host.auth.createDevice('SDK operation-only fixture')).token,
  )
  let closeWatch = async () => {}
  try {
    await cli.pair(host.pairing.code, 'CLI lineage fixture')
    await cli.connect()
    await observer.connect()
    const workspace = (await runtime.storage.call('workspaces'))[0]!,
      session = await runtime.storage.call('createSession', workspace.id)
    const run = await runtime.kernel.submit(session.id, 'lineage-test', { text: '/slow', images: [] }, 'local-fixture')
    const events: SessionEvent[] = []
    const watch = await createOperationWatcher(observer).watch(run.id, 0, (update) => {
      if (update.kind === 'event') events.push(update.event)
    })
    closeWatch = watch.close
    const done = waitForRun(cli, session, run, 'silent', 'defer').then(
      (result) => ({ result, error: null }),
      (error: unknown) => ({ result: null, error }),
    )
    await until(() => runtime.facade.streams.size > 0)
    const kernel = runtime.snapshot().units.find((unit) => unit.descriptor.id === 'kernel')!.generations[0]!
    if (!kernel.pid || kernel.pid === process.pid) throw new Error('Expected the fixture Kernel PID')
    process.kill(kernel.pid, 'SIGKILL')
    await runtime.waitForIdle()
    const recovery = await runtime.storage.call('runtimeRecoveryRead', run.id)
    if (!recovery?.run) throw new Error('Expected a durable continuation')
    const completion = await done
    expect(completion.error).toBeNull()
    expect(completion.result?.run).toMatchObject({ id: recovery.run.id, status: 'completed' })
    expect((await runtime.storage.call('run', run.id)).status).toBe('interrupted')
    await until(() => events.some((event) => event.runId === recovery.run!.id && event.type === 'run.settled'))
    const state = await createRunCommandClient(observer).execute('operation.get', { operationId: run.id })
    expect(state).toMatchObject({
      operationId: run.id,
      executionRunId: recovery.run.id,
      status: 'completed',
      recovery: { status: 'settled', attempts: 1 },
    })
    expect(completion.result?.snapshot.messages.filter((message) => message.role === 'user')).toHaveLength(1)
    expect(cli.connectionStatus()).toBe('connected')
    expect(observer.connectionStatus()).toBe('connected')
  } finally {
    await closeWatch()
    cli.disconnect()
    observer.disconnect()
    await host.close()
    await runtime.close()
    await rm(root, { recursive: true, force: true })
  }
}, 40_000)

test('the managed Controller admits a manual continuation through the retained chain without replacing any runtime or websocket', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-manual-lineage-'))
  const runtime = await ProcessHostRuntime.create({
    layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
    demo: true,
    workspace: root,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(runtime.kernel, { port: 0, runtime, controller: runtime.controller })
  const client = new HbarClient(
    `http://127.0.0.1:${host.server.port}`,
    (await host.auth.createDevice('Manual recovery fixture')).token,
  )
  try {
    await client.connect()
    const workspace = (await runtime.storage.call('workspaces'))[0]!,
      session = await runtime.storage.call('createSession', workspace.id)
    const original = await runtime.storage.call(
      'enqueue',
      session.id,
      'manual-root',
      { text: 'Continue the interrupted work', images: [] },
      'local-fixture',
    )
    await runtime.storage.call('claim', session.id)
    await runtime.storage.call('commit', session.id, original.id, 'user', [{ type: 'text', text: original.input.text }])
    let current = original
    for (let attempt = 0; attempt < 2; attempt++) {
      await runtime.storage.call('recover', { runIds: [current.id], preserveQueued: true })
      const plan = await runtime.storage.call('runtimeRecoveryPlan', current.id)
      const continuation = await runtime.storage.call('runtimeRecoveryQueue', current.id, plan.recoveryId)
      if (!continuation.run) throw new Error('Expected the retained automatic lineage')
      current = continuation.run
      await runtime.storage.call('claim', session.id)
    }
    await runtime.storage.call('recover', { runIds: [current.id], preserveQueued: true })
    expect((await runtime.storage.call('runtimeRecoveryPlan', current.id)).chain.reasonCode).toBe('RECOVERY_LIMIT')
    const identities = runtime
      .snapshot()
      .units.map((unit) => [unit.descriptor.id, unit.generations.map((generation) => generation.pid)])
    const commands = createRunCommandClient(client)
    const accepted = await commands.execute(
      'run.retry',
      { sessionId: session.id, operationId: original.id },
      { idempotencyKey: 'manual' },
    )
    await until(async () => (await runtime.storage.call('run', accepted.operationId)).status === 'completed')
    expect(await commands.getReceipt(session.id, 'manual', 'run.retry')).toEqual(accepted)
    expect((await runtime.storage.call('run', accepted.operationId)).recovery).toMatchObject({
      manual: true,
      attempt: 3,
      automaticAttempt: 2,
    })
    expect(
      (await runtime.storage.call('snapshot', session.id)).messages.filter((message) => message.role === 'user'),
    ).toHaveLength(1)
    // Durable settlement precedes execution lease release; let the Host finish that handoff before teardown.
    await runtime.waitForIdle(30_000)
    expect(
      runtime
        .snapshot()
        .units.map((unit) => [unit.descriptor.id, unit.generations.map((generation) => generation.pid)]),
    ).toEqual(identities)
    expect(client.connectionStatus()).toBe('connected')
  } finally {
    client.disconnect()
    await host.close()
    await runtime.close()
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)
