import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, writeFile, readFile, rm, rename, symlink, unlink, realpath } from 'node:fs/promises'
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
    execution: LocalExecution,
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
    await run(service, protocol, workspace, state, execution)
  } finally {
    await protocol.dispose()
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
        { rootId: 'engine', expectedRoot: workspace, operationId: 'run:version', version: 'before' },
        signal(),
      ),
    )
    expect(Buffer.from(before.data, 'base64').toString()).toBe('before')
    const foreign = await protocol
      .invoke(
        'fs.receipt.chunk',
        { rootId: 'other', expectedRoot: workspace, operationId: 'run:version', version: 'before' },
        signal(),
      )
      .catch((error: unknown) => error)
    expect(foreign).toMatchObject({ code: 'NODE_RECEIPT_SCOPE' })
    await node.setPolicy({ ...node.policy, protectedPaths: [join(workspace, 'file.txt')] })
    const protectedVersion = await protocol
      .invoke(
        'fs.receipt.chunk',
        { rootId: 'engine', expectedRoot: workspace, operationId: 'run:version', version: 'before' },
        signal(),
      )
      .catch((error: unknown) => error)
    expect(protectedVersion).toMatchObject({ code: 'NODE_DENIED' })
  })
})

test('a reused root ID refuses the previous workspace binding and its durable file versions', async () => {
  await fixture(async (node, protocol, workspace) => {
    await writeFile(join(workspace, 'file.txt'), 'original')
    await protocol.invoke('fs.write', writeChunk('file.txt', 'run:bound', Buffer.from('after'), 5, 0, true), signal())
    const replacement = join(workspace, 'replacement')
    await mkdir(replacement)
    await writeFile(join(replacement, 'file.txt'), 'replacement')
    await node.setPolicy({
      ...node.policy,
      roots: [{ rootId: 'engine', name: 'replacement', path: replacement, access: 'write' }],
    })
    for (const [method, input] of [
      ['fs.readBytes', { rootId: 'engine', path: 'file.txt', authority }],
      ['fs.canonicalize', { rootId: 'engine', paths: ['.'] }],
      ['fs.write', writeChunk('file.txt', 'run:misrouted', Buffer.from('wrong'), 5, 0, true)],
    ] as const) {
      const error = await protocol
        .invoke(method, { ...input, expectedRoot: workspace }, signal())
        .catch((error: unknown) => error)
      expect(error).toMatchObject({ code: 'NODE_ROOT_CHANGED' })
    }
    const versions = await protocol
      .invoke(
        'fs.receipt.chunk',
        {
          rootId: 'engine',
          operationId: 'run:bound',
          version: 'before',
          expectedRoot: replacement,
        },
        signal(),
      )
      .catch((error: unknown) => error)
    expect(versions).toMatchObject({ code: 'NODE_RECEIPT_SCOPE' })
    const wrongVersionRoot = await protocol
      .invoke(
        'fs.receipt.chunk',
        { rootId: 'engine', expectedRoot: workspace, operationId: 'run:bound', version: 'before' },
        signal(),
      )
      .catch((error: unknown) => error)
    expect(wrongVersionRoot).toMatchObject({ code: 'NODE_RECEIPT_SCOPE' })
    expect(await readFile(join(replacement, 'file.txt'), 'utf8')).toBe('replacement')
    expect(await node.receipt('run:misrouted')).toEqual({ state: 'absent' })
  })
})

