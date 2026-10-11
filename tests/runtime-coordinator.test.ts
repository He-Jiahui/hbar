import { expect, test } from 'bun:test'
import { RuntimeCoordinator, type CoordinationPersistence } from '@hbar/runtime'
import type {
  ExecutionOwnership,
  RuntimeOwner,
  RuntimeUnitDescriptor,
  RuntimeVersion,
  RuntimeVersionSet,
} from '@hbar/contracts/runtime'

const hash = 'a'.repeat(64)
function owner(unitId: string, generation = 1): RuntimeOwner {
  return { unitId, generation, incarnation: `${unitId}-${generation}-${crypto.randomUUID()}` }
}
function version(value: RuntimeOwner): RuntimeVersion {
  return { unitId: value.unitId, generation: value.generation, artifactId: hash }
}
function fixture(overrides: Partial<CoordinationPersistence> = {}) {
  const claimed: ExecutionOwnership[] = []
  const revoked: Array<{ owner: RuntimeOwner; runIds: readonly string[] }> = []
  const coordinator = new RuntimeCoordinator({
    async claim(lease) {
      claimed.push(lease)
      return lease
    },
    async release() {},
    async revoke(owner, runIds) {
      revoked.push({ owner, runIds })
    },
    ...overrides,
  })
  const kernel = owner('kernel')
  const driver = owner('driver')
  const plugin = owner('plugin.local')
  const register = (value: RuntimeOwner, kind: RuntimeUnitDescriptor['kind'], activate = true) => {
    coordinator.register(value, version(value), {
      id: value.unitId,
      kind,
      isolation: 'process',
      dependencies: [],
      required: true,
      reloadable: true,
      contractFingerprint: hash,
      storageSchema: 23,
    })
    if (activate) coordinator.activate(value)
  }
  register(kernel, 'kernel')
  register(driver, 'driver')
  register(plugin, 'plugin')
  const bindings = (k = kernel, d = driver, p = plugin): RuntimeVersionSet => ({
    kernel: version(k),
    driver: version(d),
    plugins: [version(p)],
    hooks: [version(p)],
  })
  const claim = async (sessionId = 'session', runId = 'run', k = kernel, d = driver, p = plugin) => {
    const lease = await coordinator.claim(k, sessionId, runId, bindings(k, d, p))
    if (!lease) throw new Error('Fixture did not claim its Run')
    return lease
  }
  return { coordinator, kernel, driver, plugin, bindings, claim, register, claimed, revoked }
}

test('candidates have no write authority and only a default Kernel can claim a Run', async () => {
  const f = fixture()
  const candidate = owner('kernel', 2)
  f.register(candidate, 'kernel', false)
  expect(() => f.coordinator.assertCanWrite(candidate)).toThrow('candidates cannot write')
  await expect(f.coordinator.claim(candidate, 'session', 'run', f.bindings(candidate))).rejects.toMatchObject({
    code: 'RUNTIME_NOT_DEFAULT',
  })
  expect(f.claimed).toHaveLength(0)
  f.coordinator.activate(candidate)
  await expect(f.coordinator.claim(f.kernel, 'session', 'old', f.bindings())).rejects.toMatchObject({
    code: 'RUNTIME_NOT_DEFAULT',
  })
  expect((await f.claim('session', 'new', candidate)).owner.incarnation).toBe(candidate.incarnation)
})

test('valid lease identities cannot forge their captured capability bindings', async () => {
  const f = fixture()
  const lease = await f.claim()
  const next = owner('plugin.local', 2)
  f.register(next, 'plugin')
  const forged = structuredClone(lease)
  forged.versions.plugins = [version(next)]
  expect(() => f.coordinator.assertExecution(forged)).toThrow('invalid or revoked owner')
  expect(() => f.coordinator.assertCanWrite(next, forged)).toThrow('invalid or revoked owner')
  f.coordinator.assertExecution(lease)
})

