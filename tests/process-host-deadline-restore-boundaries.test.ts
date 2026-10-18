import { expect, spyOn, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import type { z } from 'zod'
import type { RuntimeOwner } from '@hbar/contracts/runtime'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { IpcPeer, type IpcCallOptions } from '@hbar/runtime'
import { createPathLayout } from '@hbar/storage'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { HostRuntimeDemand, type HostRuntimeDemandHold } from '../apps/host/src/runtime-host-demand'

function gate() {
  let release = () => {}
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release: () => release() }
}
async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 30_000
  while (!check()) {
    if (Date.now() >= deadline) throw new Error('Deadline restore boundary did not settle')
    await Bun.sleep(10)
  }
}
async function boundary(mode: 'shared-cancel' | 'controller-unknown' | 'maintenance-unknown'): Promise<void> {
  const parent = await realpath(tmpdir())
  const root = await mkdtemp(join(parent, 'hbar-deadline-boundary-'))
  const canonical = await realpath(root)
  if (dirname(canonical) !== parent || !basename(canonical).startsWith('hbar-deadline-boundary-'))
    throw new Error('Unowned deadline boundary fixture')
  const release = gate()
  let runtime: ProcessHostRuntime | undefined
  let demand: HostRuntimeDemand | undefined
  let armed = false
  let primary: { error: unknown } | undefined
  const holds: HostRuntimeDemandHold[] = []
  const receipts: Array<{ owner: RuntimeOwner; method: string }> = []
  const targets =
    mode === 'shared-cancel'
      ? ['controller', 'maintenance']
      : [mode === 'controller-unknown' ? 'controller' : 'maintenance']
  const originalAcquire = HostRuntimeDemand.prototype.acquire
  const acquisitions = spyOn(HostRuntimeDemand.prototype, 'acquire').mockImplementation(function (
    this: HostRuntimeDemand,
    ...args: Parameters<HostRuntimeDemand['acquire']>
  ) {
    demand = this
    return originalAcquire.apply(this, args)
  })
  const originalCall = IpcPeer.prototype.call
  const calls = spyOn(IpcPeer.prototype, 'call').mockImplementation(function <Output>(
    this: IpcPeer,
    method: string,
    input: unknown,
    output: z.ZodType<Output>,
    options?: IpcCallOptions,
  ): Promise<Output> {
    const pending = originalCall.call(this, method, input, output, options).then((value) => output.parse(value))
    if (
      !armed ||
      !targets.includes(this.remote.unitId) ||
      !['controller.schedule.wake', 'maintenance.inspection.restore'].includes(method)
    )
      return pending
    return pending.then(async (value) => {
      receipts.push({ owner: { ...this.remote }, method })
      if (mode !== 'shared-cancel') throw new Error('Fixture loses the original reply after the real child restore ACK')
      await release.promise
      return value
    })
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
      diagnosticFullCoverage: true,
    })
    const managed = runtime
    const application = managed.controller.application
    if (!application || !demand) throw new Error('Actual Host demand composition missing')
    const port = demand
    await application.scheduleController.start()
    await until(() =>
      targets.every(
        (id) => managed.snapshot().units.find((unit) => unit.descriptor.id === id)?.idle?.phase === 'sleeping',
      ),
    )
    armed = true
    const controller = new AbortController()
    const first = port.acquire(targets, controller.signal).then(
      (hold) => {
        holds.push(hold)
        return { ok: true }
      },
      () => ({ ok: false }),
    )
    if (mode === 'shared-cancel') {
      await until(() => receipts.length >= 1)
      const second = port.acquire(targets, AbortSignal.timeout(30_000)).then((hold) => {
        holds.push(hold)
        return hold
      })
      const secondOutcome = second.then(
        () => 'ready',
        () => 'failed',
      )
      controller.abort()
      expect((await first).ok).toBe(false)
      await Bun.sleep(30)
      for (const receipt of receipts) {
        const generation = managed
          .snapshot()
          .units.find((unit) => unit.descriptor.id === receipt.owner.unitId)
          ?.generations.find((value) => value.incarnation === receipt.owner.incarnation)
        expect(generation?.phase).not.toBe('serving')
      }
      release.release()
      expect(await secondOutcome).toBe('ready')
      const hold = await second
      expect(receipts).toHaveLength(2)
      for (const id of targets) {
        expect(receipts.filter((receipt) => receipt.owner.unitId === id)).toHaveLength(1)
        const owner = hold.owners.find((value) => value.unitId === id)
        expect(owner).toEqual(receipts.find((value) => value.owner.unitId === id)?.owner)
      }
      hold.release()
      await until(() =>
        targets.every(
          (id) => managed.snapshot().units.find((unit) => unit.descriptor.id === id)?.idle?.phase === 'sleeping',
        ),
      )
    } else {
      expect((await first).ok).toBe(false)
      expect(receipts).toHaveLength(1)
      const owner = receipts[0]?.owner
      if (!owner) throw new Error('Original real restore ACK missing')
      const failed = managed.snapshot().units.find((unit) => unit.descriptor.id === owner.unitId)
      expect(failed?.generations.some((value) => value.phase === 'serving')).toBe(false)
      expect(port.snapshot().unresolvedStarts + port.snapshot().unresolvedAdmissions).toBeGreaterThan(0)
      const repeated = await port.acquire(targets, AbortSignal.timeout(1_000)).then(
        (hold) => {
          holds.push(hold)
          return 'unexpected-ready'
        },
        () => 'fenced',
      )
      expect(repeated).toBe('fenced')
      for (let sample = 0; sample < 20; sample++) managed.snapshot()
      await Bun.sleep(50)
      expect(receipts).toHaveLength(1)
      expect(
        managed
          .snapshot()
          .units.find((unit) => unit.descriptor.id === owner.unitId)
          ?.generations.some((value) => value.phase === 'serving'),
      ).toBe(false)
    }
    console.info(
      JSON.stringify({ type: 'real-before-serving-restore-boundary', mode, receipts, externalModelRequests: 0 }),
    )
  } catch (error) {
    primary = { error }
    console.info(
      JSON.stringify({
        type: 'real-before-serving-restore-boundary-failure',
        mode,
        receipts,
        units: runtime?.snapshot().units,
        demand: demand?.snapshot(),
      }),
    )
  }
  release.release()
  for (const hold of holds) hold.release()
  const cleanup: unknown[] = []
  try {
    await runtime?.close()
  } catch (error) {
    cleanup.push(error)
  }
  calls.mockRestore()
  acquisitions.mockRestore()
  if (!primary && cleanup.length === 0 && runtime) {
    const current = await realpath(root)
    if (
      current !== canonical ||
      dirname(current) !== parent ||
      !basename(current).startsWith('hbar-deadline-boundary-')
    )
      throw new Error('Deadline boundary fixture identity changed before cleanup')
    await rm(root, { recursive: true, force: true })
  }
  if (cleanup.length) {
    const errors = primary ? [primary.error, ...cleanup] : cleanup
    throw new AggregateError(errors, 'Deadline boundary cleanup failed', { cause: errors[0] })
  }
  if (primary) throw primary.error
}
test(
  'one cancelled waiter leaves the original shared before-serving restores intact',
  () => boundary('shared-cancel'),
  120_000,
)
test(
  'lost real Controller restore ACK keeps startup UNKNOWN and cannot be replayed',
  () => boundary('controller-unknown'),
  120_000,
)
test(
  'lost real Maintenance restore ACK keeps startup UNKNOWN and cannot be replayed',
  () => boundary('maintenance-unknown'),
  120_000,
)
