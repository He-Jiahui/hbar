import { expect, test } from 'bun:test'
import { z } from 'zod'
import { IpcPeer, procedure } from '@hbar/runtime'
import type { IpcCallTimeout } from '@hbar/runtime'
import { ManagedProcess } from '@hbar/runtime'
import { diagnosticEventSchema } from '@hbar/contracts/diagnostics'
import type { DiagnosticEvent } from '@hbar/contracts/diagnostics'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { STORAGE_SCHEMA_VERSION } from '@hbar/storage'

function fixture(observer: (event: IpcCallTimeout) => void) {
  const owner = { unitId: 'parent', generation: 1, incarnation: 'parent-incarnation' }
  const remote = { unitId: 'child', generation: 1, incarnation: 'child-incarnation' }
  let right: IpcPeer | undefined
  let dispatchedTimeouts = 0
  const left = new IpcPeer({
    owner,
    remote,
    inFlight: 1,
    reservedControl: 0,
    transport: { send: (frame) => right?.receive(frame) },
    onCallTimeout: observer,
    onTimeout: () => {
      dispatchedTimeouts++
    },
  })
  right = new IpcPeer({ owner: remote, remote: owner, transport: { send: (frame) => left.receive(frame) } })
  return {
    left,
    right,
    dispatchedTimeouts: () => dispatchedTimeouts,
    close: () => {
      left.close()
      right?.close()
    },
  }
}
const rejected = (value: Promise<unknown>) => value.catch((error: unknown) => error)

test('dispatched deadline records only generated identity, named method and monotonic duration', async () => {
  const events: IpcCallTimeout[] = []
  const peers = fixture((event) => events.push(event))
  let release: (() => void) | undefined
  const blocked = new Promise<void>((resolve) => {
    release = resolve
  })
  peers.right.register(
    'fixture.wait',
    procedure(z.unknown(), z.undefined(), async () => {
      await blocked
    }),
  )
  try {
    const canary = 'private-input-and-request-identity-7180'
    expect(
      await rejected(peers.left.call('fixture.wait', { canary }, z.undefined(), { timeoutMs: 25, requestId: canary })),
    ).toMatchObject({ code: 'IPC_TIMEOUT' })
    expect(events).toHaveLength(1)
    const event = events[0]
    if (!event) throw new Error('Timeout event missing')
    expect(event).toMatchObject({ method: 'fixture.wait', phase: 'dispatched' })
    expect(event.elapsedMs).toBeGreaterThanOrEqual(0)
    expect(event.callId).toMatch(/^[a-f0-9-]{36}$/)
    expect(Object.keys(event).sort()).toEqual(['callId', 'elapsedMs', 'method', 'phase'])
    expect(JSON.stringify(events)).not.toContain(canary)
    expect(peers.dispatchedTimeouts()).toBe(1)
  } finally {
    release?.()
    peers.close()
  }
})

test('queued deadlines are observed without invoking dispatched timeout fencing; cancellation is not a timeout', async () => {
  const events: IpcCallTimeout[] = []
  const peers = fixture((event) => events.push(event))
  let release: (() => void) | undefined
  let started: (() => void) | undefined
  const blocked = new Promise<void>((resolve) => {
    release = resolve
  })
  const entered = new Promise<void>((resolve) => {
    started = resolve
  })
  peers.right.register(
    'fixture.wait',
    procedure(z.unknown(), z.undefined(), async () => {
      started?.()
      await blocked
    }),
  )
  const pending = rejected(peers.left.call('fixture.wait', null, z.undefined(), { timeoutMs: 5_000 }))
  try {
    await entered
    expect(await rejected(peers.left.call('fixture.wait', null, z.undefined(), { timeoutMs: 25 }))).toMatchObject({
      code: 'IPC_TIMEOUT',
    })
    expect(events.map((event) => event.phase)).toEqual(['queued'])
    expect(peers.dispatchedTimeouts()).toBe(0)
    const controller = new AbortController()
    const cancelled = rejected(
      peers.left.call('fixture.wait', null, z.undefined(), { signal: controller.signal, timeoutMs: 5_000 }),
    )
    controller.abort(new Error('private-abort-reason'))
    expect(await cancelled).toMatchObject({ code: 'IPC_CANCELLED' })
    expect(events).toHaveLength(1)
  } finally {
    release?.()
    await pending
    peers.close()
  }
})

test('throwing timeout observers cannot suppress original deadline rejection or dispatched fault callback', async () => {
  const peers = fixture(() => {
    throw new Error('private-observer-error')
  })
  let release: (() => void) | undefined
  const blocked = new Promise<void>((resolve) => {
    release = resolve
  })
  peers.right.register(
    'fixture.wait',
    procedure(z.unknown(), z.undefined(), async () => {
      await blocked
    }),
  )
  try {
    expect(await rejected(peers.left.call('fixture.wait', null, z.undefined(), { timeoutMs: 25 }))).toMatchObject({
      code: 'IPC_TIMEOUT',
    })
    expect(peers.dispatchedTimeouts()).toBe(1)
  } finally {
    release?.()
    peers.close()
  }
})

