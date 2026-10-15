import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { emptyUsage } from '@hbar/contracts'
import type { SessionBranchTargetSelectInput } from '@hbar/contracts/commands/session-branch-target'
import { Kernel, MemorySecrets, createSessionBranchTargetCommands } from '@hbar/kernel'
import { definePlugin, provide, type HarnessDriver } from '@hbar/plugin-sdk'

const prefix = 'hbar-branch-target-kernel-'
const resources: { root: string; kernel: Kernel }[] = []
afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    const absolute = resolve(root)
    if (dirname(absolute) !== resolve(tmpdir()) || !basename(absolute).startsWith(prefix))
      throw new Error('Refusing to remove an unowned fixture')
    await rm(absolute, { recursive: true, force: true })
  }
})
async function git(cwd: string, args: string[]) {
  const process = Bun.spawn(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe', windowsHide: true })
  const [code, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ])
  if (code) throw new Error(stderr)
  return stdout.trim()
}
test('real Run admission restores the target branch, scopes AI Git tools to a linked worktree, and recognizes the created branch', async () => {
  const root = await mkdtemp(join(tmpdir(), prefix))
  const repository = join(root, 'repository')
  await mkdir(repository)
  await git(repository, ['init', '-q', '-b', 'main'])
  await git(repository, ['config', 'user.name', 'hbar test'])
  await git(repository, ['config', 'user.email', 'hbar@example.invalid'])
  await writeFile(join(repository, 'file.txt'), 'initial\n')
  await git(repository, ['add', '.'])
  await git(repository, ['commit', '-q', '-m', 'initial'])
  const oid = await git(repository, ['rev-parse', 'HEAD'])
  await git(repository, ['branch', 'feature/shared'])
  const observations: { path: string; branch: string }[] = []
  const driver = definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Branch target fixture',
      description: 'Records actual task and tool directories',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      required: true,
      provides: { driver: '1.0.0' },
      permissions: [],
    },
    apply(ctx) {
      provide<HarnessDriver>(ctx, 'driver', {
        async run(input) {
          if (input.run.input.text === 'AI create')
            await input.execute('git_branch', { operation: 'create', name: 'codex/ai-created' }, crypto.randomUUID())
          observations.push({
            path: input.workspace.path,
            branch: await git(input.workspace.path, ['branch', '--show-current']),
          })
          await input.commit('assistant', [{ type: 'text', text: 'Recorded task directory and branch' }])
        },
        summarize: async () => ({ text: 'summary', usage: emptyUsage() }),
      })
    },
  })
  const kernel = await Kernel.create({
    home: join(root, 'host-data'),
    workspace: repository,
    demo: true,
    secrets: new MemorySecrets(),
    profile: { replacements: { 'driver.pi': driver } },
  })
  resources.push({ root, kernel })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id, 'branch fixture')
  await kernel.setPermissionMode('allow')
  const send = async (text: string) => {
    const run = await kernel.submit(session.id, crypto.randomUUID(), { text, images: [] }, 'local-fixture')
    await kernel.waitForIdle()
    expect((await kernel.storage.call('run', run.id)).status).toBe('completed')
  }
  await send('first run')
  const identity = () => ({ actorId: 'branch-fixture', idempotencyKey: crypto.randomUUID() })
  await kernel.selectSessionBranchTarget(
    {
      sessionId: session.id,
      workspaceId: workspace.id,
      expectedRevision: 0,
      choice: { kind: 'branch', ref: 'refs/heads/feature/shared', expectedOid: oid },
    },
    identity(),
    new AbortController().signal,
  )
  await git(repository, ['switch', 'main'])
  await send('restore branch')
  expect(observations.at(-1)).toEqual({ path: repository, branch: 'feature/shared' })

  const worktree = join(root, 'local-worktree')
  await git(repository, ['worktree', 'add', '-b', 'feature/worktree', worktree, 'main'])
  await kernel.selectSessionBranchTarget(
    {
      sessionId: session.id,
      workspaceId: workspace.id,
      expectedRevision: 1,
      choice: { kind: 'branch', ref: 'refs/heads/feature/worktree', expectedOid: oid },
    },
    identity(),
    new AbortController().signal,
  )
  await send('AI create')
  expect(observations.at(-1)).toEqual({ path: worktree, branch: 'codex/ai-created' })
  expect(await git(repository, ['branch', '--show-current'])).toBe('feature/shared')
  const page = await kernel.sessionBranchTargets.list(
    { sessionId: session.id, workspaceId: workspace.id },
    new AbortController().signal,
  )
  expect(page.execution).toEqual({ path: worktree, branch: 'codex/ai-created', kind: 'worktree' })
  expect(page.branches.find((branch) => branch.name === 'codex/ai-created')?.current).toBe(true)
}, 60_000)

