import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { emptyUsage } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { AgentService, GoalService, HarnessDriver, WorkflowService } from '@hbar/plugin-sdk'

const resources: { root: string; kernel: Kernel }[] = []

afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

async function git(root: string, ...args: string[]) {
  const child = Bun.spawn(['git', ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe' })
  const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
  if (code !== 0) throw new Error(`git ${args.join(' ')} failed: ${stderr}`)
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-workflow-delegation-'))
  await mkdir(join(root, 'src'))
  for (const name of ['a', 'b', 'c', 'd']) await writeFile(join(root, 'src', `${name}.txt`), `parent ${name}\n`)
  await writeFile(join(root, 'shared.txt'), 'shared context\n')
  await git(root, 'init')
  await git(root, 'config', 'user.name', 'hbar test')
  await git(root, 'config', 'user.email', 'hbar@example.invalid')
  await git(root, 'add', 'src', 'shared.txt')
  await git(root, 'commit', '-m', 'fixture')

  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let active = 0
  let maximumActive = 0
  const driver = definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Delegation fixture driver',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      description: 'Holds delegated agents so queue bounds can be observed',
      scope: 'host' as const,
      required: true,
      provides: { driver: '1.0.0' },
      permissions: [],
    },
    apply(ctx) {
      provide<HarnessDriver>(ctx, 'driver', {
        async run(input) {
          active++
          maximumActive = Math.max(maximumActive, active)
          try {
            await gate
            const path = input.run.input.text.match(/^Write paths: (.+)$/m)?.[1]
            if (!path) throw new Error('Focus package did not include a write path')
            await writeFile(join(input.workspace.path, path), `child ${path}\n`)
            await input.commit('assistant', [{ type: 'text', text: `Prepared ${path}` }])
          } finally {
            active--
          }
        },
        summarize: async () => ({ text: 'summary', usage: emptyUsage() }),
      })
    },
  })
  const kernel = await Kernel.create({
    home: join(root, '.hbar-data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
    profile: { replacements: { 'driver.pi': driver } },
  })
  resources.push({ root, kernel })
  await kernel.changePlugin('goal.codex', true, { autoContinue: false, maxContinuations: 0 })
  await kernel.changePlugin('budget.codex', true, { autoContinue: false })
  await kernel.changePlugin('git.codex', true, { worktreeRoot: join(root, '.hbar-worktrees') })
  const workspace = (await kernel.storage.call('workspaces')).find((entry) => entry.path === root)!
  const session = await kernel.createSession(workspace.id, 'parent')
  return {
    root,
    kernel,
    session,
    workflows: kernel.plugins.get<WorkflowService>('workflow'),
    agents: kernel.plugins.get<AgentService>('agent'),
    goals: kernel.plugins.get<GoalService>('goal'),
    release,
    maximumActive: () => maximumActive,
  }
}

function item(name: string, writePath = `src/${name}.txt`) {
  return {
    id: name,
    title: `Implement ${name}`,
    scope: { readPaths: ['shared.txt'], writePaths: [writePath], tools: ['read_file', 'write_file'] },
    acceptanceChecks: [
      {
        id: `review-${name}`,
        description: `Review ${name} in the parent workspace`,
        verifier: { kind: 'user' as const },
      },
    ],
  }
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise
    throw new Error('Expected rejection')
  } catch (error) {
    return error
  }
}

async function until(check: () => boolean) {
  const deadline = Date.now() + 5_000
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for delegated agents')
    await Bun.sleep(10)
  }
}

test('workflow delegation limits concurrency, queues the remainder, and requires parent integration checks', async () => {
  const resource = await fixture()
  await resource.workflows.start(
    resource.session.id,
    'Implement four independent files',
    ['a', 'b', 'c', 'd'].map((name) => item(name)),
    1_000,
  )
  const delegated = await resource.workflows.delegate(
    resource.session.id,
    ['a', 'b', 'c', 'd'],
    'local-fixture',
    100,
    1,
  )
  expect(delegated.workflow?.delegations.filter((entry) => entry.status === 'running')).toHaveLength(3)
  expect(delegated.workflow?.delegations.filter((entry) => entry.status === 'queued')).toHaveLength(1)
  await until(() => resource.maximumActive() === 3)
  expect(resource.maximumActive()).toBe(3)
  for (const name of ['a', 'b', 'c', 'd'])
    expect(await readFile(join(resource.root, 'src', `${name}.txt`), 'utf8')).toBe(`parent ${name}\n`)

  resource.release()
  await resource.kernel.waitForIdle()
  const ready = await resource.workflows.get(resource.session.id)
  expect(ready.workflow?.delegations.every((entry) => entry.status === 'patch_ready')).toBeTrue()
  expect(resource.maximumActive()).toBe(3)
  for (const delegation of ready.workflow!.delegations) {
    const agent = await resource.agents.result(resource.session.id, delegation.agentId!)
    const session = await resource.kernel.storage.call('session', agent.sessionId)
    const workspace = await resource.kernel.storage.call('workspace', session.workspaceId)
    expect(workspace.path).toStartWith(join(resource.root, '.hbar-worktrees'))
  }

  const cancelled = ready.workflow!.delegations[3]!
  const cancelledAgent = await resource.agents.result(resource.session.id, cancelled.agentId!)
  const cancelledSession = await resource.kernel.storage.call('session', cancelledAgent.sessionId)
  const cancelledWorkspace = await resource.kernel.storage.call('workspace', cancelledSession.workspaceId)
  const revised = await resource.workflows.checkpoint(
    resource.session.id,
    cancelled.itemId,
    'revise',
    'Cancel this patch and return coordination to the main agent',
    null,
    ready.workflow!.revision,
  )
  expect(revised.workflow?.delegations[3]?.status).toBe('cancelled')
  await expect(stat(cancelledWorkspace.path)).rejects.toMatchObject({ code: 'ENOENT' })

  const first = revised.workflow!.delegations[0]!
  await resource.agents.applyPatch(resource.session.id, first.agentId!, revised.workflow!.planRevision, {
    actorId: 'workflow-test',
    idempotencyKey: `apply-${first.delegationId}`,
    requestId: `apply-${first.delegationId}`,
  })
  expect((await resource.workflows.get(resource.session.id)).workflow?.delegations[0]?.status).toBe('applied')
  expect(await readFile(join(resource.root, 'src', 'a.txt'), 'utf8')).toBe('child src/a.txt\n')
  expect(await rejection(resource.goals.update(resource.session.id, 'complete'))).toMatchObject({
    code: 'WORKFLOW_ACCEPTANCE_PENDING',
  })
})

test('workflow delegation rejects overlapping writes and excessive child budgets while allowing shared reads', async () => {
  const resource = await fixture()
  await resource.workflows.start(
    resource.session.id,
    'Validate delegation boundaries',
    [item('directory', 'src'), item('file', 'src/a.txt')],
    100,
  )
  expect(
    await rejection(resource.workflows.delegate(resource.session.id, ['directory', 'file'], 'local-fixture', 10, 1)),
  ).toMatchObject({ code: 'WORKFLOW_DELEGATION_CONFLICT' })
  expect(
    await rejection(resource.workflows.delegate(resource.session.id, ['directory'], 'local-fixture', 101, 1)),
  ).toMatchObject({ code: 'WORKFLOW_DELEGATION_CONFLICT' })

  const delegated = await resource.workflows.delegate(resource.session.id, ['file'], 'local-fixture', 10, 1)
  expect(delegated.workflow?.delegations[0]).toMatchObject({ itemId: 'file', status: 'running' })
  resource.release()
  await resource.kernel.waitForIdle()
})
