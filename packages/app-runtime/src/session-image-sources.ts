import { CommandError } from '@hbar/commands'
import { artifactSchema, idSchema, type ArtifactRef, type Message } from '@hbar/contracts'
import type { PreSessionDraftState } from '@hbar/contracts/commands/pre-session-draft'
import { z } from 'zod'
import {
  IMAGE_VIEWER_MAX_ITEMS,
  type ImageViewerItem,
  type ImageViewerRequest,
  type ImageViewerSource,
} from './image-viewer'
import type { SessionDraftState, SessionTimelineState } from './types'

export type SessionImageDraft = Pick<SessionDraftState, 'sessionId' | 'revision' | 'attachments'>
export type SessionImageMessage = Pick<Readonly<Message>, 'id' | 'sessionId' | 'seq' | 'content'>
export type SessionImageTimeline = Pick<SessionTimelineState, 'sessionId' | 'messages'>
export type PreSessionImageDraft = Pick<PreSessionDraftState, 'draftId' | 'revision' | 'attachments'>

export interface SessionImageProjection {
  /** Opaque Host/owner/collection identity; never pass an endpoint, token or credential as the Host identity. */
  readonly sourceId: string
  /**
   * All canonical image occurrences, including an over-capacity collection.
   * This is a projection, not permission to open: only open when capacity.exceeded is false.
   * createImageViewer independently enforces its capacity and current membership.
   */
  readonly request: ImageViewerRequest
  readonly capacity: { readonly count: number; readonly limit: number; readonly exceeded: boolean }
}
export type PreSessionImageProjection = SessionImageProjection
export interface SessionImageDraftInput {
  /** The confirmed Host's opaque identity. Connection-generation lifetime fencing belongs to the resource owner. */
  readonly hostIdentity: string
  readonly draft: SessionImageDraft
  /** Zero-based occurrence among image attachments, not the absolute attachment index. */
  readonly activeOrdinal?: number
}
export interface PreSessionDraftImageInput {
  /** The confirmed Host's opaque identity. Connection-generation lifetime fencing belongs to the resource owner. */
  readonly hostIdentity: string
  readonly draft: PreSessionImageDraft
  /** Zero-based occurrence among image attachments, not the absolute attachment index. */
  readonly activeOrdinal?: number
}
export interface SessionImageMessageInput {
  readonly hostIdentity: string
  readonly message: SessionImageMessage
  /** Zero-based occurrence among image blocks; text and tool blocks never shift it. */
  readonly activeOrdinal?: number
}
export interface SessionImageMembership {
  readonly activeSessionId: string | null
  readonly draft: SessionImageDraft | null | undefined
  readonly timeline: SessionImageTimeline | null | undefined
}
export interface PreSessionImageMembership {
  /** The active pre-session owner; callers set null while a real Session is active. */
  readonly activeDraftId: string | null
  readonly draft: PreSessionImageDraft | null | undefined
}

function invalid(): never {
  throw new CommandError('INVALID_INPUT', 'Invalid canonical image source')
}
function validId(value: string): boolean {
  return idSchema.safeParse(value).success
}
function integer(value: number, minimum: number): boolean {
  return Number.isSafeInteger(value) && value >= minimum
}
const atom = (value: string) => `${value.length}:${value}`
const preSessionDraftIdSchema = z.string().uuid()

