import { expect, test } from 'bun:test'
import { IpcPeer, procedure, type IpcFrame, type IpcPeerOptions } from '@hbar/runtime'
import { z } from 'zod'
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, basename } from 'node:path'
import { diagnosticEventSchema } from '@hbar/contracts/diagnostics'
import { STORAGE_SCHEMA_VERSION } from '@hbar/storage'

function peers(
  options: { maximum?: number; throwAck?: boolean; throwFragment?: boolean; observerThrows?: boolean } = {},
) {
  const owner = { unitId: 'base', generation: 1, incarnation: 'diagnostic-parent' }
  const remote = { unitId: 'fixture', generation: 1, incarnation: 'diagnostic-child' }
  const events: Array<Parameters<NonNullable<IpcPeerOptions['onProtocolFailure']>>[0]> = []
  const failures: string[] = []
  let right: IpcPeer | undefined
  const left = new IpcPeer({
    owner,
    remote,
    messageBytes: options.maximum ?? 10000,
    onProtocolFailure(event) {
      events.push(event)
      if (options.observerThrows) throw new Error('PRIVATE_CANARY')
    },
    onFailure(error) {
      failures.push(error.code)
    },
    transport: {
      send(frame) {
        if ((options.throwAck && frame.kind === 'ack') || (options.throwFragment && frame.kind === 'fragment'))
          throw new Error('PRIVATE_CANARY')
        right?.receive(frame)
      },
    },
  })
  right = new IpcPeer({ owner: remote, remote: owner, transport: { send: (frame) => left.receive(frame) } })
  const frame = (data: string, index = 0, total = 1): IpcFrame => ({
    kind: 'fragment',
    version: 1,
    from: remote.incarnation,
    to: owner.incarnation,
    id: 'packet',
    index,
    total,
    data,
  })
  return {
    left,
    right,
    events,
    failures,
    frame,
    close() {
      left.close()
      right?.close()
    },
  }
}

for (const kind of ['schema', 'owner', 'sequence', 'payload', 'decode', 'ack-send'] as const)
  test(`receive classifies ${kind} without exposing payload and preserves IPC_PROTOCOL`, () => {
    const pair = peers({ maximum: kind === 'payload' ? 1 : 10000, throwAck: kind === 'ack-send' })
    try {
      if (kind === 'schema') pair.left.receive({ private: 'PRIVATE_CANARY' })
      if (kind === 'owner') pair.left.receive({ ...pair.frame('PRIVATE_CANARY'), from: 'wrong' })
      if (kind === 'sequence') pair.left.receive(pair.frame('PRIVATE_CANARY', 1, 2))
      if (kind === 'payload') pair.left.receive(pair.frame('PRIVATE_CANARY'))
      if (kind === 'decode' || kind === 'ack-send') pair.left.receive(pair.frame('PRIVATE_CANARY'))
      const reason = (
        {
          schema: 'frame_schema',
          owner: 'owner',
          sequence: 'fragment_sequence',
          payload: 'payload',
          decode: 'decode',
          'ack-send': 'transport_send',
        } as const
      )[kind]
      expect(pair.events).toHaveLength(1)
      expect(pair.events[0]?.reason).toBe(reason)
      expect(pair.failures).toEqual(['IPC_PROTOCOL'])
      expect(JSON.stringify(pair.events)).not.toContain('PRIVATE_CANARY')
      pair.left.receive({ another: 'PRIVATE_CANARY' })
      pair.left.close()
      expect(pair.events).toHaveLength(1)
      expect(pair.failures).toHaveLength(1)
    } finally {
      pair.close()
    }
  })

test('fragment sequence mismatch is distinct from byte overflow', () => {
  const pair = peers()
  try {
    pair.left.receive(pair.frame('first', 0, 3))
    pair.left.receive(pair.frame('second', 0, 3))
    expect(pair.events).toEqual([{ reason: 'fragment_sequence', errorCode: 'IPC_PAYLOAD_LIMIT' }])
    expect(pair.failures).toEqual(['IPC_PROTOCOL'])
  } finally {
    pair.close()
  }
})

test('duplicate decoded invocation is classified as dispatch failure', async () => {
  const pair = peers()
  let release: () => void = () => {
    throw new Error('Uninitialized handler')
  }
  const blocked = new Promise<void>((resolve) => {
    release = resolve
  })
  pair.left.register(
    'blocked',
    procedure(z.unknown(), z.null(), async () => {
      await blocked
      return null
    }),
  )
  const packet = JSON.stringify({
    message: { kind: 'call', id: 'same-call', method: 'blocked', input: null, requestId: 'request' },
    undefinedPaths: [],
  })
  try {
    pair.left.receive(pair.frame(packet))
    pair.left.receive({ ...pair.frame(packet), id: 'second-packet' })
    expect(pair.events).toEqual([{ reason: 'dispatch', errorCode: 'IPC_PROTOCOL' }])
    expect(pair.failures).toEqual(['IPC_PROTOCOL'])
  } finally {
    release()
    pair.close()
    await blocked
  }
})

test('real outbound fragment transport failure is observed before failclosed rejection', async () => {
  const pair = peers({ throwFragment: true })
  pair.right.register(
    'echo',
    procedure(z.string(), z.string(), (value) => value),
  )
  try {
    await expect(pair.left.call('echo', 'PRIVATE_CANARY', z.string())).rejects.toMatchObject({
      code: 'IPC_DISCONNECTED',
    })
    expect(pair.events).toEqual([{ reason: 'transport_send', errorCode: 'IPC_TRANSPORT_SEND' }])
    expect(pair.failures).toEqual(['IPC_DISCONNECTED'])
  } finally {
    pair.close()
  }
})

