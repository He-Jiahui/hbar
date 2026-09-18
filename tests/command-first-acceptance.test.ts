import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  HbarClient,
  createAgentCommandClient,
  createBudgetCommandClient,
  createDirectoryQueryAdapter,
  createExtensionCommandClient,
  createFileCommandClient,
  createGitCommandClient,
  createGoalPlanCommandClient,
  createInteractionCommandClient,
  createMetricsCommandClient,
  createModelCommandClient,
  createRunCommandClient,
  createSettingsCommandClient,
  createSystemCommandClient,
  createUsageCommandClient,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import type { Approval } from '@hbar/contracts'
import { createAppRuntime } from '@hbar/app-runtime'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server.ts'

async function git(cwd: string, args: string[]) {
  const child = Bun.spawn(['git', ...args], {
    cwd,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' },
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
  if (code !== 0) throw new Error(`${args.join(' ')}: ${stderr || stdout}`)
  return stdout.trim()
}

async function waitForOperation(runs: ReturnType<typeof createRunCommandClient>, operationId: string) {
  for (let attempt = 0; attempt < 1_000; attempt++) {
    const operation = await runs.execute('operation.get', { operationId })
    if (!['queued', 'running', 'waiting_approval', 'cancelRequested'].includes(operation.status)) return operation
    await Bun.sleep(10)
  }
  throw new Error(`Operation did not settle: ${operationId}`)
}

test('command-first Host completes the first-stage workflow without any GUI runtime', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-command-first-'))
  await git(root, ['init', '-q'])
  await git(root, ['config', 'user.name', 'hbar acceptance'])
  await git(root, ['config', 'user.email', 'hbar@example.invalid'])
  await writeFile(join(root, 'README.md'), 'command first\n')
  await git(root, ['add', 'README.md'])
  await git(root, ['commit', '-q', '-m', 'external seed'])
  const kernel = await Kernel.create({
    home: join(root, '.hbar-test-data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(kernel, { port: 0, metricsIntervalMs: 50 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  let runtime: ReturnType<typeof createAppRuntime> | undefined
  try {
    const hostInfo = await client.pair(host.pairing.code, 'command-first acceptance')
    const workspaces = createWorkspaceSessionCommandClient(client)
    const existing = (await workspaces.execute('workspace.list', { limit: 20 })).items[0]!
    const workspace = await workspaces.execute('workspace.create', { path: root })
    expect(workspace.id).toBe(existing.id)
    const session = await workspaces.execute(
      'session.create',
      { workspaceId: workspace.id, title: 'Command-first acceptance' },
      { idempotencyKey: 'acceptance-session' },
    )

    const budgets = createBudgetCommandClient(client)
    runtime = createAppRuntime({
      instanceId: 'headless-acceptance',
      hostId: hostInfo.instanceId,
      directory: createDirectoryQueryAdapter(client),
      budget: budgets,
    })
    await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    expect(runtime.view.state.navigation.getSnapshot()).toMatchObject({
      workspaceId: workspace.id,
      sessionId: session.id,
      status: 'idle',
    })
    await expect(runtime.view.commands.execute('app.openPanel', { panelId: 'files' })).rejects.toMatchObject({
      code: 'CAPABILITY_UNAVAILABLE',
    })

    const models = createModelCommandClient(client)
    const unsetModel = await models.execute('session.getModel', { sessionId: session.id })
    const selectedModel = await models.execute(
      'session.setModel',
      { sessionId: session.id, modelId: 'local-fixture', baselineRevisions: unsetModel.revisions },
      { idempotencyKey: 'acceptance-model' },
    )
    await models.execute(
      'session.setThinkingLevel',
      { sessionId: session.id, thinkingLevel: 'high', baselineRevisions: selectedModel.revisions },
      { idempotencyKey: 'acceptance-thinking' },
    )
    await budgets.execute(
      'session.setBudget',
      { sessionId: session.id, tokens: 100_000 },
      { idempotencyKey: 'acceptance-budget' },
    )
    const settings = await createSettingsCommandClient(client).execute('settings.get', {
      scope: { kind: 'session', targetId: session.id },
    })
    expect(settings.schemaVersion).toBeGreaterThan(0)

    const files = createFileCommandClient(client)
    await files.execute('file.write', {
      workspaceId: workspace.id,
      path: 'command-first.txt',
      text: 'written through command',
      expectedSha256: null,
    })
    expect((await files.execute('file.read', { workspaceId: workspace.id, path: 'command-first.txt' })).text).toBe(
      'written through command',
    )

    const goals = createGoalPlanCommandClient(client)
    await goals.execute('goal.create', { sessionId: session.id, objective: 'Prove headless closure', tokenBudget: 10_000 })
    await goals.execute('plan.update', {
      sessionId: session.id,
      explanation: 'Acceptance workflow',
      plan: [
        { step: 'exercise commands', status: 'completed' },
        { step: 'reconnect', status: 'in_progress' },
      ],
    })

    await client.follow(session.id, 0)
    const interactions = createInteractionCommandClient(client)
    let approvalResolution: Promise<unknown> = Promise.resolve()
    const offEvents = client.onEvent((notification) => {
      if (notification.method !== 'session.event' || notification.params.type !== 'approval.requested') return
      const approval = notification.params.data as Approval
      approvalResolution = interactions.execute('approval.resolve', {
        sessionId: session.id,
        approvalId: approval.id,
        decision: 'allowed',
      })
    })
    const runs = createRunCommandClient(client)
    const toolRun = await runs.execute(
      'run.submit',
      {
        sessionId: session.id,
        modelId: 'local-fixture',
        input: {
          text: '/tool write_file {"path":"approved.txt","text":"approved"}',
          images: [],
          thinking: 'high',
          approval: 'ask',
        },
      },
      { idempotencyKey: 'acceptance-tool-run' },
    )
    expect((await waitForOperation(runs, toolRun.operationId)).status).toBe('completed')
    await approvalResolution
    offEvents()
    expect(await readFile(join(root, 'approved.txt'), 'utf8')).toBe('approved')

    const slowRun = await runs.execute(
      'run.submit',
      {
        sessionId: session.id,
        modelId: 'local-fixture',
        input: { text: '/slow', images: [], thinking: 'off', approval: 'deny' },
      },
      { idempotencyKey: 'acceptance-slow-run' },
    )
    await runs.execute('operation.cancel', { operationId: slowRun.operationId })
    expect((await waitForOperation(runs, slowRun.operationId)).status).toBe('cancelled')
    const retry = await runs.execute(
      'run.retry',
      { sessionId: session.id, operationId: slowRun.operationId },
      { idempotencyKey: 'acceptance-retry' },
    )
    expect((await waitForOperation(runs, retry.operationId)).status).toBe('completed')

    const agents = createAgentCommandClient(client)
    const child = await agents.execute(
      'agent.create',
      {
        parentSessionId: session.id,
        objective: 'Headless child task',
        modelId: 'local-fixture',
        approval: 'deny',
      },
      { idempotencyKey: 'acceptance-agent' },
    )
    if (child.runId) await waitForOperation(runs, child.runId)
    expect((await agents.execute('agent.list', { parentSessionId: session.id, limit: 10 })).items).toHaveLength(1)

    const usage = await createUsageCommandClient(client).execute('usage.query', {
      scope: { kind: 'session', sessionId: session.id, includeDescendants: true },
      bucketMs: 1_000,
      maxBuckets: 60,
      maxSamples: 100,
      filters: {},
    })
    expect(usage.totals.runs).toBeGreaterThanOrEqual(3)
    const metrics = await createMetricsCommandClient(client).execute('metrics.current', {})
    expect(metrics.process.pid).toBe(process.pid)
    const now = Date.now()
    const gitStats = await createGitCommandClient(client).execute('git.stats', {
      cwd: root,
      from: now - 86_400_000,
      to: now + 86_400_000,
      bucketMs: 3_600_000,
      maxBuckets: 48,
      sources: ['auto', 'manual', 'external'],
    })
    expect(gitStats.totals.externalCommits).toBe(1)
    expect((await createSystemCommandClient(client).execute('system.diagnose', {})).host.demo).toBeTrue()
    expect(await createExtensionCommandClient(client).execute('plugin.list', {})).toBeArray()

    client.disconnect()
    await client.connect()
    expect((await workspaces.execute('session.get', { sessionId: session.id }))?.id).toBe(session.id)
    expect((await budgets.execute('session.getBudget', { sessionId: session.id }))?.limit).toBe(100_000)
    expect(await models.execute('session.getModel', { sessionId: session.id })).toMatchObject({
      modelId: 'local-fixture',
      thinkingLevel: 'high',
    })
    expect((await goals.execute('goal.get', { sessionId: session.id })).goal?.objective).toBe(
      'Prove headless closure',
    )
  } finally {
    runtime?.dispose()
    client.disconnect()
    await host.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)