function collectionId(hostIdentity: string, source: ImageViewerSource): string {
  if (typeof hostIdentity !== 'string' || !hostIdentity.trim() || hostIdentity.length > 128) invalid()
  if (source.kind === 'pre-session-draft') {
    const value = `pre-session-images:1:${atom(hostIdentity)}${atom(source.draftId)}draft`
    if (value.length > 512) invalid()
    return value
  }
  const collection =
    source.kind === 'draft' ? 'draft' : `message${atom(source.messageId)}${atom(String(source.messageSeq))}`
  const value = `session-images:1:${atom(hostIdentity)}${atom(source.sessionId)}${atom(collection)}`
  if (value.length > 512) invalid()
  return value
}
function occurrenceKey(source: ImageViewerSource, ordinal: number): string {
  if (source.kind === 'pre-session-draft') return `pre-session-draft-image:1:${ordinal}`
  return source.kind === 'draft'
    ? `draft-image:1:${ordinal}`
    : `message-image:1:${atom(source.messageId)}${atom(String(source.messageSeq))}${ordinal}`
}
function captureItem(source: ImageViewerSource, artifact: Readonly<ArtifactRef>, ordinal: number): ImageViewerItem {
  const parsed = artifactSchema.safeParse(artifact)
  if (!parsed.success) invalid()
  return Object.freeze({ key: occurrenceKey(source, ordinal), artifact: Object.freeze(parsed.data) })
}
function project(
  hostIdentity: string,
  source: ImageViewerSource,
  artifacts: readonly Readonly<ArtifactRef>[],
  activeOrdinal: number,
): SessionImageProjection | null {
  const sourceId = collectionId(hostIdentity, source)
  if (!integer(activeOrdinal, 0)) invalid()
  if (!artifacts.length) {
    if (activeOrdinal !== 0) invalid()
    return null
  }
  const items = Object.freeze(artifacts.map((artifact, ordinal) => captureItem(source, artifact, ordinal)))
  const active = items[activeOrdinal]
  if (!active) invalid()
  return Object.freeze({
    sourceId,
    request: Object.freeze({ source: Object.freeze(source), items, activeKey: active.key }),
    capacity: Object.freeze({
      count: items.length,
      limit: IMAGE_VIEWER_MAX_ITEMS,
      exceeded: items.length > IMAGE_VIEWER_MAX_ITEMS,
    }),
  })
}
function draftArtifacts(draft: SessionImageDraft): readonly Readonly<ArtifactRef>[] {
  // Reservations, uploads and unaccepted confirmed transfers are deliberately not membership.
  return draft.attachments.flatMap((attachment) => (attachment.kind === 'image' ? [attachment.artifact] : []))
}
function preSessionDraftArtifacts(draft: PreSessionImageDraft): readonly Readonly<ArtifactRef>[] {
  // Only accepted draft attachments are canonical; reservations and in-flight transfers are not membership.
  return draft.attachments.flatMap((attachment) => (attachment.kind === 'image' ? [attachment.artifact] : []))
}
function messageArtifacts(message: SessionImageMessage): readonly Readonly<ArtifactRef>[] {
  return message.content.flatMap((block) => (block.type === 'image' ? [block.artifact] : []))
}

/** Project confirmed draft attachments only; text/mention revisions are not collection identity. */
export function projectSessionDraftImages(input: SessionImageDraftInput): SessionImageProjection | null {
  if (!validId(input.draft.sessionId) || !integer(input.draft.revision, 0)) invalid()
  return project(
    input.hostIdentity,
    { kind: 'draft', sessionId: input.draft.sessionId, draftRevision: input.draft.revision },
    draftArtifacts(input.draft),
    input.activeOrdinal ?? 0,
  )
}

/** Project confirmed no-tab draft attachments without manufacturing a Session identity. */
export function projectPreSessionDraftImages(input: PreSessionDraftImageInput): PreSessionImageProjection | null {
  const parsedDraftId = preSessionDraftIdSchema.safeParse(input.draft.draftId)
  if (!parsedDraftId.success || !integer(input.draft.revision, 0)) invalid()
  return project(
    input.hostIdentity,
    { kind: 'pre-session-draft', draftId: parsedDraftId.data, draftRevision: input.draft.revision },
    preSessionDraftArtifacts(input.draft),
    input.activeOrdinal ?? 0,
  )
}

