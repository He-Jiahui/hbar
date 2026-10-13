import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nodeFloorSchema } from '@hbar/contracts/node'
import { resolvedSandboxProfileSchema } from '@hbar/contracts/sandbox'
import { NODE_TERMINAL_LIMITS, type NodeTerminalScope } from '@hbar/contracts/node-terminal'
import { sandboxSnapshotContent } from '@hbar/sandbox'
import {
  NodeTerminalService,
  type NodeManualTerminalConfirmation,
  type NodeTerminalBackend,
  type NodeTerminalProcess,
} from './terminal-service'

const temporary: string[] = []
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})
const scope: NodeTerminalScope = {
  nodeId: 'node-a',
  rootId: 'workspace',
  sessionId: 'session-a',
  ownerDeviceId: 'device-a',
}
const profile = resolvedSandboxProfileSchema.parse({
  version: 1,
  profileId: ':workspace-write',
  chain: [{ id: ':workspace-write', revision: 0 }],
  escalation: 'ask',
  filesystem: { default: 'write', grants: [] },
  commands: { rules: [] },
  network: { enabled: true },
  tools: { rules: [] },
  environment: { set: {} },
})
const sandbox = { profile, ref: { profileId: profile.profileId, digest: sandboxSnapshotContent(profile).digest } }
function fakeBackend(available = true) {
  const events: {
    output?: (data: string) => void
    exit?: () => void
    written: string[]
    sizes: [number, number][]
    closed: number
    opens: number
    inputs: Parameters<NodeTerminalBackend['open']>[0][]
  } = { written: [], sizes: [], closed: 0, opens: 0, inputs: [] }
  const backend: NodeTerminalBackend = {
    backend: 'bwrap',
    available,
    async open(input) {
      events.opens++
      events.inputs.push(input)
      events.output = input.onOutput
      events.exit = input.onExit
      const process: NodeTerminalProcess = {
        write(data) {
          events.written.push(data)
        },
        resize(cols, rows) {
          events.sizes.push([cols, rows])
        },
        async close() {
          events.closed++
        },
      }
      return process
    },
  }
  return { backend, events }
}
async function setup(
  options: {
    terminal?: boolean
    available?: boolean
    paused?: boolean
    localConfirm?: 'none' | 'write' | 'process' | 'always'
    confirm?: (input: NodeManualTerminalConfirmation) => Promise<void>
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-node-terminal-'))
  temporary.push(root)
  const workspace = join(root, 'workspace')
  const dataRoot = join(root, 'data')
  await mkdir(workspace)
  await mkdir(join(workspace, '.git', 'hooks'), { recursive: true })
  await mkdir(join(workspace, '.hbar-worktrees'), { recursive: true })
  await mkdir(dataRoot)
  const floor = nodeFloorSchema.parse({
    roots: [{ rootId: 'workspace', name: 'Workspace', path: workspace, access: 'write' }],
    terminal: options.terminal ?? true,
    process: true,
    localConfirm: options.localConfirm ?? 'none',
    maxConcurrentProcesses: 2,
    maxTimeoutMs: 10_000,
  })
  const fake = fakeBackend(options.available)
  const lifecycle = {
    reserveProcess(operationId: string) {
      let released = false
      const controller = new AbortController()
      return {
        operationId,
        controller,
        signal: controller.signal,
        release() {
          released = true
        },
        activate() {
          if (released) throw new Error('reservation was released')
          released = true
          return () => undefined
        },
      }
    },
    assertProcessAvailable() {},
  }
  const service = new NodeTerminalService(
    'node-a',
    dataRoot,
    () => floor,
    fake.backend,
    () => options.paused ?? false,
    options.confirm,
    lifecycle,
  )
  service.putSnapshot(sandbox.ref, sandbox.profile)
  return {
    service,
    fake,
  }
}
const open = (operationId = 'op-1') => ({
  operationId,
  scope,
  sandbox: sandbox.ref,
  cwd: '.',
  cols: 80,
  rows: 24,
})

describe('NodeTerminalService', () => {
  test('refuses a disabled floor or unavailable confined PTY', async () => {
    const disabled = await setup({ terminal: false })
    await expect(disabled.service.open(open())).rejects.toMatchObject({ code: 'NODE_DENIED' })
    const unavailable = await setup({ available: false })
    await expect(unavailable.service.open(open())).rejects.toMatchObject({ code: 'SANDBOX_BACKEND_UNAVAILABLE' })
    const paused = await setup({ paused: true })
    await expect(paused.service.open(open())).rejects.toMatchObject({ code: 'NODE_PAUSED' })
  })

  test('binds input, resize, output and close to the immutable session owner scope', async () => {
    const { service, fake } = await setup()
    const info = await service.open(open())
    expect(await service.input({ terminalId: info.terminalId, scope, data: 'pwd\n' })).toEqual({ accepted: true })
    expect(fake.events.written).toEqual(['pwd\n'])
    expect(() =>
      service.input({
        terminalId: info.terminalId,
        scope: { ...scope, ownerDeviceId: 'other-device' },
        data: 'whoami\n',
      }),
    ).toThrow('Terminal is unavailable for this owner scope')
    service.resize({ terminalId: info.terminalId, scope, cols: 100, rows: 40 })
    expect(fake.events.sizes).toEqual([[100, 40]])
    fake.events.output?.('ready\n')
    expect(
      service.output({
        terminalId: info.terminalId,
        scope,
        afterSeq: 0,
        creditBytes: NODE_TERMINAL_LIMITS.outputFrameBytes * 2,
      }).frames,
    ).toEqual([{ seq: 1, data: 'ready\n' }])
    const futureCursor = service.output({
      terminalId: info.terminalId,
      scope,
      afterSeq: 99,
      creditBytes: NODE_TERMINAL_LIMITS.outputFrameBytes * 2,
    })
    expect(futureCursor.reset).toBe(true)
    expect(futureCursor.nextSeq).toBe(1)
    expect(await service.close({ terminalId: info.terminalId, scope })).toEqual({ closed: true })
    expect(fake.events.closed).toBe(1)
  })

  test('reports a cursor reset after bounded output history expires', async () => {
    const { service, fake } = await setup()
    const info = await service.open(open())
    // Repeated bounded frames force eviction while keeping process output sequential.
    for (let index = 0; index < 12; index++) fake.events.output?.('x'.repeat(NODE_TERMINAL_LIMITS.outputFrameBytes))
    const result = service.output({
      terminalId: info.terminalId,
      scope,
      afterSeq: 0,
      creditBytes: NODE_TERMINAL_LIMITS.outputFrameBytes * 2,
    })
    expect(result.reset).toBe(true)
    expect(result.frames).toEqual([])
    await service.close({ terminalId: info.terminalId, scope })
  })

  test('reuses an operation only for identical owner and open parameters', async () => {
    const { service, fake } = await setup()
    const request = open('single-use-operation')
    const first = await service.open(request)
    const duplicate = await service.open(request)
    expect(duplicate.terminalId).toBe(first.terminalId)
    expect(fake.events.opens).toBe(1)
    await expect(service.open({ ...request, cwd: 'subdir' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    await service.close({ terminalId: first.terminalId, scope })
  })

  test('exposes operation ownership to the B console and lets node.kill terminate the PTY', async () => {
    const { service, fake } = await setup()
    const info = await service.open(open('console-kill-op'))
    expect(service.running()).toEqual(['console-kill-op'])
    expect(await service.cancel('wrong-op')).toBe(false)
    expect(await service.cancel('console-kill-op')).toBe(true)
    expect(service.running()).toEqual([])
    expect(fake.events.closed).toBe(1)
    expect(await service.close({ terminalId: info.terminalId, scope })).toEqual({ closed: true })
    await service.dispose()
  })

  test('fails closed for missing snapshots and passes snapshot intersections to the confined PTY', async () => {
    const { service, fake } = await setup()
    await expect(
      service.open({ ...open(), sandbox: { ...sandbox.ref, digest: 'b'.repeat(64) } }),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_NOT_FOUND' })
    await service.open(open())
    expect(fake.events.inputs[0]?.networkEnabled).toBe(false)
    expect(fake.events.inputs[0]?.writableRoots.length).toBeGreaterThan(0)
    await service.close({ terminalId: (await service.open(open())).terminalId, scope })
  })

  test('requires and retries B-local process confirmation before PTY creation', async () => {
    const noProvider = await setup({ localConfirm: 'process' })
    await expect(noProvider.service.open(open())).rejects.toMatchObject({ code: 'NODE_LOCAL_CONFIRMATION_REQUIRED' })
    expect(noProvider.fake.events.opens).toBe(0)

    let confirmations = 0
    const approved = await setup({
      localConfirm: 'process',
      confirm: async (input) => {
        confirmations++
        expect(input.operationId).toBe('approved-op')
        expect(input.sessionId).toBe(scope.sessionId)
        expect(input.ownerDeviceId).toBe(scope.ownerDeviceId)
        expect(input.snapshotDigest).toBe(sandbox.ref.digest)
        if (confirmations === 1) throw new Error('NODE_LOCAL_CONFIRMATION_PENDING')
      },
    })
    await expect(approved.service.open(open('approved-op'))).rejects.toThrow('NODE_LOCAL_CONFIRMATION_PENDING')
    expect(approved.fake.events.opens).toBe(0)
    await approved.service.open(open('approved-op'))
    expect(confirmations).toBe(2)
    expect(approved.fake.events.opens).toBe(1)
    await approved.service.dispose()
  })
})
