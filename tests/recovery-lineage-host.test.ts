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
  while (!await check()) { if (Date.now() >= deadline) throw new Error('Recovery lineage did not settle'); await Bun.sleep(20) }
}
test('CLI and an operation-only SDK watcher follow the same interrupted identity to its real successor terminal result', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-lineage-'))
  const runtime = await ProcessHostRuntime.create({ layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
    demo: true, workspace: root, secrets: new MemorySecrets() })
  const host = await startServer(runtime.kernel, { port: 0, runtime, controller: runtime.controller })
  const cli = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  const observer = new HbarClient(`http://127.0.0.1:${host.server.port}`, (await host.auth.createDevice('SDK operation-only fixture')).token)
  let closeWatch = async () => {}
  try {
    await cli.pair(host.pairing.code, 'CLI lineage fixture'); await cli.connect()
    await observer.connect()
    const workspace = (await runtime.storage.call('workspaces'))[0]!, session = await runtime.storage.call('createSession', workspace.id)
    const run = await runtime.kernel.submit(session.id, 'lineage-test', { text: '/slow', images: [] }, 'local-fixture')
    const events: SessionEvent[] = []
    const watch = await createOperationWatcher(observer).watch(run.id, 0, update => { if (update.kind === 'event') events.push(update.event) })
    closeWatch = watch.close
    const done = waitForRun(cli, session, run, 'silent', 'defer').then(result => ({ result, error: null }), (error: unknown) => ({ result: null, error }))
    await until(() => runtime.facade.streams.size > 0)
    const kernel = runtime.snapshot().units.find(unit => unit.descriptor.id === 'kernel')!.generations[0]!
    if (!kernel.pid || kernel.pid === process.pid) throw new Error('Expected the fixture Kernel PID')
    process.kill(kernel.pid, 'SIGKILL')
    await runtime.waitForIdle()
    const recovery = await runtime.storage.call('runtimeRecoveryRead', run.id)
    if (!recovery?.run) throw new Error('Expected a durable continuation')
    const completion = await done
    expect(completion.error).toBeNull(); expect(completion.result?.run).toMatchObject({ id: recovery.run.id, status: 'completed' })
    expect((await runtime.storage.call('run', run.id)).status).toBe('interrupted')
    await until(() => events.some(event => event.runId === recovery.run!.id && event.type === 'run.settled'))
    const state = await createRunCommandClient(observer).execute('operation.get', { operationId: run.id })
    expect(state).toMatchObject({ operationId: run.id, executionRunId: recovery.run.id, status: 'completed', recovery: { status: 'settled', attempts: 1 } })
    expect(completion.result?.snapshot.messages.filter(message => message.role === 'user')).toHaveLength(1)
    expect(cli.connectionStatus()).toBe('connected'); expect(observer.connectionStatus()).toBe('connected')
  } finally { await closeWatch(); cli.disconnect(); observer.disconnect(); await host.close(); await runtime.close(); await rm(root, { recursive: true, force: true }) }
}, 40_000)
