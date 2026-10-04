import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import {
  HbarClient,
  createConfigurationCommandClient,
  createGoalPlanCommandClient,
  createModelCommandClient,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../../apps/host/src/server'

// Real temporary Host. The local demo provider is metadata/fixture capability,
// not evidence of commercial-provider support. No Run or provider probe is sent.
const options = z
  .object({ root: z.string().min(1), assets: z.string().min(1), goal: z.enum(['active', 'paused', 'none']) })
  .parse({
    root: process.env.HBAR_GOAL_PLAN_RECOVERY_ROOT,
    assets: process.env.HBAR_GOAL_PLAN_RECOVERY_WEB_DIST,
    goal: process.env.HBAR_GOAL_PLAN_RECOVERY_GOAL ?? 'active',
  })
const workspacePath = join(options.root, 'Goal Plan recovery — 原工程')
await mkdir(workspacePath, { recursive: true })
const kernel = await Kernel.create({
  home: join(options.root, 'data'),
  workspace: workspacePath,
  demo: true,
  secrets: new MemorySecrets(),
})
let host: Awaited<ReturnType<typeof startServer>> | undefined
let client: HbarClient | undefined
let closing: Promise<void> | undefined
function close(): Promise<void> {
  closing ??= (async () => {
    client?.disconnect()
    try {
      await host?.close()
    } finally {
      await kernel.close()
    }
  })()
  return closing
}

try {
  await kernel.changePlugin('goal.codex', true, { autoContinue: false })
  host = await startServer(kernel, { hostname: '127.0.0.1', port: 0, staticRoot: resolve(options.assets) })
  const browserDevice = await host.auth.createDevice('Goal Plan recovery browser fixture')
  const externalDevice = await host.auth.createDevice('Goal Plan recovery independent observer')
  const url = `http://127.0.0.1:${host.server.port}`
  client = new HbarClient(url, externalDevice.token)
  await client.connect()
  const directory = createWorkspaceSessionCommandClient(client)
  const models = createModelCommandClient(client)
  const goals = createGoalPlanCommandClient(client)
  const configuration = createConfigurationCommandClient(client)
  const workspace = (await directory.execute('workspace.list', { limit: 100 })).items.find(
    (item) => item.path === workspacePath,
  )
  if (!workspace) throw new Error('Owned Goal Plan workspace is missing')
  const initializationWrites = ['plugin.change(goal.codex:autoContinue=false)']
  const firstSession = await directory.execute(
    'session.create',
    { workspaceId: workspace.id, title: 'Recovery A — 原会话' },
    { idempotencyKey: 'goal-plan-recovery-session-a' },
  )
  const secondSession = await directory.execute(
    'session.create',
    { workspaceId: workspace.id, title: 'Recovery B — 独立会话' },
    { idempotencyKey: 'goal-plan-recovery-session-b' },
  )
  initializationWrites.push('session.create', 'session.create')
  for (const session of [firstSession, secondSession]) {
    const baseline = await models.execute('session.getModel', { sessionId: session.id })
    await models.execute(
      'session.setModel',
      { sessionId: session.id, modelId: 'local-fixture', baselineRevisions: baseline.revisions },
      { idempotencyKey: `goal-plan-recovery-model-${session.id}` },
    )
    await configuration.execute('mode.set', { sessionId: session.id, mode: 'default' })
    initializationWrites.push('session.setModel', 'mode.set')
  }
  if (options.goal !== 'none') {
    const created = await goals.execute('goal.create', {
      sessionId: firstSession.id,
      objective: 'Keep the original recovery Goal — 保留原目标',
      tokenBudget: 10000,
    })
    initializationWrites.push('goal.create')
    if (!created.goal?.goalId) throw new Error('Owned Goal identity is missing')
    if (options.goal === 'paused') {
      await goals.execute('goal.set', {
        sessionId: firstSession.id,
        expectedGoalId: created.goal.goalId,
        status: 'paused',
      })
      initializationWrites.push('goal.set')
    }
  }
  const firstGoal = await goals.execute('goal.snapshot', { sessionId: firstSession.id })
  for (const session of [firstSession, secondSession]) {
    if ((await client.call('session.snapshot', { sessionId: session.id })).runs.length !== 0)
      throw new Error('Unexpected Run during fixture initialization')
  }
  client.disconnect()
  // Credential-bearing protocol is consumed in memory by the owning helper;
  // never copy this stdout into screenshots/reports.
  process.stdout.write(
    `${JSON.stringify({
      url,
      token: browserDevice.token,
      externalToken: externalDevice.token,
      workspace,
      firstSession,
      secondSession,
      firstGoal,
      initializationWrites,
      goalAutoContinue: false,
    })}\n`,
  )
  const input = createInterface({ input: process.stdin })
  await new Promise<void>((done) => {
    input.on('line', (line) => {
      if (line === 'stop') done()
    })
    input.once('close', done)
  })
  input.close()
  await close()
} catch (error) {
  try {
    await close()
  } catch {
    process.stderr.write('Owned Goal Plan Host cleanup failed\n')
  }
  process.stderr.write(error instanceof Error ? `${error.message}\n` : 'Owned Goal Plan Host failed\n')
  process.exitCode = 1
}
