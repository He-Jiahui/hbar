import { expect, test } from 'bun:test'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { createCommandExpectation, type CommandExecutionTicket } from '@hbar/commands'
import { directoryCommands } from '@hbar/contracts/commands'
import { chatDatabaseCommands } from '@hbar/contracts/commands/chat-database'
import type { CommandExecutionReceipt } from '@hbar/contracts/command-execution'
import type { ExecutionOwnership, RuntimeVersion } from '@hbar/contracts/runtime'
import { HbarClient } from '@hbar/client'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout } from '@hbar/storage'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { hostRuntimeBuildUnits } from '../apps/host/src/runtime-build'
import { startServer } from '../apps/host/src/server'
import { removeOwnedTestDirectory } from './owned-temp-directory'

async function failure(action: Promise<unknown>): Promise<unknown> {
  try {
    await action
  } catch (error) {
    return error
  }
  throw new Error('Expected command interruption')
}
async function until(check: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 30_000
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Tracked command owner did not reach its expected state')
    await Bun.sleep(10)
  }
}
async function removeOwnedSourceDirectory(source: string, prefix: string): Promise<void> {
  const [actual, artifacts] = await Promise.all([realpath(source), realpath(join(process.cwd(), 'artifacts'))])
  if (dirname(actual) !== artifacts || resolve(actual) !== resolve(source) || !basename(actual).startsWith(prefix))
    throw new Error('Refusing to remove an unowned command owner source directory')
  await rm(actual, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}

test('an actual Controller retains a late write receipt and its generation through timeout and reload until acknowledged', async () => {
  const prefix = 'hbar-command-jobs-host-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const sourcePrefix = 'command-jobs-owner-'
  const source = await mkdtemp(join(process.cwd(), 'artifacts', sourcePrefix))
  const entered = join(root, 'entered'),
    release = join(root, 'release'),
    effect = join(root, 'effect')
  const original = (await readFile('apps/host/src/runtime-controller-process.ts', 'utf8')).replaceAll(
    "'./",
    "'../../apps/host/src/",
  )
  const anchor = "  context.peer.register(\n    'controller.command.start',"
  const normalized = original.replaceAll('\r\n', '\n')
  if (normalized.split(anchor).length !== 2) throw new Error('Controller tracked command fixture anchor changed')
  const injection = `
  if (application && kernel) {
    const proof = new CommandRegistry({ execution: 'host', maxConcurrent: 1 })
    proof.register(defineCommand({ id: 'fixture.delayedWrite', owner: 'fixture', version: 1, execution: 'host',
      kind: 'command', stateEffect: 'persistent', scope: 'global', category: 'fixture', titleKey: 'fixture',
      descriptionKey: 'fixture', surfaces: ['api'], timeoutMs: 20 },
      z.strictObject({ label: z.string().default('admitted') }),
      z.strictObject({ pid: z.number(), text: z.string(), label: z.string(), lateScopeCode: z.string() })),
      async input => {
        await Bun.write(${JSON.stringify(entered)}, String(process.pid))
        while (!await Bun.file(${JSON.stringify(release)}).exists()) await Bun.sleep(5)
        const count = await Bun.file(${JSON.stringify(effect)}).exists() ? Number(await Bun.file(${JSON.stringify(effect)}).text()) : 0
        await Bun.write(${JSON.stringify(effect)}, String(count + 1))
        let lateScopeCode = 'unexpected-admission'
        try { await kernel.api.storage.call('workspaces') } catch (error) {
          lateScopeCode = error instanceof HbarError ? error.code : 'unclassified'
        }
        return { pid: process.pid, text: '中文🎯'.repeat(40000), label: input.label, lateScopeCode }
      }, { durable: true })
    const service = {
      dispatch: (value: unknown, actorId: string) => proof.dispatch(value, { actorId }),
      dispatchPrepared: proof.dispatchPrepared.bind(proof), dispatchPreparedTracked: proof.dispatchPreparedTracked.bind(proof),
      prepare: (value: unknown) => proof.prepare(value), describe: (id: string) => proof.describe(id), list: () => proof.list(),
    }
    application.commandServices.push({ commandIds: ['fixture.delayedWrite'], service })
    application.commandDispatchers.set('fixture.delayedWrite', service.dispatch)
    application.commandDescribers.set('fixture.delayedWrite', () => service.describe('fixture.delayedWrite'))
  }
`
  const ownerSource =
    "import { defineCommand } from '@hbar/commands'\n" + normalized.replace(anchor, injection + anchor)
  const ownerPath = join(source, 'owner.ts')
  await writeFile(ownerPath, ownerSource)
  const units = hostRuntimeBuildUnits().map((unit) =>
    unit.descriptor.id === 'controller' ? { ...unit, entrypoint: ownerPath } : unit,
  )
  let runtime: ProcessHostRuntime | undefined
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let client: HbarClient | undefined
  try {
    runtime = await ProcessHostRuntime.create({
      layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
      sourceRoot: process.cwd(),
      buildUnits: units,
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
    })
    host = await startServer(runtime.kernel, { port: 0, runtime, controller: runtime.controller })
    const operator = await host.auth.createDevice('tracked command fixture')
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`, operator.token)
    await client.connect()
    const prepared = await host.commands.prepare({
      protocol: 1,
      commandId: 'fixture.delayedWrite',
      commandVersion: 1,
      requestId: 'tracked-write',
      idempotencyKey: 'tracked-write',
      input: {},
    })
    const expected = createCommandExpectation(prepared)
    const ticket = host.commands.executePreparedTracked(prepared.invocation, operator.device.id, expected)
    if (!ticket.acknowledge) throw new Error('Managed ticket has no receipt acknowledgment')
    await until(() => Bun.file(entered).exists())
    const originalPid = Number(await readFile(entered, 'utf8'))
    expect(await failure(ticket.result)).toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(await Bun.file(effect).exists()).toBe(false)
    expect(await failure(ticket.acknowledge())).toMatchObject({ code: 'COMMAND_JOB_ACTIVE' })
    const busy = host.commands.executePreparedTracked(
      { ...prepared.invocation, requestId: 'busy-write', idempotencyKey: 'busy-write' },
      operator.device.id,
      expected,
    )
    expect(await failure(busy.result)).toMatchObject({ code: 'BUSY' })
    expect(await busy.settled).toMatchObject({ status: 'failed', executionStarted: false, error: { code: 'BUSY' } })
    if (!busy.acknowledge) throw new Error('Managed busy ticket has no acknowledgment')
    await busy.acknowledge()
    const updated = join(source, 'updated.ts')
    await writeFile(updated, ownerSource + '\nexport const compatibleTrackedRevision = 2\n')
    const controller = runtime.buildUnits.find((unit) => unit.descriptor.id === 'controller')
    if (!controller) throw new Error('Controller build unit missing')
    const set = await runtime.artifacts.registerSet([
      await runtime.artifacts.build({ ...controller, entrypoint: updated }),
    ])
    const reload = runtime.reload(set.id, ['controller'])
    const activeRuntime = runtime
    await until(
      () =>
        activeRuntime
          .snapshot()
          .units.find((unit) => unit.descriptor.id === 'controller')
          ?.generations.some(
            (generation) =>
              generation.generation === 2 && generation.role === 'default' && generation.phase === 'serving',
          ) ?? false,
    )
    expect(runtime.getReload(reload.operationId).phase).toBe('draining')
    await writeFile(release, 'released')
    const actual = z
      .strictObject({
        status: z.literal('succeeded'),
        executionStarted: z.literal(true),
        result: z.strictObject({ pid: z.number(), text: z.string(), label: z.string(), lateScopeCode: z.string() }),
      })
      .parse(await ticket.settled)
    expect(actual.result).toEqual({
      pid: originalPid,
      text: '中文🎯'.repeat(40_000),
      label: 'admitted',
      lateScopeCode: 'CONTROLLER_INVOCATION_EXPIRED',
    })
    expect(await readFile(effect, 'utf8')).toBe('1')
    await Bun.sleep(1_100)
    const old = runtime
      .snapshot()
      .units.find((unit) => unit.descriptor.id === 'controller')
      ?.generations.find((generation) => generation.generation === 1)
    expect(old).toMatchObject({ pid: originalPid, role: 'draining', phase: 'draining' })
    expect(old?.references.resources).toBeGreaterThan(0)
    expect(client.connectionStatus()).toBe('connected')
    await ticket.acknowledge()
    await until(() => activeRuntime.getReload(reload.operationId).phase === 'completed')
    expect(await readFile(effect, 'utf8')).toBe('1')
    expect(
      runtime
        .snapshot()
        .units.find((unit) => unit.descriptor.id === 'controller')
        ?.generations.some((generation) => generation.generation === 1),
    ).toBe(false)
  } finally {
    await writeFile(release, 'released')
    client?.disconnect()
    await host?.close()
    await runtime?.close()
    await removeOwnedTestDirectory(root, prefix)
    await removeOwnedSourceDirectory(source, sourcePrefix)
  }
}, 120_000)

test('managed command owners bind their durable identity before dispatch and retain the source claim until saved acknowledgment', async () => {
  const prefix = 'hbar-command-scope-host-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const runtime = await ProcessHostRuntime.create({
    layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
    sourceRoot: process.cwd(),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(runtime.kernel, { port: 0, runtime, controller: runtime.controller })
  let cleanupSource: ExecutionOwnership | null = null
  const tickets: CommandExecutionTicket[] = [],
    releases: Array<() => void> = []
  try {
    const operator = await host.auth.createDevice('source scope fixture')
    const workspace = (await runtime.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Source scope fixture has no workspace')
    const session = await runtime.storage.call('createSessionCommand', {
      workspaceId: workspace.id,
      actorId: operator.device.id,
      idempotencyKey: 'scope-session',
    })
    const run = await runtime.storage.call(
      'enqueue',
      session.id,
      'scope-run',
      { text: 'source command work', images: [] },
      'fixture',
    )
    const currentVersion = (id: string): RuntimeVersion => {
      const generation = runtime
        .snapshot()
        .units.find((unit) => unit.descriptor.id === id)
        ?.generations.find((generation) => generation.role === 'default' && generation.phase === 'serving')
      if (!generation) throw new Error('Source scope owner is unavailable')
      return { unitId: generation.unitId, generation: generation.generation, artifactId: generation.artifactId }
    }
    const kernel = runtime.manager.defaultOwner('kernel')
    const plugins = runtime
      .snapshot()
      .units.filter((unit) => unit.descriptor.kind === 'plugin')
      .map((unit) => currentVersion(unit.descriptor.id))
    const source = await runtime.coordinator.claim(kernel, session.id, run.id, {
      kernel: currentVersion('kernel'),
      driver: currentVersion('driver.pi'),
      plugins,
      hooks: plugins,
    })
    if (!source) throw new Error('Source scope fixture failed to acquire its real Run claim')
    cleanupSource = source
    const cases = [
      { ownerId: 'controller', commandId: 'session.getBudget', input: { sessionId: session.id } },
      { ownerId: 'kernel', commandId: 'workspace.list', input: {} },
      { ownerId: 'maintenance', commandId: 'chatDatabase.statistics', input: { scope: { kind: 'global' } } },
    ]
    for (const [index, testCase] of cases.entries()) {
      const prepared = await host.commands.prepare({
        protocol: 1,
        commandId: testCase.commandId,
        commandVersion: 1,
        requestId: `scope-${index}`,
        input: testCase.input,
      })
      const expectation = createCommandExpectation(prepared)
      const identity = { sessionId: session.id, actorId: operator.device.id, operationKey: `scope-${index}` }
      let receipt: CommandExecutionReceipt = (
        await runtime.storage.call('commandExecutionAccept', {
          ...identity,
          runId: run.id,
          callId: `scope-call-${index}`,
          invocation: prepared.invocation,
          expectation,
        })
      ).receipt
      let release: () => void = () => {
        throw new Error('Source scope gate is not ready')
      }
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      releases.push(release)
      let preparing = false,
        resultDelivered = false
      const ticket = runtime.commandScopes.run(
        {
          source,
          beforeStart: async (owner) => {
            preparing = true
            expect(owner).toMatchObject({ kind: 'runtime', owner: runtime.manager.defaultOwner(testCase.ownerId) })
            await gate
            receipt = await runtime.storage.call('commandExecutionUpdate', {
              ...identity,
              expectedRevision: receipt.revision,
              change: { kind: 'bind', owner },
            })
          },
        },
        () => host.commands.executePreparedTracked(prepared.invocation, operator.device.id, expectation),
      )
      tickets.push(ticket)
      void ticket.result.then(
        () => {
          resultDelivered = true
        },
        () => {},
      )
      await until(() => preparing)
      expect(resultDelivered).toBe(false)
      expect((await runtime.storage.call('commandExecutionRead', identity))?.owner).toBeNull()
      release()
      const result: unknown = await ticket.result
      const physical = await ticket.settled
      expect(physical).toEqual({ status: 'succeeded', executionStarted: true, result })
      receipt = await runtime.storage.call('commandExecutionUpdate', {
        ...identity,
        expectedRevision: receipt.revision,
        change: { kind: 'logical', payload: { kind: 'inline', json: JSON.stringify({ ok: true, result }) } },
      })
      receipt = await runtime.storage.call('commandExecutionUpdate', {
        ...identity,
        expectedRevision: receipt.revision,
        change: {
          kind: 'settled',
          physical: {
            status: 'succeeded',
            executionStarted: true,
            payload: { kind: 'inline', json: JSON.stringify(physical) },
          },
        },
      })
      if (index === cases.length - 1) {
        await runtime.storage.callOwned(source, 'setRun', run.id, 'completed')
        await runtime.coordinator.requestRelease(source, () => {})
        expect(runtime.coordinator.executionForSession(session.id)?.runId).toBe(run.id)
      }
      if (!ticket.acknowledge) throw new Error('Managed source ticket has no acknowledgment')
      await ticket.acknowledge()
      await runtime.storage.call('commandExecutionUpdate', {
        ...identity,
        expectedRevision: receipt.revision,
        change: { kind: 'acknowledged' },
      })
      expect((await runtime.storage.call('commandExecutionRead', identity))?.physical?.status).toBe('succeeded')
    }
    await until(() => runtime.coordinator.executionForSession(session.id) === null)
  } finally {
    for (const release of releases) release()
    for (const ticket of tickets) {
      await ticket.settled
      await ticket.acknowledge?.()
    }
    if (cleanupSource && runtime.coordinator.execution(cleanupSource.runId)) {
      const runId = cleanupSource.runId
      const current = await runtime.storage.call('run', runId)
      if (['running', 'queued', 'waiting_approval'].includes(current.status))
        await runtime.storage.callOwned(cleanupSource, 'setRun', runId, 'cancelled')
      await runtime.coordinator.requestRelease(cleanupSource, () => {})
      await until(() => runtime.coordinator.execution(runId) === null)
    }
    await host.close()
    await runtime.close()
    await removeOwnedTestDirectory(root, prefix)
  }
}, 120_000)

test('an actual Maintenance owner retains its command receipt through reload and routes new queries to the new owner', async () => {
  const prefix = 'hbar-maintenance-command-jobs-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const sourcePrefix = 'maintenance-command-jobs-owner-'
  const source = await mkdtemp(join(process.cwd(), 'artifacts', sourcePrefix))
  let runtime: ProcessHostRuntime | undefined
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  try {
    runtime = await ProcessHostRuntime.create({
      layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
      sourceRoot: process.cwd(),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
    })
    host = await startServer(runtime.kernel, { port: 0, runtime, controller: runtime.controller })
    const operator = await host.auth.createDevice('tracked Maintenance query fixture')
    const prepared = await host.commands.prepare({
      protocol: 1,
      commandId: 'chatDatabase.statistics',
      commandVersion: 1,
      requestId: 'maintenance-tracked-statistics',
      input: { scope: { kind: 'global' } },
    })
    const expected = createCommandExpectation(prepared)
    const rejected = runtime.maintenance.dispatchPreparedTracked(prepared.invocation, operator.device.id, {
      ...expected,
      descriptor: { ...expected.descriptor, metadata: { ...expected.descriptor.metadata, timeoutMs: 1 } },
    })
    expect(await failure(rejected.result)).toMatchObject({ code: 'COMMAND_PREPARATION_STALE' })
    expect(await rejected.settled).toMatchObject({ status: 'failed', executionStarted: false })
    await rejected.acknowledge()
    const ticket = host.commands.executePreparedTracked(prepared.invocation, operator.device.id, expected)
    if (!ticket.acknowledge) throw new Error('Maintenance ticket has no receipt acknowledgment')
    const result = chatDatabaseCommands['chatDatabase.statistics'].output.parse(await ticket.result)
    expect(await ticket.settled).toEqual({ status: 'succeeded', executionStarted: true, result })
    const updated = join(source, 'updated.ts')
    const original = (await readFile('apps/host/src/runtime-maintenance-process.ts', 'utf8')).replaceAll(
      "'./",
      "'../../apps/host/src/",
    )
    await writeFile(updated, original + '\nexport const compatibleMaintenanceTrackedRevision = 2\n')
    const unit = runtime.buildUnits.find((unit) => unit.descriptor.id === 'maintenance')
    if (!unit) throw new Error('Maintenance build unit missing')
    const set = await runtime.artifacts.registerSet([await runtime.artifacts.build({ ...unit, entrypoint: updated })])
    const reload = runtime.reload(set.id, ['maintenance'])
    const activeRuntime = runtime
    await until(
      () =>
        activeRuntime
          .snapshot()
          .units.find((unit) => unit.descriptor.id === 'maintenance')
          ?.generations.some(
            (generation) =>
              generation.generation === 2 && generation.role === 'default' && generation.phase === 'serving',
          ) ?? false,
    )
    await Bun.sleep(1_100)
    const old = runtime
      .snapshot()
      .units.find((unit) => unit.descriptor.id === 'maintenance')
      ?.generations.find((generation) => generation.generation === 1)
    expect(old).toMatchObject({ role: 'draining', phase: 'draining' })
    expect(old?.references.resources).toBeGreaterThan(0)
    expect(runtime.getReload(reload.operationId).phase).toBe('draining')
    await ticket.acknowledge()
    await until(() => activeRuntime.getReload(reload.operationId).phase === 'completed')
    expect(
      runtime
        .snapshot()
        .units.find((unit) => unit.descriptor.id === 'maintenance')
        ?.generations.some((generation) => generation.generation === 1),
    ).toBe(false)
    const next = host.commands.executePreparedTracked(
      { ...prepared.invocation, requestId: 'statistics-after-owner-reload' },
      operator.device.id,
      expected,
    )
    chatDatabaseCommands['chatDatabase.statistics'].output.parse(await next.result)
    expect(await next.settled).toMatchObject({ status: 'succeeded', executionStarted: true })
    if (!next.acknowledge) throw new Error('New Maintenance ticket has no receipt acknowledgment')
    await next.acknowledge()
  } finally {
    await host?.close()
    await runtime?.close()
    await removeOwnedTestDirectory(root, prefix)
    await removeOwnedSourceDirectory(source, sourcePrefix)
  }
}, 120_000)

test('an actual Kernel retains validated directory receipts through reload until the caller acknowledges them', async () => {
  const prefix = 'hbar-kernel-command-jobs-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const sourcePrefix = 'kernel-command-jobs-owner-'
  const source = await mkdtemp(join(process.cwd(), 'artifacts', sourcePrefix))
  let runtime: ProcessHostRuntime | undefined
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let client: HbarClient | undefined
  try {
    runtime = await ProcessHostRuntime.create({
      layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
      sourceRoot: process.cwd(),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
    })
    host = await startServer(runtime.kernel, { port: 0, runtime, controller: runtime.controller })
    const operator = await host.auth.createDevice('tracked Kernel query fixture')
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`, operator.token)
    await client.connect()
    const prepared = await host.commands.prepare({
      protocol: 1,
      commandId: 'workspace.list',
      commandVersion: 1,
      requestId: 'kernel-tracked-directory',
      input: {},
    })
    const expected = createCommandExpectation(prepared)
    const dispatch = runtime.kernel.directoryQueries.dispatchPreparedTracked
    if (!dispatch) throw new Error('Managed Kernel has no tracked directory port')
    const rejected = dispatch(prepared.invocation, operator.device.id, {
      ...expected,
      descriptor: { ...expected.descriptor, metadata: { ...expected.descriptor.metadata, timeoutMs: 1 } },
    })
    expect(await failure(rejected.result)).toMatchObject({ code: 'COMMAND_PREPARATION_STALE' })
    expect(await rejected.settled).toMatchObject({
      status: 'failed',
      executionStarted: false,
      error: { code: 'COMMAND_PREPARATION_STALE' },
    })
    if (!rejected.acknowledge) throw new Error('Managed Kernel rejection has no receipt acknowledgment')
    await rejected.acknowledge()
    const ticket = host.commands.executePreparedTracked(prepared.invocation, operator.device.id, expected)
    if (!ticket.acknowledge) throw new Error('Managed Kernel ticket has no receipt acknowledgment')
    const result = directoryCommands['workspace.list'].output.parse(await ticket.result)
    expect(result.items.some((workspace) => resolve(workspace.path) === resolve(root))).toBe(true)
    expect(await ticket.settled).toEqual({ status: 'succeeded', executionStarted: true, result })
    const updated = join(source, 'updated.ts')
    const original = (await readFile('apps/host/src/runtime-kernel-process.ts', 'utf8')).replaceAll(
      "'./",
      "'../../apps/host/src/",
    )
    await writeFile(updated, original + '\nexport const compatibleKernelTrackedRevision = 2\n')
    const kernel = runtime.buildUnits.find((unit) => unit.descriptor.id === 'kernel')
    if (!kernel) throw new Error('Kernel build unit missing')
    const set = await runtime.artifacts.registerSet([await runtime.artifacts.build({ ...kernel, entrypoint: updated })])
    const reload = runtime.reload(set.id, ['kernel'])
    const activeRuntime = runtime
    await until(
      () =>
        activeRuntime
          .snapshot()
          .units.find((unit) => unit.descriptor.id === 'kernel')
          ?.generations.some(
            (generation) =>
              generation.generation === 2 && generation.role === 'default' && generation.phase === 'serving',
          ) ?? false,
    )
    await Bun.sleep(1_100)
    const old = runtime
      .snapshot()
      .units.find((unit) => unit.descriptor.id === 'kernel')
      ?.generations.find((generation) => generation.generation === 1)
    expect(old).toMatchObject({ role: 'draining', phase: 'draining' })
    expect(old?.references.resources).toBeGreaterThan(0)
    expect(runtime.getReload(reload.operationId).phase).toBe('draining')
    expect(client.connectionStatus()).toBe('connected')
    await ticket.acknowledge()
    await until(() => activeRuntime.getReload(reload.operationId).phase === 'completed')
    expect(
      runtime
        .snapshot()
        .units.find((unit) => unit.descriptor.id === 'kernel')
        ?.generations.some((generation) => generation.generation === 1),
    ).toBe(false)
    expect(
      directoryCommands['workspace.list'].output.parse(
        await client.call('command.execute', {
          ...prepared.invocation,
          requestId: 'kernel-query-after-reload',
        }),
      ),
    ).toEqual(result)
  } finally {
    client?.disconnect()
    await host?.close()
    await runtime?.close()
    await removeOwnedTestDirectory(root, prefix)
    await removeOwnedSourceDirectory(source, sourcePrefix)
  }
}, 120_000)
