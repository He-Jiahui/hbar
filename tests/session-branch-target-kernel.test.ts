import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { emptyUsage } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
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
