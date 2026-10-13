import { afterEach, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { LocalExecution } from '@hbar/local-tools'
import { nodeFloorSchema, type NodeCallAuthority, type NodeExecStart } from '@hbar/contracts/node'
import { NodeStateStorage } from '@hbar/storage/node-state'
import { WorkspaceNodeService, type NodeExecutionBackend, type NodeExecutionBackendOptions } from '@hbar/node-core'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close()
})

test('B executes inside the same alias view used by mounted filesystem and query paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-node-mount-execution-'))
  const engine = join(root, 'engine')
  const docs = join(root, 'docs')
  const data = join(root, 'data')
  await Promise.all([
    mkdir(join(engine, '.git', 'hooks'), { recursive: true }),
    mkdir(join(engine, '.hbar-worktrees'), { recursive: true }),
    mkdir(join(docs, 'sub'), { recursive: true }),
    mkdir(join(docs, '.git', 'hooks'), { recursive: true }),
    mkdir(join(docs, '.hbar-worktrees'), { recursive: true }),
    mkdir(data, { recursive: true }),
  ])
  await writeFile(join(docs, 'sub', 'readme.md'), 'mounted')
  const state = new NodeStateStorage(join(data, 'node.sqlite'))
  await state.call('ready', {})
  await state.call(
    'floor.set',
    nodeFloorSchema.parse({
      roots: [
        { rootId: 'engine', name: 'Engine', path: engine, access: 'write' },
        { rootId: 'docs', name: 'Docs', path: docs, access: 'read' },
      ],
      network: true,
      osConfinement: 'required',
    }),
  )
  let captured: { cwd: string; options: NodeExecutionBackendOptions } | undefined
  const backend: NodeExecutionBackend = {
    name: 'bwrap',
    filesystem: true,
    network: true,
    processTree: true,
    async exec(cwd, _command, _signal, options) {
      captured = { cwd, options }
      return { text: 'ok', details: { code: 0, truncated: false } }
    },
  }
  const local = new LocalExecution([data], undefined, undefined, { get: () => [data] })
  const node = await WorkspaceNodeService.open('builder', data, state, local, backend)
  cleanup.push(async () => {
    await node.dispose()
    await state.close()
    await rm(root, { recursive: true, force: true })
  })
  const unsigned = {
    schemaVersion: 1 as const,
    workspaceId: 'workspace-1',
    revision: 4,
    nodeId: 'builder',
    primaryRootId: 'engine',
    roots: [
      { rootId: 'engine', expectedRoot: engine, alias: 'src' },
      { rootId: 'docs', expectedRoot: docs, alias: 'docs' },
    ],
  }
  const authority: NodeCallAuthority = {
    sessionId: 'session',
    runId: 'run',
    callId: 'call',
    sandbox: null,
    admission: { kind: 'allow' },
    workspaceMounts: { ...unsigned, digest: createHash('sha256').update(JSON.stringify(unsigned)).digest('hex') },
  }
  const request: NodeExecStart = {
    ...authority,
    rootId: 'engine',
    expectedRoot: engine,
    operationId: 'run:call',
    cwd: 'docs/sub',
    command: 'pwd',
    timeoutMs: 5_000,
  }
  expect((await node.start(request)).state).toBe('started')
  for (let attempt = 0; attempt < 100 && !captured; attempt++) await Bun.sleep(5)
  expect(captured?.cwd).toBe('/workspace/docs/sub')
  expect(captured?.options.workspaceMounts?.map((mount) => [mount.rootId, mount.target, mount.access])).toEqual([
    ['engine', '/workspace/src', 'write'],
    ['docs', '/workspace/docs', 'read'],
  ])
  await Bun.sleep(5)
})
