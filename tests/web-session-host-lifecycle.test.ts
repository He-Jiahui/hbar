import { expect, test } from 'bun:test'
import { spawn, type ChildProcess } from 'node:child_process'
import { stopOwnedWebSessionHostChild, waitForWebSessionHostReady } from '../e2e/support/web-session-host'

const ready = {
  token: 'owned-fixture-token',
  workspaceId: 'fixture-workspace',
  workspaceName: 'fixture workspace',
  sessionId: 'fixture-session',
  sessionTitle: 'fixture session',
}
const start = (code: string): ChildProcess =>
  spawn(process.execPath, ['-e', code], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
const ended = (child: ChildProcess) => child.exitCode !== null || child.signalCode !== null
const expectReleased = (child: ChildProcess) => {
  expect(child.listenerCount('exit')).toBe(0)
  expect(child.listenerCount('error')).toBe(0)
  expect(child.stderr?.listenerCount('data')).toBe(0)
}

test('a startup timeout terminates its owned child before rejecting and releases all observation resources', async () => {
  const child = start('setInterval(() => {}, 1000)')
  try {
    await expect(waitForWebSessionHostReady(child, 25)).rejects.toThrow('E2E Host did not start')
    expect(ended(child)).toBe(true)
    expectReleased(child)
  } finally {
    await stopOwnedWebSessionHostChild(child)
  }
})

test('a Host exiting before readiness produces a terminal startup error without leaked observers', async () => {
  const child = start('process.exit(7)')
  try {
    await expect(waitForWebSessionHostReady(child, 5_000)).rejects.toThrow('E2E Host exited with 7')
    expect(ended(child)).toBe(true)
    expectReleased(child)
  } finally {
    await stopOwnedWebSessionHostChild(child)
  }
})

test('readiness validates the complete protocol and leaves a successful child owned by its caller', async () => {
  const child = start(
    `console.log('non-protocol diagnostic'); console.log(JSON.stringify(${JSON.stringify(ready)})); setInterval(() => {}, 1000)`,
  )
  try {
    expect(await waitForWebSessionHostReady(child, 5_000)).toEqual(ready)
    expect(ended(child)).toBe(false)
    expectReleased(child)
  } finally {
    await stopOwnedWebSessionHostChild(child)
  }
  expect(ended(child)).toBe(true)
  expectReleased(child)
})

test('partial or wrong-shaped readiness is not accepted and the failed child is terminated', async () => {
  const child = start(
    `console.log(JSON.stringify(${JSON.stringify({ ...ready, token: 3 })})); setInterval(() => {}, 1000)`,
  )
  let observed = ''
  const collect = (chunk: unknown) => {
    observed += String(chunk)
  }
  child.stdout?.on('data', collect)
  try {
    await expect(waitForWebSessionHostReady(child, 1_000)).rejects.toThrow('E2E Host did not start')
    expect(observed).toContain('"token":3')
    expect(ended(child)).toBe(true)
    expectReleased(child)
  } finally {
    child.stdout?.off('data', collect)
    await stopOwnedWebSessionHostChild(child)
  }
})

test('a failed spawn rejects promptly and releases startup observers without an owned PID', async () => {
  const child = spawn(`hbar-missing-executable-${crypto.randomUUID()}`, [], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  await expect(waitForWebSessionHostReady(child, 5_000)).rejects.toHaveProperty('code', 'ENOENT')
  expect(child.pid).toBeUndefined()
  expectReleased(child)
})
