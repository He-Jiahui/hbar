import { currentThreadMemoryPriority, setCurrentThreadMemoryPriority } from './memory-priority-native'

function synchronousRead<T>(read: () => T): T {
  const result = read()
  if (
    ((typeof result === 'object' && result !== null) || typeof result === 'function') &&
    'then' in result &&
    typeof result.then === 'function'
  )
    throw new TypeError('Memory priority scope requires a synchronous callback')
  return result
}

/**
 * Give pages touched by a synchronous Windows scan a low memory priority, then
 * restore the caller's exact priority. Other platforms execute the same read.
 * This changes page retention priority, not CPU priority or a process-wide cache policy.
 */
export function withReadMostlyMemoryPriority<T>(read: () => T): T {
  if (process.platform !== 'win32') return synchronousRead(read)
  const previous = currentThreadMemoryPriority()
  const desired = Math.min(previous, 2)
  if (desired !== previous) setCurrentThreadMemoryPriority(desired)
  try {
    return synchronousRead(read)
  } finally {
    if (desired !== previous) setCurrentThreadMemoryPriority(previous)
  }
}
