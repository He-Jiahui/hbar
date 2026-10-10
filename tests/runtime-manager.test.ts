import { afterEach, expect, test } from 'bun:test'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import {
  RuntimeManager,
  ManagedProcess,
  type ManagedGenerationPort,
  type RuntimeArtifact,
  type RuntimeArtifactSet,
} from '@hbar/runtime'
import type { RuntimeGeneration, RuntimeOwner, RuntimeUnitDescriptor } from '@hbar/contracts/runtime'
import { fileURLToPath } from 'node:url'

const managers: RuntimeManager[] = []
afterEach(async () => {
  for (const manager of managers.splice(0)) await manager.close()
})
const fingerprint = 'a'.repeat(64)
function manifest(id = 'plugin'): RuntimeUnitDescriptor {
  return {
    id,
    kind: 'plugin',
    isolation: 'process',
    dependencies: [],
    required: true,
    reloadable: true,
    contractFingerprint: fingerprint,
    storageSchema: 23,
  }
}
function artifact(revision: number, descriptor = manifest()): RuntimeArtifact {
  return {
    id: revision.toString(16).padStart(64, '0'),
    unitId: descriptor.id,
    descriptor,
    entry: 'unit.js',
    files: [{ name: 'unit.js', sha256: fingerprint }],
    inputs: [],
    resources: [],
    resourceFiles: [],
  }
}
async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000
  while (!check()) {
    if (Date.now() >= deadline) throw new Error('Runtime reload did not settle')
    await Bun.sleep(5)
  }
}
function deferred() {
  let release: () => void = () => {
    throw new Error('Uninitialized deferred')
  }
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release: () => release() }
}
class Generation implements ManagedGenerationPort {
  state: RuntimeGeneration
  prepareGate: Promise<void> | undefined
  constructor(
    readonly artifact: RuntimeArtifact,
    generation: number,
    readonly changed: () => void,
    readonly failed = false,
  ) {
    this.state = {
      unitId: artifact.unitId,
      generation,
      incarnation: `${artifact.unitId}-${generation}`,
      artifactId: artifact.id,
      role: 'candidate',
      phase: 'preparing',
      pid: 100 + generation,
      references: { runs: 0, resources: 0, requests: 0 },
      lastHeartbeatAt: null,
      failures: 0,
      nextAttemptAt: null,
      reasonCode: null,
    }
  }
  owner(): RuntimeOwner {
    return { unitId: this.state.unitId, generation: this.state.generation, incarnation: this.state.incarnation }
  }
  snapshot(): RuntimeGeneration {
    return structuredClone(this.state)
  }
  references(runs: number, resources: number): void {
    this.state.references.runs = runs
    this.state.references.resources = resources
  }
  async prepare() {
    await this.prepareGate
    if (this.failed) throw new HbarError('FIXTURE_PREPARE_FAILED', 'Candidate did not prepare')
    if (this.state.phase === 'disposed') throw new HbarError('RUNTIME_DISPOSED', 'Candidate was disposed')
    this.state.phase = 'ready'
    this.changed()
  }
  async activate(role: 'default' | 'draining' = 'default') {
    this.state.role = role
    this.state.phase = role === 'default' ? 'serving' : 'draining'
    this.changed()
  }
  async drain() {
    this.state.role = 'draining'
    this.state.phase = 'draining'
    this.changed()
    return { runs: 0, resources: 0, requests: this.state.references.requests }
  }
  async dispose() {
    this.state.phase = 'disposed'
    this.state.pid = null
    this.changed()
  }
  async call<Output>(_method: string, input: unknown, schema: z.ZodType<Output>): Promise<Output> {
    return schema.parse({ generation: this.state.generation, input })
  }
}
function fixture(
  options: {
    failedArtifact?: number
    gate?: Promise<void>
    units?: string[]
    beforeActivate?: (owner: RuntimeOwner, artifact: RuntimeArtifact) => Promise<void>
  } = {},
) {
  const sets = new Map<string, RuntimeArtifactSet>()
  const created: Generation[] = []
  const references = new Map<string, number>()
  let preparation = 0
  let peak = 0
  const manager = new RuntimeManager({
    instanceId: 'stable-host',
    artifacts: {
      artifactSet(id) {
        const set = sets.get(id)
        if (!set) throw new HbarError('RUNTIME_ARTIFACT_UNREGISTERED', 'Set missing')
        return set
      },
      preparedSets: () => [...sets.keys()],
    },
    sweepMs: 10,
    ...(options.beforeActivate ? { beforeActivate: options.beforeActivate } : {}),
    references: (owner) => ({ runs: references.get(owner.incarnation) ?? 0, resources: 0, tools: 0 }),
    create(artifact, generation, changed) {
      const value = new Generation(
        artifact,
        generation,
        changed,
        artifact.id === options.failedArtifact?.toString(16).padStart(64, '0'),
      )
      const prepare = value.prepare.bind(value)
      value.prepare = async () => {
        preparation++
        peak = Math.max(peak, preparation)
        try {
          await prepare()
        } finally {
          preparation--
        }
      }
      value.prepareGate = options.gate
      created.push(value)
      return value
    },
  })
  managers.push(manager)
  for (const unit of options.units ?? ['plugin']) manager.register(manifest(unit))
  const reload = (revision: number, units = options.units ?? ['plugin']) => {
    const id = `set-${revision}`
    sets.set(id, { id, createdAt: Date.now(), artifacts: units.map((unit) => artifact(revision, manifest(unit))) })
    return manager.reload(id, units).operationId
  }
  const completed = async (id: string) => until(() => manager.getReload(id).phase === 'completed')
  return { manager, created, references, sets, reload, completed, peak: () => peak }
}

