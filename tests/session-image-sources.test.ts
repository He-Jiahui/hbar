import { expect, test } from 'bun:test'
import type { ArtifactRef, ContentBlock, Message } from '@hbar/contracts'
import { CommandError } from '@hbar/commands'
import {
  isSessionImageRequestCurrent,
  projectSessionDraftImages,
  projectSessionMessageImages,
  projectSessionToolResultImages,
  findSessionToolResultMessage,
  type SessionImageProjection,
} from '../packages/app-runtime/src/session-image-sources'
import { createImageViewer } from '../packages/app-runtime/src/image-viewer'
import type { SessionDraftState, SessionTimelineState } from '../packages/app-runtime/src/types'

const hostIdentity = 'confirmed-host-a'
const artifact = (value = 'a', name = 'same-image.png'): ArtifactRef => ({
  id: value.repeat(64),
  name,
  mime: 'image/png',
  size: 16,
})
const picture = (value = 'a', name?: string): ContentBlock => ({ type: 'image', artifact: artifact(value, name) })
const text: ContentBlock = { type: 'text', text: 'Caption belongs to the host, not collection identity.' }
const tool: ContentBlock = {
  type: 'tool_result',
  callId: 'call',
  name: 'tool',
  text: 'result',
  isError: false,
  details: { image: artifact('c') },
}
function draft(
  attachments: SessionDraftState['attachments'] = [{ kind: 'image', artifact: artifact() }],
): SessionDraftState {
  return {
    sessionId: 'session-a',
    revision: 7,
    text: 'Keep this text',
    mentions: [],
    attachments,
    attachmentTransfers: [],
    uploading: 0,
    uploadError: null,
    status: 'idle',
    error: null,
    lastOperationId: null,
  }
}
function message(content: ContentBlock[] = [text, picture(), tool, picture('b')]): Message {
  return { id: 'message-a', sessionId: 'session-a', seq: 21, role: 'user', runId: 'run-a', createdAt: 100, content }
}
function timeline(messages: Message[] = [message()]): SessionTimelineState {
  return {
    sessionId: 'session-a',
    status: 'ready',
    olderStatus: 'idle',
    olderError: null,
    messages,
    runs: [],
    approvals: [],
    userInputs: [],
    plan: null,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    streams: {},
    events: [],
    cursor: 30,
    hasOlder: true,
    error: null,
  }
}
function present(value: SessionImageProjection | null): SessionImageProjection {
  if (!value) throw new Error('Expected images in the fixture')
  return value
}
const fromDraft = (value = draft(), activeOrdinal?: number) =>
  present(
    projectSessionDraftImages({
      hostIdentity,
      draft: value,
      ...(activeOrdinal === undefined ? {} : { activeOrdinal }),
    }),
  )
const fromMessage = (value = message(), activeOrdinal?: number) =>
  present(
    projectSessionMessageImages({
      hostIdentity,
      message: value,
      ...(activeOrdinal === undefined ? {} : { activeOrdinal }),
    }),
  )
const current = (
  request: SessionImageProjection['request'],
  value: { draft?: SessionDraftState; timeline?: SessionTimelineState; activeSessionId?: string | null } = {},
) =>
  isSessionImageRequestCurrent(request, {
    activeSessionId: value.activeSessionId === undefined ? 'session-a' : value.activeSessionId,
    draft: value.draft,
    timeline: value.timeline,
  })

