import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { Database } from 'bun:sqlite'
import { LocalExecution } from '@hbar/local-tools'
import { NodeStateStorage } from '@hbar/storage/node-state'
import {
  WorkspaceNodeService,
  WorkspaceNodeProtocol,
  nodeProtectedPaths,
  type NodeExecutionBackend,
} from '@hbar/node-core'
import { nodeFloorSchema, nodeWorkspaceMethods, NODE_LIMITS } from '@hbar/contracts/node'
import { resolveSandboxProfile, sandboxSnapshotContent, BUILTIN_SANDBOX_PROFILES } from '@hbar/sandbox'
import { sandboxProfileSchema } from '@hbar/contracts/sandbox'

const authority = {
  sessionId: 'session',
  runId: 'run',
  callId: 'call',
  sandbox: null,
  admission: { kind: 'allow' as const },
}
const signal = () => AbortSignal.timeout(10_000)
const backend: NodeExecutionBackend = {
  name: 'none',
  filesystem: false,
  network: false,
  processTree: true,
  exec: async () => {
    throw new Error('This fixture must never execute commands')
  },
}
async function fixture(
  run: (
    node: WorkspaceNodeService,
    protocol: WorkspaceNodeProtocol,
    workspace: string,
    state: NodeStateStorage,
  ) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-node-protocol-')),
    workspace = join(root, 'workspace'),
    data = join(root, 'node')
  await mkdir(workspace)
  await mkdir(data)
  const state = new NodeStateStorage(join(data, 'node.sqlite'))
  await state.call('ready', {})
  await state.call(
    'floor.set',
    nodeFloorSchema.parse({ roots: [{ rootId: 'engine', name: 'engine', path: workspace, access: 'write' }] }),
  )
  let node: WorkspaceNodeService | undefined
  const execution = new LocalExecution([data], undefined, undefined, {
    get: () => (node ? nodeProtectedPaths(node.policy, data) : [data]),
  })
  const service = await WorkspaceNodeService.open('build-box', data, state, execution, backend)
  node = service
  const protocol = new WorkspaceNodeProtocol(service)
  try {
    await run(service, protocol, workspace, state)
  } finally {
    protocol.dispose()
    await service.dispose()
    await state.close()
    await rm(root, { recursive: true, force: true })
  }
}
const writeChunk = (
  path: string,
  operationId: string,
  bytes: Uint8Array,
  totalBytes: number,
  offset: number,
  final: boolean,
) => ({
  rootId: 'engine',
  path,
  operationId,
  authority,
  totalBytes,
  offset,
  final,
  data: Buffer.from(bytes).toString('base64'),
})
test('chunked reading keeps one revision and detects a file change instead of mixing versions', async () => {
  await fixture(async (_node, protocol, workspace) => {
    await writeFile(join(workspace, 'file.txt'), 'first\nsecond\n')
    const first = nodeWorkspaceMethods['fs.readBytes'].output.parse(
      await protocol.invoke('fs.readBytes', { rootId: 'engine', path: 'file.txt', authority, limit: 6 }, signal()),
    )
    expect(Buffer.from(first.data, 'base64').toString()).toBe('first\n')
    expect(first.done).toBe(false)
    await writeFile(join(workspace, 'file.txt'), 'changed')
    const error = await protocol
      .invoke(
        'fs.readBytes',
        { rootId: 'engine', path: 'file.txt', authority, offset: 6, expectedRevision: first.revision },
        signal(),
      )
      .catch((error: unknown) => error)
    expect(error).toMatchObject({ code: 'FILE_CONFLICT' })
  })
})
test('partial upload has no disk effect and complete retries return the same durable write receipt', async () => {
  await fixture(async (_node, protocol, workspace) => {
    const bytes = Buffer.from('中文'.repeat(50_000)),
      first = bytes.subarray(0, NODE_LIMITS.chunkBytes),
      last = bytes.subarray(NODE_LIMITS.chunkBytes)
    const request = writeChunk('new.txt', 'run:write', first, bytes.length, 0, false)
    expect(await protocol.invoke('fs.write', request, signal())).toMatchObject({
      state: 'buffered',
      nextOffset: first.length,
    })
    expect(await Bun.file(join(workspace, 'new.txt')).exists()).toBe(false)
    expect(await protocol.invoke('fs.write', request, signal())).toMatchObject({ state: 'buffered' })
    const final = writeChunk('new.txt', 'run:write', last, bytes.length, first.length, true)
    const receipt = await protocol.invoke('fs.write', final, signal())
    expect(receipt).toMatchObject({ state: 'settled', revision: createHash('sha256').update(bytes).digest('hex') })
    expect(await readFile(join(workspace, 'new.txt'))).toEqual(bytes)
    await protocol.invoke('fs.write', request, signal())
    expect(await protocol.invoke('fs.write', final, signal())).toEqual(receipt)
    const conflict = await protocol
      .invoke('fs.write', writeChunk('new.txt', 'run:write', Buffer.from('other'), 5, 0, true), signal())
      .catch((error: unknown) => error)
    expect(conflict).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    expect(await readFile(join(workspace, 'new.txt'))).toEqual(bytes)
  })
})
test('file versions remain scoped to the original root and the current floor', async () => {
  await fixture(async (node, protocol, workspace) => {
    await writeFile(join(workspace, 'file.txt'), 'before')
    await protocol.invoke('fs.write', writeChunk('file.txt', 'run:version', Buffer.from('after'), 5, 0, true), signal())
    const before = nodeWorkspaceMethods['fs.receipt.chunk'].output.parse(
      await protocol.invoke(
        'fs.receipt.chunk',
        { rootId: 'engine', operationId: 'run:version', version: 'before' },
        signal(),
      ),
    )
    expect(Buffer.from(before.data, 'base64').toString()).toBe('before')
    const foreign = await protocol
      .invoke('fs.receipt.chunk', { rootId: 'other', operationId: 'run:version', version: 'before' }, signal())
      .catch((error: unknown) => error)
    expect(foreign).toMatchObject({ code: 'NODE_RECEIPT_SCOPE' })
    await node.setPolicy({ ...node.policy, protectedPaths: [join(workspace, 'file.txt')] })
    const protectedVersion = await protocol
      .invoke('fs.receipt.chunk', { rootId: 'engine', operationId: 'run:version', version: 'before' }, signal())
      .catch((error: unknown) => error)
    expect(protectedVersion).toMatchObject({ code: 'NODE_DENIED' })
  })
})
test('native node search filters protected paths and applies the current profile before returning matches', async () => {
  await fixture(async (node, protocol, workspace) => {
    await writeFile(join(workspace, 'public.txt'), 'needle public\n')
    await writeFile(join(workspace, 'private.txt'), 'needle private\n')
    await node.setPolicy({ ...node.policy, protectedPaths: [join(workspace, 'private.txt')] })
    const query = { rootId: 'engine', authority, query: { pattern: 'needle', literal: true, include: ['**/*.txt'] } }
    const result = nodeWorkspaceMethods['query.search'].output.parse(
      await protocol.invoke('query.search', query, signal()),
    )
    expect(result.matches.map((item) => item.path)).toEqual(['public.txt'])
    expect(JSON.stringify(result)).not.toContain('needle private')
    await node.setPolicy({ ...node.policy, protectedPaths: [] })
    const profile = await resolveSandboxProfile('safe', async () =>
      sandboxProfileSchema.parse({
        ...BUILTIN_SANDBOX_PROFILES[':read-only'],
        id: 'safe',
        name: 'safe',
        builtin: false,
        escalation: 'deny',
        filesystem: { default: 'read', grants: [{ path: 'private.txt', access: 'none' }] },
      }),
    )
    const ref = { profileId: profile.profileId, digest: sandboxSnapshotContent(profile).digest }
    node.putSnapshot(ref, profile)
    const guarded = nodeWorkspaceMethods['query.search'].output.parse(
      await protocol.invoke('query.search', { ...query, authority: { ...authority, sandbox: ref } }, signal()),
    )
    expect(guarded.matches.map((item) => item.path)).toEqual(['public.txt'])
    expect(guarded.pagination).toBeUndefined()
    expect(guarded.cache.bytesRead).toBe(0)
  })
})
test('restore deduplicates exact versions and rejects later edits without replaying a partial effect', async () => {
  await fixture(async (_node, protocol, workspace) => {
    await writeFile(join(workspace, 'a.txt'), 'after')
    const input = {
      rootId: 'engine',
      operationId: 'run:restore',
      authority,
      changes: [{ path: 'a.txt', before: 'before', after: 'after' }],
    }
    expect(await protocol.invoke('fs.restore', input, signal())).toEqual({ accepted: true })
    await writeFile(join(workspace, 'a.txt'), 'user edit')
    expect(await protocol.invoke('fs.restore', input, signal())).toEqual({ accepted: true })
    expect(await readFile(join(workspace, 'a.txt'), 'utf8')).toBe('user edit')
  })
})
test('oversized ranged query results have a recoverable error while chunked file reading remains available', async () => {
  await fixture(async (_node, protocol, workspace) => {
    await writeFile(join(workspace, 'large.txt'), 'x'.repeat(NODE_LIMITS.frameBytes + 10))
    const ranged = await protocol
      .invoke(
        'query.readRange',
        { rootId: 'engine', path: 'large.txt', authority, startLine: 1, lineCount: 1 },
        signal(),
      )
      .catch((error: unknown) => error)
    expect(ranged).toMatchObject({ code: 'NODE_QUERY_RESULT_LIMIT' })
    const chunk = nodeWorkspaceMethods['fs.readBytes'].output.parse(
      await protocol.invoke('fs.readBytes', { rootId: 'engine', path: 'large.txt', authority }, signal()),
    )
    expect(Buffer.from(chunk.data, 'base64').byteLength).toBe(NODE_LIMITS.chunkBytes)
    expect(chunk.done).toBe(false)
  })
})
test('transfers reject gaps, premature completion and changed bytes and release capacity on disconnect', async () => {
  await fixture(async (_node, protocol) => {
    const gap = await protocol
      .invoke('fs.write', writeChunk('a.txt', 'run:gap', Buffer.from('abc'), 6, 3, true), signal())
      .catch((error: unknown) => error)
    expect(gap).toMatchObject({ code: 'NODE_TRANSFER_OFFSET' })
    const premature = await protocol
      .invoke('fs.write', writeChunk('a.txt', 'run:gap', Buffer.from('abc'), 6, 0, true), signal())
      .catch((error: unknown) => error)
    expect(premature).toMatchObject({ code: 'NODE_TRANSFER_OFFSET' })
    const pending = Array.from({ length: 32 }, (_, index) =>
      protocol.invoke('fs.write', writeChunk('a.txt', 'run:' + index, Buffer.alloc(0), 1, 0, false), signal()),
    )
    await Promise.all(pending)
    const full = await protocol
      .invoke('fs.write', writeChunk('a.txt', 'run:full', Buffer.alloc(0), 1, 0, false), signal())
      .catch((error: unknown) => error)
    expect(full).toMatchObject({ code: 'NODE_BUSY' })
    protocol.resetTransfers()
    expect(
      await protocol.invoke('fs.write', writeChunk('a.txt', 'run:full', Buffer.alloc(0), 1, 0, false), signal()),
    ).toMatchObject({ state: 'buffered' })
  })
})
test('node state migration 2 preserves old receipts but refuses unscoped legacy file-version reads', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-node-v1-')),
    path = join(root, 'node.sqlite')
  const old = new Database(path)
  old.exec(
    `CREATE TABLE config(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE operations(operationId TEXT PRIMARY KEY,argumentsDigest TEXT NOT NULL,kind TEXT NOT NULL,authority TEXT NOT NULL,receipt TEXT NOT NULL,versions TEXT,updatedAt INTEGER NOT NULL); CREATE TABLE audit(seq INTEGER PRIMARY KEY AUTOINCREMENT,data TEXT NOT NULL); PRAGMA user_version=1;`,
  )
  old
    .query(
      'INSERT INTO operations(operationId,argumentsDigest,kind,authority,receipt,versions,updatedAt) VALUES(?,?,?,?,?,?,?)',
    )
    .run(
      'run:old',
      'a'.repeat(64),
      'write',
      JSON.stringify(authority),
      JSON.stringify({
        state: 'settled',
        acceptedAt: 1,
        startedAt: 2,
        settledAt: 3,
        result: {
          text: '',
          isError: false,
          details: { code: 0, exitCode: 0, executionStarted: true, truncated: false, backend: 'none' },
        },
      }),
      JSON.stringify({
        path: 'a.txt',
        before: 'before',
        after: 'after',
        created: false,
        revision: createHash('sha256').update('after').digest('hex'),
      }),
      Date.now(),
    )
  old.close()
  const state = new NodeStateStorage(path)
  try {
    expect(await state.call('ready', {})).toEqual({ version: 2 })
    expect(await state.call('operation.get', { operationId: 'run:old' })).toMatchObject({
      target: null,
      versions: { before: 'before' },
    })
    const legacy = await WorkspaceNodeService.open('legacy', root, state, new LocalExecution([root]), backend)
    try {
      const versions = await legacy.fileVersion('engine', 'run:old', 'before').catch((error: unknown) => error)
      expect(versions).toMatchObject({ code: 'NODE_RECEIPT_SCOPE' })
    } finally {
      await legacy.dispose()
    }
    expect(await state.call('operation.get', { operationId: 'absent' })).toBeNull()
    await state.call('operation.accept', {
      operationId: 'run:new',
      argumentsDigest: 'b'.repeat(64),
      kind: 'write',
      authority,
      target: { rootId: 'engine', path: 'a.txt' },
    })
    expect(await state.call('operation.get', { operationId: 'run:new' })).toMatchObject({
      target: { rootId: 'engine', path: 'a.txt' },
    })
  } finally {
    await state.close()
    await rm(root, { recursive: true, force: true })
  }
})