test('a local reload changes only its unit generation and old bound work retains the previous version', async () => {
  const f = fixture({ units: ['plugin', 'independent'] })
  await f.completed(f.reload(1))
  const old = f.manager.currentVersion('plugin')
  const independent = f.manager.currentVersion('independent')
  f.references.set('plugin-1', 1)
  const operation = f.reload(2, ['plugin'])
  await until(() => f.manager.currentVersion('plugin').generation === 2)
  expect(f.manager.currentVersion('independent')).toEqual(independent)
  expect(await f.manager.call('plugin', 'echo', 'old', z.object({ generation: z.number() }), {}, old)).toMatchObject({
    generation: 1,
  })
  expect(await f.manager.call('plugin', 'echo', 'new', z.object({ generation: z.number() }))).toMatchObject({
    generation: 2,
  })
  expect(f.manager.getReload(operation).phase).toBe('draining')
  f.references.delete('plugin-1')
  await f.completed(operation)
  expect(f.manager.snapshot().units.find((unit) => unit.descriptor.id === 'plugin')?.generations).toHaveLength(1)
  expect(f.manager.snapshot().instanceId).toBe('stable-host')
})

test('two serving generations retain at most one candidate and continuous edits keep only the latest candidate', async () => {
  const f = fixture()
  await f.completed(f.reload(1))
  f.references.set('plugin-1', 1)
  const second = f.reload(2)
  await until(() => f.manager.currentVersion('plugin').generation === 2)
  f.references.set('plugin-2', 1)
  const third = f.reload(3)
  await until(() => f.manager.getReload(third).phase === 'waiting_capacity')
  expect(f.manager.snapshot().units[0]?.generations).toHaveLength(3)
  const fourth = f.reload(4)
  await until(() => f.manager.getReload(fourth).phase === 'waiting_capacity')
  expect(f.manager.getReload(third).phase).toBe('cancelled')
  expect(f.manager.snapshot().units[0]?.generations).toHaveLength(3)
  expect(f.manager.currentVersion('plugin').artifactId).toBe(artifact(2).id)
  f.references.delete('plugin-1')
  await f.completed(second)
  await until(() => f.manager.currentVersion('plugin').artifactId === artifact(4).id)
  expect(f.manager.snapshot().units[0]?.generations).toHaveLength(2)
  f.references.delete('plugin-2')
  await f.completed(fourth)
  expect(
    f.created.some((generation) => generation.artifact.id === artifact(3).id && generation.state.role === 'default'),
  ).toBe(false)
})

