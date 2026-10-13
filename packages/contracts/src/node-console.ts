import { z } from 'zod'
import { nodeLinkStatusSchema } from './node-link-state'
import {
  nodeCapabilitiesSchema,
  nodeFloorSchema,
  nodeAuditEntrySchema,
  nodeReceiptSchema,
  nodeFingerprintSchema,
  nodeObservationMethods,
  nodeObservedSessionPageSchema,
  nodeObservedSnapshotSchema,
  nodePublicKeySchema,
  nodeSignatureSchema,
} from './node'
import {
  nodeLocalConfirmationPageSchema,
  nodeLocalConfirmationResolveSchema,
  nodeLocalConfirmationSchema,
} from './node-confirmations'

const empty = z.strictObject({})
const done = z.strictObject({ accepted: z.literal(true) })
export const nodeConsoleRoleSchema = z.enum(['operator', 'observer'])
export const nodeConsoleDeviceViewSchema = z.strictObject({
  deviceId: z.string().min(1).max(160),
  name: z.string().min(1).max(160),
  role: nodeConsoleRoleSchema,
  roots: z.array(z.string().min(1).max(64)).max(64),
  createdAt: z.number().int().nonnegative().safe(),
  lastSeenAt: z.number().int().nonnegative().safe().nullable(),
  revokedAt: z.number().int().nonnegative().safe().nullable(),
})
export const nodeConsoleChallengeRequestSchema = z.discriminatedUnion('purpose', [
  z.strictObject({ purpose: z.literal('pair') }),
  z.strictObject({ purpose: z.literal('request'), deviceId: z.string().min(1).max(160) }),
])
export const nodeConsoleChallengeSchema = z.strictObject({
  nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  expiresAt: z.number().int().nonnegative().safe(),
})
export const nodeConsolePairRequestSchema = z.strictObject({
  nonce: nodeConsoleChallengeSchema.shape.nonce,
  code: z.string().regex(/^\d{8}$/),
  name: z.string().min(1).max(160),
  publicKey: nodePublicKeySchema,
  signature: nodeSignatureSchema,
})
export const nodeConsoleAuthenticatedRequestSchema = z.strictObject({
  nonce: nodeConsoleChallengeSchema.shape.nonce,
  deviceId: z.string().min(1).max(160),
  method: z.string().min(1).max(160),
  input: z.json(),
  signature: nodeSignatureSchema,
})
export const nodeConsolePairResultSchema = z.strictObject({
  device: nodeConsoleDeviceViewSchema,
})
export const nodeConsoleInviteResultSchema = z.strictObject({
  inviteId: z.string().min(1).max(160),
  code: z.string().regex(/^\d{8}$/),
  expiresAt: z.number().int().nonnegative().safe(),
})
export const nodePolicySnapshotSchema = z.strictObject({
  floor: nodeFloorSchema,
  revision: z.number().int().nonnegative().safe(),
})
/** B-local operator methods. Never registered on the A-B connection. */
export const nodeConsoleMethods = {
  'node.status': {
    input: empty,
    output: z.strictObject({
      capabilities: nodeCapabilitiesSchema,
      fingerprint: nodeFingerprintSchema,
      paused: z.boolean(),
      running: z.array(z.string().max(330)).max(64),
      linked: z.boolean(),
      connection: nodeLinkStatusSchema,
    }),
  },
  'node.policy.get': { input: empty, output: nodeFloorSchema },
  'node.policy.set': { input: nodeFloorSchema, output: nodeFloorSchema },
  'node.policy.snapshot': { input: empty, output: nodePolicySnapshotSchema },
  'node.policy.update': {
    input: z.strictObject({ floor: nodeFloorSchema, expectedRevision: nodePolicySnapshotSchema.shape.revision }),
    output: nodePolicySnapshotSchema,
  },
  'node.localConfirmation.list': { input: empty, output: nodeLocalConfirmationPageSchema },
  'node.localConfirmation.resolve': {
    input: nodeLocalConfirmationResolveSchema,
    output: nodeLocalConfirmationSchema,
  },
  'node.pause': { input: z.strictObject({ paused: z.boolean() }), output: done },
  'node.kill': {
    input: z
      .strictObject({ operationId: z.string().min(1).max(330).optional(), all: z.boolean().default(false) })
      .refine((value) => value.all || !!value.operationId),
    output: z.array(nodeReceiptSchema).max(64),
  },
  'node.audit': {
    input: z.strictObject({
      after: z.number().int().nonnegative().default(0),
      limit: z.number().int().min(1).max(500).default(100),
    }),
    output: z.array(nodeAuditEntrySchema).max(500),
  },
  'node.unlink': { input: empty, output: done },
  'node.pairing.create': {
    input: z.strictObject({
      name: z.string().min(1).max(160),
      role: nodeConsoleRoleSchema,
      roots: z.array(z.string().min(1).max(64)).max(64),
    }),
    output: nodeConsoleInviteResultSchema,
  },
  'node.devices.list': { input: empty, output: z.array(nodeConsoleDeviceViewSchema).max(256) },
  'node.device.revoke': {
    input: z.strictObject({ deviceId: z.string().min(1).max(160) }),
    output: nodeConsoleDeviceViewSchema.nullable(),
  },
  'observe.sessions.list': {
    input: nodeObservationMethods['observe.sessions.list'].input,
    output: nodeObservedSessionPageSchema,
  },
  'observe.sessions.snapshot': {
    input: nodeObservationMethods['observe.sessions.snapshot'].input,
    output: nodeObservedSnapshotSchema,
  },
  'observe.sessions.follow': {
    input: nodeObservationMethods['observe.sessions.follow'].input,
    output: nodeObservationMethods['observe.sessions.follow'].output,
  },
} as const
export type NodeConsoleMethod = keyof typeof nodeConsoleMethods
const names: [NodeConsoleMethod, ...NodeConsoleMethod[]] = [
  'node.status',
  'node.policy.get',
  'node.policy.set',
  'node.policy.snapshot',
  'node.policy.update',
  'node.localConfirmation.list',
  'node.localConfirmation.resolve',
  'node.pause',
  'node.kill',
  'node.audit',
  'node.unlink',
  'node.pairing.create',
  'node.devices.list',
  'node.device.revoke',
  'observe.sessions.list',
  'observe.sessions.snapshot',
  'observe.sessions.follow',
]
export const nodeConsoleRequestSchema = z.strictObject({ method: z.enum(names), input: z.json() })
export const nodeConsoleConnectionSchema = z.strictObject({
  url: z.string().url(),
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  pid: z.number().int().positive(),
})

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
    const encoded = JSON.stringify(value)
    if (encoded === undefined) throw new TypeError('Value is not JSON serializable')
    return encoded
  }
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  if (!value || typeof value !== 'object') throw new TypeError('Value is not JSON serializable')
  const object = z.record(z.string(), z.json()).parse(value)
  return (
    '{' +
    Object.keys(object)
      .sort()
      .map((key) => JSON.stringify(key) + ':' + canonicalJson(object[key]))
      .join(',') +
    '}'
  )
}
export function nodeConsolePairSigningText(
  input: Pick<z.input<typeof nodeConsolePairRequestSchema>, 'nonce' | 'code' | 'name' | 'publicKey'>,
): string {
  return JSON.stringify(['hbar.node-console.pair.v1', input.nonce, input.code, input.name, input.publicKey])
}
export function nodeConsoleRequestSigningText(
  input: Pick<z.input<typeof nodeConsoleAuthenticatedRequestSchema>, 'nonce' | 'deviceId' | 'method' | 'input'>,
): string {
  return JSON.stringify([
    'hbar.node-console.request.v1',
    input.nonce,
    input.deviceId,
    input.method,
    canonicalJson(input.input),
  ])
}
