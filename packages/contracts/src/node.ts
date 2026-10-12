import { z } from 'zod'
import { resolvedSandboxProfileSchema, sandboxSnapshotRefSchema } from './sandbox'
import { nodeIdSchema, nodeRelativePathSchema, nodeRootIdSchema } from './node-address'
import {
  workspaceFindInputSchema,
  workspaceFindResultSchema,
  workspaceSearchInputSchema,
  workspaceSearchResultSchema,
  workspaceReadResultSchema,
  workspaceFileEntrySchema,
} from './workspace-query'
import { sessionSchema } from './state/directory'
import { sessionEventSchema, artifactSchema, runSchema, usageSchema, userInputRequestSchema } from './index'
export * from './node-address'

export const NODE_PROTOCOL_VERSION = 1
export const NODE_LIMITS = Object.freeze({
  frameBytes: 1_048_576,
  inflight: 32,
  fileBytes: 2 * 1024 * 1024,
  chunkBytes: 192 * 1024,
  outputBytes: 64 * 1024,
  commandCharacters: 16_000,
  heartbeatMs: 15_000,
  heartbeatTimeoutMs: 45_000,
  receipts: 10_000,
  receiptRetentionMs: 7 * 24 * 60 * 60 * 1_000,
})
const entityId = z.string().min(1).max(160)
const digest = z.string().regex(/^[a-f0-9]{64}$/)
const operationId = z
  .string()
  .min(1)
  .max(330)
  .regex(/^[A-Za-z0-9:_-]+$/)