test('candidate failure keeps the current version, while cancellation cannot roll back a switched generation', async () => {
  const f = fixture({ failedArtifact: 2 })
  await f.completed(f.reload(1))
  const before = f.manager.currentVersion('plugin')
  const failed = f.reload(2)
  await until(() => f.manager.getReload(failed).phase === 'failed')
  expect(f.manager.currentVersion('plugin')).toEqual(before)
  f.references.set('plugin-1', 1)
  const accepted = f.reload(3)
  await until(() => f.manager.currentVersion('plugin').artifactId === artifact(3).id)
  expect(f.manager.cancelReload(accepted).cancellable).toBe(false)
  expect(f.manager.currentVersion('plugin').artifactId).toBe(artifact(3).id)
  f.references.delete('plugin-1')
  await f.completed(accepted)
})

test('cancelled prepared candidates release their process but preserve the active and draining defaults', async () => {
  const f = fixture()
  await f.completed(f.reload(1))
  f.references.set('plugin-1', 1)
  f.reload(2)
  await until(() => f.manager.currentVersion('plugin').generation === 2)
  f.references.set('plugin-2', 1)
  const candidate = f.reload(3)
  await until(() => f.manager.getReload(candidate).phase === 'waiting_capacity')
  expect(f.manager.cancelReload(candidate).phase).toBe('cancelled')
  await until(() => f.manager.snapshot().units[0]?.generations.length === 2)
  expect(f.manager.currentVersion('plugin').artifactId).toBe(artifact(2).id)
  expect(f.created.at(-1)?.state.phase).toBe('disposed')
})

test('an activation handoff cannot be cancelled halfway through granting production authority', async () => {
  const handoff = deferred()
  const f = fixture({
    beforeActivate: async (_owner, artifact) => {
      if (artifact.id === '2'.padStart(64, '0')) await handoff.promise
    },
  })
  await f.completed(f.reload(1))
  const operation = f.reload(2)
  await until(() => f.manager.getReload(operation).phase === 'activating')
  expect(f.manager.cancelReload(operation).cancellable).toBe(false)
  expect(f.manager.getReload(operation).units[0]?.phase).toBe('activating')
  handoff.release()
  await f.completed(operation)
  expect(f.manager.currentVersion('plugin').artifactId).toBe(artifact(2).id)
})

test('candidate preparation concurrency is two even for a larger multi-unit operation', async () => {
  const gate = deferred()
  const f = fixture({ gate: gate.promise, units: ['a', 'b', 'c', 'd'] })
  const operation = f.reload(1)
  await until(() => f.created.length === 2)
  expect(f.peak()).toBe(2)
  expect(f.manager.getReload(operation).units.filter((unit) => unit.phase === 'preparing')).toHaveLength(4)
  gate.release()
  await f.completed(operation)
  expect(f.created).toHaveLength(4)
  expect(f.peak()).toBe(2)
})

test('multi-unit preflight failure does not switch the other already prepared targets', async () => {
  const f = fixture({ units: ['a', 'b'] })
  await f.completed(f.reload(1))
  const beforeA = f.manager.currentVersion('a')
  const beforeB = f.manager.currentVersion('b')
  const id = 'incompatible'
  f.sets.set(id, {
    id,
    createdAt: Date.now(),
    artifacts: [artifact(2, manifest('a')), artifact(2, { ...manifest('b'), contractFingerprint: 'b'.repeat(64) })],
  })
  const operation = f.manager.reload(id, ['a', 'b']).operationId
  await until(() => f.manager.getReload(operation).phase === 'restart_required')
  await Bun.sleep(30)
  expect(f.manager.currentVersion('a')).toEqual(beforeA)
  expect(f.manager.currentVersion('b')).toEqual(beforeB)
})

