import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { HbarClient, createConfigurationCommandClient, createExtensionCommandClient } from '@hbar/client'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout } from '@hbar/storage'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { startServer } from '../apps/host/src/server'

async function until(check: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 30_000
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error('Maintenance admission did not settle')
    await Bun.sleep(10)
  }
}

test('public plugin configuration samples settled Kernel facts while active and concurrent maintenance remain fenced', async () => {
  const parent = await realpath(tmpdir())
  const root = await mkdtemp(join(parent, 'hbar-maintenance-admission-'))
  const canonical = await realpath(root)
  if (dirname(canonical) !== parent || !basename(canonical).startsWith('hbar-maintenance-admission-'))
    throw new Error('Unowned maintenance admission fixture')
  let runtime: ProcessHostRuntime | undefined
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let client: HbarClient | undefined
  let release: (() => void) | undefined
  let maintained: Promise<void> | undefined
  let primary: unknown
  const cleanupErrors: unknown[] = []
  try {
    const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
    runtime = await ProcessHostRuntime.create({
      layout,
      sourceRoot: process.cwd(),
      workspace: root,
      demo: true,
      noLocalExec: true,
      secrets: new MemorySecrets(),
    })
    const managed = runtime
    host = await startServer(managed.kernel, { port: 0, runtime: managed, controller: managed.controller })
    client = new HbarClient('http://127.0.0.1:' + host.server.port)
    await client.pair(host.pairing.code, 'public-maintenance-admission')
    await client.connect()
    const configuration = createConfigurationCommandClient(client)
    const extensions = createExtensionCommandClient(client)
    const model = await configuration.execute('provider.save', {
      provider: {
        id: 'maintenance-admission-provider',
        name: 'Owned inactive provider',
        protocol: 'openai-completions',
        model: 'owned-inactive-model',
        baseUrl: 'http://127.0.0.1:1/v1',
        contextWindow: 128_000,
        maxOutput: 64,
      },
      apiKey: 'owned-fixture-key',
    })
    expect(model.providerId).toBe('maintenance-admission-provider')
    expect(
      (await configuration.execute('provider.list', {})).some((value) => value.provider.id === model.providerId),
    ).toBe(true)
    const catalog = await client.call('command.catalog', { category: 'system.extensions', limit: 100 })
    expect(catalog.items.filter((item) => item.metadata.id === 'plugin.set')).toHaveLength(1)
    const oldGoal = managed
      .snapshot()
      .units.find((unit) => unit.descriptor.id === 'plugin.goal')
      ?.generations.find((owner) => owner.role === 'default' && owner.phase === 'serving')
    if (!oldGoal?.pid) throw new Error('Actual pre-configuration Goal owner missing')
    const cachedIdleBefore = managed.kernel.chatDatabaseIsIdle()
    // No waitForIdle, sleeps, retries or private configuration calls before this public mutation.
    const configured = await extensions.execute('plugin.set', {
      id: 'goal.codex',
      enabled: true,
      config: { retryDelayMs: 30_000, maxTransientRetries: 2 },
    })
    expect(configured.find((value) => value.id === 'goal.codex')?.config).toMatchObject({
      retryDelayMs: 30_000,
      maxTransientRetries: 2,
    })
    const selected = managed
      .snapshot()
      .units.find((unit) => unit.descriptor.id === 'plugin.goal')
      ?.generations.find((owner) => owner.role === 'default' && owner.phase === 'serving')
    if (!selected) throw new Error('Actual configured Goal owner missing')
    expect(selected?.generation).toBe(oldGoal.generation + 1)
    expect(selected?.incarnation).not.toBe(oldGoal.incarnation)
    const owner = { unitId: oldGoal.unitId, generation: oldGoal.generation, incarnation: oldGoal.incarnation }
    await until(() => managed.manager.retirement(owner)?.status === 'retired')
    expect(managed.manager.retirement(owner)).toMatchObject({
      status: 'retired',
      ownerCleanupCompleted: true,
      physical: {
        childPid: oldGoal.pid,
        nativeJoined: true,
        onExitCompleted: true,
        // Explicit configuration replacement terminates its old tree boundary before join.
        // Natural idle has a separate strict nonforced retirement contract.
        forced: true,
        cleanDisposeAck: true,
        exitCode: 0,
      },
    })
    expect(
      (await client.call('plugin.set', { id: 'goal.codex', enabled: true })).find((value) => value.id === 'goal.codex')
        ?.config,
    ).toMatchObject({ retryDelayMs: 30_000 })
    const bootstrap = await client.call('system.bootstrap', {})
    const workspace = bootstrap.workspaces[0]
    if (!workspace) throw new Error('Actual workspace missing')
    const session = await client.call('session.create', {
      workspaceId: workspace.id,
      title: 'active-maintenance-fence',
    })
    const run = await client.call('run.start', {
      sessionId: session.id,
      requestId: 'active-fence-' + crypto.randomUUID(),
      input: { text: '/slow', images: [] },
      modelId: 'local-fixture',
    })
    await until(() => managed.coordinator.execution(run.id) !== null)
    await expect(
      extensions.execute('plugin.set', { id: 'goal.codex', enabled: true, config: { retryDelayMs: 1234 } }),
    ).rejects.toMatchObject({ code: 'BUSY' })
    expect(managed.manager.currentVersion('plugin.goal').generation).toBe(selected?.generation)
    await managed.waitForIdle(30_000)
    expect(
      (await client.call('session.snapshot', { sessionId: session.id })).runs.find((value) => value.id === run.id)
        ?.status,
    ).toBe('completed')
    let entered: (() => void) | undefined
    const admitted = new Promise<void>((resolve) => {
      entered = resolve
    })
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    maintained = managed.kernel.maintainChatDatabase(async () => {
      entered?.()
      await held
    })
    await Promise.race([
      admitted,
      maintained.then(() => {
        throw new Error('Maintenance finished before admission')
      }),
    ])
    await expect(
      extensions.execute('plugin.set', { id: 'goal.codex', enabled: true, config: { retryDelayMs: 2345 } }),
    ).rejects.toMatchObject({ code: 'BUSY' })
    release?.()
    await maintained
    maintained = undefined
    expect((await extensions.execute('plugin.inspect', { id: 'goal.codex' }))?.config).toMatchObject({
      retryDelayMs: 30_000,
    })
    expect(client.connectionStatus()).toBe('connected')
    expect(managed.coordinator.snapshot()).toMatchObject({ sessions: 0, physicalTools: 0 })
    console.info(
      JSON.stringify({
        type: 'hbar.maintenance-admission.v1',
        cachedIdleBefore,
        originalGoalOwner: owner,
        nextGoalOwner: selected?.incarnation,
        activeExecutionRejected: true,
        concurrentMaintenanceRejected: true,
        exactRetirement: managed.manager.retirement(owner),
        retirementCause: 'explicit-configuration-replacement',
        naturalIdleQualification: false,
        externalModelRequests: 0,
      }),
    )
  } catch (error) {
    primary = error
  } finally {
    release?.()
    try {
      await maintained
    } catch (error) {
      cleanupErrors.push(error)
    }
    client?.disconnect()
    try {
      await host?.close()
    } catch (error) {
      cleanupErrors.push(error)
    }
    try {
      await runtime?.close()
    } catch (error) {
      cleanupErrors.push(error)
    }
    try {
      const current = await realpath(root)
      if (
        current !== canonical ||
        dirname(current) !== parent ||
        !basename(current).startsWith('hbar-maintenance-admission-')
      )
        cleanupErrors.push(new Error('Owned maintenance cleanup path changed'))
      else await rm(current, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    } catch (error) {
      cleanupErrors.push(error)
    }
  }
  if (primary) cleanupErrors.unshift(primary)
  if (cleanupErrors.length)
    throw new AggregateError(cleanupErrors, 'Maintenance admission fixture failed', { cause: cleanupErrors[0] })
}, 120_000)
