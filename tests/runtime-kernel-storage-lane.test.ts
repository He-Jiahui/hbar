import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import type { DiagnosticEvent } from '@hbar/contracts'
import { RUNTIME_KERNEL_CONTROL_METHODS } from '@hbar/kernel/runtime-port'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { GoalService, PlanService, WorkflowService } from '@hbar/plugin-sdk'
import { IpcPeer, RuntimeValuePort, procedure } from '@hbar/runtime'
import { Storage, createPathLayout, ensurePathLayout, storageRpcCallSchema } from '@hbar/storage'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'

async function until(check: () => boolean | Promise<boolean>, timeoutMs = 5_000, pollIntervalMs = 5): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error('Storage lane fixture progress deadline exceeded')
    await Bun.sleep(pollIntervalMs)
  }
}

async function removeFixture(root: string): Promise<void> {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-storage-lane-'))
    throw new Error('Unsafe Storage lane fixture cleanup path')
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

function reportFailure(failed: boolean, primary: unknown, cleanup: unknown[]): void {
  if (failed) {
    if (cleanup.length)
      throw new AggregateError([primary, ...cleanup], 'Storage lane and cleanup failed', { cause: primary })
    throw primary
  }
  if (cleanup.length) throw new AggregateError(cleanup, 'Storage lane cleanup failed')
}

for (const legacy of [true, false]) {
  test(
    legacy
      ? 'legacy normal Storage forms a bounded reentrant wait and cancellation drains it'
      : 'Kernel Storage lane completes thirty nested callbacks while twenty-four outer invokes own normal slots',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'hbar-storage-lane-'))
      let storage: Storage | undefined
      let kernel: IpcPeer | undefined
      let host: IpcPeer | undefined
      let caller: RuntimeValuePort | undefined
      let receiver: RuntimeValuePort | undefined
      let failed = false
      let primary: unknown
      const cleanup: unknown[] = []
      const abort = new AbortController()
      let release: (() => void) | undefined
      const gate = new Promise<void>((resolveGate) => {
        release = resolveGate
      })
      const outcomes: Array<Promise<{ ok: boolean; value: unknown }>> = []
      let arrived = 0
      let dispatched = 0
      let peak = 0
      try {
        storage = new Storage(join(root, 'state.sqlite'))
        await storage.call('ready')
        const actualStorage = storage
        const workspace = await storage.call('createWorkspace', root, 'Storage lane')
        const session = await storage.call('createSession', workspace.id)
        const methods = [
          ...RUNTIME_KERNEL_CONTROL_METHODS.filter((method) => !legacy || method !== 'kernel.storage'),
          'kernel.plugins.callback',
          'kernel.plugins.control',
        ]
        const options = { inFlight: 32, queued: 128, reservedControl: 8, controlMethods: methods }
        const kernelOwner = { unitId: 'kernel', generation: 1, incarnation: crypto.randomUUID() }
        const hostOwner = { unitId: 'base', generation: 1, incarnation: crypto.randomUUID() }
        const sendToHost = (frame: Parameters<IpcPeer['receive']>[0]): void => {
          if (!host) throw new Error('Missing Host peer')
          peak = Math.max(peak, kernel?.snapshot().inFlight ?? 0)
          host.receive(frame)
        }
        const sendToKernel = (frame: Parameters<IpcPeer['receive']>[0]): void => {
          if (!kernel) throw new Error('Missing Kernel peer')
          kernel.receive(frame)
        }
        kernel = new IpcPeer({ ...options, owner: kernelOwner, remote: hostOwner, transport: { send: sendToHost } })
        host = new IpcPeer({ ...options, owner: hostOwner, remote: kernelOwner, transport: { send: sendToKernel } })
        const kernelPeer = kernel
        caller = new RuntimeValuePort(kernel, { prefix: 'kernel.plugins' })
        receiver = new RuntimeValuePort(host, { prefix: 'kernel.plugins' })
        host.register(
          'kernel.storage',
          procedure(storageRpcCallSchema, z.unknown(), async (input) => {
            dispatched++
            return actualStorage.executeRpc(input)
          }),
        )
        receiver.register('invoke', async ([callback]) => {
          arrived++
          await gate
          if (typeof callback !== 'function') throw new Error('Missing real application callback')
          const value: unknown = await Reflect.apply(callback, undefined, [])
          return value
        })
        // RuntimeValuePort serializes the callback and sends it back over the same peer.
        // Its nested leaf read is a real Storage Worker request, not a paired Promise stand-in.
        for (let index = 0; index < 30; index++) {
          const operation = caller.call(
            'invoke',
            [
              async () =>
                kernelPeer.call('kernel.storage', { method: 'session', args: [session.id] }, z.unknown(), {
                  signal: abort.signal,
                }),
            ],
            { signal: abort.signal },
          )
          outcomes.push(
            operation.then(
              (value: unknown) => ({ ok: true, value }),
              (value: unknown) => ({ ok: false, value }),
            ),
          )
        }
        await until(() => arrived === 24)
        expect(kernel.snapshot()).toMatchObject({ inFlight: 24, queued: 6 })
        release?.()
        if (legacy) {
          await until(() => kernelPeer.snapshot().queued === 30)
          expect(dispatched).toBe(0)
          expect(arrived).toBe(24)
          abort.abort()
          const results = await Promise.all(outcomes)
          expect(results.every((result) => !result.ok)).toBe(true)
        } else {
          await until(() => dispatched === 30)
          const results = await Promise.all(outcomes)
          expect(results.every((result) => result.ok)).toBe(true)
          for (const result of results) expect(result.value).toMatchObject({ id: session.id })
          expect(arrived).toBe(30)
          expect(peak).toBeGreaterThan(24)
          expect(peak).toBeLessThanOrEqual(32)
        }
        await until(() => kernelPeer.snapshot().inFlight === 0 && kernelPeer.snapshot().queued === 0)
        expect(kernel.snapshot()).toMatchObject({ inFlight: 0, queued: 0 })
      } catch (error) {
        failed = true
        primary = error
      }
      abort.abort()
      release?.()
      try {
        await Promise.all(outcomes)
      } catch (error) {
        cleanup.push(error)
      }
      try {
        caller?.dispose()
      } catch (error) {
        cleanup.push(error)
      }
      try {
        receiver?.dispose()
      } catch (error) {
        cleanup.push(error)
      }
      try {
        kernel?.close()
      } catch (error) {
        cleanup.push(error)
      }
      try {
        host?.close()
      } catch (error) {
        cleanup.push(error)
      }
      try {
        await storage?.close()
      } catch (error) {
        cleanup.push(error)
      }
      try {
        await removeFixture(root)
      } catch (error) {
        cleanup.push(error)
      }
      reportFailure(failed, primary, cleanup)
    },
    20_000,
  )
}

