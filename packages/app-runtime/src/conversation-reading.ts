import { CommandError } from '@hbar/commands'
import { createState, type StateReader } from './state'

/** The maximum number of per-session reading anchors retained by one runtime. */
export const CONVERSATION_READING_MAX_ANCHORS = 128
/** Bounds every opaque identity before it becomes part of the ephemeral cache key. */
export const CONVERSATION_READING_MAX_ID_LENGTH = 512
/** Bounds geometry supplied by a rendered viewport without storing the viewport itself. */
export const CONVERSATION_READING_MAX_MESSAGE_OFFSET = 10_000_000

export interface ConversationReadingTarget {
  readonly workspaceId: string
  readonly sessionId: string
  readonly sourceTabInstanceKey: string
}

export interface ConversationReadingPosition {
  readonly messageId: string | null
  readonly messageOffset: number
  readonly atEnd: boolean
}

export interface ConversationReadingEntry {
  readonly target: ConversationReadingTarget
  readonly position: ConversationReadingPosition
}

export interface ConversationReadingState {
  /** Entries are ordered from least recently remembered to most recently remembered. */
  readonly anchors: readonly ConversationReadingEntry[]
}

export interface ConversationReading {
  readonly reader: StateReader<ConversationReadingState>
  readonly navigation: StateReader<ConversationReadingNavigation>
  navigate(
    target: ConversationReadingTarget,
    position: ConversationReadingPosition,
    callId?: string | null,
    query?: string | null,
  ): void
  acknowledge(target: ConversationReadingTarget, revision: number): void
  read(target: ConversationReadingTarget): ConversationReadingPosition | null
  remember(target: ConversationReadingTarget, position: ConversationReadingPosition): void
  retainTargets(targets: readonly ConversationReadingTarget[]): void
  dispose(): void
}

export interface ConversationReadingNavigation {
  readonly revision: number
  readonly request: {
    readonly target: ConversationReadingTarget
    readonly position: ConversationReadingPosition
    readonly callId: string | null
    readonly query: string | null
  } | null
}

const emptyState: ConversationReadingState = Object.freeze({ anchors: Object.freeze([]) })

function invalidInput(detail: string): CommandError {
  return new CommandError('INVALID_INPUT', detail)
}

function validateId(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > CONVERSATION_READING_MAX_ID_LENGTH)
    throw invalidInput(`Conversation reading ${field} is invalid`)
}

function validateTarget(value: unknown): asserts value is ConversationReadingTarget {
  if (!value || typeof value !== 'object') throw invalidInput('Conversation reading target is invalid')
  const target = value as Partial<ConversationReadingTarget>
  validateId(target.workspaceId, 'workspace')
  validateId(target.sessionId, 'session')
  validateId(target.sourceTabInstanceKey, 'source tab')
}

function validatePosition(value: unknown): asserts value is ConversationReadingPosition {
  if (!value || typeof value !== 'object') throw invalidInput('Conversation reading position is invalid')
  const position = value as Partial<ConversationReadingPosition>
  if (position.messageId !== null) validateId(position.messageId, 'message')
  if (
    typeof position.messageOffset !== 'number' ||
    !Number.isFinite(position.messageOffset) ||
    Math.abs(position.messageOffset) > CONVERSATION_READING_MAX_MESSAGE_OFFSET
  )
    throw invalidInput('Conversation reading message offset is invalid')
  if (typeof position.atEnd !== 'boolean') throw invalidInput('Conversation reading end state is invalid')
}

function keyOf(target: ConversationReadingTarget): string {
  return JSON.stringify([target.workspaceId, target.sessionId, target.sourceTabInstanceKey])
}

function samePosition(left: ConversationReadingPosition, right: ConversationReadingPosition): boolean {
  return left.messageId === right.messageId && left.messageOffset === right.messageOffset && left.atEnd === right.atEnd
}

function sameTarget(left: ConversationReadingTarget, right: ConversationReadingTarget): boolean {
  return (
    left.workspaceId === right.workspaceId &&
    left.sessionId === right.sessionId &&
    left.sourceTabInstanceKey === right.sourceTabInstanceKey
  )
}

/**
 * Runtime-owned reading geometry. This intentionally contains no transcript,
 * DOM node, scrollTop, workspace path, or persisted preference.
 */
