import { expect, spyOn, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import type { z } from 'zod'
import type { RuntimeOwner } from '@hbar/contracts/runtime'
import { sessionWakeTransferSchema, sessionWakeStatusSchema } from '@hbar/contracts/session-wake'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { IpcPeer, ManagedProcess, type IpcCallOptions } from '@hbar/runtime'
import { Storage, createPathLayout, ensurePathLayout } from '@hbar/storage'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { hostRuntimeBuildUnits } from '../apps/host/src/runtime-build'
import { HostRuntimeDemand, type HostRuntimeDemandHold } from '../apps/host/src/runtime-host-demand'
import { runtimeControllerIdleCheckpointSchema } from '../apps/host/src/runtime-background-idle'
import { controllerScheduleWakeSchema } from '../apps/host/src/runtime-controller-schedule-contract'
import { scheduleIdleManifestSchema, scheduleWakeReplySchema } from '../apps/host/src/runtime-schedule-idle-contract'
import {
  maintenanceInspectionManifestSchema,
  maintenanceInspectionRestoreSchema,
  maintenanceInspectionWakeReplySchema,
} from '../apps/host/src/runtime-maintenance-inspection-contract'

interface Observation {
  readonly sequence: number
  readonly owner: RuntimeOwner
  readonly method: string
  readonly input: unknown
  readonly reply: unknown
  readonly checkpoint?: unknown
}

async function until(check: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 30_000
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error('Absolute deadline readiness did not settle')
    await Bun.sleep(10)
  }
}