test('tool image collections belong to their exact durable result, retaining duplicates and bounded capacity', () => {
  for (const count of [0, 1, 4, 12, 13]) {
    const original = message([
      { ...tool, images: Array.from({ length: count }, () => artifact('a', '截图-很长的文件名.png')) },
    ])
    const value = projectSessionToolResultImages({ hostIdentity, message: original, resultIndex: 0 })
    if (!count) {
      expect(value).toBeNull()
      continue
    }
    if (!value) throw new Error('Missing tool images')
    expect(value.capacity).toEqual({ count, limit: 12, exceeded: count > 12 })
    expect(new Set(value.request.items.map((item) => item.key)).size).toBe(count)
    expect(current(value.request, { timeline: timeline([original]) })).toBe(true)
    expect(current(value.request, { timeline: timeline([message([tool])]) })).toBe(false)
    expect(current(value.request, { timeline: timeline([original, original]) })).toBe(false)
    expect(current(value.request, { timeline: timeline([original]), activeSessionId: 'other' })).toBe(false)
    expect(projectSessionMessageImages({ hostIdentity, message: original })).toBeNull()
  }
})

test('paired tool images cannot pick another Run, Session or tool with a reused call ID', () => {
  const owner = message([{ type: 'tool_call', callId: 'call', name: 'tool', args: {} }])
  const result = { ...message([{ ...tool, images: [artifact()] }]), id: 'result', seq: 22, role: 'tool' as const }
  const wrongRun = { ...result, id: 'foreign-run', runId: 'run-b' }
  const wrongSession = { ...result, id: 'foreign-session', sessionId: 'session-b' }
  const wrongTool = { ...result, id: 'foreign-tool', content: [{ ...tool, name: 'other', images: [artifact('b')] }] }
  const facts = timeline([owner, wrongRun, wrongSession, wrongTool, result, { ...result, id: 'duplicate' }])
  expect(findSessionToolResultMessage(facts, owner.id, 'call', 'tool')).toBe(result)
  expect(findSessionToolResultMessage(facts, 'stale-owner', 'call', 'tool')).toBeUndefined()
  const value = projectSessionToolResultImages({ hostIdentity, message: result, resultIndex: 0 })
  if (!value) throw new Error('Missing collection')
  expect(current(value.request, { timeline: facts })).toBe(true)
  const changed = { ...result, content: [{ ...tool, images: [artifact('b')] }] }
  expect(current(value.request, { timeline: timeline([owner, changed]) })).toBe(false)
})

test('message images retain ordered occurrence identity across text, file and tool-result blocks', () => {
  const original = message([picture(), text, tool, { type: 'file', artifact: artifact('d') }, picture('b')])
  const before = fromMessage(original, 1)
  const after = fromMessage({ ...original, content: [text, tool, picture(), picture('b'), text, tool] }, 1)
  expect(before.request.items).toEqual(after.request.items)
  expect(before.sourceId).toBe(after.sourceId)
  expect(before.request.activeKey).toBe(before.request.items[1]?.key ?? '')
  expect(before.request.items.map((item) => item.artifact.id)).toEqual([artifact().id, artifact('b').id])
  expect(current(before.request, { timeline: timeline([{ ...original, content: [picture(), picture('b')] }]) })).toBe(
    true,
  )
  expect(before.request.source).toEqual({
    kind: 'message',
    sessionId: 'session-a',
    messageId: 'message-a',
    messageSeq: 21,
  })
})

test('same hash and same filename never collapse multiple original image occurrences', () => {
  const original = message([picture(), picture(), picture('b')])
  const value = fromMessage(original)
  expect(new Set(value.request.items.map((item) => item.key)).size).toBe(3)
  expect(current(value.request, { timeline: timeline([original]) })).toBe(true)
  expect(current(value.request, { timeline: timeline([message([picture(), picture('b')])]) })).toBe(false)
  expect(
    current(value.request, { timeline: timeline([message([picture(), picture(), picture(), picture('b')])]) }),
  ).toBe(false)
  const duplicatedKey = {
    ...value.request,
    items: value.request.items.map((item) => ({ ...item, key: value.request.activeKey })),
  }
  expect(current(duplicatedKey, { timeline: timeline([original]) })).toBe(false)
  const otherMessage = fromMessage({ ...original, id: 'message-b' })
  const otherSeq = fromMessage({ ...original, seq: 22 })
  expect(otherMessage.request.items[0]?.key).not.toBe(value.request.items[0]?.key)
  expect(otherSeq.request.items[0]?.key).not.toBe(value.request.items[0]?.key)
})

