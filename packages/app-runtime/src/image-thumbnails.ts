import { CommandError } from '@hbar/commands'
import { artifactSchema } from '@hbar/contracts'
import { z } from 'zod'
import type {
  ImageResourceErrorCode,
  ImageResourceLease,
  ImageResourcePort,
  ImageViewerItem,
  ImageViewerResource,
} from './image-viewer'
import { createState, type StateReader } from './state'

export const IMAGE_THUMBNAILS_MAX_ITEMS = 12
export interface ImageThumbnailsRequest {
  /** Opaque Host/session/collection identity, never a credential. Caption/text revisions need not change it. */
  readonly sourceId: string
  readonly items: readonly ImageViewerItem[]
}
export interface ImageThumbnailState extends ImageViewerItem {
  readonly status: 'idle' | 'loading' | 'ready' | 'failed'
  readonly resource: ImageViewerResource | null
  readonly error: ImageResourceErrorCode | null
}
export interface ImageThumbnailsState {
  readonly active: boolean
  readonly sourceId: string | null
  readonly items: readonly ImageThumbnailState[]
}
export interface ImageThumbnailsOptions {
  readonly resources: ImageResourcePort
  /** Validate current canonical membership. Must not infer membership from caption or content hash alone. */
  readonly isCurrent: (request: ImageThumbnailsRequest) => boolean
  readonly onSubscriberError?: (error: unknown) => void
}
export interface ImageThumbnails {
  readonly reader: StateReader<ImageThumbnailsState>
  /** Only call for a mounted, visible collection. This owner never discovers timeline items itself. */
  activate(request: ImageThumbnailsRequest): void
  deactivate(): void
  retry(key: string): void
  revalidate(): void
  dispose(): void
}

const requestSchema = z.strictObject({
  sourceId: z.string().min(1).max(512),
  items: z
    .array(z.strictObject({ key: z.string().min(1).max(512), artifact: artifactSchema }))
    .min(1)
    .max(IMAGE_THUMBNAILS_MAX_ITEMS),
})
const inactive: ImageThumbnailsState = Object.freeze({ active: false, sourceId: null, items: Object.freeze([]) })
const codes: readonly ImageResourceErrorCode[] = [
  'INVALID_INPUT',
  'UNSUPPORTED_IMAGE',
  'TOO_LARGE',
  'BUSY',
  'CANCELLED',
  'TIMEOUT',
  'UNAUTHORIZED',
  'NOT_FOUND',
  'READ_FAILED',
  'CONTENT_MISMATCH',
  'DISCONNECTED',
  'INVALID_IMAGE',
  'DECODE_FAILED',
  'UNAVAILABLE',
]
function safeCode(error: unknown): ImageResourceErrorCode {
  try {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
    return codes.find((value) => value === code) ?? 'READ_FAILED'
  } catch {
    return 'READ_FAILED'
  }
}
function capture(input: ImageThumbnailsRequest): ImageThumbnailsRequest {
  if (input && Array.isArray(input.items) && input.items.length > IMAGE_THUMBNAILS_MAX_ITEMS)
    throw new CommandError('TOO_LARGE', 'Thumbnail collection exceeds capacity')
  const parsed = requestSchema.safeParse(input)
  if (!parsed.success || new Set(parsed.data.items.map((item) => item.key)).size !== parsed.data.items.length)
    throw new CommandError('INVALID_INPUT', 'Invalid thumbnail collection')
  return Object.freeze({
    sourceId: parsed.data.sourceId,
    items: Object.freeze(
      parsed.data.items.map((item) => Object.freeze({ key: item.key, artifact: Object.freeze(item.artifact) })),
    ),
  })
}
function sameResource(left: ImageViewerItem, right: ImageViewerItem) {
  return (
    left.key === right.key &&
    left.artifact.id === right.artifact.id &&
    left.artifact.mime === right.artifact.mime &&
    left.artifact.size === right.artifact.size
  )
}
function validLease(lease: ImageResourceLease) {
  if (
    !lease ||
    typeof lease.release !== 'function' ||
    !Number.isSafeInteger(lease.width) ||
    lease.width <= 0 ||
    !Number.isSafeInteger(lease.height) ||
    lease.height <= 0
  )
    return false
  try {
    const url = new URL(lease.url)
    return url.protocol === 'blob:' && url.pathname.length > 0
  } catch {
    return false
  }
}
interface RecordEntry {
  view: ImageThumbnailState
  lease: ImageResourceLease | null
}
interface Collection {
  readonly request: ImageThumbnailsRequest
  readonly records: readonly RecordEntry[]
}
interface Flight {
  readonly record: RecordEntry
  readonly controller: AbortController
}