test('new Runs may bind a draining capability only for the Session that retains its native resource', async () => {
  const f = fixture(), next = owner('plugin.local', 2)
  const retained = f.coordinator.retainSessionResource(f.plugin, 'native:fixture-context', 'retained-session')
  f.register(next, 'plugin')
  const wrong: unknown = await f.coordinator.claim(f.kernel, 'other-session', 'wrong-run', f.bindings()).catch((error: unknown) => error)
  expect(wrong).toMatchObject({ code: 'RUNTIME_DEPENDENCY_UNAVAILABLE' })
  const run = await f.claim('retained-session', 'retained-run')
  expect(run.versions.plugins[0]).toEqual(version(f.plugin))
  await f.coordinator.releaseExecution(run)
  f.coordinator.releaseResource(f.plugin, retained.id)
  const expired: unknown = await f.coordinator.claim(f.kernel, 'retained-session', 'expired-run', f.bindings()).catch((error: unknown) => error)
  expect(expired).toMatchObject({ code: 'RUNTIME_DEPENDENCY_UNAVAILABLE' })
  expect((await f.claim('fresh-session', 'fresh-run', f.kernel, f.driver, next)).versions.plugins[0]).toEqual(version(next))
})

test('an in-flight claim retains every captured generation while its native resource closes', async () => {
  let commit: (() => void) | undefined
  const f = fixture({ claim: lease => new Promise(resolve => { commit = () => resolve(lease) }) })
  const retained = f.coordinator.retainSessionResource(f.plugin, 'native:closing-context', 'session')
  const next = owner('plugin.local', 2); f.register(next, 'plugin')
  const pending = f.claim()
  f.coordinator.releaseResource(f.plugin, retained.id)
  expect(f.coordinator.references(f.plugin)).toMatchObject({ runs: 1, resources: 0 })
  if (!commit) throw new Error('The claim did not reach persistence')
  commit()
  const lease = await pending
  expect(lease.versions.plugins[0]).toEqual(version(f.plugin))
  expect(f.coordinator.references(f.plugin).runs).toBe(1)
  await f.coordinator.releaseExecution(lease)
  expect(f.coordinator.references(f.plugin).runs).toBe(0)
})

test('a dependency that exits during a persisted claim cannot be replaced by a healthy incarnation with the same version', async () => {
  let finish: (() => void) | undefined
  const f = fixture({ claim: lease => new Promise(resolve => { finish = () => resolve(lease) }) })
  const pending = f.claim().catch((error: unknown) => error)
  await f.coordinator.revoke(f.plugin)
  f.coordinator.ownerExited(f.plugin)
  const replacement = owner('plugin.local')
  f.register(replacement, 'plugin')
  if (!finish) throw new Error('The claim did not reach persistence')
  finish()
  expect(await pending).toMatchObject({ code: 'EXECUTION_DEPENDENCY_REVOKED' })
  expect(f.coordinator.execution('run')).toBeNull()
  expect(f.revoked.some(item => item.owner.incarnation === f.kernel.incarnation && item.runIds.includes('run'))).toBe(true)
  const duplicate = await f.coordinator.claim(f.kernel, 'session', 'duplicate', f.bindings(f.kernel, f.driver, replacement)).catch((error: unknown) => error)
  expect(duplicate).toMatchObject({ code: 'EXECUTION_RECONCILIATION_REQUIRED' })
})

test('a compatible dependency switch during claim persistence preserves its captured live draining owner', async () => {
  let finish: (() => void) | undefined
  const f = fixture({ claim: lease => new Promise(resolve => { finish = () => resolve(lease) }) })
  const pending = f.claim()
  const replacement = owner('plugin.local', 2)
  f.register(replacement, 'plugin')
  if (!finish) throw new Error('The claim did not reach persistence')
  finish()
  expect((await pending).versions.plugins[0]).toEqual(version(f.plugin))
  expect(f.coordinator.execution('run')?.versions.plugins[0]).toEqual(version(f.plugin))
})