/** Project canonical message image blocks. Tool-result details and provider-private payloads are not sources. */
export function projectSessionMessageImages(input: SessionImageMessageInput): SessionImageProjection | null {
  if (!validId(input.message.sessionId) || !validId(input.message.id) || !integer(input.message.seq, 1)) invalid()
  return project(
    input.hostIdentity,
    { kind: 'message', sessionId: input.message.sessionId, messageId: input.message.id, messageSeq: input.message.seq },
    messageArtifacts(input.message),
    input.activeOrdinal ?? 0,
  )
}

function sameArtifact(left: Readonly<ArtifactRef>, right: Readonly<ArtifactRef>): boolean {
  return left.id === right.id && left.mime === right.mime && left.size === right.size && left.name === right.name
}
function sameOccurrences(request: ImageViewerRequest, artifacts: readonly Readonly<ArtifactRef>[]): boolean {
  if (!artifacts.length || artifacts.length !== request.items.length) return false
  let foundActive = false
  for (let ordinal = 0; ordinal < artifacts.length; ordinal++) {
    const original = artifacts[ordinal]
    const item = request.items[ordinal]
    if (
      !original ||
      !item ||
      item.key !== occurrenceKey(request.source, ordinal) ||
      !sameArtifact(item.artifact, original)
    )
      return false
    if (item.key === request.activeKey) foundActive = true
  }
  return foundActive
}

/**
 * Membership proof relative to the injected canonical runtime facts, not a server ACL or Host proof.
 * The composition root must replace/dispose resource owners when Host/connection identity changes.
 * Archived, offline and failed-Run history remains readable; no execution-preparation guard applies.
 */
export function isSessionImageRequestCurrent(request: ImageViewerRequest, current: SessionImageMembership): boolean {
  const source = request.source
  if (source.kind === 'pre-session-draft') return false
  if (!validId(source.sessionId) || current.activeSessionId !== source.sessionId) return false
  if (source.kind === 'draft') {
    const draft = current.draft
    return Boolean(
      draft &&
      draft.sessionId === source.sessionId &&
      integer(source.draftRevision, 0) &&
      integer(draft.revision, 0) &&
      source.draftRevision <= draft.revision &&
      sameOccurrences(request, draftArtifacts(draft)),
    )
  }
  const timeline = current.timeline
  if (
    !timeline ||
    timeline.sessionId !== source.sessionId ||
    !validId(source.messageId) ||
    !integer(source.messageSeq, 1)
  )
    return false
  const matching = timeline.messages.filter((message) => message.id === source.messageId)
  const message = matching[0]
  if (matching.length !== 1 || !message || message.sessionId !== source.sessionId || message.seq !== source.messageSeq)
    return false
  return sameOccurrences(request, messageArtifacts(message))
}

/**
 * Membership proof for a real pre-session draft owner. Reservations and unaccepted transfers
 * are not image sources; a newer text-only revision may keep the captured image list current.
 */
export function containsPreSessionDraftImages(
  request: ImageViewerRequest,
  draft: PreSessionImageDraft | null | undefined,
): boolean {
  const source = request.source
  if (
    source.kind !== 'pre-session-draft' ||
    !preSessionDraftIdSchema.safeParse(source.draftId).success ||
    !draft ||
    draft.draftId !== source.draftId ||
    !integer(source.draftRevision, 0) ||
    !integer(draft.revision, 0) ||
    source.draftRevision > draft.revision
  )
    return false
  return sameOccurrences(request, preSessionDraftArtifacts(draft))
}

/** Validate both the selected no-tab owner and its exact current confirmed image occurrences. */
export function isPreSessionImageRequestCurrent(
  request: ImageViewerRequest,
  current: PreSessionImageMembership,
): boolean {
  const source = request.source
  return Boolean(
    source.kind === 'pre-session-draft' &&
    preSessionDraftIdSchema.safeParse(source.draftId).success &&
    current.activeDraftId === source.draftId &&
    current.draft?.draftId === source.draftId &&
    containsPreSessionDraftImages(request, current.draft),
  )
}
