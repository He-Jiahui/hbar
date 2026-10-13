import { afterEach, expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { mkdir, realpath, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { freemem } from 'node:os'
import { z } from 'zod'
import type { DiagnosticEvent, WireNotification } from '@hbar/contracts'
import { RUNTIME_LIMITS } from '@hbar/contracts/runtime'
import { createUsageFact } from '@hbar/usage'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import {
  Storage,
  StableStoragePort,
  callStorageRpc,
  createPathLayout,
  type ManagedStorageWriter,
  type StorageMethods,
} from '@hbar/storage'
import {
  definePlugin,
  provide,
  type DriverInput,
  type GoalService,
  type HarnessDriver,
  type PlanService,
} from '@hbar/plugin-sdk'
import type { RuntimeOwner } from '@hbar/contracts/runtime'

const TEST_TIMEOUT_MS = 180_000
const WAVE_TIMEOUT_MS = 35_000
const FIXTURE_PREFIX = 'hbar-sqlite-agent-pressure-'
const SEED = 0x51a7c0de
const WAVE_SIZES = [30, 40, 50] as const
const SUBMISSION_BATCH_SIZE = 8
const USAGE = { input: 8, output: 3, cacheRead: 0, cacheWrite: 0, cost: 0 }

type PressureSpec = {
  readonly wave: string
  readonly index: number
  readonly seed: number
  readonly extraActions: number
}

type DriverBarrier = {
  readonly entered: number
  readonly active: number
  readonly peak: number
  readonly release: () => void
  readonly waitForTarget: (signal: AbortSignal) => Promise<void>
  readonly waitUntilEntered: (target: number, deadline: number) => Promise<void>
}

type WorkerMetrics = {
  readonly events: DiagnosticEvent[]
  readonly storageOutstanding: Set<number>
  readonly workerExecuting: Set<number>
  readonly managedCalls: Map<number, string>
  nextManagedCallId: number
  storageOutstandingPeak: number
  workerExecutingPeak: number
}

type WaveReport = {
  readonly name: string
  readonly requestedAgents: number
  acceptedRuns: number
  duplicateReceipts: number
  fullAccessRuns: number
  cancelledRunId?: string
  sameSessionSuccessorId?: string
  sameSessionSuccessorStatus?: string
  cancelledActorGoalStatus?: string
  cancelledActorGoalTokens?: number
  enteredBeforeRelease: number
  kernelActiveAtRelease: number
  driverPeak: number
  stableInFlightPeak: number
  stableQueuedPeak: number
  stableBufferedBytesPeak: number
  storageRpcOutstandingPeak: number
  sqliteWorkerExecutingPeak: number
  streamUpdateCount: number
  freeMemoryStartBytes: number
  rssStartBytes: number
  runLatencyMs: number[]
  snapshotLatencyMs: number[]
  statuses: Record<string, number>
  failures: string[]
  durationMs: number
}

type PressureReport = {
  readonly attemptId: string
  readonly seed: number
  readonly generatedAt: string
  readonly fixtureKind: 'deterministic synthetic HarnessDriver; no model API; Goal autoContinue disabled'
  readonly storagePath: 'Kernel -> StableStoragePort (64 active / 256 queued / 64 MiB) -> real SQLite Storage Worker'
  readonly accessContract: {
    readonly approval: 'allow'
    readonly permissionAtAdmission: 'allow'
    readonly sandboxSnapshot: 'none'
    readonly osConfinement: 'none'
    readonly boundary: 'built-in file tools remain restricted to the owned workspace; no shell probe in this SQLite fixture'
  }
  sqlite: Record<string, unknown>
  limits: Record<string, number>
  waves: WaveReport[]
  history: Record<string, unknown>
  cleanup: Record<string, unknown>
  failure?: { readonly phase: string; readonly errorType: string; readonly errorMessage: string }
}

type Fixture = {
  readonly root: string
  readonly workRoot: string
  readonly layout: ReturnType<typeof createPathLayout>
  readonly kernel: Kernel
  readonly stable: StableStoragePort
  readonly physical: Storage
  readonly metrics: WorkerMetrics
  readonly workerOwner: RuntimeOwner
  readonly workerExitSettled: () => boolean
  readonly setBarrier: (barrier: DriverBarrier | undefined) => void
  readonly resetDriverMetrics: () => void
  readonly driverPeak: () => number
  readonly driverEntered: () => number
  readonly driverActive: () => number
  readonly driverResults: Map<
    string,
    { readonly toolNames: readonly string[]; readonly fileContents: string[]; readonly usageTokens: number }
  >
  readonly wireEvents: WireNotification[]
  readonly hotspotValues: Set<string>
  readonly specs: Map<string, PressureSpec>
  readonly disposeTools: () => Promise<void>
  readonly unsubscribe: () => void
}

const activeFixtures: Fixture[] = []

function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 0x1_0000_0000
  }
}

function createBarrier(): DriverBarrier {
  let entered = 0
  let active = 0
  let peak = 0
  let released = false
  let releaseGate = (): void => {}
  const gate = new Promise<void>((resolve) => {
    releaseGate = resolve
  })
  const barrier: DriverBarrier = {
    get entered() {
      return entered
    },
    get active() {
      return active
    },
    get peak() {
      return peak
    },
    release() {
      if (released) return
      released = true
      releaseGate()
    },
    async waitForTarget(signal) {
      signal.throwIfAborted()
      entered += 1
      active += 1
      peak = Math.max(peak, active)
      let rejectAbort: (reason: unknown) => void = () => {}
      const aborted = new Promise<never>((_, reject) => {
        rejectAbort = reject
      })
      const abort = () => rejectAbort(signal.reason)
      signal.addEventListener('abort', abort, { once: true })
      try {
        await Promise.race([gate, aborted])
        signal.throwIfAborted()
      } finally {
        signal.removeEventListener('abort', abort)
        active -= 1
      }
    },
    async waitUntilEntered(count, deadline) {
      while (entered < count && performance.now() < deadline) await Bun.sleep(2)
      if (entered < count) throw new Error(`DRIVER_BARRIER_SHORTFALL:${entered}/${count}`)
    },
  }
  return barrier
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0
  const ordered = [...values].sort((left, right) => left - right)
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)] ?? 0
}