test('two real idle wakes restore Goal, Schedule, Search and Maintenance absolute deadlines before serving', async () => {
  const parent = await realpath(tmpdir())
  const root = await mkdtemp(join(parent, 'hbar-deadline-ready-'))
  const canonical = await realpath(root)
  if (dirname(canonical) !== parent || !basename(canonical).startsWith('hbar-deadline-ready-'))
    throw new Error('Unowned deadline readiness fixture')
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  let seed: Storage | undefined
  let runtime: ProcessHostRuntime | undefined
  let hold: HostRuntimeDemandHold | undefined
  let demand: HostRuntimeDemand | undefined
  let primary: { error: unknown } | undefined
  let sequence = 0
  let overflow = false
  let stableControllerRestorations = 0
  const observations: Observation[] = []
  const serving = new Map<string, number>()
  const latest = new Map<string, RuntimeOwner>()
  const domains = ['kernel', 'controller', 'maintenance']
  const checkpointEvents: Array<{
    event: string
    phase: string | null
    contextId: string | null
    errorCode: string | null
  }> = []
  const originalAcquire = HostRuntimeDemand.prototype.acquire
  const demands = spyOn(HostRuntimeDemand.prototype, 'acquire').mockImplementation(function (
    this: HostRuntimeDemand,
    ...args: Parameters<HostRuntimeDemand['acquire']>
  ) {
    demand = this
    return originalAcquire.apply(this, args)
  })
  const methods = new Set([
    'kernel.sessionWakes.commit',
    'kernel.sessionWakes.restore',
    'controller.schedule.preview',
    'controller.schedule.quiesce',
    'controller.schedule.wake',
    'maintenance.inspection.preview',
    'maintenance.inspection.restore',
  ])
  const originalCall = IpcPeer.prototype.call
  const calls = spyOn(IpcPeer.prototype, 'call').mockImplementation(function <Output>(
    this: IpcPeer,
    method: string,
    input: unknown,
    output: z.ZodType<Output>,
    options?: IpcCallOptions,
  ): Promise<Output> {
    return originalCall.call(this, method, input, output, options).then(async (value) => {
      const result = output.parse(value)
      if (domains.includes(this.remote.unitId) && methods.has(method)) {
        // The real child timer state is a metadata observation. A fresh manifest
        // has a new observedAt; it cannot prove preservation of the old deadline.
        const checkpoint =
          method === 'controller.schedule.wake'
            ? await originalCall.call(
                this,
                'controller.idleCheckpoint',
                undefined,
                runtimeControllerIdleCheckpointSchema,
                options,
              )
            : undefined
        if (observations.length === 256) overflow = true
        else
          observations.push({
            sequence: ++sequence,
            owner: { ...this.remote },
            method,
            input,
            reply: result,
            ...(checkpoint ? { checkpoint } : {}),
          })
      }
      return result
    })
  })
  const originalSnapshot = ManagedProcess.prototype.snapshot
  const snapshots = spyOn(ManagedProcess.prototype, 'snapshot').mockImplementation(function (this: ManagedProcess) {
    const value = originalSnapshot.call(this)
    if (domains.includes(value.unitId) && value.role === 'default' && value.phase === 'serving') {
      if (!serving.has(value.incarnation)) serving.set(value.incarnation, ++sequence)
      latest.set(value.unitId, { unitId: value.unitId, generation: value.generation, incarnation: value.incarnation })
    }
    return value
  })
  const observed = (owner: RuntimeOwner, method: string): Observation => {
    const value = observations.findLast(
      (item) => item.owner.incarnation === owner.incarnation && item.method === method,
    )
    if (!value) throw new Error(`Actual deadline receipt missing: ${owner.unitId}/${method}`)
    return value
  }
  try {
    await ensurePathLayout(layout)
    seed = new Storage(layout.database, layout)
    await seed.call('ready')
    await seed.call('setPlugin', 'goal.codex', true, { retryDelayMs: 30_000, maxTransientRetries: 2 })
    await seed.close()
    seed = undefined
    runtime = await ProcessHostRuntime.create({
      layout,
      sourceRoot: process.cwd(),
      workspace: root,
      demo: true,
      noLocalExec: true,
      secrets: new MemorySecrets(),
      idleTimeoutMs: 500,
      diagnosticFullCoverage: true,
      diagnostics: {
        emit(event) {
          if (!event.event.startsWith('host.runtime_idle_')) return
          if (checkpointEvents.length === 128) checkpointEvents.shift()
          checkpointEvents.push({
            event: event.event,
            phase: event.phase ?? null,
            contextId: event.contextId ?? null,
            errorCode: event.errorCode ?? null,
          })
        },
      },
      buildUnits: hostRuntimeBuildUnits().map((unit) =>
        unit.descriptor.id === 'driver.pi' ? { ...unit, entrypoint: 'tests/fixtures/owned-transient-driver.ts' } : unit,
      ),
    })
    const managed = runtime
    const application = managed.controller.application
    if (!application) throw new Error('Actual Controller application missing')
    const workspace = (await managed.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Actual fixture workspace missing')
    const model = (await managed.kernel.models()).find(
      (value) => value.providerId === 'local-fixture' && value.protocol === 'mock' && value.canExecute,
    )
    if (!model) throw new Error('Local finite driver model unavailable')
    const session = await managed.storage.call('createSession', workspace.id, 'deadline-readiness')
    const at = Date.now() + 120_000
    const schedule = await managed.storage.call('createSchedule', {
      workspaceId: workspace.id,
      name: 'Future absolute readiness proof',
      input: 'Local fixture only',
      modelId: model.id,
      timezone: 'UTC',
      target: { mode: 'existing-session', sessionId: session.id },
      spec: { kind: 'once', at },
    })
    const goals = managed.kernel.plugins.get('goal')
    await goals.create(session.id, 'Retain one finite future retry through two complete cold activations', 1000)
    const run = await managed.kernel.submit(
      session.id,
      'deadline-readiness-initial',
      { text: 'Work', images: [] },
      model.id,
    )
    await until(async () => (await goals.get(session.id)).goal?.continuation?.reason === 'retry_wait')
    const intent = (await goals.get(session.id)).goal?.continuation
    if (!intent?.retryAt) throw new Error('Actual future Goal retry missing')
    expect((await managed.storage.call('run', run.id)).failure).toMatchObject({
      category: 'transient',
      retryable: true,
    })
    // Checkpoint after the original Run's actual writes, including its new Search work.
    await application.scheduleController.start()
    for (let round = 1; round <= 2; round++) {
      await until(() =>
        domains.every(
          (id) => managed.snapshot().units.find((unit) => unit.descriptor.id === id)?.idle?.phase === 'sleeping',
        ),
      )
      const old = domains.map((id) => {
        const owner = latest.get(id)
        if (!owner) throw new Error('Previously serving actual deadline owner missing')
        expect(managed.manager.retirement(owner)).toMatchObject({
          status: 'retired',
          ownerCleanupCompleted: true,
          physical: { nativeJoined: true, onExitCompleted: true, cleanDisposeAck: true, forced: false, exitCode: 0 },
        })
        return owner
      })
      const kernel = old.find((owner) => owner.unitId === 'kernel')
      const controller = old.find((owner) => owner.unitId === 'controller')
      const maintenance = old.find((owner) => owner.unitId === 'maintenance')
      if (!kernel || !controller || !maintenance) throw new Error('Exact deadline owner cohort missing')
      const wakes = sessionWakeTransferSchema.parse(observed(kernel, 'kernel.sessionWakes.commit').input).ack
      const schedules = scheduleIdleManifestSchema.parse(observed(controller, 'controller.schedule.quiesce').reply)
      const inspection = maintenanceInspectionManifestSchema.parse(
        observed(maintenance, 'maintenance.inspection.preview').reply,
      )
      expect(wakes.manifest.entries).toHaveLength(1)
      expect(wakes.manifest.entries[0]).toMatchObject({
        sessionId: session.id,
        intentId: intent.intentId,
        dueAt: intent.retryAt,
      })
      expect(
        schedules.snapshot.definitions.some(
          (item) => item.id === schedule.id && item.spec.kind === 'once' && item.spec.at === at,
        ),
      ).toBe(true)
      if (!demand) throw new Error('Actual Host demand composition was not observed')
      // Use the same public demand owner as business frontdoors. A raw Manager
      // hold bypasses the Host idle lifecycle and cannot prove a second sleep.
      hold = await demand.acquire(domains, AbortSignal.timeout(30_000))
      const owners = hold.owners
      const evidence = domains.map((id) => {
        const owner = owners.find((value) => value.unitId === id)
        if (!owner) throw new Error('Actually admitted deadline owner missing')
        const method =
          id === 'kernel'
            ? 'kernel.sessionWakes.restore'
            : id === 'controller'
              ? 'controller.schedule.wake'
              : 'maintenance.inspection.restore'
        const ack = observations.findLast(
          (value) => value.owner.incarnation === owner.incarnation && value.method === method,
        )
        return { owner, firstServing: serving.get(owner.incarnation), restore: ack ?? null }
      })
      console.info(
        JSON.stringify({
          type: 'fullhost-absolute-deadline-readiness',
          round,
          evidence,
          originalGoalDueAt: intent.retryAt,
          originalScheduleAt: at,
          originalSearchAt: schedules.nextSearchCheckAt,
          originalInspectionAt: inspection.checkpoint.nextCheckAt,
          externalModelRequests: 0,
        }),
      )
      expect(overflow).toBe(false)
      for (const value of evidence) {
        expect(value.restore).not.toBeNull()
        if (!value.restore || value.firstServing === undefined) throw new Error('Actual before-serving proof missing')
        expect(value.restore.sequence).toBeLessThan(value.firstServing)
        if (value.owner.unitId === 'kernel') {
          expect(sessionWakeTransferSchema.parse(value.restore.input).ack).toEqual(wakes)
          expect(sessionWakeStatusSchema.parse(value.restore.reply)).toMatchObject({
            phase: 'restored',
            token: wakes.token,
            revision: wakes.manifest.revision,
          })
        } else if (value.owner.unitId === 'controller') {
          const reply = scheduleWakeReplySchema.parse(value.restore.reply)
          const checkpoint = runtimeControllerIdleCheckpointSchema.parse(value.restore.checkpoint)
          expect(controllerScheduleWakeSchema.parse(value.restore.input).restoration).toEqual(schedules)
          if (reply.kind === 'settled') {
            stableControllerRestorations++
            expect(checkpoint.state.search).toMatchObject({ timer: true, nextDueAt: schedules.nextSearchCheckAt })
            expect(checkpoint.state.schedule).toMatchObject({ timer: true, nextDueAt: schedules.nextDueAt })
          } else {
            expect(reply.manifest.snapshot.database.sourceRevision).not.toBe(schedules.snapshot.database.sourceRevision)
            expect(checkpoint.state.search?.timer).toBe(true)
            expect(checkpoint.state.search?.nextDueAt).not.toBeNull()
            expect(checkpoint.state.search?.nextDueAt).toBeLessThanOrEqual(schedules.nextSearchCheckAt)
            expect(checkpoint.state.schedule?.timer).toBe(true)
            expect(checkpoint.state.schedule?.nextDueAt).not.toBeNull()
            expect(checkpoint.state.schedule?.nextDueAt).toBeLessThanOrEqual(schedules.nextDueAt ?? 0)
          }
          expect(reply.manifest.snapshot.definitions).toEqual(schedules.snapshot.definitions)
        } else {
          expect(maintenanceInspectionRestoreSchema.parse(value.restore.input).checkpoint).toEqual(
            inspection.checkpoint,
          )
          expect(maintenanceInspectionWakeReplySchema.parse(value.restore.reply)).toMatchObject({
            owner: value.owner,
            checkpoint: inspection.checkpoint,
            timerArmed: true,
          })
        }
      }
      expect((await goals.get(session.id)).goal?.continuation).toMatchObject({
        intentId: intent.intentId,
        retryAt: intent.retryAt,
      })
      expect((await managed.storage.call('readSessionFacts', { sessionId: session.id })).runs).toHaveLength(1)
      hold.release()
      hold = undefined
    }
    expect(stableControllerRestorations).toBeGreaterThanOrEqual(1)
    await goals.clear(session.id)
  } catch (error) {
    primary = { error }
    console.info(
      JSON.stringify({
        type: 'fullhost-absolute-deadline-readiness-failure',
        observations,
        serving: [...serving],
        overflow,
        checkpointEvents,
        units: runtime?.snapshot().units,
        demand: demand?.snapshot(),
      }),
    )
  }
  const cleanup: unknown[] = []
  hold?.release()
  try {
    await seed?.close()
  } catch (error) {
    cleanup.push(error)
  }
  try {
    await runtime?.close()
  } catch (error) {
    cleanup.push(error)
  }
  if (cleanup.length === 0) hold?.release()
  calls.mockRestore()
  snapshots.mockRestore()
  demands.mockRestore()
  if (!primary && cleanup.length === 0 && runtime) {
    const current = await realpath(root)
    if (current !== canonical || dirname(current) !== parent || !basename(current).startsWith('hbar-deadline-ready-'))
      throw new Error('Deadline readiness fixture identity changed before cleanup')
    await rm(root, { recursive: true, force: true })
  }
  if (cleanup.length) {
    const errors = primary ? [primary.error, ...cleanup] : cleanup
    throw new AggregateError(errors, 'Absolute deadline readiness cleanup failed', { cause: errors[0] })
  }
  if (primary) throw primary.error
}, 120_000)
