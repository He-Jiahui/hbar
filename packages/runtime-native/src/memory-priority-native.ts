import { HbarError } from '@hbar/contracts/errors'

interface MemoryPriorityNative {
  currentThreadMemoryPriority(): unknown
  setCurrentThreadMemoryPriority(priority: number): void
}

function nativeModule(): MemoryPriorityNative {
  let value: unknown
  try {
    value = require('../native/hbar_runtime_native.node')
  } catch (cause) {
    throw new HbarError('RUNTIME_RESTART_REQUIRED', 'Build the native runtime module before scanning storage', {
      cause,
    })
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    !('currentThreadMemoryPriority' in value) ||
    typeof value.currentThreadMemoryPriority !== 'function' ||
    !('setCurrentThreadMemoryPriority' in value) ||
    typeof value.setCurrentThreadMemoryPriority !== 'function'
  )
    throw new HbarError('RUNTIME_RESTART_REQUIRED', 'Native storage scans need the current runtime module')
  return value as MemoryPriorityNative
}

export function currentThreadMemoryPriority(): number {
  const priority = nativeModule().currentThreadMemoryPriority()
  if (typeof priority !== 'number' || !Number.isInteger(priority) || priority < 1 || priority > 5)
    throw new HbarError('RUNTIME_MEMORY_PRIORITY_UNCONFIRMED', 'Current thread memory priority is unconfirmed')
  return priority
}

export function setCurrentThreadMemoryPriority(priority: number): void {
  if (!Number.isInteger(priority) || priority < 1 || priority > 5)
    throw new TypeError('Invalid current thread memory priority')
  nativeModule().setCurrentThreadMemoryPriority(priority)
}
