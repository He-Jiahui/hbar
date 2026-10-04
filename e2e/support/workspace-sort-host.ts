import { mkdir, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { HbarClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { Session } from '@hbar/contracts/directory'
import { startServer } from '../../apps/host/src/server'
import { z } from 'zod'

const rootPrefix = 'hbar-workspace-sort-ui-'
const options = z
  .strictObject({ root: z.string().min(1), assets: z.string().min(1) })
  .parse({ root: process.env.HBAR_WORKSPACE_SORT_ROOT, assets: process.env.HBAR_WORKSPACE_SORT_WEB_DIST })
const root = await realpath(options.root)
if (dirname(root) !== (await realpath(tmpdir())) || !basename(root).startsWith(rootPrefix))
  throw new Error('Refusing to seed a non-owned workspace-sort fixture root')

const assets = resolve(options.assets)
const projectPaths = Array.from({ length: 6 }, (_, index) => join(root, 'projects', `sort-project-${index + 1}`))
const initialWorkspacePath = projectPaths[0]
if (!initialWorkspacePath) throw new Error('The workspace-sort fixture did not create its initial project path')
for (const path of projectPaths) await mkdir(path, { recursive: true })

const kernel = await Kernel.create({
  home: join(root, 'data'),
  workspace: initialWorkspacePath,
  demo: false,
  secrets: new MemorySecrets(),
})
let host: Awaited<ReturnType<typeof startServer>> | undefined
let seedClient: HbarClient | undefined

async function seed() {
  host = await startServer(kernel, { hostname: '127.0.0.1', port: 0, staticRoot: assets })
  const wideDevice = await host.auth.createDevice('Workspace sort wide browser fixture')
  const narrowDevice = await host.auth.createDevice('Workspace sort narrow browser fixture')
  const observerDevice = await host.auth.createDevice('Workspace sort read observer fixture')
  const url = `http://127.0.0.1:${host.server.port}`
  seedClient = new HbarClient(url, wideDevice.token)
  await seedClient.connect()
  const commands = createWorkspaceSessionCommandClient(seedClient)
  const directory = await commands.execute('workspace.list', { limit: 20 })
  const firstWorkspace = directory.items.find((workspace) => workspace.path === projectPaths[0])
  if (!firstWorkspace) throw new Error('The initial workspace-sort project was not registered')
  const workspaces = [firstWorkspace]
  for (const path of projectPaths.slice(1)) workspaces.push(await commands.execute('workspace.create', { path }))

  const sessionsByWorkspace: Record<string, Session[]> = {}
  const primaryWorkspace = firstWorkspace
  const primarySessions: Session[] = []
  for (let index = 0; index < 115; index++) {
    primarySessions.push(
      await commands.execute(
        'session.create',
        { workspaceId: primaryWorkspace.id, title: `Sort fixture session ${String(index + 1).padStart(3, '0')}` },
        { idempotencyKey: `workspace-sort-session-${String(index + 1).padStart(3, '0')}` },
      ),
    )
  }
  sessionsByWorkspace[primaryWorkspace.id] = primarySessions

  for (let index = 1; index < workspaces.length; index++) {
    const workspace = workspaces[index]
    if (!workspace) throw new Error('Workspace seed order changed unexpectedly')
    const session = await commands.execute(
      'session.create',
      { workspaceId: workspace.id, title: `Sort project ${index + 1} session` },
      { idempotencyKey: `workspace-sort-project-session-${index + 1}` },
    )
    sessionsByWorkspace[workspace.id] = [session]
  }

  const idPage = await commands.execute('session.list', { workspaceId: primaryWorkspace.id, limit: 100 })
  const createdPage = await commands.execute('session.activity.list', {
    workspaceId: primaryWorkspace.id,
    sortBy: 'createdAt',
    limit: 200,
  })
  const idPageIds = new Set(idPage.items.map((session) => session.id))
  const createdHead = createdPage.items[0]
  if (!createdHead) throw new Error('The primary workspace has no created-time activity records')
  const createdHeadId = createdHead.id
  const updateTarget = createdPage.items.find((session) => !idPageIds.has(session.id) && session.id !== createdHeadId)
  if (!updateTarget) throw new Error('No non-created-head session remains outside the ID-first page')

  await kernel.storage.call('commit', updateTarget.id, 'workspace-sort-history-only', 'assistant', [
    { type: 'text', text: 'Temporary workspace-sort fixture history; no model run was created.' },
  ])

  const updatedSessionPage = await commands.execute('session.activity.list', {
    workspaceId: primaryWorkspace.id,
    sortBy: 'updatedAt',
    limit: 200,
  })
  if (updatedSessionPage.items[0]?.id !== updateTarget.id)
    throw new Error('The activity-updated session did not lead the Host updated-time page')
  const selectedSession = updatedSessionPage.items[0]
  if (!selectedSession) throw new Error('The updated-time Host page is empty')

  const organization = await commands.execute('workspaceOrganization.get', {})
  const hiddenWorkspace = workspaces[1]
  const pinnedWorkspace = workspaces[4]
  if (!hiddenWorkspace || !pinnedWorkspace) throw new Error('Pinned or hidden project seed is missing')
  await commands.execute(
    'workspaceOrganization.apply',
    {
      expectedRevision: organization.revision,
      change: {
        kind: 'setHidden',
        workspaceId: hiddenWorkspace.id,
        expectedHidden: false,
        hidden: true,
      },
    },
    { idempotencyKey: 'workspace-sort-hide-project' },
  )

  const currentSnapshot = await kernel.storage.call('snapshot', updateTarget.id)
  if (currentSnapshot.runs.length > 0) throw new Error('The fixture unexpectedly created a Run')

  seedClient.disconnect()
  process.stdout.write(
    `${JSON.stringify({
      url,
      wideToken: wideDevice.token,
      narrowToken: narrowDevice.token,
      observerToken: observerDevice.token,
      workspaces,
      primaryWorkspace,
      pinnedWorkspace,
      hiddenWorkspace,
      selectedSession,
      createdHead,
      idPageSessionCount: idPage.items.length,
    })}\n`,
  )
}

async function close() {
  seedClient?.disconnect()
  try {
    await host?.close()
  } finally {
    await kernel.close()
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
  process.stderr.write(error instanceof Error ? `${error.message}\n` : 'Workspace-sort fixture failed\n')
  process.exitCode = 1
} finally {
  await close()
}