test('a recovered old generation opens its draining ports without stealing the current default', async () => {
  const f = fixture()
  const next = owner('kernel', 2)
  f.register(next, 'kernel')
  const recovered = owner('kernel', 1)
  f.register(recovered, 'kernel', false)
  f.coordinator.activate(recovered, 'draining')
  f.coordinator.assertCanWrite(recovered)
  expect(f.coordinator.role(recovered)).toBe('draining')
  expect(f.coordinator.canIdle(recovered, 'old')).toBe(false)
  expect((await f.claim('new-session', 'new-run', next)).owner).toEqual(next)
})

test('logical terminal release retains its Session and physical capacity, rejects late commits and hands off once actual work settles', async () => {
  let persisted = 0
  let resumed = 0
  const f = fixture({ release: async () => { persisted++ } })
  const lease = await f.claim()
  const permit = f.coordinator.reserveTool(lease, 'ignored-abort', f.kernel)
  await f.coordinator.requestRelease(lease, () => { resumed++ })
  await f.coordinator.requestRelease(lease, () => { resumed++ })
  expect(persisted).toBe(0)
  expect(f.coordinator.snapshot()).toMatchObject({ sessions: 1, physicalTools: 1 })
  expect(() => f.coordinator.assertCanWrite(f.kernel, lease)).toThrow('logical Run has finished')
  const next = owner('kernel', 2)
  f.register(next, 'kernel')
  expect(await f.coordinator.claim(next, 'session', 'next-run', f.bindings(next))).toBeNull()
  f.coordinator.releaseTool(f.kernel, permit.id)
  await Bun.sleep(0)
  expect(persisted).toBe(1)
  expect(resumed).toBe(1)
  expect(f.coordinator.snapshot()).toMatchObject({ sessions: 0, physicalTools: 0 })
  expect((await f.claim('session', 'next-run', next)).owner).toEqual(next)
})

test('an unknown deferred durable release closes admission and is never blindly replayed', async () => {
  let attempts = 0
  let failed = 0
  const f = fixture({ release: async () => { attempts++; throw new Error('lost receipt') } })
  const lease = await f.claim()
  const permit = f.coordinator.reserveTool(lease, 'physical', f.kernel)
  await f.coordinator.requestRelease(lease, () => {}, () => { failed++ })
  f.coordinator.releaseTool(f.kernel, permit.id)
  await Bun.sleep(0)
  expect(attempts).toBe(1)
  expect(failed).toBe(1)
  expect(f.coordinator.canIdle(f.kernel, 'session')).toBe(false)
  expect(await f.coordinator.claim(f.kernel, 'other', 'other-run', f.bindings())).not.toBeNull()
  expect(attempts).toBe(1)
})

test('a handoff observer error cannot undo a confirmed release or block the next Session executor', async () => {
  const f = fixture()
  const lease = await f.claim()
  await f.coordinator.requestRelease(lease, () => { throw new Error('failed UI observer') })
  expect(f.coordinator.snapshot().sessions).toBe(0)
  expect(f.coordinator.canIdle(f.kernel, 'session')).toBe(true)
})

test('a shared writer failure revokes every active Session without making the healthy Kernel a failed owner', async () => {
  const f = fixture()
  const storage = owner('storage')
  f.register(storage, 'storage')
  const a = await f.claim('a', 'run-a'), b = await f.claim('b', 'run-b')
  expect((await f.coordinator.revoke(storage)).map(lease => lease.runId)).toEqual(['run-a', 'run-b'])
  expect(f.coordinator.role(f.kernel)).toBe('default')
  expect(() => f.coordinator.assertExecution(a)).toThrow('invalid or revoked owner')
  expect(() => f.coordinator.assertExecution(b)).toThrow('invalid or revoked owner')
  f.coordinator.ownerExited(storage)
  f.coordinator.acknowledgeRunStopped(f.kernel, a.runId)
  f.coordinator.acknowledgeRunStopped(f.kernel, b.runId)
  f.coordinator.reconciled('a')
  f.coordinator.reconciled('b')
  expect((await f.claim('a', 'new-a')).owner).toEqual(f.kernel)
})

