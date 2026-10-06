import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { z } from 'zod'
import { Storage } from '@hbar/storage'
import { LocalExecution } from '@hbar/local-tools'
import { workspaceFindInputSchema, workspaceSearchInputSchema } from '@hbar/contracts/workspace-query'
import { WorkspaceFolderService } from './workspace-folders'
import { WorkspaceSandboxService } from './workspace-sandbox'
import { resolveSandboxProfile } from './sandbox-policy'
import { evaluateSandboxCall } from './sandbox-gate'

async function denied(operation: Promise<unknown>) {
  const error = await operation.then(
    () => null,
    (reason: unknown) => reason,
  )
  expect(error).toMatchObject({ code: 'PATH_DENIED' })
}

test('virtual mounts preserve relative file/search paths, default cwd and immutable run roots without moving files', async () => {
  const base = await mkdtemp(join(tmpdir(), 'hbar-virtual-roots-'))
  const storage = new Storage(join(base, 'state.sqlite'))
  const sandboxes = new WorkspaceSandboxService(storage, join(base, 'cache'))
  const execution = new LocalExecution([], undefined, sandboxes)
  try {
    const paths = [join(base, 'very-long-directory-name', 'frontend'), join(base, 'elsewhere', 'backend')]
    for (const path of paths) {
      await mkdir(path, { recursive: true })
      await writeFile(join(path, 'same.txt'), `match ${path.endsWith('frontend') ? 'front' : 'back'}`)
    }
    const folders = paths.map((path, index) => ({
      id: `id-${index}`,
      alias: index === 0 ? 'frontend' : 'backend',
      path,
    }))
    const signal = new AbortController().signal
    const service = new WorkspaceFolderService(storage, [])
    const created = await service.apply('actor', 'create', { operation: 'create', input: { folders } }, signal)
    const root = await sandboxes.prepare(created.workspace.id, created.workspace.path, signal)
    expect((await execution.list(root, '.')).map((item) => item.path)).toEqual(['frontend', 'backend'])
    expect(await execution.read(root, 'frontend/same.txt')).toBe('match front')
    expect(await execution.read(root, 'backend/same.txt')).toBe('match back')
    expect(await execution.read(root, 'same.txt')).toBe('match front')
    await execution.write(root, 'backend/new/nested.txt', 'written safely')
    expect(await readFile(join(paths[1]!, 'new', 'nested.txt'), 'utf8')).toBe('written safely')
    const found = await execution.workspaceQuery.find(
      root,
      workspaceFindInputSchema.parse({ nameQuery: 'same.txt' }),
      signal,
    )
    expect(found.paths).toEqual(['frontend/same.txt', 'backend/same.txt'])
    const searched = await execution.workspaceQuery.search(
      root,
      workspaceSearchInputSchema.parse({ pattern: 'match', literal: true }),
      signal,
    )
    expect(searched.matches.map((item) => item.path)).toEqual(['frontend/same.txt', 'backend/same.txt'])
    const limited = await execution.workspaceQuery.find(
      root,
      workspaceFindInputSchema.parse({ nameQuery: 'same.txt', limit: 1 }),
      signal,
    )
    expect(limited.paths).toHaveLength(1)
    expect(limited.truncated).toBe(true)
    const filtered = await execution.workspaceQuery.find(
      root,
      workspaceFindInputSchema.parse({ include: ['backend/*.txt'] }),
      signal,
    )
    expect(filtered.paths).toEqual(['backend/same.txt'])
    expect(await execution.resolveDirectory(root, '.')).toBe(paths[0]!)
    expect(await execution.resolveDirectory(root, 'backend')).toBe(paths[1]!)
    await service.apply(
      'actor',
      'reorder',
      {
        operation: 'save',
        input: { workspaceId: created.workspace.id, expectedRevision: 1, folders: [...folders].reverse() },
      },
      signal,
    )
    const reordered = await sandboxes.prepare(created.workspace.id, created.workspace.path, signal)
    expect(reordered).not.toBe(root)
    expect(await execution.resolveDirectory(reordered, '.')).toBe(paths[1]!)
    expect(await execution.read(root, 'same.txt')).toBe('match front')
    expect(await readFile(join(root, 'backend', 'same.txt'), 'utf8')).toBe('match back')
    const shell = await execution.exec(
      reordered,
      process.platform === 'win32' ? '[Console]::Write((Get-Location).Path)' : 'pwd',
      signal,
    )
    expect(shell.isError).toBe(false)
    expect(shell.text.trim()).toBe(paths[1]!)
  } finally {
    execution.dispose()
    await storage.close()
    await rm(base, { recursive: true, force: true })
  }
})