test('public branch target service preserves hidden authorization descriptors, filters and durable execution', async () => {
  const root = await mkdtemp(join(tmpdir(), prefix))
  const repository = join(root, 'catalog-repository')
  await mkdir(repository)
  await git(repository, ['init', '-q', '-b', 'main'])
  await git(repository, ['config', 'user.name', 'hbar test'])
  await git(repository, ['config', 'user.email', 'hbar@example.invalid'])
  await writeFile(join(repository, 'file.txt'), 'catalog fixture\n')
  await git(repository, ['add', '.'])
  await git(repository, ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'fixture'])
  const oid = await git(repository, ['rev-parse', 'HEAD'])
  await git(repository, ['branch', 'feature/catalog'])
  const kernel = await Kernel.create({
    home: join(root, 'host-data'),
    workspace: repository,
    demo: true,
    secrets: new MemorySecrets(),
  })
  resources.push({ root, kernel })
  const workspace = (await kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('Fixture workspace missing')
  const session = await kernel.createSession(workspace.id, 'catalog fixture')
  const commands = createSessionBranchTargetCommands(kernel)
  try {
    expect(commands.list().items).toEqual([])
    expect(commands.list({ includeInternal: false }).items).toEqual([])
    const all = commands.list({ includeInternal: true })
    const ids = [
      'sessionBranchTarget.list',
      'sessionBranchTarget.operation',
      'sessionBranchTarget.reconcile',
      'sessionBranchTarget.select',
    ]
    expect(all.items.map((item) => item.metadata.id)).toEqual(ids)
    expect(all.nextCursor).toBeUndefined()
    for (const descriptor of all.items) {
      expect(descriptor).toEqual(commands.describe(descriptor.metadata.id))
      expect(descriptor.metadata).toMatchObject({
        visibility: 'internal',
        category: 'workspace.session-branch-target',
        surfaces: ['api'],
        execution: 'host',
        scope: 'session',
      })
    }
    expect(commands.describe('sessionBranchTarget.select').metadata).toMatchObject({
      kind: 'command',
      stateEffect: 'external',
      idempotency: 'required',
    })
    const first = commands.list({ includeInternal: true, limit: 2 })
    expect(first.items.map((item) => item.metadata.id)).toEqual(ids.slice(0, 2))
    if (!first.nextCursor) throw new Error('Expected another catalog page')
    const second = commands.list({ includeInternal: true, after: first.nextCursor, limit: 2 })
    expect(second.items.map((item) => item.metadata.id)).toEqual(ids.slice(2))
    expect(second.revision).toBe(first.revision)
    expect(second.nextCursor).toBeUndefined()
    expect(commands.list({ includeInternal: true, category: 'workspace', surface: 'api' }).items).toHaveLength(4)
    expect(commands.list({ includeInternal: true, category: 'workspace.session-branch-target' }).items).toHaveLength(4)
    expect(commands.list({ includeInternal: true, category: 'workspace.session-branch-target-other' }).items).toEqual(
      [],
    )
    expect(commands.list({ includeInternal: true, surface: 'cli' }).items).toEqual([])
    expect(() => commands.list({ includeInternal: true, limit: 501 })).toThrow()
    const target = { sessionId: session.id, workspaceId: workspace.id }
    expect(await commands.execute('sessionBranchTarget.list', target)).toMatchObject({
      revision: 0,
      execution: { branch: 'main' },
    })
    const input: SessionBranchTargetSelectInput = {
      ...target,
      expectedRevision: 0,
      choice: { kind: 'branch', ref: 'refs/heads/feature/catalog', expectedOid: oid },
    }
    await expect(commands.execute('sessionBranchTarget.select', input)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const options = { actorId: 'catalog-owner', idempotencyKey: 'catalog-select' }
    const selected = await commands.execute('sessionBranchTarget.select', input, options)
    expect(selected).toMatchObject({ status: 'ready', revision: 1, execution: { branch: 'feature/catalog' } })
    expect(await commands.execute('sessionBranchTarget.select', input, options)).toEqual(selected)
    const lookup = { sessionId: session.id, idempotencyKey: options.idempotencyKey }
    expect(await commands.execute('sessionBranchTarget.operation', lookup, { actorId: options.actorId })).toEqual(
      selected,
    )
    expect(await commands.execute('sessionBranchTarget.operation', lookup, { actorId: 'another-actor' })).toBeNull()
    expect(await commands.execute('sessionBranchTarget.reconcile', lookup, options)).toEqual(selected)
    expect(await git(repository, ['branch', '--show-current'])).toBe('feature/catalog')
    expect(commands.list().items).toEqual([])
  } finally {
    commands.dispose()
  }
}, 60_000)