test('a bound plugin may own execution resources but another serving capability cannot borrow that Run authority', async () => {
  const f = fixture()
  const lease = await f.claim()
  const resource = f.coordinator.acquireResource(f.plugin, 'browser:owned', lease)
  expect(resource?.executionLeaseId).toBe(lease.leaseId)
  const unrelated = owner('unrelated')
  f.register(unrelated, 'plugin')
  expect(() => f.coordinator.acquireResource(unrelated, 'browser:foreign', lease)).toThrow('not bound to this Run')
  if (!resource) throw new Error('Expected a bound resource')
  f.coordinator.releaseResource(f.plugin, resource.id)
})

test('existing Runs retain all dependency versions and Session handoff waits for the old executor', async () => {
  const f = fixture()
  const existing = await f.claim()
  const kernel = owner('kernel', 2)
  const plugin = owner('plugin.local', 2)
  f.register(kernel, 'kernel')
  f.register(plugin, 'plugin')
  f.coordinator.assertExecution(existing)
  expect(f.coordinator.role(f.kernel)).toBe('draining')
  expect(f.coordinator.references(f.plugin).runs).toBe(1)
  expect(await f.coordinator.claim(kernel, 'session', 'next', f.bindings(kernel, f.driver, plugin))).toBeNull()
  const permit = f.coordinator.reserveTool(existing, 'old-tool', f.plugin)
  expect(() => f.coordinator.assertCanWrite(plugin, existing)).toThrow('not bound to this Run')
  expect(() => f.coordinator.reserveTool(existing, 'wrong-tool', plugin)).toThrow('bound runtime version')
  f.coordinator.releaseTool(f.plugin, permit.id)
  await f.coordinator.releaseExecution(existing)
  const next = await f.claim('session', 'next', kernel, f.driver, plugin)
  expect(next.versions.plugins[0]?.generation).toBe(2)
  expect(f.coordinator.references(f.plugin).runs).toBe(0)
})

test('a lost durable claim receipt blocks the Session without retrying the claim write', async () => {
  let writes = 0
  const f = fixture({
    async claim() {
      writes++
      throw new Error('receipt lost after write')
    },
  })
  await expect(f.claim()).rejects.toThrow('receipt lost')
  await expect(f.claim()).rejects.toMatchObject({ code: 'EXECUTION_RECONCILIATION_REQUIRED' })
  expect(writes).toBe(1)
  expect(f.coordinator.snapshot().blockedSessions).toEqual(['session'])
})

test('a Run claim still in flight cannot duplicate execution or survive a change of Kernel authority', async () => {
  let finish: ((lease: ExecutionOwnership) => void) | undefined
  let captured: ExecutionOwnership | undefined
  const f = fixture({
    claim(lease) {
      captured = lease
      return new Promise((resolve) => {
        finish = resolve
      })
    },
  })
  const pending = f.coordinator.claim(f.kernel, 'session', 'run', f.bindings())
  expect(await f.coordinator.claim(f.kernel, 'session', 'other', f.bindings())).toBeNull()
  const kernel = owner('kernel', 2)
  f.register(kernel, 'kernel')
  if (!captured || !finish) throw new Error('Physical claim was not captured')
  finish(captured)
  await expect(pending).rejects.toMatchObject({ code: 'EXECUTION_OWNER_REVOKED' })
  expect(f.revoked[0]?.runIds).toEqual(['run'])
  expect(f.coordinator.snapshot().blockedSessions).toEqual(['session'])
})

