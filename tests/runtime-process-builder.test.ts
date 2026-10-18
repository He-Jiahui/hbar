import { expect, spyOn, test } from 'bun:test'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { watch } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts/errors'
import type { RuntimeProcessTree, RuntimeProcessTreePort, RuntimeUnitDescriptor } from '@hbar/contracts/runtime'
import { RuntimeArtifactStore, RuntimeBuildProcessOwner } from '@hbar/runtime'
import { createRuntimeProcessTreePort } from '@hbar/runtime-native'

const testWindows = process.platform === 'win32' ? test : test.skip
type Fault = 'none' | 'join' | 'close' | 'active' | 'positive' | 'invalid'
const command = (mode = 'build', marker?: string): [string, ...string[]] => [
  process.execPath,
  '--smol',
  fileURLToPath(new URL('./fixtures/runtime-build-process.ts', import.meta.url)),
  mode,
  ...(marker ? [marker] : []),
]
interface Control {
  fault: Fault
  omitActive: boolean
  rejectAttach: boolean
  attachGate?: Promise<void>
  joinGate?: Promise<void>
  joinCalls: number
  readonly attached: ReturnType<typeof Promise.withResolvers<number>>
  readonly joining: ReturnType<typeof Promise.withResolvers<void>>
}
async function fixture(
  body: (value: {
    root: string
    store: RuntimeArtifactStore
    unit: { descriptor: RuntimeUnitDescriptor; entrypoint: string }
    port: RuntimeProcessTreePort
    events: string[]
    pids: number[]
    control: Control
    owner(mode?: string, marker?: string): RuntimeBuildProcessOwner
    allowUnknown(owner: RuntimeBuildProcessOwner): void
  }) => Promise<void>,
): Promise<void> {
  const parent = await realpath(join(process.cwd(), 'artifacts'))
  const root = await mkdtemp(join(parent, 'runtime-process-builder-'))
  const owned = await realpath(root)
  const source = join(root, 'unit.ts')
  await writeFile(source, 'export const revision = 1\n')
  const store = new RuntimeArtifactStore(join(root, 'bundles'), process.cwd())
  const descriptor: RuntimeUnitDescriptor = {
    id: 'fixture',
    kind: 'plugin',
    isolation: 'process',
    required: true,
    reloadable: true,
    contractFingerprint: 'a'.repeat(64),
    storageSchema: 24,
    dependencies: [],
  }
  const events: string[] = [],
    pids: number[] = []
  const retained: { tree: RuntimeProcessTree; active(): number; closed: boolean }[] = []
  const owners: RuntimeBuildProcessOwner[] = [],
    expectedUnknown = new Set<RuntimeBuildProcessOwner>()
  const control: Control = {
    fault: 'none',
    omitActive: false,
    rejectAttach: false,
    joinCalls: 0,
    attached: Promise.withResolvers<number>(),
    joining: Promise.withResolvers<void>(),
  }
  const native = createRuntimeProcessTreePort()
  const port: RuntimeProcessTreePort = {
    environment: native.environment,
    async attach(pid, signal) {
      pids.push(pid)
      const tree = await native.attach(pid, signal)
      const active = tree.active?.bind(tree)
      if (!active) throw new Error('This real Windows fixture requires native active counts')
      const record = { tree, active, closed: false }
      retained.push(record)
      events.push('attached')
      control.attached.resolve(pid)
      if (control.attachGate) await control.attachGate
      if (control.rejectAttach) throw new HbarError('RUNTIME_PROCESS_TREE_UNCONFIRMED', 'Owned attachment failure')
      return {
        ...(control.omitActive
          ? {}
          : {
              active() {
                if (control.fault === 'active')
                  throw new HbarError('RUNTIME_PROCESS_TREE_UNCONFIRMED', 'Owned active-count failure')
                if (control.fault === 'positive') return 1
                if (control.fault === 'invalid') return -1
                return active()
              },
            }),
        terminate: () => tree.terminate(),
        async join(timeout) {
          control.joinCalls++
          control.joining.resolve()
          if (control.joinGate) await control.joinGate
          await tree.join(timeout)
          events.push('joined')
          if (control.fault === 'join') throw new HbarError('RUNTIME_BUILD_EXIT_TIMEOUT', 'Owned unknown join')
        },
        close() {
          if (control.fault === 'close') throw new HbarError('RUNTIME_BUILD_EXIT_TIMEOUT', 'Owned unknown close')
          tree.close()
          record.closed = true
          events.push('closed')
        },
      }
    },
  }
  let primary: { error: unknown } | undefined
  try {
    await body({
      root,
      store,
      unit: { descriptor, entrypoint: source },
      port,
      events,
      pids,
      control,
      owner(mode = 'build', marker) {
        const owner = new RuntimeBuildProcessOwner({ processTree: port, command: command(mode, marker) })
        owners.push(owner)
        return owner
      },
      allowUnknown(owner) {
        expectedUnknown.add(owner)
      },
    })
  } catch (error) {
    primary = { error }
  }
  const cleanup: unknown[] = []
  control.fault = 'none'
  for (const owner of owners) {
    try {
      await owner.close()
    } catch (error) {
      if (!expectedUnknown.has(owner)) cleanup.push(error)
    }
  }
  // Deliberately missing/rejected public handles remain UNKNOWN in the tested owner.
  // The fixture separately retains the exact real native handle and proves external cleanup.
  for (const record of retained)
    if (!record.closed) {
      try {
        record.tree.terminate()
        await record.tree.join(5_000)
        if (record.active() !== 0) throw new Error('Owned child still active')
        record.tree.close()
        record.closed = true
      } catch (error) {
        cleanup.push(error)
      }
    }
  if (primary || cleanup.length) {
    console.error('RUNTIME_PROCESS_BUILDER_FAILURE_ROOT=' + owned)
    throw new AggregateError(primary ? [primary.error, ...cleanup] : cleanup, 'Owned builder test failed')
  }
  const current = await realpath(root)
  if (
    current !== owned ||
    resolve(root) !== current ||
    dirname(current) !== parent ||
    !basename(current).startsWith('runtime-process-builder-')
  )
    throw new Error('Owned cleanup identity mismatch')
  await rm(current, { recursive: true, force: true })
}
async function dispatchMarker(
  root: string,
  path: string,
  body: (ready: Promise<void>) => Promise<void>,
): Promise<void> {
  const entered = Promise.withResolvers<void>()
  const watcher = watch(root, (_event, name) => {
    if (name?.toString() === basename(path)) entered.resolve()
  })
  const timer = setTimeout(() => entered.reject(new Error('Owned dispatch readiness deadline')), 5_000)
  try {
    await body(entered.promise)
  } finally {
    clearTimeout(timer)
    watcher.close()
  }
}