export function createConversationReading(onSubscriberError: (error: unknown) => void): ConversationReading {
  const state = createState<ConversationReadingState>(emptyState, onSubscriberError)
  const navigation = createState<ConversationReadingNavigation>({ revision: 0, request: null }, onSubscriberError)
  const entries = new Map<string, ConversationReadingEntry>()
  let disposed = false

  const publish = () => {
    if (disposed) return
    const anchors = [...entries.values()]
    const previous = state.reader.getSnapshot().anchors
    if (
      previous.length === anchors.length &&
      anchors.every(
        (entry, index) =>
          entry === previous[index] ||
          (previous[index] !== undefined &&
            sameTarget(previous[index].target, entry.target) &&
            samePosition(previous[index].position, entry.position)),
      )
    )
      return
    state.replace({ anchors })
  }

  const read = (target: ConversationReadingTarget): ConversationReadingPosition | null => {
    if (disposed) return null
    validateTarget(target)
    const key = keyOf(target)
    const entry = entries.get(key)
    if (!entry) return null
    // Reads are pure so a View can safely call this from render/useMemo. LRU
    // order advances only when a real remember changes an anchor.
    return entry.position
  }

  const remember = (target: ConversationReadingTarget, position: ConversationReadingPosition): void => {
    if (disposed) return
    validateTarget(target)
    validatePosition(position)
    const key = keyOf(target)
    const previous = entries.get(key)
    const capturedTarget = Object.freeze({
      workspaceId: target.workspaceId,
      sessionId: target.sessionId,
      sourceTabInstanceKey: target.sourceTabInstanceKey,
    })
    const capturedPosition = Object.freeze({
      messageId: position.messageId,
      messageOffset: position.messageOffset,
      atEnd: position.atEnd,
    })
    if (previous && samePosition(previous.position, capturedPosition)) {
      // Keep the exact value and insertion order. A same-value remember is a
      // no-op for subscribers, including when the key is not the MRU entry.
      return
    }
    entries.delete(key)
    entries.set(key, Object.freeze({ target: capturedTarget, position: capturedPosition }))
    while (entries.size > CONVERSATION_READING_MAX_ANCHORS) entries.delete(entries.keys().next().value!)
    publish()
  }

  const retainTargets = (targets: readonly ConversationReadingTarget[]): void => {
    if (disposed) return
    if (!Array.isArray(targets)) throw invalidInput('Conversation reading targets are invalid')
    const retained = new Set<string>()
    for (const target of targets) {
      validateTarget(target)
      retained.add(keyOf(target))
    }
    let changed = false
    for (const key of entries.keys()) {
      if (!retained.has(key)) {
        entries.delete(key)
        changed = true
      }
    }
    if (changed) publish()
    const request = navigation.reader.getSnapshot().request
    if (request && !retained.has(keyOf(request.target)))
      navigation.replace({ revision: navigation.reader.getSnapshot().revision, request: null })
  }

  const dispose = (): void => {
    if (disposed) return
    entries.clear()
    publish()
    navigation.replace({ revision: navigation.reader.getSnapshot().revision, request: null })
    disposed = true
    state.dispose()
    navigation.dispose()
  }

  const navigate = (
    target: ConversationReadingTarget,
    position: ConversationReadingPosition,
    callId: string | null = null,
    query: string | null = null,
  ): void => {
    if (disposed) return
    validateTarget(target)
    validatePosition(position)
    if (callId !== null) validateId(callId, 'tool call')
    if (query !== null && (typeof query !== 'string' || !query.trim() || query.length > 160))
      throw invalidInput('Conversation reading search query is invalid')
    navigation.replace({
      revision: navigation.reader.getSnapshot().revision + 1,
      request: Object.freeze({
        target: Object.freeze({ ...target }),
        position: Object.freeze({ ...position }),
        callId,
        query,
      }),
    })
  }
  const acknowledge = (target: ConversationReadingTarget, revision: number): void => {
    if (disposed) return
    validateTarget(target)
    const current = navigation.reader.getSnapshot()
    if (current.request && current.revision === revision && sameTarget(current.request.target, target))
      navigation.replace({ revision, request: null })
  }
  return {
    reader: state.reader,
    navigation: navigation.reader,
    navigate,
    acknowledge,
    read,
    remember,
    retainTargets,
    dispose,
  }
}
