import { Worker } from 'node:worker_threads'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { RUNTIME_LIMITS } from '@hbar/contracts/runtime'
import { RuntimeArtifactStore, runtimeArtifactSchema, type RuntimeArtifact, type RuntimeBuildUnit } from './artifacts'

const resultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), artifact: runtimeArtifactSchema }),
  z.strictObject({ ok: z.literal(false), reasonCode: z.string().min(1).max(128) }),
])
/** Development builds run outside the stable entry's event loop. No production authority reaches this Worker. */
export async function buildRuntimeArtifact(
  store: RuntimeArtifactStore,
  unit: RuntimeBuildUnit,
  signal: AbortSignal,
): Promise<RuntimeArtifact> {
  signal.throwIfAborted()
  const worker = new Worker(new URL('./build-worker.ts', import.meta.url), {
    workerData: { root: store.root, sourceRoot: store.sourceRoot, unit },
  })
  const result = Promise.withResolvers<RuntimeArtifact>()
  let received = false
  const abort = () => result.reject(new HbarError('RUNTIME_CANCELLED', 'Runtime build was cancelled'))
  const deadline = setTimeout(
    () => result.reject(new HbarError('RUNTIME_BUILD_TIMEOUT', 'Runtime build exceeded its deadline')),
    RUNTIME_LIMITS.startupMs,
  )
  signal.addEventListener('abort', abort, { once: true })
  worker.on('message', (raw: unknown) => {
    if (received) return
    received = true
    const parsed = resultSchema.safeParse(raw)
    if (!parsed.success)
      result.reject(new HbarError('RUNTIME_BUILD_INVALID', 'Local builder returned an invalid descriptor'))
    else if (!parsed.data.ok) result.reject(new HbarError(parsed.data.reasonCode, 'Local candidate build failed'))
    else result.resolve(parsed.data.artifact)
  })
  worker.on('error', () => result.reject(new HbarError('RUNTIME_BUILD_FAILED', 'Local builder exited with an error')))
  worker.on('exit', (code) => {
    if (!received)
      result.reject(new HbarError('RUNTIME_BUILD_FAILED', `Local builder exited without a result (${code})`))
  })
  let artifact: RuntimeArtifact
  try {
    artifact = await result.promise
  } finally {
    clearTimeout(deadline)
    signal.removeEventListener('abort', abort)
    // A timed-out builder cannot continue writing a half-prepared candidate in the background.
    const exited = worker.terminate()
    let exitDeadline: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        exited,
        new Promise<never>((_resolve, reject) => {
          exitDeadline = setTimeout(
            () => reject(new HbarError('RUNTIME_BUILD_EXIT_TIMEOUT', 'Builder exit could not be confirmed')),
            RUNTIME_LIMITS.shutdownMs,
          )
        }),
      ])
    } finally {
      clearTimeout(exitDeadline)
    }
  }
  // The descriptor is cloned and all immutable files are closed before delivery.
  // Release the compiler isolate before the parent allocates verification buffers.
  return await store.acceptBuild(artifact)
}