test('virtual roots retain deny/readonly rules and reject traversal, symlink escape and tampered mounts', async () => {
  const base = await mkdtemp(join(tmpdir(), 'hbar-virtual-boundary-'))
  const storage = new Storage(join(base, 'state.sqlite'))
  const sandboxes = new WorkspaceSandboxService(storage, join(base, 'cache'))
  const execution = new LocalExecution([], undefined, sandboxes)
  try {
    const rootPath = join(base, 'workspace')
    const outside = join(base, 'outside')
    await mkdir(join(rootPath, '.git'), { recursive: true })
    await mkdir(outside)
    await writeFile(join(outside, 'secret.txt'), 'outside')
    await writeFile(join(rootPath, '.git', 'config'), 'protected')
    const signal = new AbortController().signal
    const service = new WorkspaceFolderService(storage, [])
    const created = await service.apply(
      'actor',
      'new',
      { operation: 'create', input: { folders: [{ id: 'one', alias: 'src', path: rootPath }] } },
      signal,
    )
    const root = await sandboxes.prepare(created.workspace.id, created.workspace.path, signal)
    await denied(execution.read(root, '../outside/secret.txt'))
    await denied(execution.read(root, outside))
    await symlink(outside, join(rootPath, 'escape'), process.platform === 'win32' ? 'junction' : 'dir')
    await denied(execution.read(root, 'src/escape/secret.txt'))
    const profile = await resolveSandboxProfile(':workspace-write', async () => null)
    const tool = {
      name: 'write',
      description: 'Fixture write operation',
      inputSchema: z.object({ path: z.string() }),
      effect: 'write' as const,
      workspaceAccess: { kind: 'paths' as const, arguments: [{ field: 'path', access: 'write' as const }] },
      execute: async () => ({ text: '' }),
    }
    const check = (path: string) =>
      evaluateSandboxCall(profile, { tool, args: { path }, workspace: root, mount: sandboxes.get(root) })
    expect((await check('src/normal.txt')).decision).toBe('allow')
    expect((await check('src/.git/config')).decision).toBe('ask')
    expect((await check('src/escape/secret.txt')).decision).toBe('deny')
    const deniedProfile = {
      ...profile,
      filesystem: {
        ...profile.filesystem,
        grants: [...profile.filesystem.grants, { path: join(rootPath, 'normal.txt'), access: 'none' as const }],
      },
    }
    expect(
      (
        await evaluateSandboxCall(deniedProfile, {
          tool,
          args: { path: 'src/normal.txt' },
          workspace: root,
          mount: sandboxes.get(root),
        })
      ).decision,
    ).toBe('deny')
    expect(sandboxes.grantPaths(root, '.')).toEqual([rootPath])
    await unlink(join(root, 'src'))
    await symlink(outside, join(root, 'src'), process.platform === 'win32' ? 'junction' : 'dir')
    await denied(execution.read(root, 'src/secret.txt'))
    expect(await readFile(join(outside, 'secret.txt'), 'utf8')).toBe('outside')
  } finally {
    execution.dispose()
    await storage.close()
    await rm(base, { recursive: true, force: true })
  }
})