test('real managed Host completes thirty local workflow_execute read_file runs through the shared callback chain', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-storage-lane-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  let storage: Storage | undefined
  let seed: Kernel | undefined
  let runtime: ProcessHostRuntime | undefined
  let failed = false
  let primary: unknown
  const cleanup: unknown[] = []
  const runIds: string[] = []
  const sessionIds: string[] = []
  let terminalSample: Array<{ runId: string; status: string }> = []
  interface DiagnosticBucket {
    readonly first: DiagnosticEvent[]
    readonly recent: DiagnosticEvent[]
    readonly capacity: number
    seen: number
  }
  const bucket = (capacity: number): DiagnosticBucket => ({ first: [], recent: [], capacity, seen: 0 })
  const categories = {
    callback: bucket(4_000),
    storage: bucket(2_000),
    lifecycle: bucket(2_000),
    important: bucket(1_000),
  }
  const groups = new Map<string, { count: number; first: number; last: number; maxMs: number }>()
  let diagnosticCount = 0
  let overflowGroups = 0
  const retain = (target: DiagnosticBucket, event: DiagnosticEvent) => {
    if (target.first.length < target.capacity) target.first.push(event)
    target.recent[target.seen % target.capacity] = event
    target.seen++
  }
  const recordDiagnostic = (event: DiagnosticEvent) => {
    diagnosticCount++
    const key = [event.event, event.phase ?? '', event.method ?? '', event.errorCode ?? ''].join(':')
    const group = groups.get(key)
    if (group) {
      group.count++
      group.last = event.time
      group.maxMs = Math.max(group.maxMs, event.durationMs ?? 0)
    } else if (groups.size < 512)
      groups.set(key, { count: 1, first: event.time, last: event.time, maxMs: event.durationMs ?? 0 })
    else overflowGroups++
    const important = event.level === 'error' || event.level === 'fatal' || (event.durationMs ?? 0) >= 100
    if (important) retain(categories.important, event)
    const storageEvent = event.event.startsWith('storage.') || event.event.startsWith('sqlite.')
    // Routine observation reads are counted from the first event but cannot evict causal traces.
    if (storageEvent && event.method === 'run' && !important) return
    if (event.event === 'host.runtime_driver_callback') retain(categories.callback, event)
    else if (storageEvent) retain(categories.storage, event)
    else retain(categories.lifecycle, event)
  }
  try {
    await ensurePathLayout(layout)
    await writeFile(join(root, 'owned.txt'), 'local Storage lane fixture\n')
    storage = new Storage(layout.database, layout)
    await storage.call('ready')
    await storage.call('setPlugin', 'goal.codex', true, { autoContinue: false })
    await storage.call('setPlugin', 'budget.codex', true, { autoContinue: false })
    const stable = storage
    seed = await Kernel.create({
      layout,
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
      lifecycle: 'managed',
      profile: {
        createStorage: async () => ({ call: (method, ...args) => stable.call(method, ...args), close: async () => {} }),
      },
    })
    await seed.saveProvider({
      id: 'local-fixture',
      name: 'Local fixture',
      protocol: 'mock',
      baseUrl: 'http://127.0.0.1',
      model: 'fixture',
    })
    const workspace = await storage.call('createWorkspace', root, 'Managed Storage lane')
    const goals = seed.plugins.get<GoalService>('goal')
    const plans = seed.plugins.get<PlanService>('plan')
    const workflows = seed.plugins.get<WorkflowService>('workflow')
    for (let index = 0; index < 30; index++) {
      const session = await storage.call('createSession', workspace.id)
      sessionIds.push(session.id)
      await goals.create(session.id, 'Read the local fixture once')
      const plan = await plans.update(session.id, [{ step: 'Read owned fixture', status: 'in_progress' }], null)
      await workflows.focus(
        session.id,
        0,
        {
          id: 'read-fixture',
          title: 'Read owned fixture',
          scope: { readPaths: ['owned.txt'], writePaths: [], tools: ['read_file'] },
          acceptanceChecks: [],
        },
        'agent',
        plan.revision,
      )
      const run = await storage.call(
        'enqueue',
        session.id,
        crypto.randomUUID(),
        {
          text:
            '/tool workflow_execute ' +
            JSON.stringify({ calls: [{ name: 'read_file', arguments: { path: 'owned.txt' } }] }),
          images: [],
        },
        'local-fixture',
      )
      runIds.push(run.id)
    }
    await seed.close()
    seed = undefined
    await storage.close()
    storage = undefined
    runtime = await ProcessHostRuntime.create({
      layout,
      sourceRoot: process.cwd(),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
      diagnosticFullCoverage: true,
      diagnostics: { emit: recordDiagnostic },
    })
    const managed = runtime
    await until(
      async () => {
        const runs = await Promise.all(runIds.map((id) => managed.storage.call('run', id)))
        terminalSample = runs.map((run) => ({ runId: run.id, status: run.status }))
        return runs.every((run) => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status))
      },
      30_000,
      250,
    )
    // Terminal state is committed before run.end hooks and physical lease release.
    // Use the existing idle barrier before asserting those later lifecycle facts.
    await managed.waitForIdle(20_000)
    for (let index = 0; index < runIds.length; index++) {
      const runId = runIds[index]
      const sessionId = sessionIds[index]
      if (!runId || !sessionId) throw new Error('Missing fixture identity')
      expect((await managed.storage.call('run', runId)).status).toBe('completed')
      expect((await managed.storage.call('runtimeExecutionRead', runId))?.state).toBe('released')
      const events = await managed.storage.call('events', sessionId, 0, 1_000)
      const nested = events
        .filter((event) => event.type === 'tool.sequence_result')
        .flatMap((event) => {
          const parsed = z
            .object({
              content: z.array(z.object({ type: z.literal('tool_result'), name: z.string(), isError: z.boolean() })),
            })
            .safeParse(event.data)
          return parsed.success ? parsed.data.content : []
        })
      expect(nested.filter((entry) => entry.name === 'read_file')).toEqual([
        { type: 'tool_result', name: 'read_file', isError: false },
      ])
    }
    expect(managed.coordinator.snapshot()).toMatchObject({ sessions: 0, physicalTools: 0, resources: 0 })
    expect(managed.snapshot().ready).toBe(true)
  } catch (error) {
    failed = true
    primary = error
  }
  if (failed) {
    try {
      const records = Object.entries(categories).map(([category, value]) => ({
        category,
        seen: value.seen,
        first: value.first,
        recent:
          value.seen > value.capacity
            ? [
                ...value.recent.slice(value.seen % value.capacity),
                ...value.recent.slice(0, value.seen % value.capacity),
              ]
            : value.recent,
      }))
      const directory = join(
        process.cwd(),
        'artifacts',
        'sqlite-partition-20261016',
        'driver-callback-starvation-review',
      )
      await mkdir(directory, { recursive: true })
      await writeFile(
        join(directory, 'managed-storage-lane-failure-' + crypto.randomUUID() + '.json'),
        JSON.stringify(
          {
            schema: 'hbar.storage-lane-test-metadata.v2',
            diagnosticCount,
            overflowGroups,
            terminalSample,
            transportAtFailure: runtime?.transportDiagnostics(),
            coordinatorAtFailure: runtime?.coordinator.snapshot(),
            groups: [...groups].map(([key, value]) => ({ key, ...value })),
            categories: records,
          },
          null,
          2,
        ),
      )
    } catch (error) {
      cleanup.push(error)
    }
  }
  for (const runId of runIds) {
    try {
      if (runtime && ['queued', 'running'].includes((await runtime.storage.call('run', runId)).status))
        await runtime.kernel.cancel(runId)
    } catch (error) {
      cleanup.push(error)
    }
  }
  try {
    await runtime?.waitForIdle(20_000)
  } catch (error) {
    cleanup.push(error)
  }
  try {
    await runtime?.close()
  } catch (error) {
    cleanup.push(error)
  }
  try {
    await seed?.close()
  } catch (error) {
    cleanup.push(error)
  }
  try {
    await storage?.close()
  } catch (error) {
    cleanup.push(error)
  }
  try {
    await removeFixture(root)
  } catch (error) {
    cleanup.push(error)
  }
  reportFailure(failed, primary, cleanup)
}, 120_000)
