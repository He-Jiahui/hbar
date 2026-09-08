import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { HbarError } from '@hbar/contracts'
import type { StoragePort } from '@hbar/storage'

export class Auth {
  private pairing = { code: '', expiresAt: 0 }
  private attempts = new Map<string, { count: number; resetAt: number }>()
  constructor(private storage: StoragePort) {}
  createPairing() {
    this.pairing = { code: String(randomInt(10_000_000, 100_000_000)), expiresAt: Date.now() + 5 * 60_000 }
    return { ...this.pairing }
  }
  async pair(code: string, name: string, address: string) {
    const now = Date.now()
    for (const [key, limit] of this.attempts) if (limit.resetAt < now) this.attempts.delete(key)
    if (this.attempts.size > 2000) throw new HbarError('RATE_LIMIT', 'Too many pairing attempts')
    const attempt = this.attempts.get(address) ?? { count: 0, resetAt: now + 60_000 }
    this.attempts.set(address, attempt)
    if (++attempt.count > 5) throw new HbarError('RATE_LIMIT', 'Try pairing again in one minute')
    const supplied = Buffer.from(code),
      expected = Buffer.from(this.pairing.code)
    if (
      !expected.length ||
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected) ||
      this.pairing.expiresAt < now
    )
      throw new HbarError('PAIRING_FAILED', 'Invalid or expired pairing code')
    this.pairing = { code: '', expiresAt: 0 }
    return this.createDevice(name)
  }
  async createDevice(name: string) {
    const token = randomBytes(32).toString('base64url')
    const device = { id: crypto.randomUUID(), name: name.slice(0, 100), createdAt: Date.now(), lastSeenAt: Date.now() }
    await this.storage.call('putDevice', device, this.hash(token))
    return { token, device }
  }
  hash(token: string) {
    return createHash('sha256').update(token).digest('hex')
  }
  async authenticate(token?: string) {
    if (!token || token.length > 512) throw new HbarError('UNAUTHORIZED', 'Device pairing required')
    const device = await this.storage.call('deviceByHash', this.hash(token))
    if (!device) throw new HbarError('UNAUTHORIZED', 'Device credential is invalid or revoked')
    return device
  }
}
export function requestToken(request: Request): string | undefined {
  const authorization = request.headers.get('authorization')
  if (authorization?.startsWith('Bearer ')) return authorization.slice(7)
  for (const item of (request.headers.get('cookie') ?? '').split(';')) {
    const [name, ...value] = item.trim().split('=')
    if (name === 'hbar_device') return value.join('=')
  }
  return undefined
}
