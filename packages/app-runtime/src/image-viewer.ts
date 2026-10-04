import { CommandError } from '@hbar/commands'
import { artifactSchema, idSchema, type ArtifactRef } from '@hbar/contracts'
import { z } from 'zod'
import { createState, type StateReader } from './state'

export const IMAGE_VIEWER_MAX_ITEMS = 12
const resourceErrorCodes = [
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
] as const
export type ImageResourceErrorCode = (typeof resourceErrorCodes)[number]

export type ImageViewerSource =
  | { readonly kind: 'draft'; readonly sessionId: string; readonly draftRevision: number }
  | { readonly kind: 'pre-session-draft'; readonly draftId: string; readonly draftRevision: number }
  | { readonly kind: 'message'; readonly sessionId: string; readonly messageId: string; readonly messageSeq: number }

export interface ImageViewerItem {
  /** Original occurrence identity. Never derive this from the filename or content hash. */
  readonly key: string
  readonly artifact: Readonly<ArtifactRef>
}
export interface ImageViewerRequest {
  readonly source: ImageViewerSource
  readonly items: readonly ImageViewerItem[]
  readonly activeKey: string
}
export interface ImageResourceLease {
  /** An opaque, locally created blob URL from the trusted resource adapter. */
  readonly url: string
  readonly width: number
  readonly height: number
  /** Must be idempotent and nonthrowing; the adapter owns actual resource cleanup. */
  release(): void
}
export interface ImageResourcePort {
  acquire(
    artifact: Readonly<ArtifactRef>,
    options: { readonly purpose: 'full' | 'thumbnail'; readonly signal: AbortSignal },
  ): Promise<ImageResourceLease>
}
export interface ImageViewerResource {
  readonly url: string
  readonly width: number
  readonly height: number
}
export type ImageViewerState =
  | { readonly status: 'closed'; readonly request: null; readonly resource: null; readonly error: null }
  | { readonly status: 'loading'; readonly request: ImageViewerRequest; readonly resource: null; readonly error: null }
  | {
      readonly status: 'ready'
      readonly request: ImageViewerRequest
      readonly resource: ImageViewerResource
      readonly error: null
    }
  | {
      readonly status: 'failed'
      readonly request: ImageViewerRequest
      readonly resource: null
      readonly error: ImageResourceErrorCode
    }

export interface ImageViewerOptions {
  readonly resources: ImageResourcePort
  /** Consult canonical membership and active owner. Text-only draft edits may remain current. */
  readonly isCurrent: (request: ImageViewerRequest) => boolean
  readonly onSubscriberError?: (error: unknown) => void
}
export interface ImageViewer {
  readonly reader: StateReader<ImageViewerState>
  open(request: ImageViewerRequest): void
  select(key: string): void
  retry(): void
  /** Report a DOM decode error only for the exact ready snapshot rendered by that element. */
  reportDecodeFailure(expected: ImageViewerState): void
  close(): void
  /** Called by the composition root when canonical source/owner membership changes. */
  revalidate(): void
  dispose(): void
}

const keySchema = z.string().min(1).max(512)
const sourceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('draft'), sessionId: idSchema, draftRevision: z.number().int().nonnegative() }),
  z.strictObject({
    kind: z.literal('pre-session-draft'),
    draftId: z.string().uuid(),
    draftRevision: z.number().int().nonnegative(),
  }),
  z.strictObject({
    kind: z.literal('message'),
    sessionId: idSchema,
    messageId: idSchema,
    messageSeq: z.number().int().positive(),
  }),
])
const requestSchema = z.strictObject({
  source: sourceSchema,
  items: z
    .array(z.strictObject({ key: keySchema, artifact: artifactSchema }))
    .min(1)
    .max(IMAGE_VIEWER_MAX_ITEMS),
  activeKey: keySchema,
})
const closed: ImageViewerState = Object.freeze({ status: 'closed', request: null, resource: null, error: null })

function capture(input: ImageViewerRequest): ImageViewerRequest {
  if (input && Array.isArray(input.items) && input.items.length > IMAGE_VIEWER_MAX_ITEMS)
    throw new CommandError('TOO_LARGE', 'Image gallery exceeds its item capacity')
  const parsed = requestSchema.safeParse(input)
  if (!parsed.success) throw new CommandError('INVALID_INPUT', 'Invalid image gallery target')
  const value = parsed.data
  if (
    new Set(value.items.map((item) => item.key)).size !== value.items.length ||
    !value.items.some((item) => item.key === value.activeKey)
  )
    throw new CommandError('INVALID_INPUT', 'Image occurrences must have unique matching identities')
  return Object.freeze({
    source: Object.freeze(value.source),
    items: Object.freeze(
      value.items.map((item) => Object.freeze({ key: item.key, artifact: Object.freeze(item.artifact) })),
    ),
    activeKey: value.activeKey,
  })
}

function safeCode(error: unknown): ImageResourceErrorCode {
  try {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
    return resourceErrorCodes.find((candidate) => candidate === code) ?? 'READ_FAILED'
  } catch {
    return 'READ_FAILED'
  }
}

function validLease(lease: ImageResourceLease): boolean {
  if (
    !lease ||
    typeof lease.url !== 'string' ||
    !lease.url.trim() ||
    !Number.isSafeInteger(lease.width) ||
    lease.width <= 0 ||
    !Number.isSafeInteger(lease.height) ||
    lease.height <= 0 ||
    typeof lease.release !== 'function'
  )
    return false
  try {
    const url = new URL(lease.url)
    // This is only a protocol guard, not proof of URL origin/authorization.
    // The injected resource adapter must create and own the validated blob.
    return url.protocol === 'blob:' && url.pathname.length > 0
  } catch {
    return false
  }
}

