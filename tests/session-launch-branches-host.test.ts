import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { HbarClient, createSessionLaunchBranchesReader } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server.ts'

async function git(cwd: string, args: string[]): Promise<string> {
  const child = Bun.spawn(['git', ...args], {
    cwd,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: 'NUL', GIT_TERMINAL_PROMPT: '0' },
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
    windowsHide: true,
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (code !== 0) throw new Error(`Fixture Git failed: ${args.join(' ')}: ${stderr || stdout}`)
  return stdout.trim()
}

async function removeFixture(root: string): Promise<void> {
  const absolute = resolve(root)
  if (dirname(absolute) !== resolve(tmpdir()) || !basename(absolute).startsWith('hbar-launch-branches-host-'))
    throw new Error('Refusing to remove an unowned branch Host fixture')
  await rm(absolute, { recursive: true, force: true })
}

test('public paired Client discovers registered workspace branches without creating a Session or moving HEAD', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-launch-branches-host-'))
  let kernel: Kernel | undefined
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let client: HbarClient | undefined
  try {
    const repository = join(root, 'repository 空格')
    await mkdir(repository)
    await git(repository, ['init', '-q', '-b', 'main'])
    await git(repository, ['config', 'user.name', 'hbar fixture'])
    await git(repository, ['config', 'user.email', 'hbar@example.invalid'])
    await writeFile(join(repository, 'README.md'), 'branch discovery fixture\n')
    await git(repository, ['add', 'README.md'])
    await git(repository, ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'fixture'])
    await git(repository, ['branch', 'feature/中文'])
    const originalHead = await git(repository, ['rev-parse', 'HEAD'])
    kernel = await Kernel.create({
      home: join(root, 'host-data'),
      workspace: repository,
      demo: true,
      secrets: new MemorySecrets(),
    })
    host = await startServer(kernel, { port: 0 })
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
    await client.pair(host.pairing.code, 'branch discovery fixture')
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Fixture workspace missing')
    expect(await kernel.storage.call('sessions')).toEqual([])
    expect(await client.call('command.describe', { commandId: 'sessionLaunchBranches.list' })).toMatchObject({
      metadata: { kind: 'query', stateEffect: 'none', scope: 'workspace', visibility: 'internal' },
    })

    const reader = createSessionLaunchBranchesReader(client)
    const page = await reader.list({ workspaceId: workspace.id, search: '中文', limit: 1 })
    expect(page).toMatchObject({
      workspaceId: workspace.id,
      repository: { kind: 'repository', head: { kind: 'branch', name: 'main', oid: originalHead } },
      branches: [{ name: 'feature/中文', ref: 'refs/heads/feature/中文', current: false }],
      incomplete: false,
      nextCursor: null,
    })
    expect(page).not.toHaveProperty('cwd')
    expect(page.branches[0]).not.toHaveProperty('worktreePath')
    const first = await reader.list({ workspaceId: workspace.id, limit: 1 })
    expect(first.nextCursor).not.toBeNull()
    if (!first.nextCursor) throw new Error('Expected another branch page')
    const second = await reader.list({ workspaceId: workspace.id, limit: 1, cursor: first.nextCursor })
    expect(second.branches[0]?.name).not.toBe(first.branches[0]?.name)
    expect(second.nextCursor).toBeNull()
    await expect(reader.list({ workspaceId: 'missing-workspace' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      client.call('command.execute', {
        protocol: 1,
        requestId: crypto.randomUUID(),
        commandId: 'sessionLaunchBranches.list',
        commandVersion: 1,
        input: { workspaceId: workspace.id, cwd: root },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(await kernel.storage.call('sessions')).toEqual([])
    expect(await git(repository, ['symbolic-ref', '--short', 'HEAD'])).toBe('main')
    expect(await git(repository, ['rev-parse', 'HEAD'])).toBe(originalHead)
    expect(await git(repository, ['status', '--porcelain'])).toBe('')
  } finally {
    client?.disconnect()
    await host?.close()
    await kernel?.close()
    await removeFixture(root)
  }
}, 20_000)
