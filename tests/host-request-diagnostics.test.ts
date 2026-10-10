import { expect, test } from 'bun:test'
import {
  PROTOCOL_VERSION,
  type DiagnosticEvent,
  type DiagnosticSink,
  type ReadonlyDiagnosticCorrelation,
} from '@hbar/contracts'
import { createHostRequestDiagnostics } from '../apps/host/src/request-diagnostics'
import { HbarClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server'
import { Storage, type StorageMethods, type StoragePort, resolvePathLayout } from '@hbar/storage'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { basename, dirname } from 'node:path'

function sink(events: DiagnosticEvent[], throwing = false): DiagnosticSink {
  return {
    emit(event) {
      events.push(event)
      if (throwing) throw new Error('sink fixture failure')
    },
  }
}

test('host request diagnostics records staged failure metadata without request payloads', () => {
  const events: DiagnosticEvent[] = []
  const diagnostics = createHostRequestDiagnostics({ sink: sink(events), sampleRate: 0 })
  const span = diagnostics.begin({
    method: 'command.execute',
    rpcId: 'rpc-1',
    connectionId: 'connection-1',
    bytesIn: 42,
    pending: 1,
  })
  span.stage('admission')
  span.stage('auth')
  span.failure('UNAUTHORIZED', { pending: 1 })
  const text = JSON.stringify(events)
  expect(events.some((event) => event.event === 'rpc.failed' && event.errorCode === 'UNAUTHORIZED')).toBe(true)
  expect(events.some((event) => event.phase === 'auth')).toBe(true)
  expect(text).not.toContain('token')
  expect(text).not.toContain('params')
  expect(text).toContain('connection-1')
})

test('fast successful calls are sampled and sink/context failures do not escape', () => {
  const events: DiagnosticEvent[] = []
  const diagnostics = createHostRequestDiagnostics({
    sink: sink(events, true),
    sampleRate: 1,
    contextPort: {
      resolve: () => {
        throw new Error('context fixture failure')
      },
    },
  })
  expect(() => {
    const span = diagnostics.begin({ method: 'system.hello', rpcId: 7, bytesIn: 8, pending: 1 })
    span.success({ bytesOut: 16, pending: 0 })
    diagnostics.frame('out', 16)
  }).not.toThrow()
  expect(events.length).toBeGreaterThan(0)
})

test('full frame diagnostics expose only byte counts and invalid methods are normalized', () => {
  const events: DiagnosticEvent[] = []
  const diagnostics = createHostRequestDiagnostics({ sink: sink(events), full: true })
  diagnostics.frame('in', 12)
  const span = diagnostics.begin({ method: 'bad method with secret-token', rpcId: 'id', bytesIn: 12, pending: 1 })
  span.failure('INVALID_REQUEST')
  expect(events.some((event) => event.event === 'rpc.frame_in' && event.bytesIn === 12)).toBe(true)
  expect(events.some((event) => event.method === 'unknown')).toBe(true)
  expect(JSON.stringify(events)).not.toContain('secret-token')
})

test('real local Host and Client WebSocket records success, failure and sink isolation', async () => {
  const events: DiagnosticEvent[] = []
  const scopes: ReadonlyDiagnosticCorrelation[] = []
  let scopeRuns = 0
  const root = await mkdtemp(join(tmpdir(), 'hbar-host-diagnostics-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(kernel, {
    port: 0,
    diagnosticSink: sink(events, true),
    diagnosticSampleRate: 1,
    diagnosticScope: {
      current: () => scopes.at(-1),
      run(context, operation) {
        scopeRuns++
        scopes.push({ ...context })
        try {
          return operation()
        } finally {
          scopes.pop()
        }
      },
    },
  })
  const device = await host.auth.createDevice('host diagnostics fixture')
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`, device.token)
  try {
    await client.connect()
    await client.call('system.diagnose', {})
    await expect(
      client.call('system.hello', { protocol: PROTOCOL_VERSION, token: 'fixture-secret-token' }),
    ).rejects.toThrow()
    expect(events.some((event) => event.event === 'rpc.completed')).toBe(true)
    expect(events.some((event) => event.event === 'rpc.failed')).toBe(true)
    expect(scopeRuns).toBeGreaterThan(0)
    expect(scopes).toHaveLength(0)
    expect(JSON.stringify(events)).not.toContain('fixture-secret-token')
  } finally {
    client.disconnect()
    await host.close()
    await kernel.close()
    const temporary = await realpath(tmpdir())
    const owned = await realpath(root)
    expect(dirname(owned)).toBe(temporary)
    expect(basename(owned).startsWith('hbar-host-diagnostics-')).toBe(true)
    await rm(owned, { recursive: true, force: true })
  }
})

test('real RPC late disconnect executes a gated workspace storage delegate once and skips the reply', async () => {
  const events: DiagnosticEvent[] = []
  const root = await mkdtemp(join(tmpdir(), 'hbar-host-late-disconnect-'))
  let storageCalls = 0
  let gateEnabled = false
  let enteredResolve: () => void = () => undefined
  const entered = new Promise<void>((resolve) => {
    enteredResolve = resolve
  })
  let release: () => void = () => undefined
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
    profile: {
      async createStorage(home): Promise<StoragePort> {
        const layout = await resolvePathLayout({ home })
        const delegate = new Storage(layout.database, layout)
        return {
          call<K extends keyof StorageMethods>(method: K, ...args: Parameters<StorageMethods[K]>) {
            if (!gateEnabled || method !== 'workspacePage') return delegate.call(method, ...args)
            storageCalls++
            enteredResolve()
            return held.then(() => delegate.call(method, ...args))
          },
          close: () => delegate.close(),
          onFatal: (listener) => delegate.onFatal(listener),
        }
      },
    },
  })
  const host = await startServer(kernel, { port: 0, diagnosticSink: sink(events), diagnosticSampleRate: 1 })
  const device = await host.auth.createDevice('late disconnect fixture')
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`, device.token)
  try {
    await client.connect()
    const connectedDeadline = Date.now() + 2_000
    while (host.server.pendingWebSockets !== 1 && Date.now() < connectedDeadline)
      await new Promise((resolve) => setTimeout(resolve, 10))
    expect(host.server.pendingWebSockets).toBe(1)
    gateEnabled = true
    const request = client.call('workspace.list', { limit: 60 }).then(
      () => ({ failed: false }),
      () => ({ failed: true }),
    )
    const enteredDeadline = Date.now() + 2_000
    while (storageCalls === 0 && Date.now() < enteredDeadline) await new Promise((resolve) => setTimeout(resolve, 10))
    expect(storageCalls).toBe(1)
    await entered
    client.disconnect()
    const closedDeadline = Date.now() + 2_000
    while (host.server.pendingWebSockets !== 0 && Date.now() < closedDeadline)
      await new Promise((resolve) => setTimeout(resolve, 10))
    expect(host.server.pendingWebSockets).toBe(0)
    release()
    expect(await request).toEqual({ failed: true })
    expect(storageCalls).toBe(1)
    const replyDeadline = Date.now() + 2_000
    while (
      !events.some(
        (event) =>
          event.event === 'rpc.reply_skipped' &&
          event.method === 'workspace.list' &&
          event.errorCode === 'REPLY_NOT_DELIVERED',
      ) &&
      Date.now() < replyDeadline
    )
      await new Promise((resolve) => setTimeout(resolve, 10))
    const skipped = events.find(
      (event) =>
        event.event === 'rpc.reply_skipped' &&
        event.method === 'workspace.list' &&
        event.errorCode === 'REPLY_NOT_DELIVERED',
    )
    const rpcId = skipped?.rpcId
    expect(rpcId).toBeDefined()
    expect(
      events.filter(
        (event) =>
          event.event === 'rpc.reply_skipped' &&
          event.method === 'workspace.list' &&
          event.rpcId === rpcId &&
          event.errorCode === 'REPLY_NOT_DELIVERED',
      ),
    ).toHaveLength(1)
    expect(events.filter((event) => event.event === 'rpc.completed' && event.method === 'workspace.list')).toHaveLength(
      0,
    )
  } finally {
    client.disconnect()
    release()
    try {
      await host.close()
    } finally {
      await kernel.close()
    }
    const temporary = await realpath(tmpdir())
    const owned = await realpath(root)
    expect(dirname(owned)).toBe(temporary)
    expect(basename(owned).startsWith('hbar-host-late-disconnect-')).toBe(true)
    await rm(owned, { recursive: true, force: true })
  }
})