testWindows(
  'managed process builds immutable bytes; real native close precedes original acceptance',
  async () => {
    await fixture(async ({ store, unit, owner, events, pids }) => {
      const buildOwner = owner(),
        accept = store.acceptBuild.bind(store)
      const accepted = spyOn(store, 'acceptBuild').mockImplementation(async (raw) => {
        events.push('accept')
        return await accept(raw)
      })
      try {
        const artifact = await buildOwner.build(store, unit, new AbortController().signal)
        expect((await store.get(artifact.id)).id).toBe(artifact.id)
        expect(await Bun.file(await store.modulePath(artifact.id)).text()).toContain('revision')
        expect(events).toEqual(['attached', 'joined', 'closed', 'accept'])
        expect(pids).toHaveLength(1)
        expect(pids[0]).toBeGreaterThan(0)
        expect(accepted).toHaveBeenCalledTimes(1)
        expect(buildOwner.snapshot().jobs).toHaveLength(0)
        expect(buildOwner.snapshot().receipts).toMatchObject([
          { exitCode: 0, nativeJoined: true, activeProcesses: 0, nativeClosed: true },
        ])
      } finally {
        accepted.mockRestore()
      }
    })
  },
  30_000,
)

testWindows(
  'process carries resources and owned module entrypoints through immutable registration',
  async () => {
    await fixture(async ({ root, store, unit, owner }) => {
      const resource = join(root, 'owned.txt'),
        worker = join(root, 'owned-worker.ts')
      await writeFile(resource, 'owned resource')
      await writeFile(worker, 'export const owned = true\n')
      const artifact = await owner().build(
        store,
        { ...unit, resources: [resource], workers: [worker] },
        new AbortController().signal,
      )
      expect(artifact.resourceFiles).toHaveLength(1)
      expect(artifact.files.some((file) => file.name === 'owned-worker.js')).toBeTrue()
      expect((await store.get(artifact.id)).id).toBe(artifact.id)
    })
  },
  30_000,
)

