import { expect, spyOn, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import type { z } from 'zod'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout } from '@hbar/storage'
import {
  IpcPeer,
  ManagedProcess,
  type IpcCallOptions,
  type RuntimeIdleRetirement,
  type RuntimeManagerIdleResult,
} from '@hbar/runtime'
import type { RuntimeOwner } from '@hbar/contracts/runtime'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'

function gate() {
  let release: () => void = () => {}
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release: () => release() }
}

async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 30_000
  while (!check()) {
    if (Date.now() >= deadline) throw new Error('Kernel/plugin retirement race did not reach its original boundary')
    await Bun.sleep(10)
  }
}

async function retirementRace(mode: 'clean' | 'busy' | 'unknown'): Promise<void> {
  const parent = await realpath(tmpdir())
  const root = await mkdtemp(join(parent, 'hbar-kernel-plugin-retire-'))
  const canonical = await realpath(root)
  if (dirname(canonical) !== parent || !basename(canonical).startsWith('hbar-kernel-plugin-retire-'))
    throw new Error('Unowned Kernel/plugin retirement fixture')
  const enteredGoal = gate()
  const releaseGoal = gate()
  const evidence: {
    kernelOwner?: RuntimeOwner
    goalOwner?: RuntimeOwner
    kernel?: RuntimeIdleRetirement
    goal?: RuntimeManagerIdleResult
    hookFailure?: unknown
  } = {}
  let runtime: ProcessHostRuntime | undefined
  let primary: { error: unknown } | undefined
  let injected = false
  let holdGoal = true
  let competing: Promise<RuntimeManagerIdleResult> | undefined
  const originalCall = IpcPeer.prototype.call
  const drain = spyOn(IpcPeer.prototype, 'call').mockImplementation(function <Output>(
    this: IpcPeer,
    method: string,
    input: unknown,
    output: z.ZodType<Output>,
    options?: IpcCallOptions,
  ): Promise<Output> {
    const pending = originalCall.call(this, method, input, output, options).then((value) => output.parse(value))
    if (method !== 'runtime.drain' || this.remote.unitId !== 'kernel' || injected) return pending
    return pending.then(async (result) => {
      const host = runtime
      if (!host) throw new Error('Kernel drain has no actual Host')
      const goal = host.manager.snapshot().units.find((unit) => unit.descriptor.id === 'plugin.goal')
      const selected = goal?.generations.find(
        (generation) => generation.role === 'default' && generation.phase === 'serving',
      )
      if (!selected || goal?.idle?.phase !== 'active') throw new Error('Goal proof changed before drain injection')
      injected = true
      evidence.kernelOwner = { ...this.remote }
      evidence.goalOwner = {
        unitId: 'plugin.goal',
        generation: selected.generation,
        incarnation: selected.incarnation,
      }
      // The real drain has acknowledged. Hold only the competing Goal transition
      // before returning that receipt to Kernel's original final child probe.
      competing = host.manager.retireIdle('plugin.goal', evidence.goalOwner)
      await Promise.race([enteredGoal.promise, competing.then(() => {})])
      if (mode === 'unknown') throw new Error('Fixture loses the drain reply after the actual child acknowledged')
      return result
    })
  })
  const original = ManagedProcess.prototype.retireIdle
  const retirement = spyOn(ManagedProcess.prototype, 'retireIdle').mockImplementation(function (
    this: ManagedProcess,
    owner: RuntimeOwner,
  ): Promise<RuntimeIdleRetirement> {
    if (owner.unitId === 'plugin.goal' && holdGoal) {
      if (!injected || mode === 'busy')
        return Promise.resolve<RuntimeIdleRetirement>({ status: 'busy', owner, reasonCode: 'RUNTIME_IDLE_BUSY' })
      if (evidence.goalOwner?.incarnation === owner.incarnation) {
        enteredGoal.release()
        return releaseGoal.promise.then(() => original.call(this, owner))
      }
    }
    if (owner.unitId !== 'kernel') return original.call(this, owner)
    if (mode === 'busy' && !injected) {
      const goal = runtime?.manager.snapshot().units.find((unit) => unit.descriptor.id === 'plugin.goal')
      const selected = goal?.generations.find(
        (generation) => generation.role === 'default' && generation.phase === 'serving',
      )
      if (!selected || goal?.idle?.phase !== 'active')
        return Promise.resolve<RuntimeIdleRetirement>({ status: 'busy', owner, reasonCode: 'RUNTIME_IDLE_BUSY' })
      injected = true
      evidence.kernelOwner = { ...owner }
      evidence.goalOwner = {
        unitId: 'plugin.goal',
        generation: selected.generation,
        incarnation: selected.incarnation,
      }
      evidence.kernel = { status: 'busy', owner, reasonCode: 'RUNTIME_IDLE_BUSY' }
      return Promise.resolve(evidence.kernel)
    }
    return (async () => {
      try {
        const result = await original.call(this, owner)
        if (injected && evidence.kernelOwner?.incarnation === owner.incarnation) evidence.kernel = result
        return result
      } catch (error) {
        evidence.hookFailure = error
        throw error
      } finally {
        if (injected && evidence.kernelOwner?.incarnation === owner.incarnation) {
          releaseGoal.release()
          if (competing) evidence.goal = await competing
        }
      }
    })()
  })
  try {
    runtime = await ProcessHostRuntime.create({
      layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
      sourceRoot: process.cwd(),
      workspace: root,
      demo: true,
      noLocalExec: true,
      secrets: new MemorySecrets(),
      idleTimeoutMs: 200,
    })
    const host = runtime
    const application = host.controller.application
    if (!application) throw new Error('Actual Controller lifecycle missing')
    await application.scheduleController.start()
    await until(() => evidence.kernel !== undefined || evidence.hookFailure !== undefined)
    if (evidence.hookFailure) throw evidence.hookFailure
    if (mode !== 'busy') await until(() => evidence.goal !== undefined)
    console.info(JSON.stringify({ type: 'fullhost-kernel-plugin-retirement-race', mode, ...evidence }))
    if (!evidence.kernelOwner || !evidence.goalOwner) throw new Error('Actual retirement identities missing')
    if (mode === 'clean') {
      expect(evidence.goal).toBe('busy')
      expect(evidence.kernel).toMatchObject({
        status: 'confirmed-physical-exit',
        owner: evidence.kernelOwner,
        exitCode: 0,
        disposalAcknowledged: true,
        nativeJoined: true,
      })
      await until(
        () => host.snapshot().units.find((unit) => unit.descriptor.id === 'kernel')?.idle?.phase === 'sleeping',
      )
      expect(host.manager.retirement(evidence.kernelOwner)).toMatchObject({
        status: 'retired',
        ownerCleanupCompleted: true,
        physical: { nativeJoined: true, onExitCompleted: true, forced: false, exitCode: 0, cleanDisposeAck: true },
      })
    } else if (mode === 'unknown') {
      expect(evidence.goal).toBe('busy')
      expect(evidence.kernel).toMatchObject({ status: 'unknown', owner: evidence.kernelOwner })
      await until(
        () => host.snapshot().units.find((unit) => unit.descriptor.id === 'kernel')?.idle?.phase === 'unknown',
      )
      expect(await host.manager.retireIdle('plugin.goal', evidence.goalOwner)).toBe('busy')
      const goal = host.snapshot().units.find((unit) => unit.descriptor.id === 'plugin.goal')
      expect(goal?.generations.find((value) => value.incarnation === evidence.goalOwner?.incarnation)).toMatchObject({
        incarnation: evidence.goalOwner.incarnation,
        phase: 'serving',
        role: 'default',
      })
    } else {
      expect(evidence.kernel).toMatchObject({ status: 'busy', owner: evidence.kernelOwner })
      await until(() => host.snapshot().units.find((unit) => unit.descriptor.id === 'kernel')?.idle?.phase === 'active')
      host.manager.setIdleEnabled('kernel', false)
    }
    if (mode !== 'unknown') {
      holdGoal = false
      const result = await host.manager.retireIdle('plugin.goal', evidence.goalOwner)
      expect(['sleeping', 'retired']).toContain(result)
      expect(host.manager.retirement(evidence.goalOwner)).toMatchObject({
        status: 'retired',
        ownerCleanupCompleted: true,
        physical: { nativeJoined: true, onExitCompleted: true, forced: false, exitCode: 0, cleanDisposeAck: true },
      })
    }
  } catch (error) {
    primary = { error }
  }
  holdGoal = false
  releaseGoal.release()
  const cleanup: unknown[] = []
  try {
    await runtime?.close()
  } catch (error) {
    cleanup.push(error)
  }
  retirement.mockRestore()
  drain.mockRestore()
  if (!primary && cleanup.length === 0 && runtime) {
    const current = await realpath(root)
    if (
      current !== canonical ||
      dirname(current) !== parent ||
      !basename(current).startsWith('hbar-kernel-plugin-retire-')
    )
      throw new Error('Kernel/plugin fixture root changed before cleanup')
    await rm(root, { recursive: true, force: true })
  }
  if (cleanup.length) {
    const errors = primary ? [primary.error, ...cleanup] : cleanup
    throw new AggregateError(errors, 'Kernel/plugin retirement fixture cleanup failed', { cause: errors[0] })
  }
  if (primary) throw primary.error
}

test(
  'empty Kernel retirement retains its exact plugin proof through final native disposal',
  () => retirementRace('clean'),
  120_000,
)
test(
  'empty Kernel checkpoint releases its plugin proof after known pre-drain busy',
  () => retirementRace('busy'),
  120_000,
)
test(
  'empty Kernel checkpoint retains its plugin proof through a lost real drain reply',
  () => retirementRace('unknown'),
  120_000,
)
