import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import {
  nodeConsoleChallengeRequestSchema,
  nodeConsoleAuthenticatedRequestSchema,
  nodeConsolePairSigningText,
  nodeConsoleRequestSigningText,
  type nodeConsoleChallengeSchema,
} from '@hbar/contracts/node-console'

type ChallengePurpose = 'pair' | 'request'
interface ChallengeEntry {
  readonly purpose: ChallengePurpose
  readonly sourceKey: string
  readonly deviceId: string | null
  readonly expiresAt: number
}
interface RateEntry {
  windowStartedAt: number
  count: number
}
export type NodeConsoleChallenge = z.infer<typeof nodeConsoleChallengeSchema>

const challengeLifetimeMs = 30_000
const rateWindowMs = 60_000
const maxChallenges = 8_192
const maxRateEntries = 4_096
const sourcePairChallengesPerMinute = 12
const sourceRequestChallengesPerMinute = 120
const ed25519SpkiPrefix = Buffer.from('302a300506032b6570032100', 'hex')

/** Owns short-lived, one-use B-console challenges independently from A's device auth. */
export class NodeConsoleAuthenticator {
  private readonly challenges = new Map<string, ChallengeEntry>()
  private readonly rates = new Map<string, RateEntry>()

  issue(input: unknown, sourceKey: string, now = Date.now()): NodeConsoleChallenge {
    const request = nodeConsoleChallengeRequestSchema.parse(input)
    this.prune(now)
    const rateKey = `${request.purpose}:${sourceKey}`
    const rate = this.rates.get(rateKey)
    if (!rate && this.rates.size >= maxRateEntries)
      throw new HbarError('RATE_LIMIT', 'B console challenge source capacity reached')
    const current = rate ?? { windowStartedAt: now, count: 0 }
    if (now - current.windowStartedAt >= rateWindowMs) {
      current.windowStartedAt = now
      current.count = 0
    }
    const sourceLimit = request.purpose === 'pair' ? sourcePairChallengesPerMinute : sourceRequestChallengesPerMinute
    if (current.count >= sourceLimit) throw new HbarError('RATE_LIMIT', 'B console challenge rate limit reached')
    if (this.challenges.size >= maxChallenges) throw new HbarError('NODE_BUSY', 'B console challenge capacity reached')
    current.count++
    this.rates.set(rateKey, current)
    const nonce = randomBytes(32).toString('base64url')
    const deviceId = request.purpose === 'request' ? request.deviceId : null
    const challenge = { nonce, expiresAt: now + challengeLifetimeMs }
    this.challenges.set(nonce, { purpose: request.purpose, sourceKey, deviceId, expiresAt: challenge.expiresAt })
    return challenge
  }

  consume(
    nonce: string,
    purpose: ChallengePurpose,
    sourceKey: string,
    deviceId: string | null,
    now = Date.now(),
  ): boolean {
    const entry = this.challenges.get(nonce)
    this.challenges.delete(nonce)
    return (
      !!entry &&
      entry.expiresAt > now &&
      entry.purpose === purpose &&
      entry.sourceKey === sourceKey &&
      entry.deviceId === deviceId
    )
  }

  private prune(now: number): void {
    for (const [nonce, entry] of this.challenges) if (entry.expiresAt <= now) this.challenges.delete(nonce)
    for (const [source, entry] of this.rates) if (now - entry.windowStartedAt >= rateWindowMs) this.rates.delete(source)
  }
}

export function nodeConsoleSourceKey(address: string): string {
  return createHash('sha256').update(address).digest('hex')
}

function ed25519PublicKey(encoded: string) {
  const raw = Buffer.from(encoded, 'base64url')
  if (raw.length !== 32) throw new HbarError('NODE_AUTH_INVALID', 'Invalid B console device public key')
  return createPublicKey({ key: Buffer.concat([ed25519SpkiPrefix, raw]), format: 'der', type: 'spki' })
}

export function verifyNodeConsolePairProof(input: {
  nonce: string
  code: string
  name: string
  publicKey: string
  signature: string
}): boolean {
  try {
    return verify(
      null,
      Buffer.from(nodeConsolePairSigningText(input)),
      ed25519PublicKey(input.publicKey),
      Buffer.from(input.signature, 'base64url'),
    )
  } catch {
    return false
  }
}

export function verifyNodeConsoleRequestProof(input: {
  nonce: string
  deviceId: string
  method: string
  input: z.input<typeof nodeConsoleAuthenticatedRequestSchema>['input']
  signature: string
  publicKey: string
}): boolean {
  try {
    return verify(
      null,
      Buffer.from(nodeConsoleRequestSigningText(input)),
      ed25519PublicKey(input.publicKey),
      Buffer.from(input.signature, 'base64url'),
    )
  } catch {
    return false
  }
}