test('throwing diagnostic observer cannot prevent failclosed cleanup', () => {
  const pair = peers({ observerThrows: true })
  try {
    pair.left.receive({ private: 'PRIVATE_CANARY' })
    expect(pair.failures).toEqual(['IPC_PROTOCOL'])
    expect(pair.events).toEqual([{ reason: 'frame_schema', errorCode: 'IPC_PROTOCOL' }])
    expect(pair.left.snapshot().inFlight).toBe(0)
  } finally {
    pair.close()
  }
})

test('ordinary paired request/reply produces no protocol failure', async () => {
  const pair = peers()
  pair.right.register(
    'echo',
    procedure(z.string(), z.string(), (value) => value),
  )
  try {
    expect(await pair.left.call('echo', 'value', z.string())).toBe('value')
    expect(pair.events).toEqual([])
    expect(pair.failures).toEqual([])
  } finally {
    pair.close()
  }
})

test('real process entry malformed frame preserves safe synchronous diagnostic and exits76', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-entry-malformed-'))
  const modulePath = join(root, 'service.ts')
  await writeFile(
    modulePath,
    `export function create() { return {
    prepare: async input => ({ contractFingerprint: input.descriptor.contractFingerprint, storageSchema: input.descriptor.storageSchema, capabilities: [] }),
    activate: async () => {}, drain: async () => ({ requests: 0, runs: 0, resources: 0 }), dispose: async () => {}
  } }`,
  )
  const owner = { unitId: 'storage', generation: 1, incarnation: 'malformed-child' }
  const parent = { unitId: 'base', generation: 1, incarnation: 'malformed-parent' }
  let peer: IpcPeer | undefined
  const child = Bun.spawn([process.execPath, join(process.cwd(), 'packages/runtime/src/process-entry.ts')], {
    env: {
      ...process.env,
      HBAR_RUNTIME_SELF: JSON.stringify(owner),
      HBAR_RUNTIME_PARENT: JSON.stringify(parent),
      HBAR_RUNTIME_MODULE: modulePath,
    },
    ipc: (message) => peer?.receive(message),
    stdout: 'ignore',
    stderr: 'pipe',
    windowsHide: true,
  })
  peer = new IpcPeer({ owner: parent, remote: owner, transport: { send: (frame) => child.send(frame) } })
  const stderr = new Response(child.stderr).text()
  const deadline = setTimeout(() => child.kill('SIGKILL'), 5000)
  let bodyFailed = false
  let bodyError: unknown
  try {
    await peer.call(
      'runtime.prepare',
      {
        descriptor: {
          id: 'storage',
          kind: 'storage',
          isolation: 'process',
          dependencies: [],
          required: true,
          reloadable: true,
          contractFingerprint: 'a'.repeat(64),
          storageSchema: STORAGE_SCHEMA_VERSION,
        },
        configuration: {},
      },
      z.unknown(),
    )
    await peer.call('runtime.activate', { role: 'default' }, z.undefined())
    child.send({ private: 'PRIVATE_PROTOCOL_FRAME_CANARY' })
    expect(await child.exited).toBe(76)
    const text = await stderr
    const events = text.split('\n').flatMap((line) => {
      try {
        const result = diagnosticEventSchema.safeParse(JSON.parse(line))
        return result.success ? [result.data] : []
      } catch {
        return []
      }
    })
    const protocol = events.filter((event) => event.event === 'host.runtime_entry_ipc_failure')
    expect(protocol).toHaveLength(1)
    expect(protocol[0]).toMatchObject({
      phase: 'frame_schema',
      errorCode: 'IPC_PROTOCOL',
      contextId: owner.unitId,
      requestId: owner.incarnation,
      processId: child.pid,
      outcome: 'failure',
    })
    expect(events.findIndex((event) => event.event === 'host.runtime_entry_ipc_failure')).toBeLessThan(
      events.findIndex((event) => event.event === 'host.runtime_entry_stop'),
    )
    expect(events.find((event) => event.event === 'host.runtime_entry_stop')).toMatchObject({
      phase: 'transport_failure',
      exitCode: 76,
      errorCode: 'RUNTIME_STOP_TRANSPORT_FAILURE',
    })
    expect(text).not.toContain('PRIVATE_PROTOCOL_FRAME_CANARY')
    expect(child.exitCode).toBe(76)
  } catch (error: unknown) {
    bodyFailed = true
    bodyError = error
  }
  const cleanupErrors: unknown[] = []
  try {
    clearTimeout(deadline)
    peer.close()
    if (child.exitCode === null) {
      child.kill('SIGKILL')
      await child.exited
    }
    await stderr
    const owned = await realpath(root)
    if (dirname(owned) !== (await realpath(tmpdir())) || !basename(owned).startsWith('hbar-entry-malformed-'))
      throw new Error('Refusing non-owned malformed fixture cleanup')
    await rm(owned, { recursive: true, force: true })
  } catch (error: unknown) {
    cleanupErrors.push(error)
  }
  if (bodyFailed && cleanupErrors.length)
    throw new AggregateError([bodyError, ...cleanupErrors], 'Protocol test body and cleanup failed', {
      cause: bodyError,
    })
  if (bodyFailed) throw bodyError
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Protocol test cleanup failed')
}, 10000)