test('confirmed draft membership survives text/mention revisions and non-image attachment changes', () => {
  const original = draft([
    { kind: 'file', artifact: artifact('d') },
    { kind: 'image', artifact: artifact() },
    { kind: 'image', artifact: artifact() },
  ])
  const value = fromDraft(original, 1)
  const changed = {
    ...original,
    revision: 50,
    text: 'Completely new text',
    attachments: original.attachments.filter((item) => item.kind === 'image'),
  }
  expect(fromDraft(changed).sourceId).toBe(value.sourceId)
  expect(current(value.request, { draft: changed })).toBe(true)
  expect(value.request.items[0]?.key).not.toBe(value.request.items[1]?.key)
  expect(current(value.request, { draft: { ...original, revision: 6 } })).toBe(false)
  expect(current(value.request, { draft: { ...original, revision: Number.NaN } })).toBe(false)
  expect(
    current(
      { ...value.request, source: { kind: 'draft', sessionId: original.sessionId, draftRevision: 51 } },
      { draft: changed },
    ),
  ).toBe(false)
})

test('draft remove, replace, caption mutation and session switches invalidate the captured full list', () => {
  const original = draft([
    { kind: 'image', artifact: artifact() },
    { kind: 'image', artifact: artifact('b') },
  ])
  const value = fromDraft(original)
  for (const attachments of [
    original.attachments.slice(1),
    [...original.attachments, { kind: 'image' as const, artifact: artifact('c') }],
    original.attachments.toReversed(),
    [{ kind: 'image' as const, artifact: artifact('c') }, original.attachments[1]].filter((item) => item !== undefined),
    [
      { kind: 'image' as const, artifact: { ...artifact(), name: 'renamed.png' } },
      { kind: 'image' as const, artifact: artifact('b') },
    ],
  ])
    expect(current(value.request, { draft: { ...original, revision: 8, attachments } })).toBe(false)
  expect(current(value.request, { draft: original, activeSessionId: 'session-b' })).toBe(false)
  expect(current(value.request, { draft: original, activeSessionId: null })).toBe(false)
  expect(current(value.request, { draft: { ...original, sessionId: 'session-b' } })).toBe(false)
  expect(current(value.request)).toBe(false)
  const removed = { ...original, revision: 8, attachments: original.attachments.slice(1) }
  const rebuilt = fromDraft(removed)
  expect(rebuilt.sourceId).toBe(value.sourceId)
  expect(rebuilt.request.items[0]?.key).toBe(value.request.items[0]?.key)
  expect(current(rebuilt.request, { draft: removed })).toBe(true)
})

test('pending, unknown and not-yet-accepted uploads cannot manufacture canonical membership', () => {
  const transfers: SessionDraftState['attachmentTransfers'] = [
    'preparing',
    'uploading',
    'unknown',
    'failed',
    'ready',
  ].map((status, index) => ({
    id: `transfer-${index}`,
    ownerRevision: 7,
    originalOperationId: null,
    name: 'pending.png',
    mime: 'image/png',
    size: 16,
    kind: 'image',
    upload: null,
    status:
      status === 'preparing'
        ? 'preparing'
        : status === 'uploading'
          ? 'uploading'
          : status === 'unknown'
            ? 'unknown'
            : status === 'failed'
              ? 'failed'
              : 'ready',
    confirmed: { kind: 'image', artifact: artifact('b') },
    error: null,
  }))
  const empty = { ...draft([]), attachmentTransfers: transfers, uploading: 1, status: 'unknown' as const }
  expect(projectSessionDraftImages({ hostIdentity, draft: empty })).toBeNull()
  const confirmed = { ...empty, attachments: draft().attachments }
  const value = fromDraft(confirmed)
  expect(value.request.items).toHaveLength(1)
  expect(current(value.request, { draft: confirmed })).toBe(true)
})