test('a shared root replaced by a directory link cannot redirect execution or silently rebind on restart', async () => {
  await fixture(async (node, protocol, workspace, state) => {
    const original = workspace + '-original',
      replacement = workspace + '-replacement'
    await mkdir(replacement)
    await writeFile(join(replacement, 'file.txt'), 'redirected')
    await rename(workspace, original)
    await symlink(replacement, workspace, process.platform === 'win32' ? 'junction' : 'dir')
    try {
      const error = await protocol
        .invoke(
          'fs.readBytes',
          {
            rootId: 'engine',
            path: 'file.txt',
            authority,
            expectedRoot: workspace,
          },
          signal(),
        )
        .catch((error: unknown) => error)
      expect(error).toMatchObject({ code: 'NODE_ROOT_CHANGED' })
      const reopened = await WorkspaceNodeService.open(
        'build-box',
        node.dataRoot,
        state,
        new LocalExecution([node.dataRoot]),
        backend,
      ).catch((error: unknown) => error)
      expect(reopened).toMatchObject({ code: 'NODE_ROOT_CHANGED' })
      if (reopened instanceof WorkspaceNodeService) await reopened.dispose()
      // An explicit local policy change may register the new target and persists its canonical location.
      const policy = await node.setPolicy(node.policy)
      expect(policy.roots[0]?.path).toBe(await realpath(replacement))
      const rebound = await protocol.invoke(
        'fs.readBytes',
        {
          rootId: 'engine',
          path: 'file.txt',
          authority,
          expectedRoot: policy.roots[0]?.path,
        },
        signal(),
      )
      expect(rebound).toMatchObject({ data: Buffer.from('redirected').toString('base64') })
    } finally {
      await unlink(workspace)
      await rename(original, workspace)
    }
  })
})

