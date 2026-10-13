import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import {
  HbarClient,
  createGoalPlanCommandClient,
  createRunCommandClient,
  createSystemCommandClient,
} from '@hbar/client'
import { getStorageLocations, resolvePathLayout } from '@hbar/storage'
import { createHostSupervisor } from '../apps/host/src/supervisor'

const connectionSchema = z.object({
  url: z.string().url(),
  token: z.string().min(1),
  pid: z.number().int().positive(),
  instanceId: z.string().min(1),
})

async function until<Value>(operation: () => Promise<Value>, timeoutMs = 120_000): Promise<Value> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      return await operation()
    } catch (error) {
      if (Date.now() >= deadline) throw error
      await Bun.sleep(50)
    }
  }
}

test('a real supervised Host restart resumes active Goals without a user message and keeps paused Goals idle', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-goal-startup-host-'))
  const dataRoot = join(root, 'data')
  const workspace = join(root, 'workspace')
  await mkdir(workspace, { recursive: true })
  const layout = await resolvePathLayout({ preferPointer: true, dataRoot, cacheRoot: join(root, 'cache') })
  const connectionFile = join((await getStorageLocations(layout)).saved.settingsRoot, 'connection.json')
  const exits: string[] = []
  const supervisor = createHostSupervisor({
    command: [process.execPath, resolve(process.env.HBAR_GOAL_STARTUP_HOST_ENTRYPOINT ?? 'apps/host/src/main.ts')],
    hostArgs: [
      '--desktop',
      '--port',
      '0',
      '--data-root',
      dataRoot,
      '--cache-root',
      join(root, 'cache'),
      '--workspace',
      workspace,
      '--profile',
      resolve('tests/fixtures/goal-startup-profile.ts'),
      '--demo',
    ],
    connectionFile,
    stdio: 'ignore',
    onExit: (event) => exits.push(JSON.stringify(event)),
  })
  const supervision = supervisor.run()
  const clients: HbarClient[] = []
  let failure: { error: unknown } | undefined
  try {
    const first = await until(async () => {
      const connection = connectionSchema.parse(JSON.parse(await readFile(connectionFile, 'utf8')))
      if (!(await fetch(`${connection.url}/healthz`)).ok) throw new Error('Host is not ready')
      return connection
    })
    const firstClient = new HbarClient(first.url, first.token)
    clients.push(firstClient)
    await firstClient.connect()
    const workspaceItem = (await firstClient.call('workspace.list', {})).items[0]
    if (!workspaceItem) throw new Error('Temporary workspace missing')
    const session = await firstClient.call('session.create', { workspaceId: workspaceItem.id, title: 'Resume me' })
    const paused = await firstClient.call('session.create', { workspaceId: workspaceItem.id, title: 'Keep paused' })
    const goals = createGoalPlanCommandClient(firstClient)
    const activeGoal = await goals.execute('goal.create', {
      sessionId: session.id,
      objective: 'Complete after the Host restarts',
      tokenBudget: 100,
    })
    const pausedGoal = await goals.execute('goal.create', { sessionId: paused.id, objective: 'Remain paused' })
    await goals.execute('goal.set', { sessionId: paused.id, status: 'paused', expectedGoalId: pausedGoal.goal?.goalId })
    const accepted = await createRunCommandClient(firstClient).execute(
      'run.submit',
      {
        sessionId: session.id,
        modelId: 'local-fixture',
        input: { text: 'Wait for the Host restart', images: [] },
      },
      { idempotencyKey: 'startup-user-turn' },
    )
    await until(async () => {
      const snapshot = await firstClient.call('session.snapshot', { sessionId: session.id })
      if (snapshot.usage.output !== 1) throw new Error('Fixture Run has not reached its durable checkpoint')
      expect(snapshot.runs.find((run) => run.id === accepted.operationId)?.status).toBe('running')
    })
    expect(await createSystemCommandClient(firstClient).execute('system.restart', {})).toMatchObject({ accepted: true })
    firstClient.disconnect()

    const second = await until(async () => {
      const connection = connectionSchema.parse(JSON.parse(await readFile(connectionFile, 'utf8')))
      if (connection.instanceId === first.instanceId) throw new Error('Host has not restarted')
      if (!(await fetch(`${connection.url}/healthz`)).ok) throw new Error('Restarted Host is not ready')
      return connection
    })
    expect(second.url).toBe(first.url)
    const secondClient = new HbarClient(second.url, first.token)
    clients.push(secondClient)
    await secondClient.connect()
    const recovered = createGoalPlanCommandClient(secondClient)
    await until(async () => {
      expect((await recovered.execute('goal.get', { sessionId: session.id })).goal).toMatchObject({
        goalId: activeGoal.goal?.goalId,
        objective: activeGoal.goal?.objective,
        status: 'complete',
        tokensUsed: 2,
      })
      expect((await secondClient.call('session.snapshot', { sessionId: session.id })).runs[0]?.status).toBe('completed')
    })
    const snapshot = await secondClient.call('session.snapshot', { sessionId: session.id })
    expect(snapshot.runs).toHaveLength(2)
    expect(snapshot.runs.find((run) => run.id === accepted.operationId)).toMatchObject({
      status: 'interrupted',
      failure: { category: 'interrupted' },
    })
    expect(snapshot.runs.find((run) => run.id !== accepted.operationId)).toMatchObject({
      status: 'completed',
      modelId: 'local-fixture',
      input: { source: 'goal', continuation: { goalId: activeGoal.goal?.goalId } },
    })
    expect((await recovered.execute('goal.get', { sessionId: paused.id })).goal?.status).toBe('paused')
    expect((await secondClient.call('session.snapshot', { sessionId: paused.id })).runs).toHaveLength(0)

    // A second server restart cannot duplicate the completed automatic turn.
    await createSystemCommandClient(secondClient).execute('system.restart', {})
    secondClient.disconnect()
    const third = await until(async () => {
      const connection = connectionSchema.parse(JSON.parse(await readFile(connectionFile, 'utf8')))
      if (connection.instanceId === second.instanceId) throw new Error('Host has not restarted again')
      if (!(await fetch(`${connection.url}/healthz`)).ok) throw new Error('Host is not ready')
      return connection
    })
    const thirdClient = new HbarClient(third.url, first.token)
    clients.push(thirdClient)
    await thirdClient.connect()
    expect((await thirdClient.call('session.snapshot', { sessionId: session.id })).runs).toHaveLength(2)
    expect(
      (await createGoalPlanCommandClient(thirdClient).execute('goal.get', { sessionId: paused.id })).goal?.status,
    ).toBe('paused')
  } catch (error) {
    failure = { error }
  } finally {
    for (const client of clients) client.disconnect()
    await supervisor.stop()
    await supervision
    await rm(root, { recursive: true, force: true })
  }
  if (failure) throw new Error(`Goal Host restart failed: ${exits.join('\n')}`, { cause: failure.error })
}, 420_000)
