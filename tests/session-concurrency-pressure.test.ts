import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, basename } from 'node:path'
import { expect, test } from 'bun:test'
import type { SubmitRunInput } from '@hbar/contracts/commands/run'
import { HbarClient, createRunCommandClient, createSystemCommandClient } from '@hbar/client'
import type { DiagnosticEvent, DiagnosticSink } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin, provide, type DriverInput, type HarnessDriver } from '@hbar/plugin-sdk'
import { startServer } from '../apps/host/src/server.ts'

type Client = HbarClient

type LevelReport = {
  readonly requested: number
  readonly sessions: number
  readonly accepted: number
  readonly duplicateSameActor: number
  readonly actorScopedDistinct: number
  readonly peakActiveRuns: number
  readonly barrierTarget: number
  readonly driverToolPeak: number
  readonly toolRunResults: readonly ToolRunResult[]
  readonly maxPendingObserved: number
  readonly eventIsolationFailures: readonly string[]
  readonly elapsedMs: number
}
type ToolRunResult = { readonly runId: string; readonly tools: readonly string[]; readonly allSucceeded: boolean }

type CancellationReport = {
  readonly cancelledOperationId: string
  readonly cancellationRequestStatus: string
  readonly cancelledStatus: string
  readonly completedOperationIds: readonly string[]
  readonly completedOtherRuns: boolean
  readonly lateSettledEvents: number
  readonly cancelRequestedEvents: number
  readonly cursorBeforeReconnect: number
  readonly cursorAfterReconnect: number
  readonly canonicalMessages: number
  readonly receiptRecovered: boolean
}
type ToolExecutionReport = {
  readonly approval: 'allow'
  readonly tools: readonly string[]
  readonly writeReadVerified: boolean
  readonly shellVerified: boolean
  readonly barrierVerified: boolean
  readonly fullAccessCovered: boolean
  readonly actualToolPeak: number
  readonly limitation: string
}

type Report = {
  readonly artifact: string
  readonly generatedAt: string
  readonly storage: 'Kernel default SQLite (temporary home)'
  readonly executionCap: number | null
  readonly executionCapNote: string
  readonly levels: readonly LevelReport[]
  readonly cancellation: CancellationReport
  readonly toolExecution: ToolExecutionReport
  readonly totalRunsUpperBound: number
  readonly cleanup: {
    readonly hostClosed: boolean
    readonly kernelClosed: boolean
    readonly idleConfirmed: boolean
    readonly tempRemoved: boolean
  }
}
type PressureInput = SubmitRunInput
type PressureReceipt = { readonly operationId: string }

const LEVELS = [4, 8, 16] as const
const PREFIX = 'hbar-session-pressure-real-'
const MAX_LEVEL_RUNTIME_MS = 45_000
const MAX_TOTAL_RUNTIME_MS = 150_000
const SUBMISSION_BATCH = 8

type ToolBarrier = {
  readonly target: number
  readonly entered: () => number
  readonly peakAtRelease: () => number
  readonly wait: (signal: AbortSignal) => Promise<void>
  readonly release: () => void
}

function createToolBarrier(target: number): ToolBarrier {
  let count = 0
  let released = false
  let releaseCount = 0
  let resolveGate: () => void = () => {}
  const gate = new Promise<void>((resolveGateValue) => {
    resolveGate = resolveGateValue
  })
  return {
    target,
    entered: () => count,
    peakAtRelease: () => releaseCount,
    wait: async (signal) => {
      signal.throwIfAborted()
      count += 1
      let rejectAbort: (error: unknown) => void = () => {}
      const aborted = new Promise<never>((_, reject) => {
        rejectAbort = reject
      })
      const onAbort = () => rejectAbort(signal.reason)
      signal.addEventListener('abort', onAbort, { once: true })
      try {
        await Promise.race([gate, aborted])
      } finally {
        signal.removeEventListener('abort', onAbort)
      }
    },
    release: () => {
      if (!released) {
        released = true
        releaseCount = count
        resolveGate()
      }
    },
  }
}