/** One real acquire and one current bounded collection; leases/bytes never enter the state reader. */
export function createImageThumbnails(options: ImageThumbnailsOptions): ImageThumbnails {
  const state = createState<ImageThumbnailsState>(inactive, (error) => {
    try {
      options.onSubscriberError?.(error)
    } catch {
      // A diagnostic callback must not become an acquisition or publication side effect.
    }
  })
  let current: Collection | null = null
  let flight: Flight | null = null
  let disposed = false
  let revision = 0
  const owns = (record: RecordEntry) => !disposed && current?.records.includes(record) === true
  const allowed = (request: ImageThumbnailsRequest) => {
    try {
      return options.isCurrent(request) === true
    } catch {
      return false
    }
  }
  const publish = () => {
    const next = current
    if (disposed) return
    if (!next) {
      if (state.reader.getSnapshot() !== inactive) state.replace(inactive)
      return
    }
    const previous = state.reader.getSnapshot()
    const items = next.records.map((record) => record.view)
    if (
      previous.active &&
      previous.sourceId === next.request.sourceId &&
      previous.items.length === items.length &&
      items.every((item, index) => previous.items[index] === item)
    )
      return
    state.replace({ active: true, sourceId: next.request.sourceId, items })
  }
  const release = (lease: ImageResourceLease) => {
    try {
      lease.release()
    } catch {
      // An unproven cleanup cannot free capacity. Stop this owner rather than issuing more reads.
      dispose()
    }
  }
  const releaseRecord = (record: RecordEntry) => {
    const lease = record.lease
    record.lease = null
    if (lease) release(lease)
  }
  const deactivate = () => {
    revision++
    const old = current
    current = null
    flight?.controller.abort()
    for (const record of old?.records ?? []) releaseRecord(record)
    publish()
  }
  const dispose = () => {
    if (disposed) return
    disposed = true
    deactivate()
    state.replace(inactive)
    state.dispose()
  }
  const validate = (): boolean => {
    const context = current
    if (!context || disposed) return false
    const valid = allowed(context.request)
    if (context !== current || disposed) return false
    if (!valid) deactivate()
    return valid
  }
  const run = async (active: Flight) => {
    let received: ImageResourceLease | null = null
    try {
      if (!owns(active.record) || !validate() || !owns(active.record)) return
      received = await options.resources.acquire(active.record.view.artifact, {
        purpose: 'thumbnail',
        signal: active.controller.signal,
      })
      if (!owns(active.record) || !validate() || !owns(active.record)) return
      if (!validLease(received)) throw new CommandError('INVALID_IMAGE', 'Invalid thumbnail resource')
      active.record.lease = received
      active.record.view = {
        ...active.record.view,
        status: 'ready',
        resource: { url: received.url, width: received.width, height: received.height },
        error: null,
      }
      received = null
      publish()
    } catch (error) {
      if (received) {
        release(received)
        received = null
      }
      if (owns(active.record) && validate() && owns(active.record)) {
        active.record.view = { ...active.record.view, status: 'failed', resource: null, error: safeCode(error) }
        publish()
      }
    } finally {
      if (received) release(received)
      // A reentrant validation callback may replace the collection while retaining this occurrence.
      if (owns(active.record) && active.record.view.status === 'loading')
        active.record.view = { ...active.record.view, status: 'idle' }
      if (flight === active) flight = null
      pump()
    }
  }
  const pump = () => {
    if (flight || !validate()) return
    const record = current?.records.find((entry) => entry.view.status === 'idle')
    if (!record) return
    const active = { record, controller: new AbortController() }
    flight = active
    record.view = { ...record.view, status: 'loading' }
    publish()
    void run(active).catch(() => dispose())
  }
  return {
    reader: state.reader,
    activate(input) {
      if (disposed) throw new CommandError('DISCONNECTED', 'Thumbnail owner is disposed')
      const request = capture(input)
      const before = revision
      const valid = allowed(request)
      if (disposed || revision !== before) return
      if (!valid) {
        deactivate()
        return
      }
      const old = current
      const records = request.items.map((item) => {
        const retained =
          old?.request.sourceId === request.sourceId
            ? old.records.find((record) => sameResource(record.view, item))
            : undefined
        if (!retained) return { view: { ...item, status: 'idle' as const, resource: null, error: null }, lease: null }
        if (retained.view.artifact.name !== item.artifact.name)
          retained.view = { ...retained.view, artifact: item.artifact }
        return retained
      })
      revision++
      current = { request, records }
      if (flight && !records.includes(flight.record)) flight.controller.abort()
      for (const record of old?.records ?? []) if (!records.includes(record)) releaseRecord(record)
      publish()
      pump()
    },
    deactivate,
    retry(key) {
      if (disposed) throw new CommandError('DISCONNECTED', 'Thumbnail owner is disposed')
      if (!validate()) return
      const record = current?.records.find((entry) => entry.view.key === key)
      if (!record || record.view.status !== 'failed')
        throw new CommandError('INVALID_INPUT', 'Only failed thumbnails may be retried')
      record.view = { ...record.view, status: 'idle', error: null }
      publish()
      pump()
    },
    revalidate() {
      validate()
    },
    dispose,
  }
}
