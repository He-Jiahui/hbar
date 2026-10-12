import { expect, test } from 'bun:test'
import type { StorageFatalEvent, StorageFatalListener, StoragePort } from '@hbar/storage'
import { KernelExecutionScope } from './runtime-execution'

const fatalEvent: StorageFatalEvent = {
  kind: 'timeout',
  code: 'STORAGE_TIMEOUT',
  message: 'private diagnostic message',
  method: 'append',
  occurredAt: 1,
}

test('execution-scoped StoragePort forwards fatal listeners and their disposer', () => {
  const listeners = new Set<StorageFatalListener>()
  const source: StoragePort = {
    call: async () => {
      throw new Error('unused')
    },
    close: async () => {},
    onFatal(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  const wrapped = new KernelExecutionScope(undefined).storage(source)
  const received: StorageFatalEvent[] = []
  const remove = wrapped.onFatal?.((event) => received.push(event))

  for (const listener of listeners) listener(fatalEvent)
  expect(received).toEqual([fatalEvent])
  remove?.()
  for (const listener of listeners) listener(fatalEvent)
  expect(received).toEqual([fatalEvent])
})

test('execution-scoped StoragePort preserves an unavailable optional fatal port', () => {
  const source: StoragePort = {
    call: async () => {
      throw new Error('unused')
    },
    close: async () => {},
  }

  expect(new KernelExecutionScope(undefined).storage(source).onFatal).toBeUndefined()
})
