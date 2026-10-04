import { HbarError, artifactSchema, type ArtifactRef } from '@hbar/contracts'
import type { ImageResourceLease, ImageResourcePort } from '@hbar/app-runtime'
import type { ImageArtifactBytes } from '@hbar/client'
import { preflightImage, type ImagePreflight } from './image-preflight'

export const IMAGE_RESOURCE_TIMEOUT_MS = 30_000
export const IMAGE_RESOURCE_QUEUE_LIMIT = 24
export const IMAGE_THUMBNAIL_LIMIT = 24
export const IMAGE_THUMBNAIL_EDGE = 256
export const IMAGE_THUMBNAIL_MAX_BYTES = 512 * 1024
export const IMAGE_THUMBNAILS_MAX_BYTES = 8 * 1024 * 1024

export type ImageResourcePurpose = 'full' | 'thumbnail'

export interface DecodedImageResource {
  readonly width: number
  readonly height: number
  /** Required only for a thumbnail. Full images retain their verified original animation bytes. */
  readonly thumbnail?: Blob | undefined
}

export interface ImageResourceEnvironment {
  readImageArtifact(ref: ArtifactRef, options: { signal: AbortSignal }): Promise<ImageArtifactBytes>
  decode(
    blob: Blob,
    metadata: ImagePreflight,
    purpose: ImageResourcePurpose,
    signal: AbortSignal,
  ): Promise<DecodedImageResource>
  createObjectURL(blob: Blob): string
  revokeObjectURL(url: string): void
  now(): number
  setTimer(callback: () => void, milliseconds: number): unknown
  clearTimer(timer: unknown): void
}

export interface BrowserImageResources extends ImageResourcePort {
  /** Pairing/Host identity boundaries revoke every local URL as well as queued/in-flight reads. */
  invalidate(): void
  dispose(): void
}

interface ImageJob {
  readonly ref: ArtifactRef
  readonly purpose: ImageResourcePurpose
  readonly generation: number
  readonly deadline: number
  readonly abort: AbortController
  readonly resolve: (lease: ImageResourceLease) => void
  readonly reject: (error: unknown) => void
  settled: boolean
  cleanup(): void
}

interface RetainedImage {
  readonly purpose: ImageResourcePurpose
  readonly bytes: number
  release(): void
}

function failure(code: string): HbarError {
  return new HbarError(code, 'Image resource is unavailable')
}

/**
 * Browser-only ephemeral resources, never part of persisted app state. One actual
 * read/decode pipeline is active; cancellation does not free that slot until its
 * underlying promise settles. The native decoder terminates its dedicated Worker.
 * This bounds application-owned resources, not browser/GPU process RSS.
 */