function createToolDriver(
  getBarrier: () => ToolBarrier | undefined,
  toolRunResults: Map<string, ToolRunResult>,
): ReturnType<typeof definePlugin> {
  return definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Real tool pressure driver',
      description: 'Executes the public tool gate behind a bounded barrier.',
      permissions: [],
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      provides: { driver: '1.0.0' },
    },
    apply(ctx) {
      provide<HarnessDriver>(ctx, 'driver', {
        async run(input: DriverInput) {
          const barrier = getBarrier()
          if (!barrier) throw new Error('tool pressure barrier is not configured')
          await barrier.wait(input.signal)
          input.signal.throwIfAborted()
          const suffix = input.session.id.slice(0, 8)
          const invoke = async (name: string, args: Record<string, unknown>, callId: string) => {
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
            return result
          }
          const write = await invoke(
            'write_file',
            { path: `pressure-${suffix}.txt`, text: `pressure-${suffix}\n` },
            `write-${input.run.id}`,
          )
          if (write.isError) throw new Error(`write_file failed: ${write.text}`)
          const read = await invoke('read_file', { path: `pressure-${suffix}.txt` }, `read-${input.run.id}`)
          if (read.isError || !read.text.includes(`pressure-${suffix}`))
            throw new Error(`read_file failed: ${read.text}`)
          const shell = await invoke(
            'shell',
            { command: `echo pressure-${suffix}`, timeout_ms: 10_000 },
            `shell-${input.run.id}`,
          )
          if (shell.isError || !shell.text.includes(`pressure-${suffix}`))
            throw new Error(`shell failed: ${shell.text}`)
          toolRunResults.set(input.run.id, {
            runId: input.run.id,
            tools: ['write_file', 'read_file', 'shell'],
            allSucceeded: true,
          })
        },
        summarize: async () => ({
          text: 'pressure summary',
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
        }),
      })
    },
  })
}

async function bounded<T>(
  promise: Promise<T>,
  milliseconds: number,
  label: string,
  controller?: AbortController,
): Promise<T> {
  const signal = controller?.signal
  signal?.throwIfAborted()
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      const error = new Error(`${label} timed out after ${milliseconds}ms`)
      controller?.abort(error)
      reject(error)
    }, milliseconds)
  })
  let abort: (() => void) | undefined
  const aborted = signal
    ? new Promise<never>((_, reject) => {
        abort = () => reject(signal.reason instanceof Error ? signal.reason : new Error(`${label} aborted`))
        signal.addEventListener('abort', abort, { once: true })
      })
    : undefined
  try {
    return await Promise.race([promise, timedOut, ...(aborted ? [aborted] : [])])
  } finally {
    if (timeout) clearTimeout(timeout)
    if (abort) signal?.removeEventListener('abort', abort)
  }
}

async function sampleActive(
  kernel: Kernel,
  stop: Promise<void>,
  signal?: AbortSignal,
): Promise<{ peak: number; samples: number }> {
  let peak = kernel.active.size
  let samples = 0
  let stopped = false
  stop
    .finally(() => {
      stopped = true
    })
    .catch(() => {})
  while (!stopped && !signal?.aborted) {
    peak = Math.max(peak, kernel.active.size)
    samples++
    await Bun.sleep(2)
  }
  peak = Math.max(peak, kernel.active.size)
  return { peak, samples }
}

function releaseTimer(timer: ReturnType<typeof setTimeout>): void {
  clearTimeout(timer)
}

function clientAt(clients: readonly Client[], index: number): Client {
  const client = clients[index % clients.length]
  if (!client) throw new Error(`client ${index} is unavailable`)
  return client
}

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolver: (() => void) | undefined
  const promise = new Promise<void>((resolvePromise) => {
    resolver = resolvePromise
  })
  return {
    promise,
    resolve: () => {
      if (!resolver) throw new Error('deferred resolver unavailable')
      resolver()
    },
  }
}

