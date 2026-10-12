import { HbarError } from '@hbar/contracts'
import { NODE_LIMITS } from '@hbar/contracts/node'

/** Network JSON is bounded before recursive schema evaluation or full serialization. */
export function validateNodeJSON(root: unknown): void {
  const stack: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }]
  let count = 0,
    bytes = 0
  while (stack.length) {
    const item = stack.pop()
    if (!item) break
    if (++count > 65_536 || item.depth > 64)
      throw new HbarError('NODE_FRAME_LIMIT', 'Node JSON structure exceeds its bound')
    const value = item.value
    if (typeof value === 'string') bytes += Buffer.byteLength(value)
    else if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new HbarError('NODE_FRAME_INVALID', 'Node JSON contains a non-finite value')
      bytes += 24
    } else if (typeof value === 'boolean' || value === null) bytes += 5
    else if (typeof value === 'object') {
      if (Array.isArray(value)) {
        if (value.length > 65_536) throw new HbarError('NODE_FRAME_LIMIT', 'Node JSON array exceeds its bound')
        for (const child of value) stack.push({ value: child, depth: item.depth + 1 })
      } else {
        if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
          throw new HbarError('NODE_FRAME_INVALID', 'Node frames accept plain JSON only')
        for (const [key, child] of Object.entries(value)) {
          bytes += Buffer.byteLength(key) + 3
          stack.push({ value: child, depth: item.depth + 1 })
        }
      }
    } else throw new HbarError('NODE_FRAME_INVALID', 'Node frames accept plain JSON only')
    if (bytes > NODE_LIMITS.frameBytes || stack.length > 65_536)
      throw new HbarError('NODE_FRAME_LIMIT', 'Node JSON payload exceeds its bound')
  }
}
export function encodeNodeFrame(value: unknown): string {
  validateNodeJSON(value)
  const text = JSON.stringify(value)
  if (Buffer.byteLength(text) > NODE_LIMITS.frameBytes)
    throw new HbarError('NODE_FRAME_LIMIT', 'Node frame exceeds one MiB')
  return text
}
export function decodeNodeFrame(text: string): unknown {
  if (Buffer.byteLength(text) > NODE_LIMITS.frameBytes)
    throw new HbarError('NODE_FRAME_LIMIT', 'Node frame exceeds one MiB')
  const value: unknown = JSON.parse(text)
  validateNodeJSON(value)
  return value
}
export function nodeWebSocketURL(value: string): string {
  const url = new URL(value)
  if (url.username || url.password || url.search || url.hash)
    throw new HbarError('NODE_URL_INVALID', 'Node URL cannot contain credentials, query parameters or fragments')
  if (url.protocol === 'https:') url.protocol = 'wss:'
  if (url.protocol === 'http:') url.protocol = 'ws:'
  if (!['ws:', 'wss:'].includes(url.protocol))
    throw new HbarError('NODE_URL_INVALID', 'Node connection requires WebSocket transport')
  if (url.protocol !== 'wss:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    throw new HbarError('NODE_TLS_REQUIRED', 'Non-loopback node connections require WSS')
  if (url.pathname !== '/' && url.pathname !== '/node')
    throw new HbarError('NODE_URL_INVALID', 'Node endpoint must be /node')
  url.pathname = '/node'
  return url.href
}