test('real process entry exit76 identifies uncaught stop reason without leaking the thrown error', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-entry-diagnostic-'))
  const modulePath = join(root, 'fixture.ts')
  const canary = 'private-uncaught-canary-3194'
  await writeFile(
    modulePath,
    `export function create(context) {
    context.peer.register('fixture.trigger', { invoke: async () => {
      setTimeout(() => { throw new Error('${canary}') }, 20)
      return undefined
    } })
    return { prepare: async input => ({ contractFingerprint: input.descriptor.contractFingerprint,
      storageSchema: input.descriptor.storageSchema, capabilities: [] }), activate: async () => {},
      drain: async () => ({ requests: 0, runs: 0, resources: 0 }), dispose: async () => {} }
  }`,
  )
  const events: DiagnosticEvent[] = []
  let peer: IpcPeer | undefined
  let resolveExit: ((code: number) => void) | undefined
  const exited = new Promise<number>((resolve) => {
    resolveExit = resolve
  })
  const owner = new ManagedProcess({
    descriptor: {
      id: 'entry.fixture',
      kind: 'plugin',
      isolation: 'process',
      dependencies: [],
      required: true,
      reloadable: true,
      contractFingerprint: 'a'.repeat(64),
      storageSchema: STORAGE_SCHEMA_VERSION,
    },
    artifactId: 'b'.repeat(64),
    modulePath,
    generation: 1,
    parent: { unitId: 'base', generation: 1, incarnation: 'entry-parent-incarnation' },
    onPeer: (value) => {
      peer = value
      value.onEvent('runtime.diagnostic', diagnosticEventSchema, (event) => {
        events.push(event)
      })
    },
    onExit: async (_identity, exit) => {
      resolveExit?.(exit.exitCode)
    },
  })
  try {
    await owner.prepare()
    const connected = peer
    if (!connected) throw new Error('Fixture entry peer missing')
    await connected.call('fixture.trigger', undefined, z.undefined())
    let deadline: ReturnType<typeof setTimeout> | undefined
    try {
      const timedOut = new Promise<never>((_resolve, reject) => {
        deadline = setTimeout(() => reject(new Error('Fixture entry exit deadline exceeded')), 5_000)
      })
      expect(await Promise.race([exited, timedOut])).toBe(76)
    } finally {
      clearTimeout(deadline)
    }
    expect(owner.snapshot().pid).toBeNull()
    const event = events.find((value) => value.event === 'host.runtime_entry_stop')
    expect(event).toMatchObject({
      phase: 'uncaught_exception',
      errorCode: 'RUNTIME_STOP_UNCAUGHT_EXCEPTION',
      exitCode: 76,
      contextId: 'entry.fixture',
      requestId: connected.remote.incarnation,
    })
    expect(JSON.stringify(events)).not.toContain(canary)
  } finally {
    await owner.dispose()
    await rm(root, { recursive: true, force: true })
  }
}, 15_000)

test('actual entry child synchronously preserves stop and exception stderr before exit76', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-entry-stderr-'))
  const modulePath = join(root, 'unused.ts')
  const canary = 'private-entry-stderr-canary'
  const entry = join(process.cwd(), 'packages/runtime/src/process-entry.ts').replaceAll('\\', '/')
  const script = join(root, 'entry.ts')
  await writeFile(
    script,
    `import { runRuntimeProcess } from ${JSON.stringify(entry)}; await runRuntimeProcess(); setTimeout(()=>{throw new ReferenceError('${canary}')},20)`,
  )
  const child = Bun.spawn([process.execPath, script], {
    env: {
      ...process.env,
      HBAR_RUNTIME_SELF: JSON.stringify({ unitId: 'kernel', generation: 1, incarnation: 'stderr-child' }),
      HBAR_RUNTIME_PARENT: JSON.stringify({ unitId: 'base', generation: 1, incarnation: 'stderr-parent' }),
      HBAR_RUNTIME_MODULE: modulePath,
    },
    ipc: () => {},
    stdout: 'ignore',
    stderr: 'pipe',
    windowsHide: true,
  })
  const stderr = new Response(child.stderr).text()
  const deadline = setTimeout(() => child.kill('SIGKILL'), 5000)
  try {
    expect(await child.exited).toBe(76)
    const text = await stderr
    const events = text.split('\n').flatMap((line) => {
      try {
        const parsed = diagnosticEventSchema.safeParse(JSON.parse(line))
        return parsed.success ? [parsed.data] : []
      } catch {
        return []
      }
    })
    expect(events[0]?.event).toBe('host.runtime_entry_stop')
    expect(events[0]?.phase).toBe('uncaught_exception')
    expect(
      events.some((event) => event.event === 'host.runtime_entry_exception' && event.method === 'ReferenceError'),
    ).toBe(true)
    expect(text).not.toContain(canary)
  } finally {
    clearTimeout(deadline)
    if (child.exitCode === null) {
      child.kill('SIGKILL')
      await child.exited
    }
    await rm(root, { recursive: true, force: true })
  }
}, 10000)