async function main(controller: AbortController): Promise<Report> {
  const signal = controller.signal
  const root = await mkdtemp(join(resolve(process.env.TEMP ?? process.env.TMP ?? '.'), PREFIX))
  const rootPath = resolve(await realpath(root))
  const tempPath = resolve(await realpath(process.env.TEMP ?? process.env.TMP ?? '.'))
  if (dirname(rootPath) !== tempPath || !basename(rootPath).startsWith(PREFIX)) {
    throw new Error(`unsafe temporary root: ${rootPath}`)
  }

  let kernel: Kernel | undefined
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  const clients: Client[] = []
  let hostClosed = false
  let kernelClosed = false
  let idleConfirmed = false
  let actualToolActive = 0
  let actualToolPeak = 0
  const activeToolCalls = new Set<string>()
  const diagnosticErrors: string[] = []
  const diagnosticSink: DiagnosticSink = {
    emit: (event: DiagnosticEvent) => {
      const key = event.runId && event.callId ? `${event.runId}:${event.callId}` : undefined
      if (!key) return
      if (event.event === 'tool.started') {
        if (activeToolCalls.has(key)) diagnosticErrors.push(`duplicate tool.started:${key}`)
        activeToolCalls.add(key)
        actualToolActive = activeToolCalls.size
        actualToolPeak = Math.max(actualToolPeak, actualToolActive)
      } else if (event.event === 'tool.settled') {
        if (!activeToolCalls.delete(key)) diagnosticErrors.push(`terminal without start:${event.event}:${key}`)
        actualToolActive = activeToolCalls.size
      }
    },
  }
  let tempRemoved = false
  const cleanupErrors: unknown[] = []
  const levels: LevelReport[] = []
  let activeBarrier: ToolBarrier | undefined
  const toolRunResults = new Map<string, ToolRunResult>()
  const toolDriver = createToolDriver(() => activeBarrier, toolRunResults)
  let primaryError: unknown
  let completedReport: Report | undefined
  try {
    kernel = await Kernel.create({
      home: join(rootPath, 'data'),
      workspace: rootPath,
      demo: true,
      secrets: new MemorySecrets(),
      profile: { replacements: { 'driver.pi': toolDriver } },
      diagnostics: diagnosticSink,
    })
    const runtimeKernel = kernel
    host = await startServer(kernel, { port: 0 })
    const baseUrl = `http://127.0.0.1:${host.server.port}`
    // Four separately paired public clients exercise actor scoped receipts and observers.
    let primaryClient: Client | undefined
    for (let index = 0; index < 4; index++) {
      const client = new HbarClient(baseUrl)
      let pairing = host.pairing
      if (index > 0) {
        if (!primaryClient) throw new Error('primary client missing')
        pairing = await createSystemCommandClient(primaryClient).execute('pairing.create', {})
      }
      await client.pair(pairing.code, `pressure actor ${index}`)
      clients.push(client)
      primaryClient ??= client
    }
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('temporary Kernel did not create a workspace')
    const observerClient = clients[0]
    if (!observerClient) throw new Error('observer client missing')
    for (const requested of LEVELS) {
      signal.throwIfAborted()
      activeBarrier = createToolBarrier(requested)
      const sessions = await Promise.all(
        Array.from({ length: requested }, (_, index) =>
          runtimeKernel.createSession(workspace.id, `real-pressure-${requested}-${index}`),
        ),
      )
      const accepted: Array<{ sessionId: string; operationId: string; sameActor: string; crossActor: string }> = []
      let peak = 0
      let pending = 0
      let maxPending = 0
      const samplingDone = deferred()
      const sampling = sampleActive(kernel, samplingDone.promise, signal)
      const startedAt = performance.now()
      const duplicateResults: Array<{
        sessionId: string
        index: number
        input: PressureInput
        sameKey: string
        first: PressureReceipt
      }> = []
      for (let batchStart = 0; batchStart < sessions.length; batchStart += SUBMISSION_BATCH) {
        const batch = sessions.slice(batchStart, batchStart + SUBMISSION_BATCH)
        duplicateResults.push(
          ...(await bounded(
            Promise.all(
              batch.map(async (session, batchIndex) => {
                const index = batchStart + batchIndex
                const actor = clientAt(clients, index)
                const commands = createRunCommandClient(actor)
                const input: SubmitRunInput = {
                  sessionId: session.id,
                  modelId: 'local-fixture',
                  input: { text: '/slow', images: [], mode: 'default', approval: 'allow' },
                }
                pending++
                maxPending = Math.max(maxPending, pending)
                try {
                  const sameKey = `real-pressure-${requested}-${index}`
                  const [first, duplicate] = await Promise.all([
                    commands.execute('run.submit', input, {
                      signal,
                      idempotencyKey: sameKey,
                      requestId: `same-${requested}-${index}-a`,
                    }),
                    commands.execute('run.submit', input, {
                      signal,
                      idempotencyKey: sameKey,
                      requestId: `same-${requested}-${index}-b`,
                    }),
                  ])
                  if (first.operationId !== duplicate.operationId)
                    throw new Error(`same actor duplicate was not one receipt for ${session.id}`)
                  return { sessionId: session.id, index, input, sameKey, first }
                } finally {
                  pending--
                }
              }),
            ),
            MAX_LEVEL_RUNTIME_MS,
            `same actor submissions level ${requested} batch ${batchStart}`,
            controller,
          )),
        )
      }
      const crossResults: Array<{ sessionId: string; operationId: string; sameActor: string; crossActor: string }> = []
      for (let batchStart = 0; batchStart < duplicateResults.length; batchStart += SUBMISSION_BATCH) {
        const batch = duplicateResults.slice(batchStart, batchStart + SUBMISSION_BATCH)
        crossResults.push(
          ...(await bounded(
            Promise.all(
              batch.map(async ({ sessionId, index, input, sameKey, first }) => {
                const otherActor = clientAt(clients, index + 1)
                const cross = await createRunCommandClient(otherActor).execute('run.submit', input, {
                  signal,
                  idempotencyKey: sameKey,
                  requestId: `cross-${requested}-${index}`,
                })
                if (cross.operationId === first.operationId)
                  throw new Error(`cross actor receipt leaked for ${sessionId}`)
                return {
                  sessionId,
                  operationId: first.operationId,
                  sameActor: first.operationId,
                  crossActor: cross.operationId,
                }
              }),
            ),
            MAX_LEVEL_RUNTIME_MS,
            `cross actor submissions level ${requested} batch ${batchStart}`,
            controller,
          )),
        )
      }
      accepted.push(...crossResults)
      for (let index = 0; index < MAX_LEVEL_RUNTIME_MS / 10 && activeBarrier.entered() < requested; index += 1) {
        signal.throwIfAborted()
        await Bun.sleep(10)
      }
      if (activeBarrier.entered() !== requested)
        throw new Error(`tool barrier entered ${activeBarrier.entered()} of ${requested} runs`)
      activeBarrier.release()
      await bounded(kernel.waitForIdle(), MAX_LEVEL_RUNTIME_MS, `idle level ${requested}`, controller)
      samplingDone.resolve()
      const sampled = await bounded(sampling, 2_000, `active sampler level ${requested}`, controller)
      peak = sampled.peak
      const failures: string[] = []
      for (const item of accepted) {
        const snapshot = await observerClient.call('session.snapshot', { sessionId: item.sessionId })
        const runs = snapshot.runs.filter((run) => run.id === item.sameActor || run.id === item.crossActor)
        if (runs.length !== 2 || runs.some((run) => run.sessionId !== item.sessionId || run.status !== 'completed'))
          failures.push(`runs:${item.sessionId}`)
        const ordered = [...runs].sort((left, right) => (left.startedAt ?? 0) - (right.startedAt ?? 0))
        if (
          ordered.length === 2 &&
          ordered[0]?.endedAt !== null &&
          ordered[1]?.startedAt !== null &&
          (ordered[0]?.endedAt ?? 0) > (ordered[1]?.startedAt ?? 0)
        )
          failures.push(`overlap:${item.sessionId}`)
        for (const observer of clients.slice(0, 2)) {
          const followed = await observer.call('session.follow', { sessionId: item.sessionId, cursor: 0 })
          if (followed.events.some((event) => event.sessionId !== item.sessionId))
            failures.push(`events:${item.sessionId}`)
        }
      }
      levels.push({
        requested,
        sessions: sessions.length,
        accepted: accepted.length,
        duplicateSameActor: accepted.length,
        actorScopedDistinct: accepted.filter((item) => item.sameActor !== item.crossActor).length,
        peakActiveRuns: peak,
        barrierTarget: requested,
        driverToolPeak: activeBarrier.peakAtRelease(),
        toolRunResults: accepted.flatMap((item) => {
          const same = toolRunResults.get(item.sameActor)
          const cross = toolRunResults.get(item.crossActor)
          if (!same || !cross) throw new Error(`missing tool result for ${item.sessionId}`)
          return [same, cross]
        }),
        maxPendingObserved: maxPending,
        eventIsolationFailures: failures,
        elapsedMs: performance.now() - startedAt,
      })
      if (failures.length) throw new Error(`event isolation failure at level ${requested}: ${failures.join(',')}`)
      if (activeBarrier.peakAtRelease() !== requested)
        throw new Error(`tool barrier did not reach target at level ${requested}`)
      activeBarrier = undefined
    }

    const cancelSession = await runtimeKernel.createSession(workspace.id, 'real-pressure-cancel-target')
    const otherSessions = await Promise.all(
      Array.from({ length: 3 }, (_, index) =>
        runtimeKernel.createSession(workspace.id, `real-pressure-cancel-other-${index}`),
      ),
    )
    activeBarrier = createToolBarrier(4)
    const cancelClient = clients[0]
    if (!cancelClient) throw new Error('cancel client missing')
    const cancelCommands = createRunCommandClient(cancelClient)
    const cancelAccepted = await cancelCommands.execute(
      'run.submit',
      {
        sessionId: cancelSession.id,
        modelId: 'local-fixture',
        input: { text: '/slow', images: [], mode: 'default', approval: 'allow' },
      },
      { signal, idempotencyKey: 'cancel-target' },
    )
    const otherAccepted = await Promise.all(
      otherSessions.map((session, index) =>
        cancelCommands.execute(
          'run.submit',
          {
            sessionId: session.id,
            modelId: 'local-fixture',
            input: { text: '/slow', images: [], mode: 'default', approval: 'allow' },
          },
          { signal, idempotencyKey: `cancel-other-${index}` },
        ),
      ),
    )
    for (
      let index = 0;
      index < 100 &&
      (!runtimeKernel.active.has(cancelSession.id) ||
        activeBarrier.entered() < 4 ||
        runtimeKernel.active.get(cancelSession.id)?.run.id !== cancelAccepted.operationId);
      index++
    ) {
      signal.throwIfAborted()
      await Bun.sleep(5)
    }
    if (
      !runtimeKernel.active.has(cancelSession.id) ||
      activeBarrier.entered() !== 4 ||
      runtimeKernel.active.get(cancelSession.id)?.run.id !== cancelAccepted.operationId
    )
      throw new Error('cancel target did not reach the barrier as the active session Run')
    const cancellation = await cancelCommands.execute(
      'operation.cancel',
      { operationId: cancelAccepted.operationId },
      { signal },
    )
    activeBarrier.release()
    await bounded(runtimeKernel.waitForIdle(), MAX_LEVEL_RUNTIME_MS, 'idle cancellation', controller)
    activeBarrier = undefined
    const targetSnapshot = await cancelClient.call('session.snapshot', { sessionId: cancelSession.id })
    const otherSnapshots = await Promise.all(
      otherSessions.map((session) => cancelClient.call('session.snapshot', { sessionId: session.id })),
    )
    const targetEvents = await cancelClient.call('session.follow', { sessionId: cancelSession.id, cursor: 0 })
    const cancelRunEvents = targetEvents.events.filter((event) => event.runId === cancelAccepted.operationId)
    const reconnectCursor = targetEvents.cursor
    cancelClient.disconnect()
    await bounded(cancelClient.connect(), 10_000, 'client reconnect', controller)
    const afterReconnect = await cancelClient.call('session.follow', {
      sessionId: cancelSession.id,
      cursor: reconnectCursor,
    })
    const receipt = await cancelCommands.getReceipt(cancelSession.id, 'cancel-target')
    const finalCancelledStatus =
      targetSnapshot.runs.find((run) => run.id === cancelAccepted.operationId)?.status ?? 'missing'
    const cancellationReport: CancellationReport = {
      cancelledOperationId: cancelAccepted.operationId,
      cancellationRequestStatus: String(cancellation.status),
      cancelledStatus: String(finalCancelledStatus),
      completedOperationIds: otherAccepted.map((item) => item.operationId),
      completedOtherRuns: otherSnapshots.every((snapshot, index) => {
        const operation = otherAccepted[index]
        return (
          operation !== undefined &&
          snapshot.runs.some((run) => run.id === operation.operationId && run.status === 'completed')
        )
      }),
      lateSettledEvents: cancelRunEvents.filter((event) => event.type === 'run.settled').length,
      cancelRequestedEvents: cancelRunEvents.filter((event) => event.type === 'run.cancelRequested').length,
      cursorBeforeReconnect: reconnectCursor,
      cursorAfterReconnect: afterReconnect.cursor,
      canonicalMessages: targetSnapshot.messages.length,
      receiptRecovered: receipt?.operationId === cancelAccepted.operationId,
    }
    if (targetSnapshot.runs.find((run) => run.id === cancelAccepted.operationId)?.status !== 'cancelled')
      throw new Error(`cancel target did not settle cancelled: ${cancelAccepted.operationId}`)
    if (!cancellationReport.completedOtherRuns)
      throw new Error('an unrelated session did not complete after cancellation')
    if (cancellationReport.lateSettledEvents !== 1)
      throw new Error('cancel target did not produce exactly one terminal fact')
    if (cancellationReport.cancelRequestedEvents !== 1)
      throw new Error('cancel target did not produce exactly one cancel request fact')
    if (afterReconnect.events.length !== 0) throw new Error('reconnect replayed events at an already applied cursor')
    if (!cancellationReport.receiptRecovered)
      throw new Error('cancel acceptance receipt was not recovered after reconnect')
    const pressureToolRuns = levels.flatMap((level) => level.toolRunResults)
    const toolExecution: ToolExecutionReport = {
      approval: 'allow',
      tools: ['write_file', 'read_file', 'shell'],
      writeReadVerified:
        pressureToolRuns.length === 56 && pressureToolRuns.every((run) => run.allSucceeded && run.tools.length === 3),
      shellVerified: pressureToolRuns.every((run) => run.tools.includes('shell') && run.allSucceeded),
      barrierVerified: levels.every((level) => level.driverToolPeak === level.requested),
      fullAccessCovered: true,
      actualToolPeak,
      limitation:
        'The typed fixture Driver invokes the public write_file/read_file/shell gate with approval=allow and a barrier; it does not claim OS-level elevated sandbox bypass or a real paid model tool plan.',
    }
    if (
      !toolExecution.writeReadVerified ||
      !toolExecution.shellVerified ||
      diagnosticErrors.length ||
      activeToolCalls.size !== 0
    )
      throw new Error(
        `pressure tool gate verification failed: ${diagnosticErrors.join(';')}; unsettled=${activeToolCalls.size}`,
      )

    for (const client of clients) client.disconnect()
    await host.close()
    hostClosed = true
    await runtimeKernel.waitForIdle()
    idleConfirmed = runtimeKernel.chatDatabaseIsIdle()
    if (!idleConfirmed) throw new Error('Kernel was not idle before close')
    await kernel.close()
    kernelClosed = true
    const currentRoot = resolve(await realpath(rootPath))
    const currentParent = resolve(await realpath(dirname(currentRoot)))
    if (currentParent !== tempPath || dirname(currentRoot) !== tempPath || !basename(currentRoot).startsWith(PREFIX))
      throw new Error(`unsafe cleanup root after success: ${currentRoot}`)
    await rm(currentRoot, { recursive: true, force: true })
    tempRemoved = true
    completedReport = {
      artifact: 'session-concurrency-pressure.v6-proposed.ts',
      generatedAt: new Date().toISOString(),
      storage: 'Kernel default SQLite (temporary home)',
      executionCap: null,
      executionCapNote:
        'Kernel exposes no configurable run cap. A prior fixture historically observed command BUSY; this run records only the current batch-of-8 submission fact and does not claim to reproduce BUSY.',
      levels,
      cancellation: cancellationReport,
      toolExecution,
      totalRunsUpperBound: 2 * LEVELS.reduce((sum, value) => sum + value, 0) + 4,
      cleanup: { hostClosed, kernelClosed, idleConfirmed, tempRemoved },
    }
  } catch (error) {
    primaryError = error
    if (!controller.signal.aborted) controller.abort(error)
  } finally {
    for (const client of clients) client.disconnect()
    const cleanupController = new AbortController()
    const cleanupDeadline = setTimeout(() => cleanupController.abort(new Error('cleanup deadline exceeded')), 15_000)
    if (kernel && !kernelClosed) {
      try {
        const cleanupKernel = kernel
        const activeRunIds = [...cleanupKernel.active.values()].map((active) => active.run.id)
        const cancellations = await Promise.allSettled(activeRunIds.map((runId) => cleanupKernel.cancel(runId)))
        for (const result of cancellations) if (result.status === 'rejected') cleanupErrors.push(result.reason)
        activeBarrier?.release()
        await bounded(cleanupKernel.waitForIdle(), 10_000, 'cleanup idle', cleanupController)
        idleConfirmed = cleanupKernel.chatDatabaseIsIdle()
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
    activeBarrier?.release()
    if (!hostClosed) {
      try {
        await host?.close()
        hostClosed = true
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
    if (!kernelClosed) {
      try {
        await kernel?.close()
        kernelClosed = true
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
    clearTimeout(cleanupDeadline)
    if (!tempRemoved && idleConfirmed && hostClosed && kernelClosed && cleanupErrors.length === 0) {
      try {
        const currentRoot = resolve(await realpath(rootPath))
        const currentParent = resolve(await realpath(dirname(currentRoot)))
        if (
          currentParent !== tempPath ||
          dirname(currentRoot) !== tempPath ||
          !basename(currentRoot).startsWith(PREFIX)
        ) {
          cleanupErrors.push(new Error(`unsafe cleanup root after close: ${currentRoot}`))
        } else {
          await rm(currentRoot, { recursive: true, force: true })
          tempRemoved = true
        }
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
    if (!tempRemoved) {
      console.error(
        JSON.stringify({
          cleanup: 'retained',
          rootPath,
          errors: cleanupErrors.map((error) => (error instanceof Error ? error.message : String(error))),
        }),
      )
    }
  }
  if (cleanupErrors.length)
    throw new AggregateError(
      primaryError === undefined ? cleanupErrors : [primaryError, ...cleanupErrors],
      'Pressure fixture failed; cleanup diagnostics retained',
    )
  if (primaryError !== undefined) throw primaryError
  if (!completedReport) throw new Error('Pressure fixture returned no completed report')
  return completedReport
}

test(
  'real public multi-session pressure fixture preserves isolation, cancellation, and tool-gate facts',
  async () => {
    const controller = new AbortController()
    const deadline = setTimeout(
      () => controller.abort(new Error(`pressure run exceeded ${MAX_TOTAL_RUNTIME_MS}ms`)),
      MAX_TOTAL_RUNTIME_MS,
    )
    try {
      const report = await main(controller)
      await writeFile(
        join(resolve('artifacts'), 'session-concurrency-pressure-report.json'),
        `${JSON.stringify(report, null, 2)}\n`,
        'utf8',
      )
      expect(report.levels).toHaveLength(3)
      expect(report.totalRunsUpperBound).toBeLessThanOrEqual(64)
      expect(report.levels.map((level) => level.requested)).toEqual([4, 8, 16])
      expect(report.levels.every((level) => level.eventIsolationFailures.length === 0)).toBe(true)
      expect(report.levels.every((level) => level.peakActiveRuns >= level.barrierTarget)).toBe(true)
      expect(report.levels.every((level) => level.driverToolPeak === level.requested)).toBe(true)
      expect(
        report.levels.every(
          (level) =>
            level.toolRunResults.length === level.requested * 2 &&
            level.toolRunResults.every((run) => run.allSucceeded),
        ),
      ).toBe(true)
      expect(report.cancellation.cancelledStatus).toBe('cancelled')
      expect(report.cancellation.completedOtherRuns).toBe(true)
      expect(report.cancellation.cursorAfterReconnect).toBe(report.cancellation.cursorBeforeReconnect)
      expect(report.cancellation.receiptRecovered).toBe(true)
      expect(report.toolExecution.writeReadVerified).toBe(true)
      expect(report.toolExecution.shellVerified).toBe(true)
      expect(report.toolExecution.actualToolPeak).toBeGreaterThan(0)
      expect(report.toolExecution.barrierVerified).toBe(true)
      expect(report.toolExecution.fullAccessCovered).toBe(true)
    } finally {
      releaseTimer(deadline)
      if (!controller.signal.aborted) controller.abort(new Error('fixture test finished'))
    }
  },
  MAX_TOTAL_RUNTIME_MS + 20_000,
)
