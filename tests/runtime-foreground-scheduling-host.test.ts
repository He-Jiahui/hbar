import { expect, spyOn, test } from 'bun:test'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCommandExpectation } from '@hbar/commands'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout } from '@hbar/storage'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { startServer } from '../apps/host/src/server'
import { removeOwnedTestDirectory } from './owned-temp-directory'
async function until(check: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 30_000
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error('Foreground cold demand did not settle within 30s')
    await Bun.sleep(10)
  }
}

test('actual cold Controller command retains its physical owner until acknowledged', async () => {
  const prefix = 'hbar-cold-controller-ticket-',
    root = await mkdtemp(join(tmpdir(), prefix))
  let runtime: ProcessHostRuntime | undefined, host: Awaited<ReturnType<typeof startServer>> | undefined
  let primary: unknown
  try {
    runtime = await ProcessHostRuntime.create({
      layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
      sourceRoot: process.cwd(),
      workspace: root,
      demo: true,
      idleTimeoutMs: 200,
      secrets: new MemorySecrets(),
    })
    host = await startServer(runtime.kernel, { port: 0, runtime, controller: runtime.controller })
    const device = await host.auth.createDevice('Cold Controller fixture')
    const workspace = (await runtime.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Fixture workspace missing')
    const session = await runtime.storage.call('createSession', workspace.id)
    const prepared = await host.commands.prepare({
      protocol: 1,
      commandId: 'session.getBudget',
      commandVersion: 1,
      requestId: 'cold-controller-ticket',
      input: { sessionId: session.id },
    })
    const current = runtime
    const application = current.controller.application
    if (!application) throw new Error('Actual controller lifecycle is missing')
    await application.scheduleController.start()
    const sleeping = (id: string) =>
      current.snapshot().units.find((unit) => unit.descriptor.id === id)?.idle?.phase === 'sleeping'
    await until(() => sleeping('controller') && sleeping('kernel'))
    const ticket = host.commands.executePreparedTracked(
      prepared.invocation,
      device.device.id,
      createCommandExpectation(prepared),
    )
    await ticket.result
    expect(await ticket.settled).toMatchObject({ status: 'succeeded', executionStarted: true })
    const controller = current.manager.defaultOwner('controller'),
      kernel = current.manager.defaultOwner('kernel')
    expect(current.coordinator.references(controller).resources).toBeGreaterThan(0)
    await Bun.sleep(600)
    expect(current.manager.defaultOwner('controller')).toEqual(controller)
    expect(current.manager.defaultOwner('kernel')).toEqual(kernel)
    expect(sleeping('controller')).toBe(false)
    if (!ticket.acknowledge) throw new Error('Cold ticket lacks ACK')
    await ticket.acknowledge()
    await until(() => sleeping('controller') && sleeping('kernel'))
  } catch (error) {
    primary = error
  }
  const errors: unknown[] = []
  try {
    await host?.close()
  } catch (error) {
    errors.push(error)
  }
  try {
    await runtime?.close()
  } catch (error) {
    errors.push(error)
  }
  if (primary !== undefined) errors.unshift(primary)
  if (errors.length) throw new AggregateError(errors, 'Cold Controller fixture failed; temporary evidence retained')
  await removeOwnedTestDirectory(root, prefix)
}, 120_000)

test('actual sleeping Host consumes an exact durable capacity reservation without submitting another Run', async () => {
  const prefix = 'hbar-cold-capacity-consumer-',
    root = await mkdtemp(join(tmpdir(), prefix))
  let runtime: ProcessHostRuntime | undefined
  let releaseSession: string | undefined, primary: unknown
  let restoreReservation: (() => void) | undefined
  let stage = 'host.create'
  const events: Array<{
    event: string
    phase: string | null
    contextId: string | null
    requestId: string | null
    errorCode: string | null
    outcome: string | null
    durationMs: number | null
  }> = []
  const observedEvents = new Set([
    'host.runtime_idle_checkpoint_start',
    'host.runtime_idle_goal_checkpoint',
    'host.runtime_idle_maintenance_checkpoint',
    'host.runtime_idle_physical_checkpoint',
    'host.runtime_idle_deadline_unknown',
    'host.runtime_idle_deadline_reconcile_failed',
    'host.runtime_idle_wake_started',
    'host.runtime_kernel_fatal',
  ])
  try {
    runtime = await ProcessHostRuntime.create({
      layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
      sourceRoot: process.cwd(),
      workspace: root,
      demo: true,
      idleTimeoutMs: 200,
      secrets: new MemorySecrets(),
      profileModule: join(process.cwd(), 'tests/fixtures/execution-capacity-profile.ts'),
      diagnosticFullCoverage: true,
      diagnostics: {
        emit(event) {
          if (!observedEvents.has(event.event)) return
          if (events.length === 64) events.shift()
          events.push({
            event: event.event,
            phase: event.phase ?? null,
            contextId: event.contextId ?? null,
            requestId: event.requestId ?? null,
            errorCode: event.errorCode ?? null,
            outcome: event.outcome ?? null,
            durationMs: event.durationMs ?? null,
          })
        },
      },
    })
    const current = runtime
    stage = 'workspace.read'
    const workspace = (await current.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Fixture workspace missing')
    stage = 'session.create'
    const session = await current.storage.call('createSession', workspace.id)
    releaseSession = session.id
    stage = 'budget.set'
    await current.kernel.plugins.get('budget').set(session.id, 100)
    stage = 'kernel.initial.sleep.wait'
    const application = current.controller.application
    if (!application) throw new Error('Actual controller lifecycle is missing')
    await application.scheduleController.start()
    await until(
      () => current.snapshot().units.find((unit) => unit.descriptor.id === 'kernel')?.idle?.phase === 'sleeping',
    )
    stage = 'durable.enqueue'
    const requestId = 'cold-existing-capacity-reservation'
    const original = await current.storage.call(
      'enqueue',
      session.id,
      requestId,
      { text: 'Complete the one original queued Run', images: [], approval: 'deny', mode: 'plan' },
      'local-fixture',
    )
    // Controlled reservation producer only. Durable queue, Host, Kernel claim and local driver are real.
    // The actual slot producer remains covered by managed-execution-capacity/runtime-coordinator tests.
    let pending = true
    stage = 'reservation.install'
    const reservation = spyOn(current.coordinator, 'capacityReadyQueue').mockImplementation(() =>
      pending ? [{ sessionId: session.id, runId: original.id }] : [],
    )
    restoreReservation = () => reservation.mockRestore()
    stage = 'driver.started.wait'
    await until(() => Bun.file(join(root, `started.${session.id}`)).exists())
    stage = 'driver.started.assert'
    pending = false
    expect(await Bun.file(join(root, `started.${session.id}`)).text()).toBe(original.id)
    expect((await current.storage.call('runByRequest', session.id, requestId))?.run.id).toBe(original.id)
    expect((await current.storage.call('run', original.id)).status).toBe('running')
    stage = 'driver.release'
    await writeFile(join(root, `release.${session.id}`), 'release')
    stage = 'run.completed.wait'
    await until(async () => (await current.storage.call('run', original.id)).status === 'completed')
    expect((await current.storage.call('runByRequest', session.id, requestId))?.run.id).toBe(original.id)
  } catch (error) {
    primary = error
    try {
      const snapshot = runtime?.snapshot()
      const storage = runtime?.storage.snapshot()
      console.info(
        JSON.stringify({
          type: 'foreground-capacity-stage-failure',
          stage,
          events,
          runtime: snapshot
            ? {
                ready: snapshot.ready,
                units: snapshot.units.map((unit) => ({
                  unitId: unit.descriptor.id,
                  queuedArtifactId: unit.queuedArtifactId,
                  idle: unit.idle,
                  generations: unit.generations.map((generation) => ({
                    unitId: generation.unitId,
                    generation: generation.generation,
                    incarnation: generation.incarnation,
                    artifactId: generation.artifactId,
                    role: generation.role,
                    phase: generation.phase,
                    pid: generation.pid,
                    reasonCode: generation.reasonCode,
                  })),
                })),
              }
            : null,
          storage: storage
            ? {
                phase: storage.phase,
                owner: storage.owner,
                queuedSessionCount: storage.queuedSessionCount,
              }
            : null,
        }),
      )
    } catch {
      /* Observability failure must preserve primary and enter the original cleanup. */
    }
  }
  const errors: unknown[] = []
  restoreReservation?.()
  if (releaseSession) {
    try {
      await writeFile(join(root, `release.${releaseSession}`), 'release')
    } catch (error) {
      errors.push(error)
    }
  }
  try {
    await runtime?.close()
  } catch (error) {
    errors.push(error)
  }
  if (primary !== undefined) errors.unshift(primary)
  if (errors.length) throw new AggregateError(errors, 'Cold capacity consumer failed; temporary evidence retained')
  if (!runtime) throw new Error('Actual capacity runtime is missing')
  expect(runtime.storage.snapshot().phase).toBe('closed')
  expect(runtime.coordinator.snapshot()).toMatchObject({ sessions: 0, claims: 0, physicalTools: 0, resources: 0 })
  expect(events.filter((event) => event.event === 'host.runtime_kernel_fatal')).toHaveLength(0)
  await removeOwnedTestDirectory(root, prefix)
}, 120_000)