for (const mode of ['malformed', 'overflow', 'load-failure', 'stderr-success'] as const)
  testWindows(
    'real child ' + mode + ' never reaches acceptance',
    async () => {
      await fixture(async ({ store, unit, owner }) => {
        const buildOwner = owner(mode),
          accepted = spyOn(store, 'acceptBuild')
        try {
          await expect(buildOwner.build(store, unit, new AbortController().signal)).rejects.toMatchObject({
            code:
              mode === 'load-failure' || mode === 'stderr-success' ? 'RUNTIME_BUILD_FAILED' : 'RUNTIME_BUILD_INVALID',
          })
          expect(accepted).not.toHaveBeenCalled()
          expect(buildOwner.snapshot().jobs).toHaveLength(0)
          expect(buildOwner.snapshot().receipts).toHaveLength(1)
        } finally {
          accepted.mockRestore()
        }
      })
    },
    30_000,
  )

testWindows(
  'syntax failure preserves the safe build code and the previously registered generation',
  async () => {
    await fixture(async ({ root, store, unit, owner }) => {
      const buildOwner = owner(),
        artifact = await buildOwner.build(store, unit, new AbortController().signal)
      const accepted = spyOn(store, 'acceptBuild')
      await writeFile(join(root, 'unit.ts'), 'export const broken = {\n')
      try {
        await expect(buildOwner.build(store, unit, new AbortController().signal)).rejects.toMatchObject({
          code: 'RUNTIME_BUILD_FAILED',
        })
        expect(accepted).not.toHaveBeenCalled()
        expect((await store.get(artifact.id)).id).toBe(artifact.id)
        expect(buildOwner.snapshot().jobs).toHaveLength(0)
      } finally {
        accepted.mockRestore()
      }
    })
  },
  30_000,
)

for (const fault of ['join', 'close', 'active', 'positive', 'invalid'] as const)
  testWindows(
    'unknown native ' + fault + ' stays owned; reconciliation never compiles or accepts again',
    async () => {
      await fixture(async ({ store, unit, owner, control, pids }) => {
        control.fault = fault
        const buildOwner = owner(),
          accepted = spyOn(store, 'acceptBuild')
        try {
          await expect(buildOwner.build(store, unit, new AbortController().signal)).rejects.toMatchObject({
            code: 'RUNTIME_BUILD_EXIT_TIMEOUT',
          })
          expect(buildOwner.snapshot().jobs).toMatchObject([{ phase: 'unknown', exitCode: 0, nativeClosed: false }])
          expect(buildOwner.snapshot().receipts).toHaveLength(0)
          const identity = buildOwner.snapshot().jobs[0]?.jobId
          await expect(buildOwner.reconcile()).rejects.toMatchObject({ code: 'RUNTIME_BUILD_EXIT_TIMEOUT' })
          expect(buildOwner.snapshot().jobs[0]?.jobId).toBe(identity)
          control.fault = 'none'
          const settled = await buildOwner.reconcile()
          expect(settled.jobs).toHaveLength(0)
          expect(settled.receipts).toHaveLength(1)
          expect(settled.receipts[0]?.jobId).toBe(identity)
          expect(pids).toHaveLength(1)
          expect(accepted).not.toHaveBeenCalled()
        } finally {
          control.fault = 'none'
          accepted.mockRestore()
        }
      })
    },
    30_000,
  )

