import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage } from '@hbar/storage'
import { inputSchema } from '@hbar/contracts'
import { workspaceFoldersSchema, type WorkspaceFolderMutation } from '@hbar/contracts/commands/workspace-folders'
import { WorkspaceFolderService } from './workspace-folders'

async function failure(operation: Promise<unknown>, code: string) {
  const error = await operation.then(
    () => null,
    (reason: unknown) => reason,
  )
  expect(error).toMatchObject({ code })
}

test('multiple roots persist, retain aliases/order, use CAS and receipts, and removal never deletes a directory', async () => {
  const base = await mkdtemp(join(tmpdir(), 'hbar-folder-contract-'))
  const storage = new Storage(join(base, 'state.sqlite'))
  try {
    const frontend = join(base, 'frontend')
    const backend = join(base, 'backend')
    const protectedRoot = join(base, 'private')
    for (const path of [frontend, backend, protectedRoot]) await mkdir(path)
    await writeFile(join(backend, 'keep.txt'), 'original user data')
    const service = new WorkspaceFolderService(storage, [protectedRoot])
    const signal = new AbortController().signal
    const request: WorkspaceFolderMutation = {
      operation: 'create',
      input: {
        folders: [
          { id: 'front', alias: '前端', path: frontend },
          { id: 'back', alias: 'backend', path: backend },
        ],
      },
    }
    const result = await service.apply('actor-a', 'create-key', request, signal)
    expect(result.snapshot.folders.map((item) => item.alias)).toEqual(['前端', 'backend'])
    expect(await service.apply('actor-a', 'create-key', request, signal)).toEqual(result)
    expect(await storage.call('workspaceFolderReceipt', 'actor-b', 'create-key', request)).toBeNull()
    const update: WorkspaceFolderMutation = {
      operation: 'save',
      input: {
        workspaceId: result.workspace.id,
        expectedRevision: 1,
        folders: [result.snapshot.folders[1]!, { ...result.snapshot.folders[0]!, alias: 'frontend' }],
      },
    }
    const next = await service.apply('actor-a', 'save-key', update, signal)
    expect(next.snapshot.revision).toBe(2)
    expect(next.snapshot.folders.map((item) => item.alias)).toEqual(['backend', 'frontend'])
    await failure(service.apply('actor-a', 'stale-key', update, signal), 'COMMAND_CONFLICT')
    await failure(
      service.apply('actor-a', 'save-key', { ...update, input: { ...update.input, expectedRevision: 2 } }, signal),
      'IDEMPOTENCY_CONFLICT',
    )
    const session = await storage.call('createSession', result.workspace.id)
    const run = await storage.call(
      'enqueue',
      session.id,
      'queued-folder-check',
      inputSchema.parse({ text: 'queued' }),
      'fixture',
    )
    await failure(
      service.apply(
        'actor-a',
        'busy-key',
        {
          operation: 'save',
          input: {
            workspaceId: result.workspace.id,
            expectedRevision: 2,
            folders: next.snapshot.folders,
          },
        },
        signal,
      ),
      'BUSY',
    )
    await storage.call('setRun', run.id, 'cancelled')
    await service.apply(
      'actor-a',
      'remove-key',
      {
        operation: 'save',
        input: {
          workspaceId: result.workspace.id,
          expectedRevision: 2,
          folders: [next.snapshot.folders[1]!],
        },
      },
      signal,
    )
    expect(await readFile(join(backend, 'keep.txt'), 'utf8')).toBe('original user data')
    const legacy = await storage.call('createWorkspace', join(base, 'legacy'), 'Legacy root')
    expect((await storage.call('workspaceFolders', legacy.id)).folders[0]?.path).toBe(legacy.path)
    await storage.close()
    const reopened = new Storage(join(base, 'state.sqlite'))
    try {
      expect((await reopened.call('ready')).version).toBe(20)
      expect((await reopened.call('workspaceFolders', result.workspace.id)).revision).toBe(3)
    } finally {
      await reopened.close()
    }
  } finally {
    await storage.close()
    await rm(base, { recursive: true, force: true })
  }
})

test('directory browser is paginated and read-only; unavailable, duplicate, private and cancelled inputs fail explicitly', async () => {
  const base = await mkdtemp(join(tmpdir(), 'hbar-folder-browser-'))
  const storage = new Storage(join(base, 'state.sqlite'))
  try {
    const privateRoot = join(base, 'private')
    await mkdir(privateRoot)
    for (let index = 0; index < 201; index++) await mkdir(join(base, `folder-${String(index).padStart(3, '0')}`))
    await writeFile(join(base, 'not-a-directory.txt'), 'text')
    const service = new WorkspaceFolderService(storage, [privateRoot])
    const signal = new AbortController().signal
    const first = await service.browse({ path: base }, signal)
    expect(first.items).toHaveLength(200)
    expect(first.nextCursor).toBe('folder-199')
    expect(
      (await service.browse({ path: base, after: first.nextCursor! }, signal)).items.map((item) => item.name),
    ).toEqual(['folder-200'])
    await expect(service.browse({ path: privateRoot }, signal)).rejects.toMatchObject({ code: 'PATH_DENIED' })
    await expect(service.browse({ path: join(base, 'not-a-directory.txt') }, signal)).rejects.toMatchObject({
      code: 'DIRECTORY_UNAVAILABLE',
    })
    const folder = { id: 'one', alias: 'root', path: join(base, 'folder-000') }
    await expect(
      service.canonicalFolders([folder, { ...folder, id: 'two', alias: 'other' }], signal),
    ).rejects.toMatchObject({ code: 'DUPLICATE_FOLDER' })
    await expect(service.canonicalFolders([{ ...folder, path: privateRoot }], signal)).rejects.toMatchObject({
      code: 'PATH_DENIED',
    })
    await expect(service.canonicalFolders([{ ...folder, path: 'relative' }], signal)).rejects.toMatchObject({
      code: 'INVALID_WORKSPACE',
    })
    const cancelled = AbortSignal.abort()
    await expect(service.browse({ path: base }, cancelled)).rejects.toBeDefined()
    for (const count of [0, 1, 32, 33]) {
      const folders = Array.from({ length: count }, (_, index) => ({
        id: String(index),
        alias: `root-${index}`,
        path: base,
      }))
      expect(workspaceFoldersSchema.safeParse(folders).success).toBe(count > 0 && count <= 32)
    }
    expect(workspaceFoldersSchema.safeParse([folder, { ...folder, id: 'two', alias: 'ROOT' }]).success).toBe(false)
    for (const alias of ['../root', 'nul', 'a/b', 'a\\b'])
      expect(workspaceFoldersSchema.safeParse([{ ...folder, alias }]).success).toBe(false)
  } finally {
    await storage.close()
    await rm(base, { recursive: true, force: true })
  }
})
