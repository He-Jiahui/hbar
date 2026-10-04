import { artifactSchema, HbarError, type ArtifactRef } from '@hbar/contracts'

export const MAX_IMAGE_ARTIFACT_BYTES = 10 * 1024 * 1024
export const IMAGE_ARTIFACT_TIMEOUT_MS = 15_000
export const IMAGE_ARTIFACT_CONCURRENCY = 2
export const IMAGE_ARTIFACT_QUEUE_LIMIT = 12

export type ImageArtifactMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
export interface ImageArtifactReadOptions {
  readonly signal?: AbortSignal
}
export interface ImageArtifactBytes {
  readonly artifactId: string
  readonly mime: ImageArtifactMime
  readonly bytes: Uint8Array
}

interface ReadTarget extends ArtifactRef {
  readonly mime: ImageArtifactMime
}
interface Job {
  readonly target: ReadTarget
  readonly token: string | undefined
  readonly generation: number
  readonly deadline: number
  readonly controller: AbortController
  readonly resolve: (result: ImageArtifactBytes) => void
  readonly reject: (error: HbarError) => void
  readonly cleanup: () => void
  settled: boolean
  reader: ReadableStreamDefaultReader<Uint8Array> | null
  cancel: Promise<void> | null
}

function mime(value: string): value is ImageArtifactMime {
  return ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(value)
}
function failure(code: string): HbarError {
  // Never expose HTTP error bodies, credentials, paths, or transport exception details.
  return new HbarError(code, `Image artifact read failed (${code})`)
}

