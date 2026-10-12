import { expect, test } from 'bun:test'
import { releaseExecutionAbortListener } from '../apps/node/src/execution-process'

test('completed process removes its abort listener before later cancellation', () => {
  const controller = new AbortController()
  let abortCalls = 0
  const abort = () => abortCalls++
  controller.signal.addEventListener('abort', abort, { once: true })

  releaseExecutionAbortListener(controller.signal, abort, undefined)
  controller.abort()

  expect(abortCalls).toBe(0)
})
