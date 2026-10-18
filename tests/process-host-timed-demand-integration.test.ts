import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout } from '@hbar/storage'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { runtimeMaintenanceIdleCheckpointSchema } from '../apps/host/src/runtime-background-idle'

// Full real Host/Manager/PluginProcess test draft: Root NativeJob only, not a light
// local unit. No external provider or model is invoked. Time bounds are explicit.
async function until(check: () => boolean | Promise<boolean>, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error('Timed owner fixture did not settle')
    await Bun.sleep(10)
  }
}

test('two natural Kernel sleep/wake rounds each coalesce thirty foreground reads', async () => {
  const temporaryParent = await realpath(tmpdir())
  const root = await mkdtemp(join(temporaryParent, 'hbar-timed-demand-'))
  const ownedRoot = await realpath(root)
  if (dirname(ownedRoot) !== temporaryParent || !basename(ownedRoot).startsWith('hbar-timed-demand-'))
    throw new Error('Unowned Host fixture root')
  let primary: { error: unknown } | undefined
  let runtime: ProcessHostRuntime | undefined
  const checkpointEvents: Array<{
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
  ])
  try {
    runtime = await ProcessHostRuntime.create({
      layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
      sourceRoot: process.cwd(),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
      idleTimeoutMs: 200,
      diagnosticFullCoverage: true,
      diagnostics: {
        emit(event) {
          if (!observedEvents.has(event.event)) return
          if (checkpointEvents.length === 128) checkpointEvents.shift()
          checkpointEvents.push({
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
    const managed = runtime
    const application = runtime.controller.application
    if (!application) throw new Error('Actual controller lifecycle is missing')
    const workspace = (await runtime.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Actual fixture workspace missing')
    const session = await runtime.storage.call('createSession', workspace.id)
    let ownerBeforeRound = runtime.manager.defaultOwner('kernel')
    await application.scheduleController.start()
    for (let round = 1; round <= 2; round++) {
      const first = ownerBeforeRound
      await until(
        () => managed.snapshot().units.find((unit) => unit.descriptor.id === 'kernel')?.idle?.phase === 'sleeping',
      )
      const retired = runtime.manager.retirement(first)
      expect(retired).toMatchObject({
        status: 'retired',
        owner: first,
        ownerCleanupCompleted: true,
        physical: { nativeJoined: true, onExitCompleted: true, exitCode: 0, forced: false, cleanDisposeAck: true },
      })
      const foregroundStarted = performance.now()
      let firstReplyMs: number | undefined
      const reads = await Promise.all(
        Array.from({ length: 30 }, async () => {
          const reply = await managed.kernel.plugins.get('goal').get(session.id)
          firstReplyMs ??= performance.now() - foregroundStarted
          return reply
        }),
      )
      const foregroundWaveMs = performance.now() - foregroundStarted
      expect(reads).toHaveLength(30)
      expect(reads.every((value) => value.goal === null)).toBe(true)
      const current = runtime.manager.defaultOwner('kernel')
      expect(current.generation).toBe(first.generation + 1)
      expect(current.incarnation).not.toBe(first.incarnation)
      const generations = runtime.snapshot().units.find((unit) => unit.descriptor.id === 'kernel')?.generations
      expect(generations?.filter((value) => value.role === 'default' && value.phase === 'serving')).toHaveLength(1)
      expect(runtime.manager.retirement(first).status).toBe('unverified') // ACK after replacement, never before.
      ownerBeforeRound = current
      console.info(
        JSON.stringify({
          type: 'fullhost-kernel-natural-idle-round',
          round,
          retired: first,
          retirement: retired,
          successor: current,
          foregroundRequests: reads.length,
          firstReplyMs,
          foregroundWaveMs,
          metrics: 'Observed latency only; no performance threshold asserted',
        }),
      )
    }
    await application.scheduleController.close()
  } catch (error) {
    primary = { error }
    console.info(JSON.stringify({ type: 'fullhost-idle-failure-checkpoints', events: checkpointEvents }))
    if (runtime) {
      const units = runtime.snapshot().units
      console.info(
        JSON.stringify({
          type: 'fullhost-idle-failure-owners',
          storage: runtime.storage.snapshot(),
          units: units.map((unit) => ({
            unitId: unit.descriptor.id,
            idle: unit.idle,
            generations: unit.generations.map((generation) => ({
              generation: generation.generation,
              incarnation: generation.incarnation,
              reasonCode: generation.reasonCode,
              role: generation.role,
              phase: generation.phase,
              pid: generation.pid,
            })),
          })),
        }),
      )
      const maintenance = units.find((unit) => unit.descriptor.id === 'maintenance')
      const selected = maintenance?.generations.find(
        (generation) => generation.role === 'default' && generation.phase === 'serving',
      )
      if (maintenance?.idle?.phase === 'active' && selected) {
        try {
          const checkpoint = await runtime.manager.call(
            'maintenance',
            'maintenance.idleCheckpoint',
            undefined,
            runtimeMaintenanceIdleCheckpointSchema,
            { timeoutMs: 1_000, signal: AbortSignal.timeout(1_000) },
            { unitId: 'maintenance', generation: selected.generation, artifactId: selected.artifactId },
          )
          const state = checkpoint.state.scheduler
          const scheduler = {
            closed: state.closed,
            paused: state.paused,
            current: state.current,
            timer: state.timer,
            nextDueAt: state.nextDueAt,
          }
          console.info(JSON.stringify({ type: 'fullhost-idle-failure-maintenance', scheduler }))
        } catch {
          console.info(JSON.stringify({ type: 'fullhost-idle-failure-maintenance', status: 'snapshot-unavailable' }))
        }
      }
    }
  }
  const cleanupErrors: unknown[] = []
  try {
    await runtime?.close()
  } catch (error) {
    cleanupErrors.push(error)
  }
  // Failed construction may have created resources without returning their owner.
  // Preserve all failure scenes; only a fully successful owned close permits deletion.
  if (!primary && cleanupErrors.length === 0 && runtime) {
    try {
      const currentRoot = await realpath(root)
      if (
        currentRoot !== ownedRoot ||
        dirname(currentRoot) !== temporaryParent ||
        !basename(currentRoot).startsWith('hbar-timed-demand-')
      )
        throw new Error('Host fixture root identity changed before cleanup')
      await rm(root, { recursive: true, force: true })
    } catch (error) {
      cleanupErrors.push(error)
    }
  }
  if (cleanupErrors.length) {
    const errors = primary ? [primary.error, ...cleanupErrors] : cleanupErrors
    throw new AggregateError(errors, 'Host fixture cleanup failed', { cause: errors[0] })
  }
  if (primary) throw primary.error
}, 120_000)