export function createImageResourceController(environment: ImageResourceEnvironment): BrowserImageResources {
  const queued: ImageJob[] = []
  const retained = new Set<RetainedImage>()
  let active: ImageJob | undefined
  let generation = 0
  let disposed = false
  let thumbnailBytes = 0
  let thumbnailCount = 0
  let fullCount = 0

  const settleFailure = (job: ImageJob, error: unknown): void => {
    if (job.settled) return
    job.settled = true
    job.cleanup()
    job.reject(error)
  }
  const cancel = (job: ImageJob, code: string): void => {
    job.abort.abort()
    const index = queued.indexOf(job)
    if (index !== -1) queued.splice(index, 1)
    settleFailure(job, failure(code))
  }
  const assertCurrent = (job: ImageJob): void => {
    if (disposed || job.generation !== generation) throw failure('DISCONNECTED')
    if (job.settled || job.abort.signal.aborted) throw failure('CANCELLED')
    if (environment.now() >= job.deadline) throw failure('TIMEOUT')
  }
  const hasCapacity = (purpose: ImageResourcePurpose): boolean =>
    purpose === 'full' ? fullCount === 0 : thumbnailCount < IMAGE_THUMBNAIL_LIMIT

  const retain = (blob: Blob, decoded: DecodedImageResource, purpose: ImageResourcePurpose): ImageResourceLease => {
    if (!hasCapacity(purpose)) throw failure('BUSY')
    if (
      purpose === 'thumbnail' &&
      (blob.type !== 'image/png' ||
        blob.size < 1 ||
        blob.size > IMAGE_THUMBNAIL_MAX_BYTES ||
        thumbnailBytes + blob.size > IMAGE_THUMBNAILS_MAX_BYTES ||
        decoded.width > IMAGE_THUMBNAIL_EDGE ||
        decoded.height > IMAGE_THUMBNAIL_EDGE)
    )
      throw failure('TOO_LARGE')
    if (
      !Number.isSafeInteger(decoded.width) ||
      !Number.isSafeInteger(decoded.height) ||
      decoded.width < 1 ||
      decoded.height < 1
    )
      throw failure('DECODE_FAILED')
    const url = environment.createObjectURL(blob)
    let released = false
    const entry: RetainedImage = {
      purpose,
      bytes: blob.size,
      release() {
        if (released) return
        released = true
        retained.delete(entry)
        if (purpose === 'full') fullCount -= 1
        else {
          thumbnailCount -= 1
          thumbnailBytes -= entry.bytes
        }
        environment.revokeObjectURL(url)
      },
    }
    if (purpose === 'full') fullCount += 1
    else {
      thumbnailCount += 1
      thumbnailBytes += blob.size
    }
    retained.add(entry)
    return Object.freeze({ url, width: decoded.width, height: decoded.height, release: entry.release })
  }

  const perform = async (job: ImageJob): Promise<void> => {
    try {
      assertCurrent(job)
      if (!hasCapacity(job.purpose)) throw failure('BUSY')
      const result = await environment.readImageArtifact(job.ref, { signal: job.abort.signal })
      assertCurrent(job)
      if (result.artifactId !== job.ref.id || result.mime !== job.ref.mime || result.bytes.byteLength !== job.ref.size)
        throw failure('CONTENT_MISMATCH')
      const metadata = preflightImage(result.bytes, result.mime)
      // Construct a private, correctly typed buffer; never expose credentials or an artifact URL to DOM.
      const blob = new Blob([new Uint8Array(result.bytes)], { type: result.mime })
      const decoded = await environment.decode(blob, metadata, job.purpose, job.abort.signal)
      assertCurrent(job)
      const material = job.purpose === 'full' ? blob : decoded.thumbnail
      if (!material) throw failure('DECODE_FAILED')
      if (
        job.purpose === 'full' &&
        !(
          (decoded.width === metadata.width && decoded.height === metadata.height) ||
          (decoded.width === metadata.height && decoded.height === metadata.width)
        )
      )
        throw failure('CONTENT_MISMATCH')
      const lease = retain(material, decoded, job.purpose)
      job.settled = true
      job.cleanup()
      job.resolve(lease)
    } catch (error) {
      settleFailure(job, error)
    } finally {
      active = undefined
      pump()
    }
  }
  const pump = (): void => {
    if (active || disposed) return
    const next = queued.shift()
    if (!next) return
    active = next
    // perform catches operation failures before settling the owned slot.
    perform(next).catch((error: unknown) => settleFailure(next, error))
  }

  const invalidate = (): void => {
    generation += 1
    for (const job of [...queued]) cancel(job, 'DISCONNECTED')
    if (active) cancel(active, 'DISCONNECTED')
    for (const entry of [...retained]) entry.release()
  }

  return {
    acquire(ref, { purpose, signal }) {
      if (disposed) return Promise.reject(failure('DISCONNECTED'))
      if (signal.aborted) return Promise.reject(failure('CANCELLED'))
      const parsed = artifactSchema.safeParse(ref)
      if (!parsed.success) return Promise.reject(failure('INVALID_INPUT'))
      if (!hasCapacity(purpose) || queued.length >= IMAGE_RESOURCE_QUEUE_LIMIT) return Promise.reject(failure('BUSY'))
      return new Promise<ImageResourceLease>((resolve, reject) => {
        const job: ImageJob = {
          ref: parsed.data,
          purpose,
          generation,
          deadline: environment.now() + IMAGE_RESOURCE_TIMEOUT_MS,
          abort: new AbortController(),
          resolve,
          reject,
          settled: false,
          cleanup: () => undefined,
        }
        const abort = (): void => cancel(job, 'CANCELLED')
        const timer = environment.setTimer(() => cancel(job, 'TIMEOUT'), IMAGE_RESOURCE_TIMEOUT_MS)
        job.cleanup = () => {
          environment.clearTimer(timer)
          signal.removeEventListener('abort', abort)
        }
        signal.addEventListener('abort', abort, { once: true })
        // User-triggered full reads precede still-waiting thumbnail work; no active read is duplicated.
        if (purpose === 'full') queued.unshift(job)
        else queued.push(job)
        pump()
      })
    },
    invalidate,
    dispose() {
      if (disposed) return
      disposed = true
      invalidate()
    },
  }
}