const timestamp = z.number().int().nonnegative().safe()
const empty = z.strictObject({})
const acknowledgement = z.strictObject({ accepted: z.boolean() })
export const nodePublicKeySchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/)
export const nodeSignatureSchema = z.string().regex(/^[A-Za-z0-9_-]{86}$/)
export const nodeChallengeSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/)
export const nodeFingerprintSchema = z.string().regex(/^SHA256:[A-Za-z0-9_-]{43}$/)
export const nodeConnectSchema = z.strictObject({
  protocol: z.literal(NODE_PROTOCOL_VERSION),
  publicKey: nodePublicKeySchema,
  challenge: nodeChallengeSchema,
})
export const nodeChallengeResponseSchema = z.strictObject({
  protocol: z.literal(NODE_PROTOCOL_VERSION),
  publicKey: nodePublicKeySchema,
  challenge: nodeChallengeSchema,
  signature: nodeSignatureSchema,
})
export const nodeAuthenticateSchema = z.strictObject({
  signature: nodeSignatureSchema,
  pairingCode: z
    .string()
    .regex(/^\d{8}$/)
    .optional(),
})
export const nodeJoinedSchema = z.strictObject({
  nodeId: nodeIdSchema,
  name: z.string().min(1).max(160),
  signature: nodeSignatureSchema,
})
export const nodeBackendSchema = z.enum([
  'none',
  'bwrap',
  'container',
  'seatbelt',
  'windows-restricted',
  'windows-elevated',
])
export const nodeRootSchema = z.strictObject({
  rootId: nodeRootIdSchema,
  name: z.string().min(1).max(160),
  path: z.string().min(1).max(4_000),
  access: z.enum(['read', 'write']),
})
const environmentName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,255}$/)
export const nodeFloorSchema = z.strictObject({
  roots: z
    .array(nodeRootSchema)
    .max(64)
    .refine((roots) => new Set(roots.map((root) => root.rootId)).size === roots.length),
  process: z.boolean().default(true),
  network: z.boolean().default(false),
  terminal: z.boolean().default(false),
  osConfinement: z.enum(['required', 'preferred', 'off']).default('required'),
  backend: z.enum(['auto', 'bwrap', 'container', 'seatbelt', 'windows-restricted', 'windows-elevated']).default('auto'),
  protectedPaths: z.array(z.string().min(1).max(4_000)).max(256).default([]),
  environmentAllowlist: z.array(environmentName).max(256).default(['LANG', 'LC_ALL', 'TERM', 'HOME', 'TMPDIR']),
  maxConcurrentProcesses: z.number().int().min(1).max(64).default(4),
  maxTimeoutMs: z.number().int().min(1_000).max(1_200_000).default(600_000),
  onLinkLost: z
    .strictObject({
      action: z.enum(['terminate', 'continue']).default('terminate'),
      graceMs: z.number().int().min(0).max(300_000).default(30_000),
    })
    .default({ action: 'terminate', graceMs: 30_000 }),
  localConfirm: z.enum(['none', 'write', 'process', 'always']).default('none'),
})
export const nodeFloorSummarySchema = nodeFloorSchema.omit({
  roots: true,
  protectedPaths: true,
  environmentAllowlist: true,
})
export const nodeCapabilitiesSchema = z.strictObject({
  protocol: z.literal(NODE_PROTOCOL_VERSION),
  nodeId: nodeIdSchema,
  platform: z.enum(['linux', 'darwin', 'win32']),
  evaluator: digest,
  roots: z.array(nodeRootSchema.omit({ path: true }).extend({ nodePath: z.string().min(1).max(4_000) })).max(64),
  sandbox: z.strictObject({
    backends: z.array(nodeBackendSchema).max(8),
    filesystem: z.enum(['enforced', 'none']),
    network: z.enum(['enforced', 'env-only', 'none']),
  }),
  floor: nodeFloorSummarySchema,
})
export const nodeAdmissionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('allow') }),
  z.strictObject({ kind: z.literal('approved'), approvalId: entityId }),
])
export const nodeCallAuthoritySchema = z.strictObject({
  sessionId: entityId,
  runId: entityId,
  callId: entityId,
  sandbox: sandboxSnapshotRefSchema.nullable(),
  admission: nodeAdmissionSchema,
})
const scoped = z.strictObject({
  rootId: nodeRootIdSchema,
  /** The A workspace binds this exact B-owned root; a reused root ID must not change its target. */
  expectedRoot: z.string().min(1).max(4_000).optional(),
})
const file = scoped.extend({ path: nodeRelativePathSchema })
const admittedFile = file.extend({ authority: nodeCallAuthoritySchema })
export const nodeExecStartSchema = scoped.extend({
  operationId,
  ...nodeCallAuthoritySchema.shape,
  cwd: nodeRelativePathSchema.default('.'),
  command: z.string().min(1).max(NODE_LIMITS.commandCharacters),
  timeoutMs: z.number().int().positive().max(1_200_000),
})
/** Execution must be allowed to reach its bounded settlement before transport expiry. */
export function nodeRequestTimeoutMs(method: string, input: unknown): number {
  if (method === 'exec.start') return nodeExecStartSchema.parse(input).timeoutMs + 5_000
  if (method === 'exec.cancel') return 120_000
  return 30_000
}
export const nodeExecResultSchema = z.strictObject({
  text: z.string().max(NODE_LIMITS.outputBytes),
  isError: z.boolean(),
  details: z.strictObject({
    code: z.union([z.string().max(128), z.number().int(), z.null()]),
    exitCode: z.number().int().nullable(),
    truncated: z.boolean(),
    executionStarted: z.boolean(),
    backend: nodeBackendSchema,
    timeoutMs: z.number().int().positive().optional(),
  }),
})
export const nodeReceiptSchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('absent') }),
  z.strictObject({ state: z.literal('accepted'), acceptedAt: timestamp }),
  z.strictObject({ state: z.literal('started'), acceptedAt: timestamp, startedAt: timestamp }),
  z.strictObject({
    state: z.literal('settled'),
    acceptedAt: timestamp,
    startedAt: timestamp.nullable(),
    settledAt: timestamp,
    result: nodeExecResultSchema,
  }),
  z.strictObject({
    state: z.literal('lost'),
    acceptedAt: timestamp,
    startedAt: timestamp,
    reason: z.enum(['restart', 'link-lost', 'unknown']),
  }),
])
const bytes = z.number().int().min(0).max(NODE_LIMITS.fileBytes)
const base64 = z
  .string()
  .max((NODE_LIMITS.chunkBytes / 3) * 4)
  .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
export const nodeFileChunkSchema = z.strictObject({
  offset: bytes,
  totalBytes: bytes,
  data: base64,
  revision: digest,
  done: z.boolean(),
})
export const nodeWriteReceiptSchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('buffered'), nextOffset: bytes }),
  z.strictObject({ state: z.literal('settled'), path: nodeRelativePathSchema, revision: digest, created: z.boolean() }),
])
const page = z.strictObject({ limit: z.number().int().min(1).max(100).default(50), cursor: entityId.optional() })
const sessionInput = z.strictObject({ sessionId: entityId })
export const nodeAuditEntrySchema = z.strictObject({
  seq: timestamp,
  time: timestamp,
  operationId,
  sessionId: entityId,
  runId: entityId,
  callId: entityId,
  tool: z.string().min(1).max(160),
  argumentsDigest: digest,
  decision: z.enum(['allow', 'deny', 'ask']),
  admission: nodeAdmissionSchema,
  backend: nodeBackendSchema,
  code: z.union([z.string().max(128), z.number().int(), z.null()]),
})