testWindows(
  'missing optional active capability remains UNKNOWN through close and rejects new work',
  async () => {
    await fixture(async ({ store, unit, owner, control, pids, allowUnknown }) => {
      control.omitActive = true
      const buildOwner = owner(),
        accepted = spyOn(store, 'acceptBuild')
      allowUnknown(buildOwner)
      try {
        await expect(buildOwner.build(store, unit, new AbortController().signal)).rejects.toMatchObject({
          code: 'RUNTIME_BUILD_EXIT_TIMEOUT',
        })
        const before = buildOwner.snapshot()
        expect(before.jobs).toMatchObject([{ phase: 'unknown', activeProcesses: null, nativeClosed: false }])
        await expect(buildOwner.close()).rejects.toMatchObject({ code: 'RUNTIME_BUILD_EXIT_TIMEOUT' })
        expect(buildOwner.snapshot().jobs[0]?.jobId).toBe(before.jobs[0]?.jobId)
        await expect(buildOwner.build(store, unit, new AbortController().signal)).rejects.toMatchObject({
          code: 'RUNTIME_CANCELLED',
        })
        expect(pids).toHaveLength(1)
        expect(accepted).not.toHaveBeenCalled()
        expect(buildOwner.snapshot().receipts).toHaveLength(0)
      } finally {
        accepted.mockRestore()
      }
    })
  },
  30_000,
)

testWindows(
  'rejected attach cannot substitute direct child exit for exact native authority',
  async () => {
    await fixture(async ({ store, unit, owner, control, pids, allowUnknown }) => {
      control.rejectAttach = true
      const buildOwner = owner(),
        accepted = spyOn(store, 'acceptBuild')
      allowUnknown(buildOwner)
      try {
        await expect(buildOwner.build(store, unit, new AbortController().signal)).rejects.toMatchObject({
          code: 'RUNTIME_PROCESS_TREE_UNCONFIRMED',
        })
        expect(buildOwner.snapshot().jobs).toMatchObject([
          { phase: 'unknown', attachSettled: true, activeProcesses: null, nativeJoined: false },
        ])
        await expect(buildOwner.reconcile()).rejects.toMatchObject({ code: 'RUNTIME_BUILD_EXIT_TIMEOUT' })
        expect(pids).toHaveLength(1)
        expect(accepted).not.toHaveBeenCalled()
        expect(buildOwner.snapshot().receipts).toHaveLength(0)
      } finally {
        accepted.mockRestore()
      }
    })
  },
  30_000,
)

testWindows(
  'abort while attach is pending retains the late exact handle until physical reconciliation',
  async () => {
    await fixture(async ({ store, unit, owner, control, pids }) => {
      const gate = Promise.withResolvers<void>(),
        controller = new AbortController()
      control.attachGate = gate.promise
      const buildOwner = owner(),
        accepted = spyOn(store, 'acceptBuild')
      const result = buildOwner.build(store, unit, controller.signal).catch((error: unknown) => error)
      try {
        await control.attached.promise
        controller.abort()
        expect(await result).toMatchObject({ code: 'RUNTIME_CANCELLED' })
        expect(buildOwner.snapshot().jobs).toMatchObject([
          { phase: 'unknown', attachSettled: false, nativeClosed: false },
        ])
        expect(buildOwner.snapshot().receipts).toHaveLength(0)
        gate.resolve()
        expect((await buildOwner.reconcile()).jobs).toHaveLength(0)
        expect(buildOwner.snapshot().receipts).toHaveLength(1)
        expect(pids).toHaveLength(1)
        expect(accepted).not.toHaveBeenCalled()
      } finally {
        gate.resolve()
        controller.abort()
        await result
        accepted.mockRestore()
      }
    })
  },
  30_000,
)