/** Internal HTTP owner; returned bytes are not decoded or cached. */
export function createImageArtifactReader(authority: {
  readonly baseUrl: string
  readonly token: () => string | undefined
  readonly enabled: () => boolean
}) {
  let generation = 0
  const active = new Set<Job>()
  const queue: Job[] = []

  function settle(job: Job, result: ImageArtifactBytes | HbarError) {
    if (job.settled) return
    job.settled = true
    job.cleanup()
    if (result instanceof HbarError) job.reject(result)
    else job.resolve(result)
  }
  function cancelReader(job: Job): Promise<void> {
    if (!job.cancel && job.reader) {
      try {
        job.cancel = job.reader.cancel().catch(() => {})
      } catch {
        // Best-effort cleanup must not replace the original read/validation failure.
        job.cancel = Promise.resolve()
      }
    }
    return job.cancel ?? Promise.resolve()
  }
  function abort(job: Job, code: string) {
    job.controller.abort(failure(code))
    settle(job, failure(code))
    const index = queue.indexOf(job)
    if (index !== -1) queue.splice(index, 1)
    // Cancellation is initiated immediately; an active slot remains owned until cleanup settles.
    void cancelReader(job)
  }
  function assertCurrent(job: Job) {
    if (job.controller.signal.aborted) throw job.controller.signal.reason as unknown
    if (generation !== job.generation || !authority.enabled() || authority.token() !== job.token)
      throw failure('DISCONNECTED')
    if (Date.now() >= job.deadline) throw failure('TIMEOUT')
  }
  async function download(job: Job): Promise<ImageArtifactBytes> {
    assertCurrent(job)
    const url = new URL(`/api/artifacts/${job.target.id}`, authority.baseUrl)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw failure('INVALID_INPUT')
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      redirect: 'error',
      cache: 'no-store',
      headers: job.token ? { Authorization: `Bearer ${job.token}` } : {},
      signal: job.controller.signal,
    })
    job.reader = response.body?.getReader() ?? null
    let completed = false
    try {
      assertCurrent(job)
      if (response.redirected || (response.url && response.url !== url.href)) throw failure('CONTENT_MISMATCH')
      if (response.status !== 200)
        throw failure(
          response.status === 401 || response.status === 403
            ? 'UNAUTHORIZED'
            : response.status === 404
              ? 'NOT_FOUND'
              : 'READ_FAILED',
        )
      const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
      if (contentType !== job.target.mime) throw failure('CONTENT_MISMATCH')
      const length = response.headers.get('content-length')
      if (length !== null && (!/^\d+$/.test(length) || Number(length) !== job.target.size))
        throw failure('CONTENT_MISMATCH')
      if (!job.reader) throw failure('CONTENT_MISMATCH')
      const bytes = new Uint8Array(job.target.size)
      let offset = 0
      let emptyChunks = 0
      while (true) {
        assertCurrent(job)
        const chunk = await job.reader.read()
        assertCurrent(job)
        if (chunk.done) break
        if (chunk.value.byteLength === 0) {
          if (++emptyChunks > 32) throw failure('READ_FAILED')
          continue
        }
        emptyChunks = 0
        if (chunk.value.byteLength > MAX_IMAGE_ARTIFACT_BYTES - offset) throw failure('TOO_LARGE')
        if (chunk.value.byteLength > job.target.size - offset) throw failure('CONTENT_MISMATCH')
        bytes.set(chunk.value, offset)
        offset += chunk.value.byteLength
      }
      completed = true
      if (offset !== job.target.size) throw failure('CONTENT_MISMATCH')
      const hash = await crypto.subtle.digest('SHA-256', bytes.buffer)
      assertCurrent(job)
      const hex = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
      if (hex !== job.target.id) throw failure('CONTENT_MISMATCH')
      return { artifactId: job.target.id, mime: job.target.mime, bytes }
    } finally {
      if (!completed) await cancelReader(job)
      job.reader?.releaseLock()
      job.reader = null
    }
  }
  function pump() {
    while (active.size < IMAGE_ARTIFACT_CONCURRENCY && queue.length) {
      const job = queue.shift()
      if (!job || job.settled) continue
      active.add(job)
      // Rejected/timeout callers do not free a slot while fetch/read/digest is still in flight.
      void download(job)
        .then(
          (result) => settle(job, result),
          (error: unknown) => settle(job, error instanceof HbarError ? error : failure('READ_FAILED')),
        )
        .finally(() => {
          active.delete(job)
          pump()
        })
        .catch((error: unknown) => settle(job, error instanceof HbarError ? error : failure('READ_FAILED')))
    }
  }
  function read(ref: ArtifactRef, options: ImageArtifactReadOptions = {}): Promise<ImageArtifactBytes> {
    const signal = options.signal
    if (!authority.enabled()) return Promise.reject(failure('DISCONNECTED'))
    if (signal?.aborted) return Promise.reject(failure('CANCELLED'))
    const parsed = artifactSchema.safeParse(ref)
    if (!parsed.success || parsed.data.size < 1) return Promise.reject(failure('INVALID_INPUT'))
    if (!mime(parsed.data.mime)) return Promise.reject(failure('UNSUPPORTED_IMAGE'))
    if (parsed.data.size > MAX_IMAGE_ARTIFACT_BYTES) return Promise.reject(failure('TOO_LARGE'))
    if (active.size >= IMAGE_ARTIFACT_CONCURRENCY && queue.length >= IMAGE_ARTIFACT_QUEUE_LIMIT)
      return Promise.reject(failure('BUSY'))
    const target: ReadTarget = { ...parsed.data, mime: parsed.data.mime }
    return new Promise((resolve, reject) => {
      const controller = new AbortController()
      const onAbort = () => abort(job, 'CANCELLED')
      const timer = setTimeout(() => abort(job, 'TIMEOUT'), IMAGE_ARTIFACT_TIMEOUT_MS)
      const job: Job = {
        target,
        token: authority.token(),
        generation,
        deadline: Date.now() + IMAGE_ARTIFACT_TIMEOUT_MS,
        controller,
        resolve,
        reject,
        cleanup: () => {
          clearTimeout(timer)
          signal?.removeEventListener('abort', onAbort)
        },
        settled: false,
        reader: null,
        cancel: null,
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      queue.push(job)
      pump()
    })
  }
  return {
    read,
    invalidate() {
      generation += 1
      for (const job of [...active, ...queue]) abort(job, 'DISCONNECTED')
    },
  }
}