test('a root change during a real read refuses the completed bytes before returning them to A', async () => {
  await fixture(async (node, protocol, workspace, _state, execution) => {
    await writeFile(join(workspace, 'file.txt'), 'original')
    const replacement = join(workspace, 'replacement')
    await mkdir(replacement)
    const readBytes = execution.readBytes.bind(execution)
    execution.readBytes = async (root, path) => {
      const bytes = await readBytes(root, path)
      await node.setPolicy({
        ...node.policy,
        roots: [{ rootId: 'engine', name: 'replacement', path: replacement, access: 'write' }],
      })
      return bytes
    }
    const error = await protocol
      .invoke(
        'fs.readBytes',
        {
          rootId: 'engine',
          path: 'file.txt',
          authority,
          expectedRoot: workspace,
        },
        signal(),
      )
      .catch((error: unknown) => error)
    expect(error).toMatchObject({ code: 'NODE_ROOT_CHANGED' })
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

test('chunked restore reassembles large UTF-8 versions without effects until completion and never replays settled work', async () => {
  await fixture(async (node, protocol, workspace) => {
    const before = '\uFEFF' + '原文'.repeat(150_000),
      after = '\uFEFF' + '后文'.repeat(180_000)
    await writeFile(join(workspace, 'large.txt'), after)
    await writeFile(join(workspace, 'created.txt'), 'created')
    const bytes = Buffer.from(
      JSON.stringify([
        { path: 'large.txt', before, after },
        { path: 'created.txt', before: null, after: 'created' },
      ]),
    )
    expect(bytes.length).toBeGreaterThan(NODE_LIMITS.frameBytes)
    const common = {
      rootId: 'engine',
      expectedRoot: workspace,
      authority,
      operationId: 'run:large-restore',
      totalBytes: bytes.length,
      contentDigest: createHash('sha256').update(bytes).digest('hex'),
    }
    const upload = async (expectedText: string, alreadySettled = false) => {
      for (let offset = 0; offset < bytes.length; offset += NODE_LIMITS.chunkBytes) {
        const chunk = bytes.subarray(offset, offset + NODE_LIMITS.chunkBytes)
        const final = offset + chunk.length === bytes.length
        const result = await protocol.invoke(
          'fs.restore.chunk',
          {
            ...common,
            offset,
            data: chunk.toString('base64'),
            final,
          },
          signal(),
        )
        expect(result).toMatchObject({ state: final ? 'settled' : 'buffered' })
        if (!final) {
          expect(await node.receipt(common.operationId)).toMatchObject({ state: alreadySettled ? 'settled' : 'absent' })
          expect(await readFile(join(workspace, 'large.txt'), 'utf8')).toBe(expectedText)
        }
      }
    }
    await upload(after)
    expect(await readFile(join(workspace, 'large.txt'), 'utf8')).toBe(before)
    expect(await Bun.file(join(workspace, 'created.txt')).exists()).toBe(false)
    expect(await node.receipt(common.operationId)).toMatchObject({ state: 'settled', result: { isError: false } })
    await writeFile(join(workspace, 'large.txt'), 'later edit')
    await upload('later edit', true)
    expect(await readFile(join(workspace, 'large.txt'), 'utf8')).toBe('later edit')
  })
})

test('restore transfer refuses a changed digest and validates every current version before any file mutation', async () => {
  await fixture(async (node, protocol, workspace) => {
    await writeFile(join(workspace, 'first.txt'), 'after')
    await writeFile(join(workspace, 'second.txt'), 'intervening edit')
    const bytes = Buffer.from(
      JSON.stringify([
        { path: 'first.txt', before: 'before', after: 'after' },
        { path: 'second.txt', before: 'before', after: 'after' },
      ]),
    )
    const input = {
      rootId: 'engine',
      expectedRoot: workspace,
      authority,
      operationId: 'run:restore-invalid',
      totalBytes: bytes.length,
      offset: 0,
      data: bytes.toString('base64'),
      final: true,
      contentDigest: '0'.repeat(64),
    }
    const digestError = await protocol.invoke('fs.restore.chunk', input, signal()).catch((error: unknown) => error)
    expect(digestError).toMatchObject({ code: 'NODE_TRANSFER_DIGEST' })
    expect(await node.receipt(input.operationId)).toEqual({ state: 'absent' })
    const versionError = await protocol
      .invoke(
        'fs.restore.chunk',
        {
          ...input,
          contentDigest: createHash('sha256').update(bytes).digest('hex'),
        },
        signal(),
      )
      .catch((error: unknown) => error)
    expect(versionError).toMatchObject({ code: 'FILE_CONFLICT' })
    expect(await readFile(join(workspace, 'first.txt'), 'utf8')).toBe('after')
    expect(await readFile(join(workspace, 'second.txt'), 'utf8')).toBe('intervening edit')
    expect(await node.receipt(input.operationId)).toMatchObject({ state: 'lost' })
  })
})

test('restore buffering shares bounded transfer capacity and releases it on disconnect', async () => {
  await fixture(async (_node, protocol, workspace) => {
    const common = {
      rootId: 'engine',
      expectedRoot: workspace,
      authority,
      operationId: 'run:restore-capacity',
      totalBytes: NODE_LIMITS.restoreBytes,
      contentDigest: 'a'.repeat(64),
      offset: 0,
      data: '',
      final: false,
    }
    expect(await protocol.invoke('fs.restore.chunk', common, signal())).toEqual({ state: 'buffered', nextOffset: 0 })
    const capacity = await protocol
      .invoke('fs.restore.chunk', { ...common, operationId: 'run:extra', totalBytes: 1 }, signal())
      .catch((error: unknown) => error)
    expect(capacity).toMatchObject({ code: 'NODE_BUSY' })
    const mixed = await protocol
      .invoke('fs.write', writeChunk('file.txt', common.operationId, Buffer.from('x'), 1, 0, true), signal())
      .catch((error: unknown) => error)
    expect(mixed).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    protocol.resetTransfers()
    expect(
      await protocol.invoke('fs.restore.chunk', { ...common, operationId: 'run:extra', totalBytes: 1 }, signal()),
    ).toEqual({ state: 'buffered', nextOffset: 0 })
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
    expect(await state.call('ready', {})).toEqual({ version: 4 })
    expect(await state.call('operation.get', { operationId: 'run:old' })).toMatchObject({
      target: null,
      versions: { before: 'before' },
    })
    const legacy = await WorkspaceNodeService.open('legacy', root, state, new LocalExecution([root]), backend)
    try {
      const versions = await legacy.fileVersion('engine', root, 'run:old', 'before').catch((error: unknown) => error)
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