test('message validation requires exact canonical message/session/seq and each artifact field', () => {
  const original = message([picture()])
  const value = fromMessage(original)
  for (const changed of [
    { ...original, id: 'unrelated' },
    { ...original, sessionId: 'session-b' },
    { ...original, seq: 22 },
    { ...original, content: [picture('b')] },
    { ...original, content: [{ type: 'image' as const, artifact: { ...artifact(), mime: 'image/jpeg' } }] },
    { ...original, content: [{ type: 'image' as const, artifact: { ...artifact(), size: 17 } }] },
    { ...original, content: [picture('a', 'renamed.png')] },
  ])
    expect(current(value.request, { timeline: timeline([changed]) })).toBe(false)
  expect(current(value.request, { timeline: { ...timeline([original]), sessionId: 'session-b' } })).toBe(false)
  expect(current(value.request, { timeline: timeline([original, original]) })).toBe(false)
  expect(current(value.request, { timeline: timeline([]) })).toBe(false)
  expect(current(value.request, { draft: draft() })).toBe(false)
  expect(current({ ...value.request, activeKey: 'not-an-occurrence' }, { timeline: timeline([original]) })).toBe(false)
  const forged = fromMessage(message([picture('c')]))
  expect(current(forged.request, { timeline: timeline([original]) })).toBe(false)
})

test('archived retained/offline history is read-only membership, not Run preparation permission', () => {
  const original = message()
  const value = fromMessage(original)
  const retained = { ...timeline([original]), status: 'error' as const, error: 'DISCONNECTED' }
  expect(current(value.request, { timeline: retained })).toBe(true)
  expect(current(value.request, { timeline: { ...retained, status: 'loading' } })).toBe(true)
  // No archived/ready execution gate is accepted by this API; the same canonical retained history is readable.
  expect(current(value.request, { timeline: retained, activeSessionId: 'another-session' })).toBe(false)
})

test('zero image collections return null and thirteen images remain explicit over-capacity facts', () => {
  expect(projectSessionDraftImages({ hostIdentity, draft: draft([]) })).toBeNull()
  expect(
    projectSessionMessageImages({
      hostIdentity,
      message: message([text, tool, { type: 'file', artifact: artifact() }]),
    }),
  ).toBeNull()
  const original = message(Array.from({ length: 13 }, () => picture()))
  const value = fromMessage(original, 12)
  expect(value.request.items).toHaveLength(13)
  expect(value.capacity).toEqual({ count: 13, limit: 12, exceeded: true })
  expect(current(value.request, { timeline: timeline([original]) })).toBe(true)
  expect(fromMessage(message(original.content.slice(0, 12))).capacity.exceeded).toBe(false)
  let reads = 0
  const viewer = createImageViewer({
    isCurrent: () => true,
    resources: {
      acquire: () => {
        reads++
        return Promise.reject(new Error('Must not read'))
      },
    },
  })
  expect(() => viewer.open(value.request)).toThrow(CommandError)
  expect(reads).toBe(0)
  expect(viewer.reader.getSnapshot().status).toBe('closed')
  viewer.dispose()
})

