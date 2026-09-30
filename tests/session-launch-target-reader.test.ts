import { expect, test } from 'bun:test'
import { createSessionLaunchTargetReader } from '@hbar/client'
import { HbarError } from '@hbar/contracts'
import type { RpcParams } from '@hbar/contracts'
import {
  sessionLaunchTargetGetInputSchema,
  type SessionLaunchTarget,
} from '@hbar/contracts/commands/session-launch-target'

function target(sessionId = 'session-a', revision = 7): SessionLaunchTarget {
  return {
    sessionId,
    workspaceId: 'workspace-a',
    revision,
    selection: { mode: 'shared-current' },
    locked: false,
    resolution: { status: 'idle' },
    updatedAt: 1,
  }
}

function deferred() {
  let resolve!: (value: unknown) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<unknown>((accept, decline) => {
    resolve = accept
    reject = decline
  })
  return { promise, resolve, reject }
}

test('launch-target reader asks the Host for each exact revision without cache, default or mutation commands', async () => {
  const calls: RpcParams<'command.execute'>[] = []
  let revision = 0
  const reader = createSessionLaunchTargetReader({
    async call(method, input) {
      expect(method).toBe('command.execute')
      calls.push(input)
      return target('session-a', revision++)
    },
  })
  expect(Object.keys(reader)).toEqual(['read'])
  expect((await reader.read('session-a', { requestId: 'reader-request' })).revision).toBe(0)
  expect((await reader.read('session-a')).revision).toBe(1)
  expect(calls).toHaveLength(2)
  expect(calls[0]).toEqual({
    protocol: 1,
    requestId: 'reader-request',
    commandId: 'sessionLaunchTarget.get',
    commandVersion: 3,
    input: { sessionId: 'session-a' },
  })
  expect(calls[1]).toMatchObject({ commandId: 'sessionLaunchTarget.get', input: { sessionId: 'session-a' } })
  expect(calls[1]).not.toHaveProperty('idempotencyKey')
})

test('invalid identity and pre-aborted read do not dispatch to Host', async () => {
  let calls = 0
  const reader = createSessionLaunchTargetReader({
    async call() {
      calls++
      return target()
    },
  })
  await expect(reader.read('')).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  const controller = new AbortController()
  controller.abort()
  await expect(reader.read('session-a', { signal: controller.signal })).rejects.toMatchObject({ code: 'CANCELLED' })
  expect(calls).toBe(0)
})

test('malformed, path-bearing and wrong-session replies never become a valid target', async () => {
  const replies: unknown[] = [
    { ...target(), revision: -1 },
    { ...target(), revision: Number.MAX_SAFE_INTEGER + 1 },
    { ...target(), targetPath: 'C:/host-private/worktree' },
    { ...target(), selection: { mode: 'shared-current', cwd: 'C:/foreign' } },
    target('session-b'),
  ]
  const reader = createSessionLaunchTargetReader({
    async call() {
      return replies.shift()
    },
  })
  for (let index = 0; index < 5; index++)
    await expect(reader.read('session-a')).rejects.toMatchObject({ code: 'INVALID_OUTPUT' })
})

test('cancellation stops observation promptly and consumes a late rejected transport read', async () => {
  const pending = deferred()
  let calls = 0
  const reader = createSessionLaunchTargetReader({
    call() {
      calls++
      return calls === 1 ? pending.promise : Promise.resolve(target('session-a', 8))
    },
  })
  const controller = new AbortController()
  const read = reader.read('session-a', { signal: controller.signal })
  controller.abort()
  await expect(read).rejects.toMatchObject({ code: 'CANCELLED' })
  pending.reject(new HbarError('DISCONNECTED', 'late transport settlement'))
  await Promise.resolve()
  expect((await reader.read('session-a')).revision).toBe(8)
  expect(calls).toBe(2)
})

test('an abort during dispatch is observed even before the read listener is attached', async () => {
  const controller = new AbortController()
  const reader = createSessionLaunchTargetReader({
    call() {
      controller.abort()
      return Promise.resolve(target())
    },
  })
  await expect(reader.read('session-a', { signal: controller.signal })).rejects.toMatchObject({ code: 'CANCELLED' })
})

test('concurrent reads keep their own session identity when Host replies arrive out of order', async () => {
  const pendingA = deferred()
  const pendingB = deferred()
  const reader = createSessionLaunchTargetReader({
    call(_method, request) {
      const input = sessionLaunchTargetGetInputSchema.parse(request.input)
      return input.sessionId === 'session-a' ? pendingA.promise : pendingB.promise
    },
  })
  const a = reader.read('session-a')
  const b = reader.read('session-b')
  pendingB.resolve(target('session-b', 13))
  expect(await b).toMatchObject({ sessionId: 'session-b', revision: 13 })
  pendingA.resolve(target('session-a', 7))
  expect(await a).toMatchObject({ sessionId: 'session-a', revision: 7 })
})

test('typed Host and transport failures remain query failures, never guessed shared targets', async () => {
  for (const code of ['TIMEOUT', 'DISCONNECTED', 'NOT_FOUND', 'UNAUTHORIZED']) {
    const reader = createSessionLaunchTargetReader({
      async call() {
        throw new HbarError(code, 'fixture read failure')
      },
    })
    await expect(reader.read('session-a')).rejects.toMatchObject({ code })
  }
})