/** Provider metadata and credentials are deliberately absent from the node's observation DTO. */
export const nodeObservedContentSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('text'), text: z.string().max(NODE_LIMITS.outputBytes) }),
  z.strictObject({ type: z.literal('thinking'), text: z.string().max(NODE_LIMITS.outputBytes) }),
  z.strictObject({ type: z.literal('image'), artifact: artifactSchema }),
  z.strictObject({ type: z.literal('file'), artifact: artifactSchema }),
  z.strictObject({
    type: z.literal('tool_call'),
    callId: entityId,
    name: z.string().max(160),
    args: z.record(z.string(), z.json()),
  }),
  z.strictObject({
    type: z.literal('tool_result'),
    callId: entityId,
    name: z.string().max(160),
    text: z.string().max(NODE_LIMITS.outputBytes),
    isError: z.boolean(),
  }),
])
export const nodeObservedMessageSchema = z.strictObject({
  id: entityId,
  sessionId: entityId,
  runId: entityId,
  role: z.enum(['user', 'assistant', 'tool', 'system']),
  content: z.array(nodeObservedContentSchema).max(256),
  truncated: z.boolean(),
  seq: timestamp,
  createdAt: timestamp,
})
export const nodeObservedEventSchema = z.strictObject({ ...sessionEventSchema.shape, data: z.json() })
export const nodeObservedRunSchema = runSchema
  .pick({
    id: true,
    sessionId: true,
    status: true,
    createdAt: true,
    startedAt: true,
    endedAt: true,
    error: true,
    failure: true,
  })
  .strict()
export const nodeObservedApprovalSchema = z.strictObject({
  id: entityId,
  sessionId: entityId,
  runId: entityId,
  callId: entityId,
  tool: z.string().min(1).max(160),
  args: z.record(z.string(), z.json()),
  status: z.enum(['pending', 'allowed', 'denied', 'cancelled']),
  createdAt: timestamp,
  feedback: z.string().max(4_000).optional(),
  decidedBy: entityId.optional(),
})
export const nodeObservedSnapshotSchema = z.strictObject({
  session: sessionSchema,
  messages: z.array(nodeObservedMessageSchema).max(60),
  runs: z.array(nodeObservedRunSchema).max(500),
  approvals: z.array(nodeObservedApprovalSchema).max(500),
  activityTruncated: z.boolean(),
  userInputs: z.array(userInputRequestSchema).max(200),
  usage: usageSchema,
  cursor: timestamp,
  hasOlder: z.boolean(),
  streams: z
    .array(
      z.strictObject({
        id: entityId,
        sessionId: entityId,
        runId: entityId,
        text: z.string().max(NODE_LIMITS.outputBytes),
        thinking: z.string().max(NODE_LIMITS.outputBytes),
        offset: timestamp,
        version: timestamp,
        truncated: z.boolean(),
      }),
    )
    .max(32),
})

