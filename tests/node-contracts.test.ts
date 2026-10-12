import { expect, test } from 'bun:test'
import { z } from 'zod'
import {
  NODE_LIMITS,
  nodeRelativePathSchema,
  nodeWorkspaceLocator,
  parseNodeWorkspaceLocator,
  workspaceLocationOf,
  nodeFloorSchema,
  nodeReceiptSchema,
  nodeExecStartSchema,
  nodeRequestTimeoutMs,
  nodeWorkspaceMethods,
  nodeObservationMethods,
  nodeCapabilitiesSchema,
  type NodeExecStart,
  type NodeCapabilities,
} from '@hbar/contracts/node'
import { deviceSchema, workspaceSchema, deviceAccessSchema } from '@hbar/contracts'

test('node paths reject traversal, device/absolute paths, ADS and controls on either platform', () => {
  for (const path of [
    '/etc/passwd',
    'C:/private',
    'C:relative',
    '\\\\server\\share',
    '../x',
    'a\\..\\x',
    'a/../x',
    'name:stream',
    'a\0b',
    '\\private',
  ])
    expect(nodeRelativePathSchema.safeParse(path).success).toBe(false)
  for (const path of ['.', '', 'src/a.ts', 'src\\a.ts', '目录/a.ts', './src/a.ts'])
    expect(nodeRelativePathSchema.parse(path)).toBe(path)
})

test('workspace locations round-trip and legacy local workspaces retain a local default', () => {
  const local = { id: 'workspace', path: '/local', name: 'local', createdAt: 1 }
  expect(workspaceLocationOf(workspaceSchema.parse(local))).toEqual({ kind: 'local' })
  const location = { kind: 'node' as const, nodeId: 'build-box', rootId: 'engine', nodePath: 'C:/engine' }
  const remote = { ...local, path: nodeWorkspaceLocator(location.nodeId, location.rootId), location }
  expect(workspaceSchema.parse(JSON.parse(JSON.stringify(remote)))).toEqual(remote)
  expect(parseNodeWorkspaceLocator(remote.path)).toEqual({ nodeId: 'build-box', rootId: 'engine' })
  expect(workspaceSchema.safeParse({ ...remote, path: '/local' }).success).toBe(false)
  expect(workspaceSchema.safeParse({ ...remote, location: { kind: 'local' } }).success).toBe(false)
  expect(workspaceSchema.safeParse({ ...local, path: remote.path }).success).toBe(false)
  for (const value of ['hbar-node://node/root/../private', 'hbar-node://node', 'HBAR-NODE://node/root'])
    expect(() => parseNodeWorkspaceLocator(value)).toThrow()
})

test('legacy devices default to operator and observer scopes survive serialization', () => {
  const legacy = { id: 'device', name: 'test', createdAt: 1, lastSeenAt: 1 }
  expect(deviceSchema.parse(legacy)).toEqual({ ...legacy, role: 'operator', workspaceIds: null })
  const observer = { ...legacy, role: 'observer' as const, workspaceIds: ['workspace'] }
  expect(deviceSchema.parse(JSON.parse(JSON.stringify(observer)))).toEqual(observer)
  expect(deviceAccessSchema.safeParse({ role: 'observer', workspaceIds: ['x', 'x'] }).success).toBe(false)
  expect(deviceSchema.safeParse({ ...legacy, role: 'approver' }).success).toBe(false)
})

test('node floors and execution requests reject unrecognized fields and oversized work', () => {
  const floor = nodeFloorSchema.parse({ roots: [] })
  expect(floor).toMatchObject({
    process: true,
    network: false,
    terminal: false,
    osConfinement: 'required',
    onLinkLost: { action: 'terminate', graceMs: 30_000 },
  })
  expect(nodeFloorSchema.safeParse({ roots: [], models: {} }).success).toBe(false)
  const input: NodeExecStart = {
    operationId: 'run:call',
    sessionId: 'session',
    runId: 'run',
    callId: 'call',
    rootId: 'engine',
    cwd: '.',
    command: 'echo hello',
    timeoutMs: 1_000,
    sandbox: null,
    admission: { kind: 'allow' },
  }
  expect(nodeExecStartSchema.parse(JSON.parse(JSON.stringify(input)))).toEqual(input)
  expect(nodeRequestTimeoutMs('exec.start', input)).toBe(6_000)
  expect(nodeRequestTimeoutMs('exec.start', { ...input, timeoutMs: 1_200_000 })).toBe(1_205_000)
  expect(() => nodeRequestTimeoutMs('exec.start', { ...input, timeoutMs: 1_200_001 })).toThrow()
  expect(nodeRequestTimeoutMs('exec.cancel', { operationId: input.operationId })).toBe(120_000)
  expect(nodeRequestTimeoutMs('fs.readBytes', {})).toBe(30_000)
  for (const extra of [
    { environment: { PATH: '/attacker' } },
    { callback: () => null },
    { command: 'x'.repeat(NODE_LIMITS.commandCharacters + 1) },
    { timeoutMs: 1_200_001 },
  ])
    expect(nodeExecStartSchema.safeParse({ ...input, ...extra }).success).toBe(false)
  expect(nodeReceiptSchema.safeParse({ state: 'lost', acceptedAt: 1, startedAt: 2, reason: 'restart' }).success).toBe(
    true,
  )
  expect(nodeReceiptSchema.safeParse({ state: 'running' }).success).toBe(false)
})

test('node method tables cannot reach operator RPC, storage or model credentials', () => {
  const workspace = Object.keys(nodeWorkspaceMethods)
  const observation = Object.keys(nodeObservationMethods)
  for (const name of ['run.start', 'approval.resolve', 'command.execute', 'storage.call', 'models.secret'])
    expect([...workspace, ...observation]).not.toContain(name)
  expect(observation).toEqual(['observe.sessions.list', 'observe.sessions.snapshot', 'observe.sessions.follow'])
  expect(workspace.every((name) => !observation.includes(name))).toBe(true)
  for (const definition of Object.values(nodeWorkspaceMethods)) expect(z.toJSONSchema(definition.input)).toBeDefined()
})

test('capabilities truthfully describe confinement independently of claimed process permission', () => {
  const floor = nodeFloorSchema.parse({ roots: [] })
  const { roots: _roots, protectedPaths: _protected, environmentAllowlist: _environment, ...summary } = floor
  const value: NodeCapabilities = {
    protocol: 1,
    nodeId: 'build',
    platform: 'win32',
    evaluator: 'a'.repeat(64),
    roots: [],
    sandbox: { backends: ['none'], filesystem: 'none', network: 'none' },
    floor: summary,
  }
  expect(nodeCapabilitiesSchema.parse(JSON.parse(JSON.stringify(value)))).toEqual(value)
  expect(nodeCapabilitiesSchema.safeParse({ ...value, protocol: 2 }).success).toBe(false)
})
