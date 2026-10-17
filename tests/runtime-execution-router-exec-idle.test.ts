import { expect, test } from 'bun:test'
import { ExecutionRouter } from '@hbar/node-link'
import type { ExecutionProvider, ToolResult } from '@hbar/plugin-sdk'
import { nodeWorkspaceLocator } from '@hbar/contracts/node'
function deferred<Value>() {
  let resolve: (value: Value) => void = () => {
    throw new Error('Uninitialized fixture')
  }
  const promise = new Promise<Value>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function fixture(execute: ExecutionProvider['exec']) {
  const unused = (): Promise<never> => Promise.reject(new Error('Unexpected fixture operation'))
  const local: ExecutionProvider = { list: unused, read: unused, readBytes: unused, write: unused, exec: execute }
  let remoteCalls = 0
  const router = new ExecutionRouter({
    local,
    node: {
      call: () => {
        remoteCalls++
        return unused()
      },
    },
    current: () => undefined,
    loadSnapshot: unused,
  })
  return {
    router,
    get remoteCalls() {
      return remoteCalls
    },
  }
}
test('public exec retains pending actual provider execution then returns to zero after known success', async () => {
  const held = deferred<ToolResult>(),
    entered = deferred<void>(),
    f = fixture(() => {
      entered.resolve()
      return held.promise
    })
  const pending = f.router.exec('D:/fixture', 'controlled', new AbortController().signal)
  try {
    await entered.promise
    expect(f.router.idleRequests()).toBeGreaterThan(0)
    held.resolve({ text: 'known success' })
    expect(await pending).toMatchObject({ text: 'known success' })
    expect(f.router.idleRequests()).toBe(0)
    expect(f.remoteCalls).toBe(0)
  } finally {
    held.resolve({ text: 'cleanup' })
    await pending
    await f.router.dispose()
  }
})
test('public exec EFFECT_UNKNOWN remains occupied after settled result and repeated metadata reads', async () => {
  const f = fixture(() =>
    Promise.resolve({
      text: 'unknown effect retained',
      isError: true,
      details: { code: 'EFFECT_UNKNOWN', executionStarted: true },
    }),
  )
  try {
    const result = await f.router.exec('D:/fixture', 'controlled', new AbortController().signal)
    expect(result).toMatchObject({ details: { code: 'EFFECT_UNKNOWN' } })
    const first = f.router.idleRequests()
    expect(first).toBeGreaterThan(0)
    expect(f.router.idleRequests()).toBe(first)
    expect(f.router.idleRequests()).toBe(first)
    expect(f.remoteCalls).toBe(0)
  } finally {
    await f.router.dispose()
  }
})
test('known unstarted remote scope rejection settles without creating unknown occupancy or invoking either provider', async () => {
  let localCalls = 0
  const f = fixture(() => {
    localCalls++
    return Promise.resolve({ text: 'must not execute' })
  })
  try {
    const result = await f.router.exec(
      nodeWorkspaceLocator('node', 'engine'),
      'do not execute',
      new AbortController().signal,
    )
    expect(result).toMatchObject({
      isError: true,
      details: { code: 'RUNTIME_EXECUTION_REQUIRED', executionStarted: false },
    })
    expect(f.router.idleRequests()).toBe(0)
    expect(localCalls).toBe(0)
    expect(f.remoteCalls).toBe(0)
  } finally {
    await f.router.dispose()
  }
})
