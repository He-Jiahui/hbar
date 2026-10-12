import { z } from 'zod'
import {
  HbarError,
  workspaceLocationOf,
  contentBlockSchema,
  sessionSchema,
  usageSchema,
  userInputRequestSchema,
  type Message,
  type ContentBlock,
  type Session,
  type Workspace,
  type SessionPage,
  type SessionSnapshot,
  type SessionEvent,
} from '@hbar/contracts'
import {
  NODE_LIMITS,
  nodeObservationMethods,
  nodeObservedMessageSchema,
  nodeObservedRunSchema,
  nodeObservedApprovalSchema,
} from '@hbar/contracts/node'
import { boundedNodeResult } from '@hbar/contracts/node-output'

/** Private read-only application port; neither Storage nor Kernel is exposed to the network. */
export interface NodeObservationSource {
  node(nodeId: string): Promise<{ revokedAt: number | null } | null>
  list(nodeId: string, after: string | undefined, limit: number): Promise<SessionPage>
  session(sessionId: string): Promise<Session | null>
  workspace(workspaceId: string): Promise<Workspace | null>
  snapshot(sessionId: string, before: number | undefined, limit: number): Promise<SessionSnapshot>
  events(sessionId: string, after: number, limit: number): Promise<SessionEvent[]>
}
function clip(text: string): string {
  if (text.length <= NODE_LIMITS.outputBytes && Buffer.byteLength(text) <= NODE_LIMITS.outputBytes) return text
  const bytes = Buffer.from(text.slice(0, NODE_LIMITS.outputBytes))
  let end = NODE_LIMITS.outputBytes
  while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end--
  return bytes.subarray(0, end).toString('utf8')
}
function content(block: ContentBlock): z.infer<typeof nodeObservedMessageSchema>['content'][number] {
  switch (block.type) {
    case 'text':
    case 'thinking':
      return { type: block.type, text: clip(block.text) }
    case 'image':
    case 'file':
      return { type: block.type, artifact: block.artifact }
    case 'tool_call':
      return {
        type: block.type,
        callId: block.callId,
        name: block.name,
        args: z.record(z.string(), z.json()).parse(block.args),
      }
    case 'tool_result':
      return {
        type: block.type,
        callId: block.callId,
        name: block.name,
        text: clip(block.text),
        isError: block.isError,
      }
  }
}
export function projectNodeMessage(message: Message) {
  const blocks = message.content.slice(0, 256).map(content)
  return nodeObservedMessageSchema.parse({
    id: message.id,
    sessionId: message.sessionId,
    runId: message.runId,
    role: message.role,
    content: blocks,
    seq: message.seq,
    createdAt: message.createdAt,
    truncated:
      message.content.length > blocks.length ||
      blocks.some((block, index) => {
        const original = message.content[index]
        return 'text' in block && original && 'text' in original && block.text !== original.text
      }),
  })
}
function projectRun(value: unknown) {
  const row = z.record(z.string(), z.unknown()).parse(value)
  return nodeObservedRunSchema.parse(
    Object.fromEntries(
      Object.keys(nodeObservedRunSchema.shape)
        .filter((key) => row[key] !== undefined)
        .map((key) => [key, row[key]]),
    ),
  )
}
function projectApproval(value: unknown) {
  const row = z.record(z.string(), z.unknown()).parse(value)
  return nodeObservedApprovalSchema.parse(
    Object.fromEntries(
      Object.keys(nodeObservedApprovalSchema.shape)
        .filter((key) => row[key] !== undefined)
        .map((key) => [key, row[key]]),
    ),
  )
}
function eventData(event: SessionEvent): unknown {
  const row = z.record(z.string(), z.unknown()).safeParse(event.data)
  if (!row.success) return {}
  switch (event.type) {
    case 'session.created':
    case 'session.updated':
    case 'session.moved':
      return { session: sessionSchema.parse(row.data.session) }
    case 'usage.recorded':
      return { usage: usageSchema.parse(row.data) }
    case 'user_input.requested':
      return { request: userInputRequestSchema.parse(row.data) }
    case 'message.committed': {
      const value = z
        .object({ id: z.string(), role: nodeObservedMessageSchema.shape.role, content: z.array(contentBlockSchema) })
        .parse(row.data)
      return {
        message: projectNodeMessage({
          ...value,
          sessionId: event.sessionId,
          runId: event.runId ?? 'unbound',
          seq: event.seq,
          createdAt: event.time,
        }),
      }
    }
    case 'run.queued':
    case 'run.status':
    case 'run.settled':
    case 'run.filesUndone':
    case 'run.recoveryQueued':
      return { run: projectRun(row.data.run) }
    case 'approval.requested':
    case 'approval.resolved':
      return { approval: projectApproval(row.data) }
    default:
      return {}
  }
}
/** Rechecks ownership after loading private content, and projects event payloads rather than forwarding generic data. */
export class NodeObservationService {
  constructor(private readonly source: NodeObservationSource) {}
  private async node(nodeId: string, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    const node = await this.source.node(nodeId)
    signal.throwIfAborted()
    if (!node || node.revokedAt !== null) throw new HbarError('FORBIDDEN', 'Node observation authority is unavailable')
  }
  private async scope(nodeId: string, sessionId: string, signal: AbortSignal): Promise<Session> {
    await this.node(nodeId, signal)
    const session = await this.source.session(sessionId)
    if (!session) throw new HbarError('FORBIDDEN', 'Session is outside this node observation scope')
    const workspace = await this.source.workspace(session.workspaceId)
    signal.throwIfAborted()
    const location = workspace ? workspaceLocationOf(workspace) : null
    if (!location || location.kind !== 'node' || location.nodeId !== nodeId)
      throw new HbarError('FORBIDDEN', 'Session is outside this node observation scope')
    return session
  }
  async invoke(nodeId: string, method: string, input: unknown, signal: AbortSignal): Promise<unknown> {
    if (!Object.hasOwn(nodeObservationMethods, method))
      throw new HbarError('METHOD_NOT_FOUND', 'Only node observation methods are public')
    const table: Readonly<Record<string, { input: z.ZodType; output: z.ZodType }>> = nodeObservationMethods
    const entry = table[method]
    if (!entry) throw new HbarError('METHOD_NOT_FOUND', 'Node observation method is absent')
    const value: unknown = entry.input.parse(input)
    let result: unknown
    switch (method) {
      case 'observe.sessions.list': {
        const request = nodeObservationMethods['observe.sessions.list'].input.parse(value)
        await this.node(nodeId, signal)
        const page = await this.source.list(nodeId, request.cursor, request.limit)
        await this.node(nodeId, signal)
        result = page
        break
      }
      case 'observe.sessions.snapshot': {
        const request = nodeObservationMethods['observe.sessions.snapshot'].input.parse(value)
        await this.scope(nodeId, request.sessionId, signal)
        const snapshot = await this.source.snapshot(request.sessionId, request.beforeSeq, request.limit)
        const current = await this.scope(nodeId, request.sessionId, signal)
        if (current.id !== snapshot.session.id || current.workspaceId !== snapshot.session.workspaceId)
          throw new HbarError('NODE_OBSERVATION_CHANGED', 'Session moved while its observation snapshot was read')
        for (const collection of [
          snapshot.messages,
          snapshot.runs,
          snapshot.approvals,
          snapshot.userInputs,
          snapshot.streams,
        ])
          if (collection.some((item) => item.sessionId !== request.sessionId))
            throw new HbarError('NODE_OBSERVATION_INVALID', 'Observation snapshot contains another session')
        result = {
          session: snapshot.session,
          messages: snapshot.messages.map(projectNodeMessage),
          runs: snapshot.runs.slice(0, 500).map(projectRun),
          approvals: snapshot.approvals.slice(0, 500).map(projectApproval),
          userInputs: snapshot.userInputs.slice(-200),
          usage: snapshot.usage,
          cursor: snapshot.cursor,
          hasOlder: snapshot.hasOlder,
          activityTruncated:
            snapshot.runs.length > 500 ||
            snapshot.approvals.length > 500 ||
            snapshot.userInputs.length > 200 ||
            snapshot.streams.length > 32,
          streams: snapshot.streams.slice(-32).map((stream) => ({
            id: stream.id,
            sessionId: stream.sessionId,
            runId: stream.runId,
            text: clip(stream.text),
            thinking: clip(stream.thinking),
            offset: stream.offset,
            version: stream.version,
            truncated: clip(stream.text) !== stream.text || clip(stream.thinking) !== stream.thinking,
          })),
        }
        break
      }
      case 'observe.sessions.follow': {
        const request = nodeObservationMethods['observe.sessions.follow'].input.parse(value)
        const original = await this.scope(nodeId, request.sessionId, signal)
        const events = await this.source.events(request.sessionId, request.afterSeq, 201)
        const current = await this.scope(nodeId, request.sessionId, signal)
        if (original.workspaceId !== current.workspaceId)
          throw new HbarError('NODE_OBSERVATION_CHANGED', 'Session moved while observation events were read')
        if (events.some((event) => event.sessionId !== request.sessionId))
          throw new HbarError('NODE_OBSERVATION_INVALID', 'Observation events contain another session')
        const reset =
          events.length > 200 ||
          request.afterSeq > current.seq ||
          (events.length === 0 && request.afterSeq < current.seq) ||
          events.some((event, index) => event.seq !== request.afterSeq + index + 1 || event.seq > current.seq)
        result = {
          events: reset ? [] : events.map((event) => ({ ...event, data: eventData(event) })),
          cursor: reset ? current.seq : (events.at(-1)?.seq ?? request.afterSeq),
          reset,
        }
        break
      }
    }
    return boundedNodeResult(entry.output.parse(result))
  }
}
