import { Worker } from 'node:worker_threads'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { RUNTIME_LIMITS } from '@hbar/contracts/runtime'
import type { PathLayout } from './path-layout'
import { STORAGE_SCHEMA_VERSION } from './rpc-catalog'

const resultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), prepared: z.literal(true), schemaRevision: z.literal(STORAGE_SCHEMA_VERSION) }),
  z.strictObject({ ok: z.literal(false), code: z.string().min(1).max(128), error: z.string().max(8_192) }),
])

/** Readiness includes the actual thread exit; no writer handover or maintenance job is started. */
export function createMaintenanceWorkerPreflight(layout: PathLayout, workerPath: string) {
  const worker = new Worker(workerPath, {
    workerData: {
      path: layout.database,
      sessionsRoot: layout.sessions,
      operationId: 'runtime-preflight',
      mode: 'preflight',
      flags: new SharedArrayBuffer(8),
    },
  })
  let ended = false,
    prepared = false
  let resolveReady!: () => void, rejectReady!: (error: Error) => void
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })
  void ready.catch(() => {})
  let resolveExit!: () => void
  const exited = new Promise<void>((resolve) => {
    resolveExit = resolve
  })
  let closing: Promise<void> | undefined
  let exitDeadline: ReturnType<typeof setTimeout> | undefined
  const timer = setTimeout(() => {
    rejectReady(
      new HbarError('MAINTENANCE_PREFLIGHT_TIMEOUT', 'Maintenance Worker did not prepare before its deadline'),
    )
    void close().catch(() => {})
  }, RUNTIME_LIMITS.startupMs)
  function cleanup() {
    clearTimeout(timer)
    clearTimeout(exitDeadline)
    worker.off('message', onMessage)
    worker.off('error', onError)
  }
  function onMessage(value: unknown) {
    try {
      const result = resultSchema.parse(value)
      if (!result.ok) {
        rejectReady(new HbarError(result.code, result.error))
        void close().catch(() => {})
        return
      }
      if (prepared)
        throw new HbarError('MAINTENANCE_PREFLIGHT_INVALID', 'Maintenance Worker sent readiness more than once')
      prepared = true
      clearTimeout(timer)
      exitDeadline = setTimeout(() => {
        rejectReady(
          new HbarError(
            'MAINTENANCE_PREFLIGHT_EXIT_UNCONFIRMED',
            'Prepared Maintenance Worker did not exit before its release deadline',
          ),
        )
        void close().catch(() => {})
      }, RUNTIME_LIMITS.shutdownMs)
    } catch (error) {
      rejectReady(
        error instanceof HbarError
          ? error
          : new HbarError('MAINTENANCE_PREFLIGHT_INVALID', 'Maintenance Worker sent invalid readiness'),
      )
      void close().catch(() => {})
    }
  }
  function onError(error: Error) {
    rejectReady(new HbarError('MAINTENANCE_WORKER_FAILED', `Maintenance Worker failed: ${error.message}`))
    void close().catch(() => {})
  }
  worker.on('message', onMessage)
  worker.on('error', onError)
  worker.once('exit', (code: number) => {
    ended = true
    cleanup()
    resolveExit()
    if (prepared && code === 0) resolveReady()
    else
      rejectReady(
        new HbarError(
          'MAINTENANCE_PREFLIGHT_EXITED',
          'Maintenance Worker exited before confirming read-only readiness',
        ),
      )
  })
  function close(): Promise<void> {
    if (closing) return closing
    if (ended) return Promise.resolve()
    rejectReady(new HbarError('RUNTIME_CANCELLED', 'Maintenance Worker preflight was cancelled'))
    let deadline: ReturnType<typeof setTimeout> | undefined
    closing = Promise.race([
      worker.terminate().then(() => exited),
      new Promise<never>((_resolve, reject) => {
        deadline = setTimeout(
          () =>
            reject(
              new HbarError('MAINTENANCE_PREFLIGHT_EXIT_UNCONFIRMED', 'Maintenance Worker exit could not be confirmed'),
            ),
          RUNTIME_LIMITS.shutdownMs,
        )
      }),
    ]).finally(() => {
      clearTimeout(deadline)
      if (ended) cleanup()
    })
    return closing
  }
  return { ready, close }
}
