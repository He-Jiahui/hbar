import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  verify,
} from 'node:crypto'
import { z } from 'zod'
import { nodePublicKeySchema, nodeSignatureSchema, nodeChallengeSchema } from '@hbar/contracts/node'
import { HbarError } from '@hbar/contracts'
import { nodeIdentitySchema } from '@hbar/contracts/node-registry'
export { nodeIdentitySchema } from '@hbar/contracts/node-registry'

export type NodeIdentity = z.infer<typeof nodeIdentitySchema>
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')
export function nodePublicKey(publicKey: string) {
  return createPublicKey({
    format: 'der',
    type: 'spki',
    key: Buffer.concat([SPKI_PREFIX, Buffer.from(nodePublicKeySchema.parse(publicKey), 'base64url')]),
  })
}
export function nodeFingerprint(publicKey: string): string {
  return (
    'SHA256:' +
    createHash('sha256')
      .update(Buffer.from(nodePublicKeySchema.parse(publicKey), 'base64url'))
      .digest('base64url')
  )
}
export function nodeIdFromPublicKey(publicKey: string): string {
  return (
    'node-' +
    createHash('sha256')
      .update(Buffer.from(nodePublicKeySchema.parse(publicKey), 'base64url'))
      .digest('hex')
      .slice(0, 40)
  )
}
export function createNodeIdentity(): NodeIdentity {
  const keys = generateKeyPairSync('ed25519')
  return {
    publicKey: keys.publicKey
      .export({ format: 'der', type: 'spki' })
      .subarray(SPKI_PREFIX.length)
      .toString('base64url'),
    privateKey: keys.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64url'),
  }
}
export function validateNodeIdentity(value: unknown): NodeIdentity {
  const identity = nodeIdentitySchema.parse(value)
  const publicKey = createPublicKey(
    createPrivateKey({ format: 'der', type: 'pkcs8', key: Buffer.from(identity.privateKey, 'base64url') }),
  )
    .export({ format: 'der', type: 'spki' })
    .subarray(SPKI_PREFIX.length)
    .toString('base64url')
  if (publicKey !== identity.publicKey) throw new HbarError('NODE_IDENTITY_INVALID', 'Node identity keys do not match')
  return identity
}
export function nodeChallenge(): string {
  return randomBytes(32).toString('base64url')
}
export function nodeAuthTranscript(
  conversationKey: string,
  workspaceKey: string,
  conversationChallenge: string,
  workspaceChallenge: string,
  side: 'conversation' | 'workspace' | 'joined',
): string {
  return JSON.stringify([
    'hbar.node.authentication.v1',
    side,
    nodePublicKeySchema.parse(conversationKey),
    nodePublicKeySchema.parse(workspaceKey),
    nodeChallengeSchema.parse(conversationChallenge),
    nodeChallengeSchema.parse(workspaceChallenge),
  ])
}
export function signNode(identity: NodeIdentity, transcript: string): string {
  return sign(
    null,
    Buffer.from(transcript),
    createPrivateKey({ format: 'der', type: 'pkcs8', key: Buffer.from(identity.privateKey, 'base64url') }),
  ).toString('base64url')
}
export function verifyNode(publicKey: string, transcript: string, signature: string): boolean {
  return verify(
    null,
    Buffer.from(transcript),
    nodePublicKey(publicKey),
    Buffer.from(nodeSignatureSchema.parse(signature), 'base64url'),
  )
}