testWindows(
  'an adapter ignoring join timeout remains owned and concurrent cleanup shares its pending join',
  async () => {
    await fixture(async ({ store, unit, owner, control, pids }) => {
      const gate = Promise.withResolvers<void>()
      control.joinGate = gate.promise
      const buildOwner = owner(),
        accepted = spyOn(store, 'acceptBuild')
      try {
        await expect(buildOwner.build(store, unit, new AbortController().signal)).rejects.toMatchObject({
          code: 'RUNTIME_BUILD_EXIT_TIMEOUT',
        })
        expect(buildOwner.snapshot().jobs).toMatchObject([
          { phase: 'unknown', nativeJoined: false, nativeClosed: false },
        ])
        expect(control.joinCalls).toBe(1)
        const first = buildOwner.reconcile(),
          second = buildOwner.reconcile()
        gate.resolve()
        const settled = await Promise.all([first, second])
        expect(settled.every((value) => value.jobs.length === 0)).toBeTrue()
        expect(control.joinCalls).toBe(1)
        expect(buildOwner.snapshot().receipts).toHaveLength(1)
        expect(pids).toHaveLength(1)
        expect(accepted).not.toHaveBeenCalled()
      } finally {
        gate.resolve()
        accepted.mockRestore()
      }
    })
  },
  30_000,
)

testWindows(
  'two actual children share one owner; aborting dispatched A leaves immutable B successful',
  async () => {
    await fixture(async ({ root, store, unit, owner, pids }) => {
      const marker = join(root, 'entered'),
        controller = new AbortController()
      const buildOwner = owner('neighbors', marker),
        accepted = spyOn(store, 'acceptBuild')
      await dispatchMarker(root, marker, async (ready) => {
        const a = buildOwner
          .build(store, { ...unit, descriptor: { ...unit.descriptor, id: 'cancelled' } }, controller.signal)
          .catch((error: unknown) => error)
        const b = buildOwner.build(
          store,
          { ...unit, descriptor: { ...unit.descriptor, id: 'neighbor' } },
          new AbortController().signal,
        )
        try {
          await ready
          expect(await Bun.file(marker).text()).toBe('dispatched')
          controller.abort()
          expect(await a).toMatchObject({ code: 'RUNTIME_CANCELLED' })
          const artifact = await b
          expect(artifact.unitId).toBe('neighbor')
          expect((await store.get(artifact.id)).id).toBe(artifact.id)
          expect(accepted).toHaveBeenCalledTimes(1)
          expect(pids).toHaveLength(2)
          expect(pids[0]).not.toBe(pids[1])
          expect(buildOwner.snapshot().jobs).toHaveLength(0)
          expect(buildOwner.snapshot().receipts).toHaveLength(2)
        } finally {
          controller.abort()
          await Promise.allSettled([a, b])
          accepted.mockRestore()
        }
      })
    })
  },
  30_000,
)

testWindows(
  'close aborts an actually dispatched child, drains ownership and prohibits any later spawn',
  async () => {
    await fixture(async ({ root, store, unit, owner, pids }) => {
      const marker = join(root, 'entered'),
        buildOwner = owner('abort-after-dispatch', marker)
      const accepted = spyOn(store, 'acceptBuild')
      await dispatchMarker(root, marker, async (ready) => {
        const result = buildOwner.build(store, unit, new AbortController().signal).catch((error: unknown) => error)
        try {
          await ready
          expect((await buildOwner.close()).jobs).toHaveLength(0)
          expect(await result).toMatchObject({ code: 'RUNTIME_CANCELLED' })
          await expect(buildOwner.build(store, unit, new AbortController().signal)).rejects.toMatchObject({
            code: 'RUNTIME_CANCELLED',
          })
          expect(buildOwner.snapshot().receipts).toHaveLength(1)
          expect(pids).toHaveLength(1)
          expect(accepted).not.toHaveBeenCalled()
        } finally {
          await buildOwner.close()
          await result
          accepted.mockRestore()
        }
      })
    })
  },
  30_000,
)

