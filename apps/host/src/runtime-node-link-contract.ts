import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  contentBlockSchema,
  runSchema,
  usageSchema,
  userInputRequestSchema,
  type SessionSnapshot,
} from '@hbar/contracts'
import { sessionSchema, workspaceSchema, sessionPageSchema } from '@hbar/contracts/directory'
import { liveStreamSchema } from '@hbar/contracts/runtime-notifications'
import {
  nodeWorkspaceMethods,
  nodeObservationMethods,
  NODE_LIMITS,
  type NodeWorkspaceMethod,
} from '@hbar/contracts/node'
import { nodeRegistryStateMethods, nodeInviteSchema, registeredNodeSchema } from '@hbar/contracts/node-registry'
import {
  nodeListInputSchema,
  nodeListPageSchema,
  type NodeListInput,
  type NodeListPage,
} from '@hbar/contracts/node-management'
import { nodeIdSchema } from '@hbar/contracts/node-address'
import type { NodeWireTransport } from '@hbar/node-link'

const connectionId = z.string().min(1).max(160)
const empty = z.strictObject({})
export const runtimeNodeOpenSchema = z.strictObject({ connectionId, source: z.string().min(1).max(160) })
export const runtimeNodeFrameSchema = z.strictObject({ connectionId, text: z.string().max(NODE_LIMITS.frameBytes) })
export const runtimeNodeCloseSchema = z.strictObject({ connectionId })
export const runtimeNodeTransportSchema = z.discriminatedUnion('kind', [
  runtimeNodeFrameSchema.extend({ kind: z.literal('send') }),
  z.strictObject({
    kind: z.literal('close'),
    connectionId,
    code: z.number().int().min(1000).max(4999),
    reason: z.string().max(160),
  }),
])
export const runtimeNodeCallSchema = z
  .strictObject({
    nodeId: nodeIdSchema,
    method: z.custom<NodeWorkspaceMethod>(
      (value) => typeof value === 'string' && Object.hasOwn(nodeWorkspaceMethods, value),
    ),
    input: z.unknown(),
  })
  .superRefine((value, context) => {
    if (!nodeWorkspaceMethods[value.method].input.safeParse(value.input).success)
      context.addIssue({ code: 'custom', message: 'Node call does not satisfy its named method contract' })
  })
const id = z.string().min(1).max(160)
const privateApproval = z
  .object({
    id,
    sessionId: id,
    runId: id,
    callId: id,
    tool: z.string(),
    args: z.record(z.string(), z.unknown()),
    status: z.enum(['pending', 'allowed', 'denied', 'cancelled']),
    createdAt: z.number().int().nonnegative(),
    feedback: z.string().optional(),
    decidedBy: id.optional(),
  })
  .transform(({ feedback, decidedBy, ...value }) => ({
    ...value,
    ...(feedback === undefined ? {} : { feedback }),
    ...(decidedBy === undefined ? {} : { decidedBy }),
  }))
/** The private projection owner receives conversation data through named reads, without a generic Storage port. */
const snapshot: z.ZodType<SessionSnapshot> = z.object({
  session: sessionSchema,
  messages: z
    .array(
      z.object({
        id,
        sessionId: id,
        runId: z.string().max(160),
        role: z.enum(['user', 'assistant', 'tool', 'system']),
        content: z.array(contentBlockSchema),
        seq: z.number().int().nonnegative(),
        createdAt: z.number().int().nonnegative(),
        providerData: z.unknown().optional(),
      }),
    )
    .max(60),
  runs: z.array(runSchema).max(500),
  approvals: z.array(privateApproval).max(500),
  userInputs: z.array(userInputRequestSchema).max(200),
  usage: usageSchema,
  cursor: z.number().int().nonnegative(),
  hasOlder: z.boolean(),
  streams: z.array(liveStreamSchema).max(32),
})
export const runtimeNodeObservationMethods = {
  list: {
    input: z.strictObject({ nodeId: nodeIdSchema, after: id.optional(), limit: z.number().int().min(1).max(100) }),
    output: sessionPageSchema,
  },
  session: { input: z.strictObject({ sessionId: id }), output: sessionSchema.nullable() },
  workspace: { input: z.strictObject({ workspaceId: id }), output: workspaceSchema.nullable() },
  snapshot: {
    input: z.strictObject({
      sessionId: id,
      before: z.number().int().nonnegative().optional(),
      limit: z.number().int().min(1).max(60),
    }),
    output: snapshot,
  },
  events: {
    input: z.strictObject({
      sessionId: id,
      after: z.number().int().nonnegative(),
      limit: z.number().int().min(1).max(201),
    }),
    output: z
      .array(
        z.object({
          eventId: id,
          sessionId: id,
          seq: z.number().int().positive(),
          runId: id.nullable(),
          stepId: id.nullable(),
          type: z.string().max(160),
          data: z.unknown(),
          time: z.number().int().nonnegative(),
          version: z.literal(1),
        }),
      )
      .max(201),
  },
} as const
export const runtimeNodeManagementMethods = {
  invite: { input: z.strictObject({ name: registeredNodeSchema.shape.name }), output: nodeInviteSchema },
  list: { input: nodeListInputSchema, output: nodeListPageSchema },
  revoke: { input: z.strictObject({ selector: z.string().min(1).max(160) }), output: registeredNodeSchema },
} as const
const fingerprintTable = (table: Readonly<Record<string, { input: z.ZodType; output: z.ZodType }>>) =>
  Object.entries(table).map(([name, entry]) => [
    name,
    z.toJSONSchema(entry.input, { io: 'input' }),
    z.toJSONSchema(entry.output, { io: 'input' }),
  ])
export const NODE_LINK_RUNTIME_FINGERPRINT = createHash('sha256')
  .update(
    JSON.stringify([
      'hbar.node-link.runtime.v1',
      z.toJSONSchema(runtimeNodeOpenSchema),
      z.toJSONSchema(runtimeNodeFrameSchema),
      z.toJSONSchema(runtimeNodeTransportSchema),
      ...[
        nodeWorkspaceMethods,
        nodeObservationMethods,
        nodeRegistryStateMethods,
        runtimeNodeObservationMethods,
        runtimeNodeManagementMethods,
      ].map(fingerprintTable),
    ]),
  )
  .digest('hex')
export const RUNTIME_NODE_LINK_CONTROLS = [
  'nodeLink.open',
  'nodeLink.frame',
  'nodeLink.close',
  ...Object.keys(nodeRegistryStateMethods).map((method) => 'nodeLink.registry.' + method),
  ...Object.keys(runtimeNodeObservationMethods).map((method) => 'nodeLink.observation.' + method),
] as const
export interface RuntimeNodeLinkPort {
  open(connectionId: string, source: string, transport: NodeWireTransport): Promise<void>
  receive(connectionId: string, text: string): Promise<void>
  closeConnection(connectionId: string): void
  invite(name: string): Promise<z.infer<typeof nodeInviteSchema>>
  list(input?: NodeListInput): Promise<NodeListPage>
  revoke(selector: string): Promise<z.infer<typeof registeredNodeSchema>>
  call<Method extends NodeWorkspaceMethod>(
    nodeId: string,
    method: Method,
    input: z.input<(typeof nodeWorkspaceMethods)[Method]['input']>,
    signal?: AbortSignal,
  ): Promise<z.output<(typeof nodeWorkspaceMethods)[Method]['output']>>
}
export const runtimeNodeEmptySchema = empty