/** Independent from /rpc and trusted plugin IPC. Every entry accepts and returns plain data. */
export const nodeWorkspaceMethods = {
  'node.capabilities': { input: empty, output: nodeCapabilitiesSchema },
  'node.ping': {
    input: z.strictObject({ nonce: nodeChallengeSchema }),
    output: z.strictObject({ nonce: nodeChallengeSchema }),
  },
  'sandbox.put': {
    input: z.strictObject({ ref: sandboxSnapshotRefSchema, profile: resolvedSandboxProfileSchema }),
    output: acknowledgement,
  },
  'fs.canonicalize': {
    input: scoped.extend({ paths: z.array(nodeRelativePathSchema).min(1).max(256) }),
    output: z.strictObject({
      root: z.string().min(1).max(4_000),
      paths: z.array(z.string().min(1).max(4_000)).max(256),
      dialect: z.enum(['posix', 'win32']),
      caseInsensitive: z.boolean(),
    }),
  },
  'fs.list': {
    input: admittedFile,
    output: z.array(workspaceFileEntrySchema.extend({ path: nodeRelativePathSchema })).max(1_000),
  },
  'fs.readBytes': {
    input: admittedFile.extend({
      offset: bytes.default(0),
      limit: z.number().int().min(1).max(NODE_LIMITS.chunkBytes).default(NODE_LIMITS.chunkBytes),
      expectedRevision: digest.optional(),
    }),
    output: nodeFileChunkSchema,
  },
  'fs.write': {
    input: admittedFile.extend({
      operationId,
      offset: bytes,
      totalBytes: bytes,
      data: base64,
      expectedRevision: digest.optional(),
      final: z.boolean(),
    }),
    output: nodeWriteReceiptSchema,
  },
  'fs.receipt.chunk': {
    input: scoped.extend({
      operationId,
      version: z.enum(['before', 'after']),
      offset: bytes.default(0),
      limit: z.number().int().min(1).max(NODE_LIMITS.chunkBytes).default(NODE_LIMITS.chunkBytes),
    }),
    output: nodeFileChunkSchema,
  },
  'fs.restore': {
    input: scoped.extend({
      operationId,
      authority: nodeCallAuthoritySchema,
      changes: z
        .array(
          z.strictObject({
            path: nodeRelativePathSchema,
            before: z.string().max(NODE_LIMITS.chunkBytes).nullable(),
            after: z.string().max(NODE_LIMITS.chunkBytes).nullable(),
            created: z.boolean().optional(),
          }),
        )
        .min(1)
        .max(64),
    }),
    output: acknowledgement,
  },
  'query.search': {
    input: scoped.extend({
      authority: nodeCallAuthoritySchema,
      query: workspaceSearchInputSchema.extend({ path: nodeRelativePathSchema.default('.') }),
    }),
    output: workspaceSearchResultSchema,
  },
  'query.find': {
    input: scoped.extend({
      authority: nodeCallAuthoritySchema,
      query: workspaceFindInputSchema.extend({ path: nodeRelativePathSchema.default('.') }),
    }),
    output: workspaceFindResultSchema,
  },
  'query.readRange': {
    input: admittedFile.extend({
      startLine: z.number().int().positive(),
      lineCount: z.number().int().min(1).max(2_000),
    }),
    output: workspaceReadResultSchema,
  },
  'query.invalidate': { input: file, output: acknowledgement },
  'exec.start': { input: nodeExecStartSchema, output: nodeReceiptSchema },
  'exec.cancel': { input: z.strictObject({ operationId }), output: nodeReceiptSchema },
  'exec.receipt': { input: z.strictObject({ operationId }), output: nodeReceiptSchema },
} as const
export const nodeObservationMethods = {
  'observe.sessions.list': {
    input: page,
    output: z.strictObject({ items: z.array(sessionSchema).max(100), nextCursor: entityId.nullable() }),
  },
  'observe.sessions.snapshot': {
    input: sessionInput.extend({ beforeSeq: timestamp.optional(), limit: z.number().int().min(1).max(60).default(60) }),
    output: nodeObservedSnapshotSchema,
  },
  'observe.sessions.follow': {
    input: sessionInput.extend({ afterSeq: timestamp }),
    output: z.strictObject({
      events: z.array(nodeObservedEventSchema).max(200),
      cursor: timestamp,
      reset: z.boolean(),
    }),
  },
} as const
export const nodeNotificationSchemas = {
  'exec.output': z.strictObject({ operationId, seq: z.number().int().positive(), text: z.string().max(16_384) }),
  'exec.exit': z.strictObject({ operationId, receipt: nodeReceiptSchema }),
  'node.rootsChanged': z.strictObject({ revision: timestamp }),
  'node.floorChanged': z.strictObject({ revision: timestamp }),
} as const
export type NodeWorkspaceMethod = keyof typeof nodeWorkspaceMethods
export type NodeObservationMethod = keyof typeof nodeObservationMethods
export type NodeFloor = z.infer<typeof nodeFloorSchema>
export type NodeCapabilities = z.infer<typeof nodeCapabilitiesSchema>
export type NodeExecStart = z.infer<typeof nodeExecStartSchema>
export type NodeExecResult = z.infer<typeof nodeExecResultSchema>
export type NodeReceipt = z.infer<typeof nodeReceiptSchema>
export type NodeCallAuthority = z.infer<typeof nodeCallAuthoritySchema>
export type NodeAuditEntry = z.infer<typeof nodeAuditEntrySchema>
