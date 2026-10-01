import { Database } from 'bun:sqlite'
import { basename, dirname, join, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { mkdir, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { HbarClient, createModelCommandClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../../apps/host/src/server'
import type { Session, Workspace } from '@hbar/contracts/directory'

const rootPrefix = 'hbar-sidebar-organization-e2e-'
const options = z
  .strictObject({ root: z.string().min(1), assets: z.string().min(1) })
  .parse({ root: process.env.HBAR_SIDEBAR_ORGANIZATION_ROOT, assets: process.env.HBAR_SIDEBAR_ORGANIZATION_WEB_DIST })
const root = await realpath(options.root)
if (dirname(root) !== (await realpath(tmpdir())) || !basename(root).startsWith(rootPrefix))
  throw new Error('Refusing to seed outside this owned sidebar-organization temp root')

const assets = resolve(options.assets)
if (!existsSync(join(assets, 'index.html')))
  throw new Error('Production Web bundle is missing; build dist/web before running this sidebar E2E')

const projectSpecs = [
  { directory: 'selected-project', displayName: 'Delta Project' },
  { directory: 'alpha-project', displayName: 'Alpha Project' },
  { directory: 'pinned-project', displayName: 'Zulu Pinned' },
  { directory: 'charlie-project', displayName: 'Charlie Project' },
  { directory: 'echo-project', displayName: 'Echo Project' },
  { directory: 'hidden-project', displayName: 'Hidden Project' },
] as const
const workspacePaths = projectSpecs.map(({ directory }) => join(root, 'projects', directory))
for (const path of workspacePaths) await mkdir(path, { recursive: true })

const home = join(root, 'data')
const kernelOptions = {
  home,
  workspace: workspacePaths[0],
  demo: true,
  secrets: new MemorySecrets(),
} satisfies Parameters<typeof Kernel.create>[0]
let kernel: Kernel | undefined
let host: Awaited<ReturnType<typeof startServer>> | undefined
let client: HbarClient | undefined

const now = Date.now()
const dayStart = new Date(now)
dayStart.setHours(0, 0, 0, 0)
const today = Math.max(dayStart.getTime(), Math.min(now - 1_000, dayStart.getTime() + 12 * 60 * 60 * 1_000))
const todayOverflow = Math.max(dayStart.getTime(), today - 1_000)
const timestampForDaysAgo = (daysAgo: number) => {
  const timestamp = new Date(now)
  timestamp.setHours(12, 0, 0, 0)
  timestamp.setDate(timestamp.getDate() - daysAgo)
  return timestamp.getTime()
}

async function seed() {
  kernel = await Kernel.create(kernelOptions)
  const workspaces: Workspace[] = []
  for (const path of workspacePaths) {
    const registered = await kernel.storage.call('workspaces')
    const existing = registered.find((workspace) => workspace.path === path)
    workspaces.push(existing ?? (await kernel.createWorkspace(path)))
  }
  if (workspaces.length !== projectSpecs.length) throw new Error('The sidebar fixture projects were not registered')

  for (const [index, workspace] of workspaces.entries()) {
    const displayNames = await kernel.storage.call('workspaceDisplayNames')
    await kernel.storage.call('applyWorkspaceDisplayNames', {
      actorId: 'sidebar-organization-fixture',
      idempotencyKey: `sidebar-organization-alias-${index + 1}`,
      request: {
        expectedRevision: displayNames.revision,
        workspaceId: workspace.id,
        expectedDisplayName: null,
        displayName: projectSpecs[index]!.displayName,
      },
    })
  }

  const hiddenWorkspace = workspaces[5]
  const pinnedWorkspace = workspaces[2]
  const selectedWorkspace = workspaces[0]
  const activeWorkspace = workspaces[1]
  const yesterdayWorkspace = workspaces[3]
  const last30DaysWorkspace = workspaces[2]
  const earlierWorkspace = workspaces[4]
  if (
    !hiddenWorkspace ||
    !pinnedWorkspace ||
    !selectedWorkspace ||
    !activeWorkspace ||
    !yesterdayWorkspace ||
    !last30DaysWorkspace ||
    !earlierWorkspace
  )
    throw new Error('The sidebar fixture workspace roles are incomplete')

  const organization = await kernel.storage.call('workspaceOrganization')
  await kernel.storage.call('applyWorkspaceOrganization', {
    actorId: 'sidebar-organization-fixture',
    idempotencyKey: 'sidebar-organization-hide-workspace',
    request: {
      expectedRevision: organization.revision,
      change: {
        kind: 'setHidden',
        workspaceId: hiddenWorkspace.id,
        expectedHidden: false,
        hidden: true,
      },
    },
  })

  const timestampUpdates = new Map<string, { createdAt: number; updatedAt: number }>()
  const sessions: Session[] = []
  const createSession = async (
    workspace: Workspace,
    title: string,
    updatedAt: number,
    createdAt = updatedAt,
  ): Promise<Session> => {
    const session = await kernel!.storage.call('createSession', workspace.id, title)
    timestampUpdates.set(session.id, { createdAt, updatedAt })
    sessions.push(session)
    return session
  }

  const selectedSession = await createSession(
    selectedWorkspace,
    'Sidebar selected draft target',
    today,
    timestampForDaysAgo(60),
  )
  for (let index = 1; index < 55; index++)
    await createSession(selectedWorkspace, `Sidebar today ${String(index).padStart(2, '0')}`, todayOverflow)

  const yesterdaySession = await createSession(
    yesterdayWorkspace,
    'Sidebar yesterday activity',
    timestampForDaysAgo(1),
    timestampForDaysAgo(90),
  )
  const last7DaysSession = await createSession(
    activeWorkspace,
    'Sidebar previous-week activity',
    timestampForDaysAgo(4),
    timestampForDaysAgo(90),
  )
  const last30DaysSession = await createSession(
    last30DaysWorkspace,
    'Sidebar previous-month activity',
    timestampForDaysAgo(14),
    timestampForDaysAgo(120),
  )
  const earlierSession = await createSession(
    earlierWorkspace,
    'Sidebar earlier activity 01',
    timestampForDaysAgo(45),
    timestampForDaysAgo(150),
  )
  for (let index = 1; index < 10; index++)
    await createSession(
      earlierWorkspace,
      `Sidebar earlier activity ${String(index + 1).padStart(2, '0')}`,
      timestampForDaysAgo(45),
      timestampForDaysAgo(150),
    )

  const activeSession = await createSession(activeWorkspace, 'Sidebar running activity', today, timestampForDaysAgo(60))

  await kernel.close()
  kernel = undefined

  const database = new Database(join(home, 'databases', 'hbar.sqlite'), { create: false, strict: true })
  try {
    const updateSessionTime = database.query('UPDATE sessions SET createdAt=?,updatedAt=? WHERE id=?')
    database.transaction(() => {
      for (const [sessionId, timestamps] of timestampUpdates)
        updateSessionTime.run(timestamps.createdAt, timestamps.updatedAt, sessionId)
    })()
  } finally {
    database.close()
  }

  // Reopening makes the Host read exactly the synthetic timestamps stored in this temporary profile.
  kernel = await Kernel.create(kernelOptions)
  const queuedRun = await kernel.storage.call(
    'enqueue',
    activeSession.id,
    'sidebar-organization-seeded-active-run',
    { text: 'Synthetic active sidebar fixture; this input is never dispatched.', images: [] },
    'sidebar-fixture-model',
  )
  const claimedRun = await kernel.storage.call('claim', activeSession.id)
  if (claimedRun?.id !== queuedRun.id || claimedRun.status !== 'running')
    throw new Error('The synthetic active fixture Run did not reach its stored running state')

  host = await startServer(kernel, { hostname: '127.0.0.1', port: 0, staticRoot: assets })
  const wideDevice = await host.auth.createDevice('Sidebar organization wide browser fixture')
  const narrowDevice = await host.auth.createDevice('Sidebar organization narrow browser fixture')
  const observerDevice = await host.auth.createDevice('Sidebar organization read observer fixture')
  const url = `http://127.0.0.1:${host.server.port}`
  client = new HbarClient(url, observerDevice.token)
  await client.connect()
  const models = createModelCommandClient(client)
  const localFixture = (await models.execute('model.list', {})).find(({ id }) => id === 'local-fixture')
  if (!localFixture) throw new Error('The temporary Host has no local-fixture catalog model')
  const thinkingLevel = localFixture.thinkingLevels.find((level) => level !== 'off')
  if (!thinkingLevel) throw new Error('The local-fixture model has no available non-off thinking level')
  const selectedModelBaseline = await models.execute('session.getModel', { sessionId: selectedSession.id })
  await models.execute(
    'session.setModel',
    {
      sessionId: selectedSession.id,
      modelId: 'local-fixture',
      baselineRevisions: selectedModelBaseline.revisions,
    },
    { idempotencyKey: 'sidebar-organization-selected-local-model' },
  )
  const selectedThinkingBaseline = await models.execute('session.getModel', { sessionId: selectedSession.id })
  await models.execute(
    'session.setThinkingLevel',
    { sessionId: selectedSession.id, thinkingLevel, baselineRevisions: selectedThinkingBaseline.revisions },
    { idempotencyKey: 'sidebar-organization-selected-thinking-level' },
  )

  const readySessions = await Promise.all(sessions.map(({ id }) => kernel!.storage.call('session', id)))
  process.stdout.write(
    `${JSON.stringify({
      url,
      wideToken: wideDevice.token,
      narrowToken: narrowDevice.token,
      observerToken: observerDevice.token,
      workspaces,
      aliases: workspaces.map((workspace, index) => ({
        workspaceId: workspace.id,
        displayName: projectSpecs[index]!.displayName,
      })),
      hiddenWorkspaceId: hiddenWorkspace.id,
      pinnedWorkspaceId: pinnedWorkspace.id,
      selectedSession: readySessions.find((session) => session.id === selectedSession.id),
      activeSession: readySessions.find((session) => session.id === activeSession.id),
      activeRunId: claimedRun.id,
      timeRepresentatives: {
        today: readySessions.find((session) => session.id === selectedSession.id),
        yesterday: readySessions.find((session) => session.id === yesterdaySession.id),
        last7Days: readySessions.find((session) => session.id === last7DaysSession.id),
        last30Days: readySessions.find((session) => session.id === last30DaysSession.id),
        earlier: readySessions.find((session) => session.id === earlierSession.id),
      },
      sessionCount: readySessions.length,
    })}\n`,
  )
}

async function close() {
  client?.disconnect()
  try {
    await host?.close()
  } finally {
    await kernel?.close()
  }
}

try {
  await seed()
  const input = createInterface({ input: process.stdin })
  await new Promise<void>((done) => {
    input.on('line', (line) => {
      if (line === 'stop') done()
    })
    input.once('close', done)
  })
  input.close()
} catch (error) {
  process.stderr.write(error instanceof Error ? `${error.message}\n` : 'Sidebar organization fixture failed\n')
  process.exitCode = 1
} finally {
  await close()
}
