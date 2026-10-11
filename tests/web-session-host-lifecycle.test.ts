import { expect, test } from 'bun:test'
import { spawn, type ChildProcess } from 'node:child_process'
import {
  createWebSessionHostLifecycleDiagnostics,
  stopOwnedWebSessionHostChild,
  waitForWebSessionHostReady,
  resolveWebSessionHostPort,
} from '../e2e/support/web-session-host'

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

test('the fixture listener follows its allocated proxy port and explicit targets take precedence', () => {
  const previous = process.env.HBAR_E2E_HOST_PORT
  try {
    delete process.env.HBAR_E2E_HOST_PORT
    expect(resolveWebSessionHostPort()).toBe(4317)
    process.env.HBAR_E2E_HOST_PORT = '52966'
    expect(resolveWebSessionHostPort()).toBe(52966)
    expect(resolveWebSessionHostPort(52967)).toBe(52967)
    process.env.HBAR_E2E_HOST_PORT = 'invalid'
    expect(resolveWebSessionHostPort(52967)).toBe(52967)
    expect(() => resolveWebSessionHostPort()).toThrow()
    for (const invalid of ['', '0', '-1', '65536', '1.5', 'NaN']) {
      process.env.HBAR_E2E_HOST_PORT = invalid
      expect(() => resolveWebSessionHostPort()).toThrow()
    }
    expect(() => resolveWebSessionHostPort(0)).toThrow()
  } finally {
    if (previous === undefined) delete process.env.HBAR_E2E_HOST_PORT
    else process.env.HBAR_E2E_HOST_PORT = previous
  }
})

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

test('opt-in lifecycle telemetry records only bounded redacted child facts', async () => {
  const child = start("console.error('EADDRINUSE secret-fixture-token'); setInterval(() => {}, 1000)")
  const diagnostics = createWebSessionHostLifecycleDiagnostics(child, true)
  const observedLogs: string[] = []
  const originalConsoleError = console.error
  console.error = (...args: Parameters<typeof console.error>) => {
    observedLogs.push(args.map(String).join(' '))
  }
  try {
    diagnostics.mark('ready')
    diagnostics.mark('client_connected')
    const deadline = Date.now() + 1_000
    while (diagnostics.snapshot().stderrBytes === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    const beforeStop = diagnostics.snapshot()
    expect(beforeStop.enabled).toBe(true)
    expect(beforeStop.pid).toBe(child.pid ?? null)
    expect(beforeStop.stderrBytes).toBeGreaterThan(0)
    expect(beforeStop.stderrCodes).toEqual(['EADDRINUSE'])
    expect(beforeStop.stderrSha256).toHaveLength(64)
    expect(beforeStop).not.toHaveProperty('stderr')
    expect(beforeStop).not.toHaveProperty('token')
  } finally {
    try {
      diagnostics.mark('stop_requested')
      await stopOwnedWebSessionHostChild(child)
      diagnostics.mark('stopped')
      const afterStop = diagnostics.snapshot()
      expect(afterStop.stage).toBe('stopped')
      expect(observedLogs.join('\n')).not.toContain('secret-fixture-token')
      expect(observedLogs.join('\n')).not.toContain('token')
    } finally {
      diagnostics.dispose()
      console.error = originalConsoleError
    }
  }
  expectReleased(child)
})