testWindows(
  'two UNKNOWN responsibilities exhaust capacity before another child can be spawned',
  async () => {
    await fixture(async ({ store, unit, owner, control, pids, allowUnknown }) => {
      control.omitActive = true
      const buildOwner = owner(),
        accepted = spyOn(store, 'acceptBuild')
      allowUnknown(buildOwner)
      try {
        const results = await Promise.allSettled([
          buildOwner.build(store, unit, new AbortController().signal),
          buildOwner.build(store, unit, new AbortController().signal),
        ])
        expect(results.every((value) => value.status === 'rejected')).toBeTrue()
        expect(buildOwner.snapshot().jobs).toHaveLength(2)
        await expect(buildOwner.build(store, unit, new AbortController().signal)).rejects.toMatchObject({
          code: 'RUNTIME_BUILD_LIMIT',
        })
        expect(pids).toHaveLength(2)
        expect(accepted).not.toHaveBeenCalled()
      } finally {
        accepted.mockRestore()
      }
    })
  },
  30_000,
)

testWindows(
  'syntax error remains primary when physical close also fails; cleanup preserves both causes',
  async () => {
    await fixture(async ({ root, store, unit, owner, control, pids }) => {
      control.fault = 'close'
      await writeFile(join(root, 'unit.ts'), 'export const broken = {\n')
      const buildOwner = owner(),
        accepted = spyOn(store, 'acceptBuild')
      try {
        const failure: unknown = await buildOwner
          .build(store, unit, new AbortController().signal)
          .catch((error: unknown) => error)
        expect(failure).toMatchObject({ code: 'RUNTIME_BUILD_FAILED' })
        if (!(failure instanceof Error) || !(failure.cause instanceof AggregateError))
          throw new Error('Primary and cleanup causes required')
        expect(failure.cause.errors).toHaveLength(2)
        control.fault = 'none'
        expect((await buildOwner.reconcile()).jobs).toHaveLength(0)
        expect(pids).toHaveLength(1)
        expect(accepted).not.toHaveBeenCalled()
      } finally {
        control.fault = 'none'
        accepted.mockRestore()
      }
    })
  },
  30_000,
)

testWindows(
  'parent rejects immutable bytes changed after real native exit before acceptance',
  async () => {
    await fixture(async ({ store, unit, owner }) => {
      const buildOwner = owner(),
        accept = store.acceptBuild.bind(store)
      const accepted = spyOn(store, 'acceptBuild').mockImplementation(async (raw) => {
        const metadata = z
          .object({ id: z.string().regex(/^[a-f0-9]{64}$/), entry: z.string().regex(/^[A-Za-z0-9_.-]+$/) })
          .parse(raw)
        await writeFile(join(store.root, metadata.id, metadata.entry), 'tampered')
        return await accept(raw)
      })
      try {
        await expect(buildOwner.build(store, unit, new AbortController().signal)).rejects.toMatchObject({
          code: 'RUNTIME_ARTIFACT_CHANGED',
        })
        expect(buildOwner.snapshot().jobs).toHaveLength(0)
        expect(buildOwner.snapshot().receipts).toHaveLength(1)
      } finally {
        accepted.mockRestore()
      }
    })
  },
  30_000,
)

testWindows(
  'pre-abort, invalid input and pure snapshots do not spawn or accept a compiler',
  async () => {
    await fixture(async ({ store, unit, owner, pids }) => {
      const buildOwner = owner(),
        accepted = spyOn(store, 'acceptBuild'),
        controller = new AbortController()
      const reason = new Error('Owned pre-abort')
      controller.abort(reason)
      try {
        await expect(buildOwner.build(store, unit, controller.signal)).rejects.toBe(reason)
        await expect(
          buildOwner.build(
            store,
            { ...unit, resources: Array.from({ length: 256 }, () => 'x'.repeat(1_000)) },
            new AbortController().signal,
          ),
        ).rejects.toMatchObject({ code: 'RUNTIME_BUILD_INVALID' })
        expect(buildOwner.snapshot()).toEqual({ closed: false, jobs: [], receipts: [] })
        expect(buildOwner.snapshot()).toEqual({ closed: false, jobs: [], receipts: [] })
        expect(pids).toHaveLength(0)
        expect(accepted).not.toHaveBeenCalled()
      } finally {
        accepted.mockRestore()
      }
    })
  },
  30_000,
)