interface Intent {
  readonly generation: number
  readonly request: ImageViewerRequest
}
interface Flight {
  readonly intent: Intent
  readonly controller: AbortController
}

/** One real acquire in flight and one latest intention; no byte cache or write capability. */
export function createImageViewer(options: ImageViewerOptions): ImageViewer {
  const state = createState<ImageViewerState>(closed, (error) => options.onSubscriberError?.(error))
  let disposed = false
  let generation = 0
  let current: Intent | null = null
  let queued: Intent | null = null
  let flight: Flight | null = null
  let lease: ImageResourceLease | null = null

  const assertActive = () => {
    if (disposed) throw new CommandError('DISCONNECTED', 'Image viewer has been disposed')
  }
  const isCurrent = (request: ImageViewerRequest): boolean => {
    try {
      return options.isCurrent(request) === true
    } catch {
      return false
    }
  }
  const release = (resource: ImageResourceLease): void => {
    try {
      resource.release()
    } catch {
      // A throwing cleanup cannot prove the old full resource is gone. Fail
      // closed rather than start another acquire and pretend capacity was freed.
      disposed = true
      current = null
      queued = null
      flight?.controller.abort()
      state.replace(closed)
      state.dispose()
    }
  }
  const releaseCurrent = (): void => {
    const previous = lease
    lease = null
    if (previous) release(previous)
  }
  const close = (): void => {
    generation++
    current = null
    queued = null
    flight?.controller.abort()
    releaseCurrent()
    state.replace(closed)
  }
  const owns = (intent: Intent): boolean => !disposed && current === intent && current.generation === intent.generation
  const fail = (intent: Intent, error: unknown): void => {
    if (!owns(intent)) return
    if (!isCurrent(intent.request)) {
      if (owns(intent)) close()
      return
    }
    if (owns(intent))
      state.replace({ status: 'failed', request: intent.request, resource: null, error: safeCode(error) })
  }
  const run = async (active: Flight): Promise<void> => {
    let received: ImageResourceLease | null = null
    try {
      if (!owns(active.intent)) return
      if (!isCurrent(active.intent.request)) {
        if (owns(active.intent)) close()
        return
      }
      if (!owns(active.intent)) return
      const item = active.intent.request.items.find((candidate) => candidate.key === active.intent.request.activeKey)
      if (!item) throw new CommandError('INVALID_INPUT', 'The selected image occurrence is unavailable')
      received = await options.resources.acquire(item.artifact, { purpose: 'full', signal: active.controller.signal })
      if (!owns(active.intent)) return
      if (!isCurrent(active.intent.request)) {
        if (owns(active.intent)) close()
        return
      }
      if (!owns(active.intent)) return
      if (!validLease(received)) throw new CommandError('INVALID_IMAGE', 'Image resource metadata is invalid')
      const resource = { url: received.url, width: received.width, height: received.height }
      lease = received
      received = null
      state.replace({ status: 'ready', request: active.intent.request, resource, error: null })
    } catch (error) {
      if (received) {
        release(received)
        received = null
      }
      fail(active.intent, error)
    } finally {
      if (received) release(received)
      if (flight === active) flight = null
      pump()
    }
  }
  const pump = (): void => {
    if (disposed || flight || !queued) return
    const intent = queued
    queued = null
    const active = { intent, controller: new AbortController() }
    flight = active
    // run contains all error/cleanup paths and does not release its actual slot
    // on Abort alone. A noncooperative acquire keeps the slot until it settles.
    void run(active)
  }
  const begin = (request: ImageViewerRequest): void => {
    const previousGeneration = generation
    if (!isCurrent(request)) {
      if (generation === previousGeneration) close()
      return
    }
    if (disposed || generation !== previousGeneration) return
    const intent = { generation: ++generation, request }
    current = intent
    queued = intent
    flight?.controller.abort()
    releaseCurrent()
    if (!owns(intent)) return
    state.replace({ status: 'loading', request, resource: null, error: null })
    pump()
  }
  return {
    reader: state.reader,
    open(request) {
      assertActive()
      begin(capture(request))
    },
    select(key) {
      assertActive()
      const original = current
      if (!original) throw new CommandError('INVALID_INPUT', 'No image gallery is open')
      if (!isCurrent(original.request)) {
        if (owns(original)) close()
        return
      }
      if (owns(original)) begin(capture({ ...original.request, activeKey: key }))
    },
    retry() {
      assertActive()
      const original = current
      if (!original) throw new CommandError('INVALID_INPUT', 'No failed image is available')
      if (!isCurrent(original.request)) {
        if (owns(original)) close()
        return
      }
      if (!owns(original)) return
      if (state.reader.getSnapshot().status !== 'failed')
        throw new CommandError('INVALID_INPUT', 'Only a failed image read can be retried')
      begin(original.request)
    },
    close,
    reportDecodeFailure(expected) {
      const original = current
      if (disposed || !original || expected.status !== 'ready' || state.reader.getSnapshot() !== expected) return
      if (!isCurrent(original.request)) {
        if (owns(original)) close()
        return
      }
      if (!owns(original) || state.reader.getSnapshot() !== expected) return
      releaseCurrent()
      if (owns(original) && state.reader.getSnapshot() === expected)
        state.replace({ status: 'failed', request: original.request, resource: null, error: 'DECODE_FAILED' })
    },
    revalidate() {
      const original = current
      if (!disposed && original && !isCurrent(original.request) && owns(original)) close()
    },
    dispose() {
      if (disposed) return
      disposed = true
      close()
      state.dispose()
    },
  }
}