test('revocation fences late commits before persistence, but physical permits wait for the actual owner exit', async () => {
  let revokeFinished: (() => void) | undefined
  const f = fixture({
    revoke() {
      return new Promise((resolve) => {
        revokeFinished = resolve
      })
    },
  })
  const lease = await f.claim()
  const permit = f.coordinator.reserveTool(lease, 'tool', f.plugin)
  const resource = f.coordinator.acquireResource(f.kernel, 'checkout:/repo', lease)
  expect(resource).not.toBeNull()
  const revoking = f.coordinator.revoke(f.kernel)
  expect(() => f.coordinator.assertExecution(lease)).toThrow('invalid or revoked')
  expect(f.coordinator.snapshot().physicalTools).toBe(1)
  expect(() => f.coordinator.reconciled('session')).toThrow('actually exit')
  revokeFinished?.()
  await revoking
  f.coordinator.ownerExited(f.kernel)
  expect(() => f.coordinator.reconciled('session')).toThrow('resources still hold')
  f.coordinator.releaseTool(f.plugin, permit.id)
  f.coordinator.reconciled('session')
  expect(f.coordinator.snapshot()).toMatchObject({ sessions: 0, physicalTools: 0, resources: 0 })
})

test('a plugin fault fences only dependent Runs and needs both dependency exit and executor acknowledgement', async () => {
  const f = fixture()
  const affected = await f.claim('affected', 'affected-run')
  const independentPlugin = owner('plugin.independent')
  f.register(independentPlugin, 'plugin')
  const independent = await f.claim('independent', 'independent-run', f.kernel, f.driver, independentPlugin)
  expect((await f.coordinator.revoke(f.plugin)).map((lease) => lease.runId)).toEqual(['affected-run'])
  expect(() => f.coordinator.assertExecution(affected)).toThrow('invalid or revoked')
  f.coordinator.assertExecution(independent)
  f.coordinator.acknowledgeRunStopped(f.kernel, affected.runId)
  expect(() => f.coordinator.reconciled('affected')).toThrow('dependency has not actually exited')
  f.coordinator.ownerExited(f.plugin)
  f.coordinator.reconciled('affected')
  f.coordinator.assertExecution(independent)
  expect(f.coordinator.snapshot().sessions).toBe(1)
})

test('tool capacity is one Host-wide physical budget across generations and releases only for its real owner', async () => {
  const f = fixture()
  const existing = await f.claim('old', 'old')
  const kernel = owner('kernel', 2)
  const plugin = owner('plugin.local', 2)
  f.register(kernel, 'kernel')
  f.register(plugin, 'plugin')
  const current = await f.claim('new', 'new', kernel, f.driver, plugin)
  const permits = Array.from({ length: 64 }, (_, index) =>
    f.coordinator.reserveTool(index % 2 ? current : existing, String(index), index % 2 ? plugin : f.plugin),
  )
  expect(() => f.coordinator.reserveTool(current, 'over', plugin)).toThrow('capacity is exhausted')
  const first = permits[0]
  if (!first) throw new Error('Missing physical permit')
  expect(() => f.coordinator.releaseTool(plugin, first.id)).toThrow('physical tool owner')
  f.coordinator.releaseTool(first.owner, first.id)
  expect(f.coordinator.reserveTool(current, 'after', plugin).id).toBeString()
  expect(f.coordinator.snapshot().physicalTools).toBe(64)
})

test('shared checkout and maintenance resource gates remain global during generation replacement', async () => {
  const f = fixture()
  const lease = await f.claim()
  const checkout = f.coordinator.acquireResource(f.kernel, 'checkout:/repo', lease)
  const maintenance = f.coordinator.acquireResource(f.kernel, 'database:maintenance')
  if (!checkout || !maintenance) throw new Error('Missing global resource')
  const kernel = owner('kernel', 2)
  f.register(kernel, 'kernel')
  expect(f.coordinator.acquireResource(kernel, 'checkout:/repo')).toBeNull()
  expect(f.coordinator.acquireResource(kernel, 'database:maintenance')).toBeNull()
  await expect(f.coordinator.releaseExecution(lease)).rejects.toMatchObject({ code: 'EXECUTION_RESOURCES_ACTIVE' })
  expect(() => f.coordinator.releaseResource(kernel, checkout.id)).toThrow('resource owner')
  f.coordinator.releaseResource(f.kernel, checkout.id)
  f.coordinator.releaseResource(f.kernel, maintenance.id)
  await f.coordinator.releaseExecution(lease)
  expect(f.coordinator.acquireResource(kernel, 'database:maintenance')).not.toBeNull()
})
