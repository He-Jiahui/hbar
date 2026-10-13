import { HbarError } from './index'
import { NODE_LIMITS } from './node'

/** Bound a result before whole-object serialization, reserving room for its JSON-RPC envelope. */
export function boundedNodeResult(value: unknown): unknown {
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }]
  const encoder = new TextEncoder()
  let bytes = 0,
    entries = 0
  while (pending.length) {
    const current = pending.pop()
    if (!current) break
    if (++entries > 65_536 || current.depth > 64)
      throw new HbarError('NODE_QUERY_RESULT_LIMIT', 'Node result structure exceeds its bound')
    const item = current.value
    if (item === undefined) continue
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean' || item === null) {
      if (typeof item === 'number' && !Number.isFinite(item))
        throw new HbarError('NODE_QUERY_RESULT_LIMIT', 'Node result is not finite JSON')
      bytes += encoder.encode(JSON.stringify(item)).byteLength
    } else if (typeof item === 'object') {
      if (Array.isArray(item)) {
        if (item.length > 65_536) throw new HbarError('NODE_QUERY_RESULT_LIMIT', 'Node result array exceeds its bound')
        bytes += item.length + 2
        for (const child of item) pending.push({ value: child, depth: current.depth + 1 })
      } else {
        if (Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null)
          throw new HbarError('NODE_QUERY_RESULT_LIMIT', 'Node result is not plain data')
        const fields = Object.entries(item)
        if (fields.length > 65_536)
          throw new HbarError('NODE_QUERY_RESULT_LIMIT', 'Node result object exceeds its bound')
        bytes += fields.length * 2 + 2
        for (const [key, child] of fields) {
          bytes += encoder.encode(JSON.stringify(key)).byteLength
          pending.push({ value: child, depth: current.depth + 1 })
        }
      }
    } else throw new HbarError('NODE_QUERY_RESULT_LIMIT', 'Node result is not plain data')
    if (bytes > NODE_LIMITS.frameBytes - 4_096 || pending.length > 65_536)
      throw new HbarError('NODE_QUERY_RESULT_LIMIT', 'Request a smaller result page or use chunked reading')
  }
  // Optional fields are omitted only after the bound is known.
  const result: unknown = JSON.parse(JSON.stringify(value))
  return result
}
