import { CONVERSATION_FIND_LIMITS, type ConversationFindSource, type SessionTimelineState } from '@hbar/app-runtime'
import { projectSessionMessages, type SessionMessage, type SessionMessageBlock } from './session-message-model'
import { sessionMessageTextSegments } from './session-message-text'
import { projectSessionFindText, type SessionFindTextProjection } from './session-find-text'

export interface SessionFindSourceProjection {
  readonly source: ConversationFindSource
  readonly rows: ReadonlyMap<string, ReadonlyMap<string, SessionFindTextProjection>>
}

interface CachedMessage {
  readonly blocks: readonly SessionMessageBlock[]
  readonly segments: ReadonlyMap<string, SessionFindTextProjection> | null
}

function sameBlocks(left: readonly SessionMessageBlock[], right: readonly SessionMessageBlock[]): boolean {
  return left.length === right.length && left.every((block, index) => block === right[index])
}

/** One view lifetime, no shared history mirror or query-dependent parsing. */
export function createSessionFindProjector() {
  let messages = new WeakMap<SessionMessage, CachedMessage>()
  let streams = new WeakMap<SessionTimelineState['streams'][string], SessionFindTextProjection | null>()
  return {
    project(
      timeline: SessionTimelineState,
      scopeId: string,
      expectedSessionId: string,
    ): SessionFindSourceProjection | null {
      if (!scopeId || !expectedSessionId || timeline.sessionId !== expectedSessionId) return null
      const rows: Array<ConversationFindSource['rows'][number]> = []
      const mappings = new Map<string, ReadonlyMap<string, SessionFindTextProjection>>()
      let rawCharacters = 0
      let characters = 0
      let segmentCount = 0
      let failed = false
      let limited = timeline.messages.length > CONVERSATION_FIND_LIMITS.rows
      // The public timeline itself is bounded. If that contract is exceeded,
      // reject the oversized snapshot rather than inventing a different tool
      // pairing/block-index projection from a sliced history.
      const loaded = limited ? [] : timeline.messages.filter((message) => message.sessionId === expectedSessionId)
      const projections = projectSessionMessages(loaded).toSorted((a, b) => a.message.seq - b.message.seq)
      const add = (id: string, segments: ReadonlyMap<string, SessionFindTextProjection>) => {
        const indexed: Array<{ id: string; text: string }> = []
        const accepted = new Map<string, SessionFindTextProjection>()
        for (const [segmentId, projection] of segments) {
          if (
            segmentCount >= CONVERSATION_FIND_LIMITS.segments ||
            characters + projection.text.length > CONVERSATION_FIND_LIMITS.characters
          ) {
            limited = true
            break
          }
          segmentCount++
          characters += projection.text.length
          indexed.push({ id: segmentId, text: projection.text })
          accepted.set(segmentId, projection)
        }
        if (indexed.length) {
          rows.push({ id, segments: indexed })
          mappings.set(id, accepted)
        }
      }
      for (const { message, blocks } of projections) {
        if (message.role !== 'user' && message.role !== 'assistant') continue
        if (rows.length >= CONVERSATION_FIND_LIMITS.rows) {
          limited = true
          break
        }
        let sourceSize = 0
        let sourceSegments = 0
        for (const block of blocks) {
          if (block.type !== 'text') continue
          sourceSize += block.text.length + (sourceSegments > 0 ? 2 : 0)
          sourceSegments++
        }
        // Never slice Markdown: that could turn an unfinished fence/HTML/plan
        // into different visible text. Budget the complete row before parsing.
        if (
          rawCharacters + sourceSize > CONVERSATION_FIND_LIMITS.characters ||
          segmentCount + sourceSegments > CONVERSATION_FIND_LIMITS.segments
        ) {
          limited = true
          continue
        }
        rawCharacters += sourceSize
        let cached = messages.get(message)
        if (!cached || !sameBlocks(cached.blocks, blocks)) {
          try {
            const textSegments = sessionMessageTextSegments(blocks, message.role === 'assistant')
            if (segmentCount + textSegments.length > CONVERSATION_FIND_LIMITS.segments) {
              limited = true
              continue
            }
            cached = {
              blocks,
              segments: new Map(textSegments.map((segment) => [segment.id, projectSessionFindText(segment.markdown)])),
            }
            messages.set(message, cached)
          } catch {
            // A malformed/deep offscreen body must not crash the mounted
            // conversation or leave its previous readable projection active.
            cached = { blocks, segments: null }
            messages.set(message, cached)
          }
        }
        if (!cached.segments) {
          failed = true
          continue
        }
        add(message.id, cached.segments)
      }
      for (const stream of Object.values(timeline.streams)) {
        if (stream.sessionId !== expectedSessionId || !stream.text.trim() || mappings.has(stream.id)) continue
        if (
          rows.length >= CONVERSATION_FIND_LIMITS.rows ||
          segmentCount >= CONVERSATION_FIND_LIMITS.segments ||
          rawCharacters + stream.text.length > CONVERSATION_FIND_LIMITS.characters
        ) {
          limited = true
          break
        }
        rawCharacters += stream.text.length
        let projection = streams.get(stream)
        if (projection === undefined) {
          try {
            projection = projectSessionFindText(stream.text)
            streams.set(stream, projection)
          } catch {
            projection = null
            streams.set(stream, null)
          }
        }
        if (!projection) {
          failed = true
          continue
        }
        // The real streaming renderer supplies [thinking, text], not a proposal card.
        add(stream.id, new Map([['text:1', projection]]))
      }
      const history: ConversationFindSource['history'] =
        failed || timeline.status === 'error' || timeline.olderStatus === 'error'
          ? 'failed'
          : limited || timeline.olderStatus === 'limit'
            ? 'limit'
            : timeline.hasOlder || timeline.status === 'loading'
              ? 'older'
              : 'complete'
      return { source: { scopeId, rows, history }, rows: mappings }
    },
    clear() {
      messages = new WeakMap()
      streams = new WeakMap()
    },
  }
}