test('Host/session/collection identity is collision-resistant, bounded and independent of captions', () => {
  const first = fromDraft()
  const otherHost = present(projectSessionDraftImages({ hostIdentity: 'confirmed-host-b', draft: draft() }))
  const otherSession = fromDraft({ ...draft(), sessionId: 'session-b' })
  expect(new Set([first.sourceId, otherHost.sourceId, otherSession.sourceId, fromMessage().sourceId]).size).toBe(4)
  const ambiguousA = present(projectSessionDraftImages({ hostIdentity: 'a:b', draft: { ...draft(), sessionId: 'c' } }))
  const ambiguousB = present(projectSessionDraftImages({ hostIdentity: 'a', draft: { ...draft(), sessionId: 'b:c' } }))
  expect(ambiguousA.sourceId).not.toBe(ambiguousB.sourceId)
  const longest = present(
    projectSessionMessageImages({
      hostIdentity: 'h'.repeat(128),
      message: { ...message(), id: 'm'.repeat(160), sessionId: 's'.repeat(160), seq: Number.MAX_SAFE_INTEGER },
    }),
  )
  expect(longest.sourceId.length).toBeLessThanOrEqual(512)
  expect(longest.request.items.every((item) => item.key.length <= 512)).toBe(true)
  expect(() => projectSessionDraftImages({ hostIdentity: 'h'.repeat(129), draft: draft() })).toThrow(CommandError)
  expect(() => projectSessionDraftImages({ hostIdentity: ' ', draft: draft() })).toThrow(CommandError)
})

test('invalid ordinal, identity, sequence and artifact metadata fail explicitly without truncation', () => {
  for (const activeOrdinal of [-1, 2, 0.5, Number.NaN, Number.POSITIVE_INFINITY])
    expect(() => projectSessionMessageImages({ hostIdentity, message: message(), activeOrdinal })).toThrow(CommandError)
  expect(() => projectSessionDraftImages({ hostIdentity, draft: draft([]), activeOrdinal: 1 })).toThrow(CommandError)
  expect(() => projectSessionMessageImages({ hostIdentity, message: { ...message(), seq: 0 } })).toThrow(CommandError)
  expect(() => projectSessionMessageImages({ hostIdentity, message: { ...message(), id: '' } })).toThrow(CommandError)
  expect(() => projectSessionDraftImages({ hostIdentity, draft: { ...draft(), revision: -1 } })).toThrow(CommandError)
  expect(() => fromMessage(message([{ type: 'image', artifact: { ...artifact(), id: 'not-a-hash' } }]))).toThrow(
    CommandError,
  )
})

test('projection snapshots cannot be mutated through original arrays or ArtifactRef objects', () => {
  const original = message([picture()])
  const value = fromMessage(original)
  const image = original.content[0]
  if (!image || image.type !== 'image') throw new Error('Expected original image')
  image.artifact.name = 'changed-after-projection.png'
  original.content.push(picture('b'))
  expect(value.request.items).toHaveLength(1)
  expect(value.request.items[0]?.artifact.name).toBe('same-image.png')
  expect(Object.isFrozen(value)).toBe(true)
  expect(Object.isFrozen(value.request)).toBe(true)
  expect(Object.isFrozen(value.request.source)).toBe(true)
  expect(Object.isFrozen(value.request.items)).toBe(true)
  expect(Object.isFrozen(value.request.items[0]?.artifact)).toBe(true)
  expect(current(value.request, { timeline: timeline([original]) })).toBe(false)
})

test('viewer revalidation preserves a text-edited draft lease and releases a removed occurrence', async () => {
  let canonical = draft()
  let released = 0
  let reads = 0
  const viewer = createImageViewer({
    isCurrent: (request) => current(request, { draft: canonical }),
    resources: {
      acquire: () => {
        reads++
        return Promise.resolve({
          url: 'blob:https://fixture.invalid/owned-image',
          width: 4,
          height: 4,
          release: () => {
            released++
          },
        })
      },
    },
  })
  viewer.open(fromDraft(canonical).request)
  await Promise.resolve()
  await Promise.resolve()
  expect(viewer.reader.getSnapshot().status).toBe('ready')
  canonical = { ...canonical, revision: 8, text: 'An unrelated text edit' }
  viewer.revalidate()
  expect(viewer.reader.getSnapshot().status).toBe('ready')
  expect(reads).toBe(1)
  expect(released).toBe(0)
  canonical = { ...canonical, revision: 9, attachments: [] }
  viewer.revalidate()
  expect(viewer.reader.getSnapshot().status).toBe('closed')
  expect(released).toBe(1)
  viewer.dispose()
  expect(released).toBe(1)
})
