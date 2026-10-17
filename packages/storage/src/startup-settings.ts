import { Worker } from 'node:worker_threads'
import { HbarError } from '@hbar/contracts'
import type { StoredSettingsLayer } from './types'
import { startupSettingsReplySchema } from './startup-settings-contract'

/** One bounded read before listener binding. Never opens a writer or runs a migration. */
export async function readStartupSettingsLayer(
  database: string,
  options: { readonly workerPath?: string; readonly signal?: AbortSignal; readonly timeoutMs?: number } = {},
): Promise<StoredSettingsLayer | null> {
  const timeoutMs = options.timeoutMs ?? 10_000
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000)
    throw new HbarError('INVALID_INPUT', 'Startup settings require a bounded read deadline')
  options.signal?.throwIfAborted()
  const workerOptions = { workerData: { mode: 'startup-settings', path: database } }
  const worker = options.workerPath
    ? new Worker(options.workerPath, workerOptions)
    : Bun.isStandaloneExecutable
      ? new Worker('./packages/storage/src/maintenance-worker.ts', workerOptions)
      : new Worker(new URL('./maintenance-worker.ts', import.meta.url), workerOptions)
  let layer: StoredSettingsLayer | null | undefined
  let failure: Error | undefined
  let termination: Promise<number> | undefined
  const stop = (error: Error) => {
    failure ??= error
    termination ??= worker.terminate()
    void termination.catch(() => {
      /* The exit join below still determines readiness. */
    })
  }
  const cancel = () => stop(new HbarError('CANCELLED', 'Startup settings read was cancelled'))
  options.signal?.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(() => stop(new HbarError('TIMEOUT', 'Startup settings read timed out')), timeoutMs)
  try {
    await new Promise<void>((accept) => {
      worker.on('message', (message: unknown) => {
        const reply = startupSettingsReplySchema.safeParse(message)
        if (!reply.success || layer !== undefined) {
          stop(new HbarError('INVALID_OUTPUT', 'Startup settings Worker sent an invalid reply'))
        } else if (!reply.data.ok) {
          stop(new HbarError(reply.data.code, 'Stored startup settings could not be read'))
        } else layer = reply.data.layer
      })
      worker.once('error', () => stop(new HbarError('STORAGE_WORKER_FAILED', 'Startup settings Worker failed')))
      worker.once('exit', (code: number) => {
        if (code !== 0 || layer === undefined)
          failure ??= new HbarError('STORAGE_WORKER_EXITED', 'Startup settings Worker exited before acknowledgement')
        accept()
      })
      if (options.signal?.aborted) cancel()
    })
    if (termination) await termination
    if (failure) throw failure
    if (layer === undefined) throw new HbarError('INVALID_OUTPUT', 'Startup settings are unavailable')
    return layer
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', cancel)
  }
}