async function bounded<T>(promise: Promise<T>, milliseconds: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}_TIMEOUT_${milliseconds}MS`)), milliseconds)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function onStorageEvent(metrics: WorkerMetrics, event: DiagnosticEvent): void {
  metrics.events.push(event)
  const id = event.storageRequestId
  if (typeof id !== 'number') return
  if (event.component === 'storage' && event.event === 'storage.request_dispatched') {
    metrics.storageOutstanding.add(id)
    metrics.storageOutstandingPeak = Math.max(
      metrics.storageOutstandingPeak,
      event.pending ?? metrics.storageOutstanding.size,
    )
  }
  if (event.component === 'storage' && ['storage.request_completed', 'storage.request_failed'].includes(event.event))
    metrics.storageOutstanding.delete(id)
  if (event.component === 'sqlite' && event.event === 'sqlite.request_started') {
    metrics.workerExecuting.add(id)
    metrics.workerExecutingPeak = Math.max(metrics.workerExecutingPeak, metrics.workerExecuting.size)
  }
  if (event.component === 'sqlite' && ['sqlite.request_completed', 'sqlite.request_failed'].includes(event.event))
    metrics.workerExecuting.delete(id)
}

function createDriverPlugin(
  getBarrier: () => DriverBarrier | undefined,
  specs: Map<string, PressureSpec>,
  metrics: {
    active: number
    peak: number
    entered: number
    readonly results: Map<
      string,
      { readonly toolNames: readonly string[]; readonly fileContents: string[]; readonly usageTokens: number }
    >
  },
): ReturnType<typeof definePlugin> {
  return definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Deterministic SQLite pressure driver',
      description: 'Seeded local fixture that exercises public Kernel tool and event paths.',
      permissions: [],
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      provides: { driver: '1.0.0' },
    },
    apply(ctx) {
      provide<HarnessDriver>(ctx, 'driver', {
        async run(input: DriverInput) {
          const spec = specs.get(input.session.id)
          if (!spec) throw new Error('PRESSURE_SPEC_MISSING')
          metrics.entered += 1
          metrics.active += 1
          metrics.peak = Math.max(metrics.peak, metrics.active)
          const random = seeded(spec.seed)
          const streamId = `${input.run.id}-pressure-stream`
          const stepId = `${input.run.id}-pressure-step`
          const toolNames: string[] = []
          const fileContents: string[] = []
          const callTool = async (name: string, args: Record<string, unknown>, ordinal: number) => {
            input.signal.throwIfAborted()
            const callId = `${input.run.id}-call-${ordinal}`
            await input.commit('assistant', [{ type: 'tool_call', callId, name, args }])
            const result = await input.execute(name, args, callId)
            await input.commit('tool', [
              {
                type: 'tool_result',
                callId,
                name,
                text: result.text,
                isError: Boolean(result.isError),
                ...(result.details === undefined ? {} : { details: result.details }),
              },
            ])
            if (result.isError) throw new Error(`TOOL_FAILED:${name}`)
            toolNames.push(name)
            if ((name === 'read_file' || name === 'pressure_file_read') && result.text) fileContents.push(result.text)
          }
          try {
            const barrier = getBarrier()
            if (barrier) await barrier.waitForTarget(input.signal)
            input.signal.throwIfAborted()
            await input.emit('step.started', { step: 1 }, stepId)
            let thinking = ''
            input.stream(streamId, '', thinking)
            for (let part = 0; part < 2; part += 1) {
              thinking += `${part ? 'verify' : 'plan'}-${spec.index} `
              input.stream(streamId, '', thinking)
              await Bun.sleep(35)
            }
            const privatePath = `pressure-${spec.wave}-${spec.index}.txt`
            const content = `${spec.wave}/${spec.index}/${spec.seed}`
            await callTool('write_file', { path: privatePath, text: content }, 0)
            await callTool('read_file', { path: privatePath }, 1)
            await callTool(
              'pressure_hotspot_write',
              { value: `${spec.wave}:${spec.index}:${Math.floor(random() * 1_000_000)}` },
              2,
            )
            await callTool('pressure_plan_touch', { status: 'completed' }, 3)
            for (let ordinal = 4; ordinal < 4 + spec.extraActions; ordinal += 1) {
              const pick = random()
              if (pick < 0.45) {
                const filename = `pressure-random-${spec.wave}-${spec.index}-${ordinal}.txt`
                const value = `${spec.seed}/${ordinal}/${Math.floor(random() * 0x1_0000)}`
                await callTool('write_file', { path: filename, text: value }, ordinal)
                await callTool('read_file', { path: filename }, ordinal + 100)
              } else if (pick < 0.75) {
                await callTool(
                  'pressure_hotspot_write',
                  { value: `${spec.wave}:${spec.index}:${ordinal}:${Math.floor(random() * 0x1_0000)}` },
                  ordinal,
                )
              } else {
                await callTool('pressure_plan_touch', { status: 'in_progress' }, ordinal)
              }
              await Bun.sleep(Math.floor(random() * 4))
            }
            await input.emit(
              'usage.recorded',
              createUsageFact({
                usage: { ...USAGE, input: USAGE.input + Math.floor(random() * 4) },
                runId: input.run.id,
                attemptId: `${input.run.id}-attempt`,
                source: 'model',
                model: input.request.model,
              }),
              `${input.run.id}-attempt`,
            )
            await input.emit('step.ended', {}, stepId)
            await input.commit(
              'assistant',
              [{ type: 'text', text: `fixture complete ${spec.wave}/${spec.index}` }],
              streamId,
            )
            metrics.results.set(input.run.id, { toolNames, fileContents, usageTokens: USAGE.input + USAGE.output })
          } finally {
            metrics.active -= 1
          }
        },
        summarize: async () => ({
          text: 'deterministic pressure summary',
          usage: USAGE,
        }),
      })
    },
  })
}

async function createFixture(root: string, options: { readonly requestTimeoutMs?: number } = {}): Promise<Fixture> {
  const workRoot = join(root, 'workspace')
  await mkdir(workRoot, { recursive: true })
  const dataRoot = join(root, 'data')
  await mkdir(join(dataRoot, 'databases'), { recursive: true })
  await mkdir(join(root, 'cache'), { recursive: true })
  const layout = createPathLayout(dataRoot, join(root, 'cache'), join(root, 'paths.json'), { identityRoot: dataRoot })
  const events: DiagnosticEvent[] = []
  const metrics: WorkerMetrics = {
    events,
    storageOutstanding: new Set(),
    workerExecuting: new Set(),
    managedCalls: new Map(),
    nextManagedCallId: 0,
    storageOutstandingPeak: 0,
    workerExecutingPeak: 0,
  }
  const specs = new Map<string, PressureSpec>()
  const hotspotValues = new Set<string>()
  let barrier: DriverBarrier | undefined
  const driverMetrics = {
    active: 0,
    peak: 0,
    entered: 0,
    results: new Map<
      string,
      { readonly toolNames: readonly string[]; readonly fileContents: string[]; readonly usageTokens: number }
    >(),
  }
  const physical = new Storage(layout.database, layout, {
    ...(options.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: options.requestTimeoutMs }),
    maxPendingRequests: 1_024,
    diagnostics: { emit: (event) => onStorageEvent(metrics, event) },
    diagnosticsFullCoverage: true,
    instanceId: `pressure-storage-${randomUUID()}`,
  })
  await bounded(physical.call('ready'), 10_000, 'STORAGE_READY')
  await physical.call('setPlugin', 'goal.codex', true, { autoContinue: false })
  await physical.call('setSetting', 'permission.mode', 'allow')
  const stable = new StableStoragePort(10_000)
  let workerExitSettled = false
  const owner: RuntimeOwner = { unitId: 'storage.sqlite', generation: 1, incarnation: randomUUID() }
  const writer: ManagedStorageWriter = {
    owner,
    async retire() {
      try {
        await physical.close()
      } finally {
        workerExitSettled = true
      }
    },
    call: async (method, args, authority, diagnostic) => {
      const callId = ++metrics.nextManagedCallId
      metrics.managedCalls.set(callId, method)
      try {
        return await callStorageRpc(
          {
            execute: (request) =>
              physical.executeRpc({
                ...request,
                ...(diagnostic === undefined ? {} : { diagnostic }),
              }),
          },
          method,
          args,
          authority,
        )
      } finally {
        metrics.managedCalls.delete(callId)
      }
    },
  }
  stable.install(writer)
  const driver = createDriverPlugin(() => barrier, specs, driverMetrics)
  const kernel = await Kernel.create({
    home: dataRoot,
    layout,
    workspace: workRoot,
    demo: true,
    secrets: new MemorySecrets(),
    runIdleTimeoutMs: 20_000,
    diagnostics: { emit: (event) => onStorageEvent(metrics, event) },
    diagnosticFullCoverage: true,
    profile: {
      replacements: { 'driver.pi': driver },
      createStorage: async () => stable,
    },
  })
  const hotspotInput = z.object({ value: z.string().min(1).max(200) })
  const planInput = z.object({ status: z.enum(['in_progress', 'completed']) })
  const disposeHotspot = kernel.tools.register({
    name: 'pressure_hotspot_write',
    description: 'Write one seeded marker to a shared private SQLite setting row.',
    effect: 'write',
    inputSchema: hotspotInput,
    async execute(args) {
      const input = hotspotInput.parse(args)
      await kernel.storage.call('setSetting', 'pressure.shared-hotspot', input.value)
      hotspotValues.add(input.value)
      return { text: `stored ${input.value}` }
    },
  })
  const disposePlan = kernel.tools.register({
    name: 'pressure_plan_touch',
    description: 'Update the owning Session plan through the public PlanService.',
    effect: 'write',
    inputSchema: planInput,
    async execute(args, context) {
      const input = planInput.parse(args)
      const plans = kernel.plugins.get<PlanService>('plan')
      const current = await plans.get(context.session.id)
      if (!current) throw new Error('PRESSURE_PLAN_MISSING')
      const next = await plans.update(
        context.session.id,
        [{ step: 'exercise real SQLite and tool paths', status: input.status }],
        'deterministic concurrency fixture',
        context.run.id,
        current.revision,
      )
      return { text: `plan revision ${next.revision}` }
    },
  })
  const wireEvents: WireNotification[] = []
  const unsubscribe = kernel.subscribe((event) => {
    wireEvents.push(event)
  })
  const fixture: Fixture = {
    root,
    workRoot,
    layout,
    kernel,
    stable,
    physical,
    metrics,
    workerOwner: owner,
    workerExitSettled: () => workerExitSettled,
    setBarrier: (next) => {
      barrier = next
    },
    resetDriverMetrics: () => {
      driverMetrics.active = 0
      driverMetrics.peak = 0
      driverMetrics.entered = 0
    },
    driverPeak: () => driverMetrics.peak,
    driverEntered: () => driverMetrics.entered,
    driverActive: () => driverMetrics.active,
    driverResults: driverMetrics.results,
    wireEvents,
    hotspotValues,
    specs,
    disposeTools: async () => {
      await disposeHotspot()
      await disposePlan()
    },
    unsubscribe,
  }
  activeFixtures.push(fixture)
  return fixture
}

function recordPortSample(report: WaveReport, fixture: Fixture): void {
  const port = fixture.stable.snapshot()
  report.stableInFlightPeak = Math.max(report.stableInFlightPeak, port.inFlight)
  report.stableQueuedPeak = Math.max(report.stableQueuedPeak, port.queued)
  report.stableBufferedBytesPeak = Math.max(report.stableBufferedBytesPeak, port.bufferedBytes)
  report.storageRpcOutstandingPeak = Math.max(report.storageRpcOutstandingPeak, fixture.metrics.storageOutstandingPeak)
  report.sqliteWorkerExecutingPeak = Math.max(report.sqliteWorkerExecutingPeak, fixture.metrics.workerExecutingPeak)
}

async function waitForSessionRunSettled(
  fixture: Fixture,
  sessionId: string,
  runId: string,
  deadline: number,
  phase: string,
): Promise<void> {
  let lastState: Record<string, unknown> = {}
  while (performance.now() < deadline) {
    const run = await fixture.kernel.storage.call('run', runId)
    const queued = await fixture.kernel.storage.call('queuedSessions')
    await Bun.sleep(1)
    const port = fixture.stable.snapshot()
    const active = fixture.kernel.active.get(sessionId)
    lastState = {
      status: run.status,
      activeRunId: active?.run.id ?? null,
      queuedForSession: queued.includes(sessionId),
      driverActive: fixture.driverActive(),
      storageRpcOutstanding: fixture.metrics.storageOutstanding.size,
      sqliteWorkerExecuting: fixture.metrics.workerExecuting.size,
      managedCalls: [...fixture.metrics.managedCalls.values()],
      stableInFlight: port.inFlight,
      stableQueued: port.queued,
    }
    if (
      ['completed', 'failed', 'cancelled'].includes(run.status) &&
      !active &&
      !queued.includes(sessionId) &&
      port.inFlight === 0 &&
      port.queued === 0 &&
      fixture.metrics.workerExecuting.size === 0
    )
      return
    await Bun.sleep(5)
  }
  throw new Error(`${phase}_DEADLINE_EXCEEDED:${JSON.stringify(lastState)}`)
}

async function writeReport(path: string, report: PressureReport): Promise<void> {
  await Bun.write(path, `${JSON.stringify(report, null, 2)}\n`)
}

async function createSessions(
  fixture: Fixture,
  wave: string,
  count: number,
): Promise<{ id: string; runId: string; acceptedAt: number; index: number }[]> {
  const workspace = (await fixture.kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('PRESSURE_WORKSPACE_MISSING')
  const goals = fixture.kernel.plugins.get<GoalService>('goal')
  const plans = fixture.kernel.plugins.get<PlanService>('plan')
  const actors: { id: string; runId: string; acceptedAt: number; index: number }[] = []
  for (let offset = 0; offset < count; offset += SUBMISSION_BATCH_SIZE) {
    const batchSize = Math.min(SUBMISSION_BATCH_SIZE, count - offset)
    const created = await bounded(
      Promise.all(
        Array.from({ length: batchSize }, async (_, localIndex) => {
          const index = offset + localIndex
          const session = await fixture.kernel.createSession(workspace.id, `${wave}-agent-${index}`)
          fixture.specs.set(session.id, {
            wave,
            index,
            seed: (SEED ^ Math.imul(index + 1, 0x9e3779b1) ^ wave.length) >>> 0,
            extraActions: 1 + ((index * 7 + wave.length) % 3),
          })
          await goals.create(session.id, `verify ${wave} SQLite actor ${index}`, 50_000)
          await plans.update(
            session.id,
            [{ step: 'exercise real SQLite and tool paths', status: 'pending' }],
            'seeded pressure fixture',
          )
          return { id: session.id, index }
        }),
      ),
      10_000,
      `${wave}_CREATE_BATCH_${offset}`,
    )
    actors.push(...created.map((item) => ({ id: item.id, runId: '', acceptedAt: 0, index: item.index })))
  }
  return actors
}

async function runWave(
  fixture: Fixture,
  report: PressureReport,
  waveName: string,
  count: number,
  options: {
    readonly cancelFirst?: boolean
    readonly queueSuccessor?: boolean
    readonly snapshotSessionId?: string
  } = {},
): Promise<WaveReport> {
  const wave: WaveReport = {
    name: waveName,
    requestedAgents: count,
    acceptedRuns: 0,
    duplicateReceipts: 0,
    fullAccessRuns: 0,
    enteredBeforeRelease: 0,
    kernelActiveAtRelease: 0,
    driverPeak: 0,
    stableInFlightPeak: 0,
    stableQueuedPeak: 0,
    stableBufferedBytesPeak: 0,
    storageRpcOutstandingPeak: 0,
    sqliteWorkerExecutingPeak: 0,
    streamUpdateCount: 0,
    freeMemoryStartBytes: freemem(),
    rssStartBytes: process.memoryUsage().rss,
    runLatencyMs: [],
    snapshotLatencyMs: [],
    statuses: {},
    failures: [],
    durationMs: 0,
  }
  report.waves.push(wave)
  const startedAt = performance.now()
  const deadline = startedAt + WAVE_TIMEOUT_MS
  if (freemem() < 4 * 1024 * 1024 * 1024) throw new Error(`${waveName}_FREE_MEMORY_BELOW_4GIB`)
  fixture.resetDriverMetrics()
  const actors = await createSessions(fixture, waveName, count)
  const barrier = createBarrier()
  fixture.setBarrier(barrier)
  const acceptedAt = new Map<string, number>()
  const runIds: string[] = []
  const storageEventStart = fixture.metrics.events.length
  const wireEventStart = fixture.wireEvents.length
  let successorId: string | undefined
  let primaryError: unknown
  let stopSampler = false
  const sampler = (async () => {
    while (!stopSampler) {
      recordPortSample(wave, fixture)
      await Bun.sleep(2)
    }
  })()
  const runOne = async (actor: { id: string; index: number }) => {
    const requestId = `${waveName}-request-${actor.index}`
    const run = await fixture.kernel.submit(
      actor.id,
      requestId,
      {
        text: `synthetic agent intent ${waveName}/${actor.index}`,
        images: [],
        approval: 'allow',
      },
      'local-fixture',
    )
    acceptedAt.set(run.id, performance.now())
    runIds.push(run.id)
    wave.acceptedRuns += 1
    return run
  }
  try {
    const accepted = []
    for (let offset = 0; offset < actors.length; offset += SUBMISSION_BATCH_SIZE) {
      const slice = actors.slice(offset, offset + SUBMISSION_BATCH_SIZE)
      const batch = await bounded(
        Promise.all(slice.map((actor) => runOne(actor))),
        10_000,
        `${waveName}_SUBMIT_BATCH_${offset}`,
      )
      accepted.push(...batch)
    }
    if (accepted.length !== count) throw new Error(`${waveName}_ACCEPTED_COUNT:${accepted.length}/${count}`)
    wave.fullAccessRuns = accepted.filter(
      (run) =>
        run.input.approval === 'allow' &&
        run.input.permissionAtAdmission === 'allow' &&
        run.input.sandbox === undefined,
    ).length
    if (wave.fullAccessRuns !== count)
      throw new Error(`${waveName}_FULL_ACCESS_RUN_CONFIG_MISMATCH:${wave.fullAccessRuns}/${count}`)
    const first = accepted[0]
    if (!first) throw new Error(`${waveName}_FIRST_RUN_MISSING`)
    const duplicate = await bounded(
      fixture.kernel.submit(
        first.sessionId,
        `${waveName}-request-0`,
        {
          text: `synthetic agent intent ${waveName}/0`,
          images: [],
          approval: 'allow',
        },
        'local-fixture',
      ),
      5_000,
      `${waveName}_IDEMPOTENCY_REPLAY`,
    )
    if (duplicate.id !== first.id) throw new Error(`${waveName}_IDEMPOTENCY_DUPLICATED_RUN`)
    wave.duplicateReceipts += 1
    if (options.queueSuccessor) {
      const actor = actors[0]
      if (!actor) throw new Error(`${waveName}_QUEUE_ACTOR_MISSING`)
      const queued = await bounded(
        fixture.kernel.submit(
          actor.id,
          `${waveName}-successor`,
          {
            text: `queued successor ${waveName}`,
            images: [],
            approval: 'allow',
          },
          'local-fixture',
        ),
        5_000,
        `${waveName}_QUEUE_SUCCESSOR`,
      )
      if (
        queued.input.approval !== 'allow' ||
        queued.input.permissionAtAdmission !== 'allow' ||
        queued.input.sandbox !== undefined
      )
        throw new Error(`${waveName}_SUCCESSOR_FULL_ACCESS_RUN_CONFIG_MISMATCH`)
      wave.fullAccessRuns += 1
      successorId = queued.id
      const queuedRead = await fixture.kernel.storage.call('run', queued.id)
      if (queuedRead.status !== 'queued') throw new Error(`${waveName}_SAME_SESSION_NOT_QUEUED:${queuedRead.status}`)
      runIds.push(queued.id)
      acceptedAt.set(queued.id, performance.now())
      wave.acceptedRuns += 1
    }
    await barrier.waitUntilEntered(count, deadline)
    wave.enteredBeforeRelease = barrier.entered
    wave.kernelActiveAtRelease = fixture.kernel.active.size
    if (wave.enteredBeforeRelease !== count || wave.kernelActiveAtRelease < count)
      throw new Error(
        `${waveName}_OVERLAP_SHORTFALL:${wave.enteredBeforeRelease}/${count};kernel=${wave.kernelActiveAtRelease}`,
      )
    if (options.cancelFirst) {
      const cancelTarget = accepted[0]
      if (!cancelTarget) throw new Error(`${waveName}_CANCEL_TARGET_MISSING`)
      await bounded(fixture.kernel.cancel(cancelTarget.id), 5_000, `${waveName}_CANCEL_REQUEST`)
    }
    barrier.release()
    if (options.snapshotSessionId) {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const snapshotStarted = performance.now()
        const snapshot: Awaited<ReturnType<StorageMethods['snapshot']>> = await bounded(
          fixture.kernel.storage.call('snapshot', options.snapshotSessionId),
          5_000,
          `${waveName}_LONG_HISTORY_SNAPSHOT_${attempt}`,
        )
        if (snapshot.session.id !== options.snapshotSessionId) throw new Error(`${waveName}_SNAPSHOT_CROSSED_SESSION`)
        wave.snapshotLatencyMs.push(performance.now() - snapshotStarted)
      }
    }
    await bounded(fixture.kernel.waitForIdle(), Math.max(1, deadline - performance.now()), `${waveName}_IDLE`)
    if (fixture.kernel.active.size !== 0) throw new Error(`${waveName}_KERNEL_NOT_IDLE:${fixture.kernel.active.size}`)
    const terminalRuns = await Promise.all(runIds.map((runId) => fixture.kernel.storage.call('run', runId)))
    for (const run of terminalRuns) {
      wave.statuses[run.status] = (wave.statuses[run.status] ?? 0) + 1
      if (run.status !== 'completed' && run.status !== 'cancelled')
        wave.failures.push(
          `run:${run.id}:${run.status}:${run.error ?? 'no-error'}:${run.failure?.category ?? 'no-category'}`,
        )
      const acceptedAtMs = acceptedAt.get(run.id)
      if (acceptedAtMs !== undefined && run.endedAt !== null)
        wave.runLatencyMs.push(Math.max(0, performance.now() - acceptedAtMs))
    }
    const expectedCancelled = options.cancelFirst ? 1 : 0
    if (
      (wave.statuses.completed ?? 0) !== runIds.length - expectedCancelled ||
      (wave.statuses.cancelled ?? 0) !== expectedCancelled
    )
      throw new Error(`${waveName}_TERMINAL_STATUS_MISMATCH:${JSON.stringify(wave.statuses)}`)
    const cancelledRun = terminalRuns.find((run) => run.status === 'cancelled')
    if (cancelledRun) wave.cancelledRunId = cancelledRun.id
    if (successorId) {
      const successor = terminalRuns.find((run) => run.id === successorId)
      if (successor) {
        wave.sameSessionSuccessorId = successor.id
        wave.sameSessionSuccessorStatus = successor.status
      }
      if (
        !cancelledRun ||
        !successor ||
        successor.status !== 'completed' ||
        successor.sessionId !== cancelledRun.sessionId
      )
        throw new Error(`${waveName}_SAME_SESSION_SUCCESSOR_TERMINAL_MISMATCH`)
    }
    for (const actor of actors) {
      const events = await fixture.kernel.storage.call('events', actor.id, 0, 2_000)
      const seqs = events.map((event) => event.seq)
      if (seqs.some((seq, index) => index > 0 && seq <= (seqs[index - 1] ?? 0)))
        throw new Error(`${waveName}_EVENT_SEQUENCE_INVALID:${actor.id}`)
      const hasCompletedRun = terminalRuns.some((run) => run.sessionId === actor.id && run.status === 'completed')
      const hasCancelledRun = terminalRuns.some((run) => run.sessionId === actor.id && run.status === 'cancelled')
      const goal = await fixture.kernel.plugins.get<GoalService>('goal').get(actor.id)
      if (
        !goal.goal ||
        (hasCancelledRun
          ? goal.goal.status !== 'paused' || goal.goal.tokensUsed !== 0
          : hasCompletedRun
            ? goal.goal.tokensUsed <= 0
            : goal.goal.tokensUsed !== 0)
      )
        throw new Error(`${waveName}_GOAL_USAGE_NOT_ACCOUNTED:${actor.id}`)
      if (hasCancelledRun) {
        wave.cancelledActorGoalStatus = goal.goal.status
        wave.cancelledActorGoalTokens = goal.goal.tokensUsed
      }
      const plan = await fixture.kernel.plugins.get<PlanService>('plan').get(actor.id)
      if (!plan || plan.revision < (hasCompletedRun ? 2 : 1))
        throw new Error(`${waveName}_PLAN_NOT_UPDATED:${actor.id}`)
    }
    wave.streamUpdateCount = fixture.wireEvents
      .slice(wireEventStart)
      .filter((event) => event.method === 'stream.update' && runIds.includes(event.params.runId)).length
    wave.driverPeak = fixture.driverPeak()
    const waveDiagnostics = fixture.metrics.events.slice(storageEventStart)
    wave.storageRpcOutstandingPeak = Math.max(
      wave.storageRpcOutstandingPeak,
      ...waveDiagnostics
        .filter((event) => event.component === 'storage' && event.event === 'storage.request_dispatched')
        .map((event) => event.pending ?? 0),
    )
    let workerExecuting = 0
    for (const event of waveDiagnostics) {
      if (event.component !== 'sqlite') continue
      if (event.event === 'sqlite.request_started') workerExecuting += 1
      if (event.event === 'sqlite.request_completed' || event.event === 'sqlite.request_failed')
        workerExecuting = Math.max(0, workerExecuting - 1)
      wave.sqliteWorkerExecutingPeak = Math.max(wave.sqliteWorkerExecutingPeak, workerExecuting)
    }
    recordPortSample(wave, fixture)
    if (wave.driverPeak < count) throw new Error(`${waveName}_DRIVER_PEAK_SHORTFALL:${wave.driverPeak}/${count}`)
    if (wave.streamUpdateCount < 1) throw new Error(`${waveName}_STREAM_EVENTS_MISSING`)
    for (const runId of runIds) {
      if (runId === successorId && options.cancelFirst) continue
      const result = fixture.driverResults.get(runId)
      const run = terminalRuns.find((item) => item.id === runId)
      if (run?.status === 'completed') {
        const spec = fixture.specs.get(run.sessionId)
        if (!result || !result.toolNames.includes('write_file') || !result.toolNames.includes('read_file'))
          throw new Error(`${waveName}_REAL_FILE_TOOLS_MISSING:${runId}`)
        if (!spec || !result.fileContents.some((text) => text.includes(`${spec.wave}/${spec.index}/${spec.seed}`)))
          throw new Error(`${waveName}_FILE_READBACK_MISMATCH:${runId}`)
      }
    }
  } catch (error) {
    primaryError = error
    wave.failures.push(error instanceof Error ? error.message : 'UNKNOWN_ERROR')
    throw error
  } finally {
    barrier.release()
    stopSampler = true
    await bounded(sampler, 2_000, `${waveName}_METRIC_SAMPLER_CLOSE`).catch(() => undefined)
    fixture.setBarrier(undefined)
    wave.durationMs = performance.now() - startedAt
    wave.driverPeak = Math.max(wave.driverPeak, fixture.driverPeak())
    recordPortSample(wave, fixture)
    if (primaryError && fixture.kernel.active.size > 0)
      wave.failures.push(`active-at-wave-exit:${fixture.kernel.active.size}`)
  }
  return wave
}

function createReport(attemptId: string): PressureReport {
  return {
    attemptId,
    seed: SEED,
    generatedAt: new Date().toISOString(),
    fixtureKind: 'deterministic synthetic HarnessDriver; no model API; Goal autoContinue disabled',
    storagePath: 'Kernel -> StableStoragePort (64 active / 256 queued / 64 MiB) -> real SQLite Storage Worker',
    accessContract: {
      approval: 'allow',
      permissionAtAdmission: 'allow',
      sandboxSnapshot: 'none',
      osConfinement: 'none',
      boundary: 'built-in file tools remain restricted to the owned workspace; no shell probe in this SQLite fixture',
    },
    sqlite: {},
    limits: {},
    waves: [],
    history: {},
    cleanup: { kernelClosed: false, workerExitSettled: false, idleConfirmed: false, fixtureRemoved: false },
  }
}

async function makeAttemptDirectory(): Promise<{ readonly root: string; readonly reportPath: string }> {
  const base = join(process.cwd(), 'artifacts', 'project-c-functional-20261010', 'sqlite-agent-pressure')
  await mkdir(base, { recursive: true })
  const baseReal = await realpath(base)
  const attemptId = randomUUID()
  const root = join(baseReal, `${FIXTURE_PREFIX}${attemptId}`)
  await mkdir(root)
  const rootReal = await realpath(root)
  if (dirname(rootReal) !== baseReal || basename(rootReal) !== `${FIXTURE_PREFIX}${attemptId}`)
    throw new Error('PRESSURE_ARTIFACT_ROOT_FENCE_FAILED')
  return { root: rootReal, reportPath: join(rootReal, 'report.json') }
}

async function assertOwnedDirectory(root: string): Promise<string> {
  const resolved = await realpath(root)
  const parent = await realpath(dirname(root))
  if (dirname(resolved) !== parent || !basename(resolved).startsWith('private-'))
    throw new Error('PRESSURE_FIXTURE_PATH_FENCE_FAILED')
  return resolved
}

async function prepareHistory(
  fixture: Fixture,
  count: number,
): Promise<{ readonly sessionId: string; readonly runs: number }> {
  const workspace = (await fixture.kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('PRESSURE_HISTORY_WORKSPACE_MISSING')
  const session = await fixture.kernel.createSession(workspace.id, 'long-history-probe')
  const goals = fixture.kernel.plugins.get<GoalService>('goal')
  await goals.create(session.id, 'verify bounded long-history reads under multi-session write pressure', 50_000)
  await fixture.kernel.plugins
    .get<PlanService>('plan')
    .update(session.id, [{ step: 'build canonical event history', status: 'pending' }], 'history snapshot probe')
  for (let index = 0; index < count; index += 1) {
    fixture.specs.set(session.id, { wave: 'history', index, seed: SEED ^ index, extraActions: 3 })
    const run = await bounded(
      fixture.kernel.submit(
        session.id,
        `history-${index}`,
        {
          text: `long history turn ${index}`,
          images: [],
          approval: 'allow',
        },
        'local-fixture',
      ),
      5_000,
      `HISTORY_SUBMIT_${index}`,
    )
    await waitForSessionRunSettled(fixture, session.id, run.id, performance.now() + 5_000, `HISTORY_IDLE_${index}`)
    if ((await fixture.kernel.storage.call('run', run.id)).status !== 'completed')
      throw new Error(`HISTORY_RUN_NOT_COMPLETED:${index}`)
  }
  const events = await fixture.kernel.storage.call('events', session.id, 0, 2_000)
  if (events.length < count * 8) throw new Error(`LONG_HISTORY_TOO_SHORT:${events.length}`)
  return { sessionId: session.id, runs: count }
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') return error.code
  return error instanceof Error ? error.name : 'UNKNOWN_ERROR'
}

test(
  '30/40/50 synthetic Kernel agents overlap on one real SQLite Worker without lost state or unbounded stalls',
  async () => {
    const { root: attemptRoot, reportPath } = await makeAttemptDirectory()
    const privateRoot = join(attemptRoot, 'private-runtime')
    await mkdir(privateRoot)
    const report = createReport(basename(attemptRoot).slice(FIXTURE_PREFIX.length))
    const fixture = await createFixture(privateRoot)
    let primaryError: unknown
    let rssStop = false
    let rssPeakBytes = process.memoryUsage().rss
    const rssSampler = (async () => {
      while (!rssStop) {
        rssPeakBytes = Math.max(rssPeakBytes, process.memoryUsage().rss)
        await Bun.sleep(25)
      }
    })()
    try {
      const sqliteConfig = fixture.metrics.events.find(
        (event) => event.component === 'sqlite' && event.event === 'sqlite.configured',
      )
      if (!sqliteConfig) throw new Error('SQLITE_CONFIGURATION_DIAGNOSTIC_MISSING')
      report.sqlite = {
        runtimeVersion: sqliteConfig.runtimeVersion,
        sqliteVersion: sqliteConfig.sqliteVersion,
        journalMode: sqliteConfig.journalMode,
        synchronous: sqliteConfig.synchronous,
        busyTimeoutMs: sqliteConfig.busyTimeoutMs,
        foreignKeys: sqliteConfig.foreignKeys,
      }
      if (sqliteConfig.journalMode !== 'wal' || sqliteConfig.synchronous !== 2 || sqliteConfig.busyTimeoutMs !== 5_000)
        throw new Error('SQLITE_RUNTIME_CONFIGURATION_MISMATCH')
      report.limits = {
        stableInflight: RUNTIME_LIMITS.inFlight,
        stableQueued: RUNTIME_LIMITS.queued,
        stableBufferedBytes: RUNTIME_LIMITS.bufferedBytes,
        directWorkerPending: 1_024,
        workerRequestTimeoutMs: 30_000,
        sqliteBusyTimeoutMs: 5_000,
        freeMemoryStartBytes: freemem(),
      }
      report.sqlite = { ...report.sqlite, rssStartBytes: rssPeakBytes }

      const baseline = await runWave(fixture, report, 'baseline-30', 30)
      if (baseline.acceptedRuns !== 30 || baseline.enteredBeforeRelease !== 30)
        throw new Error('BASELINE_30_REAL_TOOL_GATE_FAILED')
      await writeReport(reportPath, report)
      if (Bun.env.PRESSURE_STAGE === 'baseline') return

      const history = await prepareHistory(fixture, 12)
      report.history = {
        ...history,
        snapshotProbe: 'concurrent snapshots during 30/40/50 pressure waves',
        minimumExpectedEvents: history.runs * 8,
      }
      await writeReport(reportPath, report)
      if (Bun.env.PRESSURE_STAGE === 'history') return

      for (const count of WAVE_SIZES) {
        const waveName = `stress-${count}`
        const waveOptions =
          typeof report.history.sessionId === 'string'
            ? { cancelFirst: count === 50, queueSuccessor: count === 50, snapshotSessionId: report.history.sessionId }
            : { cancelFirst: count === 50, queueSuccessor: count === 50 }
        const wave = await runWave(fixture, report, waveName, count, {
          ...waveOptions,
        })
        if (wave.enteredBeforeRelease !== count || wave.kernelActiveAtRelease < count)
          throw new Error(`${waveName}_REAL_OVERLAP_MISSED`)
        await writeReport(reportPath, report)
      }
      report.sqlite = {
        ...report.sqlite,
        storageRpcOutstandingPeak: fixture.metrics.storageOutstandingPeak,
        sqliteWorkerExecutingPeak: fixture.metrics.workerExecutingPeak,
        sqliteWorkerRequestsStarted: fixture.metrics.events.filter(
          (event) => event.component === 'sqlite' && event.event === 'sqlite.request_started',
        ).length,
        sqliteWorkerRequestsCompleted: fixture.metrics.events.filter(
          (event) => event.component === 'sqlite' && event.event === 'sqlite.request_completed',
        ).length,
        sqliteWorkerRequestsFailed: fixture.metrics.events.filter(
          (event) => event.component === 'sqlite' && event.event === 'sqlite.request_failed',
        ).length,
        allDispatchedRequestsSettled: fixture.metrics.storageOutstanding.size === 0,
      }
      if (fixture.metrics.storageOutstanding.size !== 0 || fixture.metrics.workerExecuting.size !== 0)
        throw new Error('STORAGE_DIAGNOSTIC_REQUESTS_LEFT_IN_FLIGHT')
      const hotspot = await fixture.kernel.storage.call('getSetting', 'pressure.shared-hotspot')
      if (typeof hotspot !== 'string' || !fixture.hotspotValues.has(hotspot))
        throw new Error('SHARED_SQLITE_HOTSPOT_MISSING_OR_CORRUPT')
      report.history = {
        ...report.history,
        hotspotFinalValuePresent: true,
        runP50Ms: report.waves.map((wave) => ({
          wave: wave.name,
          p50: percentile(wave.runLatencyMs, 0.5),
          p95: percentile(wave.runLatencyMs, 0.95),
          max: Math.max(0, ...wave.runLatencyMs),
        })),
        snapshotP95Ms: report.waves.map((wave) => ({
          wave: wave.name,
          p95: percentile(wave.snapshotLatencyMs, 0.95),
          max: Math.max(0, ...wave.snapshotLatencyMs),
        })),
      }
    } catch (error) {
      primaryError = error
      report.failure = {
        phase: report.waves.length ? (report.waves.at(-1)?.name ?? 'pressure') : 'sqlite-preflight',
        errorType: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
        errorMessage: (error instanceof Error ? error.message : 'UNKNOWN_ERROR').slice(0, 2_000),
      }
      await writeReport(reportPath, report)
      throw error
    } finally {
      rssStop = true
      await bounded(rssSampler, 2_000, 'RSS_SAMPLER_CLOSE').catch(() => undefined)
      report.sqlite = {
        ...report.sqlite,
        rssStartBytes: report.sqlite.rssStartBytes ?? null,
        rssPeakBytes,
        rssEndBytes: process.memoryUsage().rss,
      }
      const idleBeforeClose =
        fixture.kernel.active.size === 0 &&
        fixture.stable.snapshot().inFlight === 0 &&
        fixture.stable.snapshot().queued === 0
      report.cleanup = {
        ...report.cleanup,
        idleBeforeClose: idleBeforeClose,
        stablePortBeforeClose: fixture.stable.snapshot(),
      }
      try {
        fixture.setBarrier(undefined)
        await fixture.disposeTools()
        fixture.unsubscribe()
        await bounded(fixture.kernel.close(), 15_000, 'KERNEL_CLOSE')
        report.cleanup = {
          ...report.cleanup,
          kernelClosed: true,
          workerExitSettled: fixture.workerExitSettled(),
          stablePortAfterClose: fixture.stable.snapshot(),
        }
      } catch (error) {
        report.cleanup = {
          ...report.cleanup,
          closeFailureType: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
          workerExitSettled: fixture.workerExitSettled(),
          stablePortAfterClose: fixture.stable.snapshot(),
        }
        try {
          await bounded(fixture.stable.close(), 10_000, 'STABLE_CLOSE_FALLBACK')
          report.cleanup = {
            ...report.cleanup,
            stableCloseFallback: fixture.stable.snapshot().phase === 'closed',
            workerExitSettled: fixture.workerExitSettled(),
          }
        } catch (stableError) {
          report.cleanup = {
            ...report.cleanup,
            stableCloseFailureType: errorCode(stableError),
            workerExitSettled: fixture.workerExitSettled(),
          }
        }
        if (!primaryError) primaryError = error
      }
      const closed =
        report.cleanup.kernelClosed === true &&
        fixture.workerExitSettled() &&
        fixture.stable.snapshot().phase === 'closed'
      report.cleanup = {
        ...report.cleanup,
        workerExitConfirmed: closed,
        idleConfirmed: closed && idleBeforeClose,
        rssPeakBytes,
      }
      if (closed && idleBeforeClose && !primaryError) {
        const owned = await assertOwnedDirectory(privateRoot)
        await rm(owned, { recursive: true, force: true })
        report.cleanup = { ...report.cleanup, fixtureRemoved: true }
      } else {
        report.cleanup = {
          ...report.cleanup,
          fixtureRetainedAt: privateRoot,
          retainedReason: primaryError ? 'failed or incomplete attempt' : 'idle/close boundary not confirmed',
        }
      }
      await writeReport(reportPath, report)
      const fixtureIndex = activeFixtures.indexOf(fixture)
      if (fixtureIndex >= 0) activeFixtures.splice(fixtureIndex, 1)
    }
    expect(primaryError).toBeUndefined()
    expect(report.waves.map((wave) => wave.enteredBeforeRelease)).toEqual([30, 30, 40, 50])
  },
  TEST_TIMEOUT_MS,
)

afterEach(async () => {
  for (const fixture of activeFixtures.splice(0)) {
    fixture.setBarrier(undefined)
    try {
      await bounded(fixture.kernel.close(), 15_000, 'AFTER_EACH_KERNEL_CLOSE')
    } catch {
      // A failed fixture remains on disk for inspection; cleanup is intentionally skipped.
    }
  }
})