test('subscribed deltas are bounded and an observer cannot corrupt another observer or the stored operation', async () => {
  const f = fixture({ units: Array.from({ length: 40 }, (_, index) => `unit${index}`) })
  let events = 0
  f.manager.subscribe(() => {
    throw new Error('observer fixture')
  })
  f.manager.subscribe((delta) => {
    if (delta.units[0]) delta.units[0].descriptor.id = 'corrupted observer input'
    if (delta.operations[0]) delta.operations[0].phase = 'failed'
  })
  f.manager.subscribe((delta) => {
    events++
    expect(delta.units.length).toBeLessThanOrEqual(32)
    expect(delta.operations.length).toBeLessThanOrEqual(16)
    expect(delta.units.every((unit) => unit.descriptor.id !== 'corrupted observer input')).toBe(true)
  })
  const operation = f.reload(1)
  await f.completed(operation)
  expect(events).toBeGreaterThan(1)
  const snapshot = f.manager.getReload(operation)
  snapshot.phase = 'failed'
  expect(f.manager.getReload(operation).phase).toBe('completed')
  expect(f.manager.snapshot().units.some((unit) => unit.descriptor.id === 'corrupted observer input')).toBe(false)
})

test('the manager can replace a real Bun unit without changing an unrelated child PID or Host identity', async () => {
  const sets = new Map<string, RuntimeArtifactSet>()
  const manager = new RuntimeManager({
    instanceId: 'real-stable-base',
    artifacts: {
      artifactSet(id) {
        const set = sets.get(id)
        if (!set) throw new Error('Missing set')
        return set
      },
      preparedSets: () => [...sets.keys()],
    },
    sweepMs: 20,
    references: () => ({ runs: 0, resources: 0, tools: 0 }),
    create(artifact, generation, changed) {
      return new ManagedProcess({
        descriptor: artifact.descriptor,
        artifactId: artifact.id,
        generation,
        modulePath: fileURLToPath(new URL('./fixtures/runtime-service.ts', import.meta.url)),
        parent: { unitId: 'base', generation: 1, incarnation: 'real-base' },
        startupMs: 3_000,
        shutdownMs: 500,
        onState: changed,
      })
    },
  })
  managers.push(manager)
  manager.register(manifest('plugin'))
  manager.register(manifest('independent'))
  sets.set('first', {
    id: 'first',
    createdAt: Date.now(),
    artifacts: [artifact(1), artifact(1, manifest('independent'))],
  })
  const initial = manager.reload('first', ['plugin', 'independent']).operationId
  await until(() => manager.getReload(initial).phase === 'completed')
  const before = manager.snapshot()
  const originalPid = before.units.find((unit) => unit.descriptor.id === 'plugin')?.generations[0]?.pid
  if (typeof originalPid !== 'number') throw new Error('The original managed unit has no live PID')
  const inFlight = manager.call('plugin', 'fixture.wait', 300, z.number())
  sets.set('second', { id: 'second', createdAt: Date.now(), artifacts: [artifact(2)] })
  const reload = manager.reload('second', ['plugin']).operationId
  await until(() => manager.currentVersion('plugin').artifactId === artifact(2).id)
  expect(await inFlight).toBe(originalPid)
  await until(() => manager.getReload(reload).phase === 'completed')
  const after = manager.snapshot()
  expect(after.instanceId).toBe(before.instanceId)
  expect(after.units.find((unit) => unit.descriptor.id === 'independent')?.generations[0]?.pid).toBe(
    before.units.find((unit) => unit.descriptor.id === 'independent')?.generations[0]?.pid,
  )
  expect(after.units.find((unit) => unit.descriptor.id === 'plugin')?.generations[0]?.pid).not.toBe(
    before.units.find((unit) => unit.descriptor.id === 'plugin')?.generations[0]?.pid,
  )
  expect(await manager.call('plugin', 'fixture.echo', 'real replacement', z.string())).toBe('real replacement')
})
