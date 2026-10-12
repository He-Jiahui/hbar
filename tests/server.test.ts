import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import {
  HbarClient,
  createDirectoryQueryAdapter,
  createGitCommandClient,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import { createAppRuntime } from '@hbar/app-runtime'
import { pathPointerSchema } from '@hbar/storage'
import { startServer } from '../apps/host/src/server.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})
async function fixture(desktop = false, noLocalExec = false) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-server-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    pointerFile: join(root, 'system', 'paths.json'),
    demo: true,
    noLocalExec,
    workspace: root,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(kernel, { port: 0, ...(desktop ? { desktop: true } : {}) })
  const url = `http://127.0.0.1:${host.server.port}`
  const client = new HbarClient(url)
  cleanups.push(async () => {
    client.disconnect()
    await host.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  })
  await client.pair(host.pairing.code, 'test browser')
  return { root, kernel, host, client, url }
}
test('desktop Host permits the Vite development origin for credential exchange', async () => {
  const { url } = await fixture(true)
  const response = await fetch(`${url}/auth/token`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://127.0.0.1:5173',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  })
  expect(response.status).toBe(204)
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://127.0.0.1:5173')
})
test('paired SDK performs session flow and resumes event following without Tauri', async () => {
  const { client, kernel } = await fixture()
  const bootstrap = await client.call('system.bootstrap', {})
  const session = await client.call('session.create', { workspaceId: bootstrap.workspaces[0]!.id })
  await client.follow(session.id, 0)
  const submitted = {
    sessionId: session.id,
    requestId: 'network',
    input: { text: 'network run' },
    modelId: 'local-fixture',
  }
  const firstRun = await client.call('run.start', submitted)
  const repeatedRun = await client.call('run.start', submitted)
  expect(repeatedRun.id).toBe(firstRun.id)
  await kernel.waitForIdle()
  const snapshot = await client.call('session.snapshot', { sessionId: session.id })
  expect(snapshot.messages).toHaveLength(2)
  expect(snapshot.runs[0]!.status).toBe('completed')
  const replay = await client.call('session.follow', { sessionId: session.id, cursor: 0 })
  expect(replay.events.at(-1)?.seq).toBe(snapshot.cursor)
  expect(replay.events.filter((e) => e.type === 'message.committed')).toHaveLength(2)
})
test('pairing codes are single-use and bad origins cannot pair or read attachments', async () => {
  const { host, url } = await fixture()
  const reused = await fetch(`${url}/auth/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: host.pairing.code, name: 'other' }),
  })
  expect(reused.status).toBe(401)
  const hostile = await fetch(`${url}/healthz`, { headers: { Origin: 'https://attacker.invalid' } })
  expect(hostile.status).toBe(403)
  const unauthenticated = await fetch(`${url}/api/artifacts/${'0'.repeat(64)}`)
  expect(unauthenticated.status).toBe(401)
})
test('revoking a paired device closes its authority', async () => {
  const { host, url, client } = await fixture()
  const second = await host.auth.createDevice('second device')
  const external = new HbarClient(url, second.token)
  await external.connect()
  await client.call('device.revoke', { id: second.device.id })
  await Bun.sleep(20)
  await expect(external.call('system.bootstrap', {})).rejects.toThrow()
  await expect(host.auth.authenticate(second.token)).rejects.toThrow('revoked')
  external.disconnect()
})
test('setting paths persists only the isolated bootstrap pointer and requires a restart', async () => {
  const { client, root } = await fixture()
  const nextDataRoot = join(root, 'next-data')
  const nextCacheRoot = join(root, 'next-cache')
  const result = await client.call('system.paths.set', { dataRoot: nextDataRoot, cacheRoot: nextCacheRoot })
  expect(result.restartRequired).toBe(true)
  expect(result.dataRoot).toBe(nextDataRoot)
  expect(result.cacheRoot).toBe(nextCacheRoot)
  expect(result.pointerFile).toBe(join(root, 'system', 'paths.json'))
  expect(pathPointerSchema.parse(JSON.parse(await readFile(result.pointerFile, 'utf8')))).toMatchObject({
    dataRoot: nextDataRoot,
    cacheRoot: nextCacheRoot,
  })
})
test('skills listing exposes global skill directories through the paired Host', async () => {
  const { client, kernel } = await fixture()
  const paths = await kernel.paths()
  await mkdir(join(paths.skills, 'global', 'demo-skill'))
  await mkdir(join(paths.skills, 'global', 'another-skill'))
  expect(await client.call('system.skills.list', {})).toEqual([
    { id: 'another-skill', path: join(paths.skills, 'global', 'another-skill') },
    { id: 'demo-skill', path: join(paths.skills, 'global', 'demo-skill') },
  ])
})
test('a Host without a restart supervisor reports that a manual restart is required', async () => {
  const { client } = await fixture()
  expect(await client.call('system.restart', {})).toEqual({ accepted: false, restartRequired: true })
})
test('permission mode is exposed through the paired host and persists for future runs', async () => {
  const { client, kernel } = await fixture()
  expect((await client.call('permission.get', {})).mode).toBe('ask')
  expect((await client.call('permission.set', { mode: 'allow' })).mode).toBe('allow')
  expect((await client.call('permission.get', {})).mode).toBe('allow')
  expect(kernel.permissionMode()).toBe('allow')
})
test('system terminal opens a scoped PTY and streams shell output', async () => {
  const { client } = await fixture()
  const bootstrap = await client.call('system.bootstrap', {})
  const workspaceId = bootstrap.workspaces[0]!.id
  const marker = `hbar-pty-${Date.now()}`
  let output = ''
  const unsubscribe = client.onEvent((event) => {
    if (event.method === 'terminal.output') output += event.params.data
  })
  try {
    const terminal = await client.call('terminal.open', { workspaceId, cols: 100, rows: 24 })
    expect(terminal.workspaceId).toBe(workspaceId)
    await client.call('terminal.input', {
      terminalId: terminal.id,
      data: process.platform === 'win32' ? `Write-Output ${marker}\r` : `printf '${marker}\\n'\n`,
    })
    for (let attempts = 0; attempts < 50 && !output.includes(marker); attempts++) await Bun.sleep(100)
    expect(output.includes(marker)).toBe(true)
    await client.call('terminal.resize', { terminalId: terminal.id, cols: 120, rows: 30 })
    expect((await client.call('terminal.list', {}))[0]?.cols).toBe(120)
    client.disconnect()
    await Bun.sleep(20)
    await client.connect()
    expect((await client.call('terminal.list', {})).some((item) => item.id === terminal.id)).toBe(true)
    await client.call('terminal.close', { terminalId: terminal.id })
    expect(await client.call('terminal.list', {})).toEqual([])
  } finally {
    unsubscribe()
  }
})

test('no-local-exec rejects Host file and terminal RPCs before local effects', async () => {
  const { root, client } = await fixture(false, true)
  const bootstrap = await client.call('system.bootstrap', {})
  const workspace = bootstrap.workspaces[0]
  if (!workspace) throw new Error('Missing fixture workspace')
  const sentinel = join(root, 'local-sentinel.txt')
  await writeFile(sentinel, 'unchanged')

  await expect(
    client.call('file.write', { workspaceId: workspace.id, path: 'local-sentinel.txt', text: 'changed' }),
  ).rejects.toMatchObject({ code: 'LOCAL_EXECUTION_DISABLED' })
  await expect(
    createWorkspaceSessionCommandClient(client).execute('workspace.folders.browse', { path: root }),
  ).rejects.toMatchObject({ code: 'LOCAL_EXECUTION_DISABLED' })
  await expect(createGitCommandClient(client).execute('git.status', { cwd: root })).rejects.toMatchObject({
    code: 'LOCAL_EXECUTION_DISABLED',
  })
  await expect(client.call('terminal.open', { workspaceId: workspace.id, cols: 80, rows: 24 })).rejects.toMatchObject({
    code: 'LOCAL_EXECUTION_DISABLED',
  })
  expect(await client.call('terminal.list', {})).toEqual([])
  expect(await readFile(sentinel, 'utf8')).toBe('unchanged')
})

test('paged directory queries and two application runtimes use one real Host without sharing selection', async () => {
  const { client, kernel } = await fixture()
  const workspaces = await client.call('workspace.list', { limit: 1 })
  const workspace = workspaces.items[0]
  if (!workspace) throw new Error('Missing fixture workspace')
  const firstSession = await kernel.createSession(workspace.id, '审查')
  const secondSession = await kernel.createSession(workspace.id, '编辑')
  const first = createAppRuntime({
    instanceId: 'one',
    hostId: kernel.instanceId,
    directory: createDirectoryQueryAdapter(client),
  })
  const second = createAppRuntime({
    instanceId: 'two',
    hostId: kernel.instanceId,
    directory: createDirectoryQueryAdapter(client),
  })
  try {
    await first.view.commands.execute('app.setWorkspace', { workspaceId: workspace.id })
    await first.view.executeText('app.setSession 审查')
    await second.view.commands.execute('app.setSession', { sessionId: secondSession.id })
    expect(first.view.state.navigation.getSnapshot().sessionId).toBe(firstSession.id)
    expect(second.view.state.navigation.getSnapshot().sessionId).toBe(secondSession.id)
    expect(await client.call('session.get', { sessionId: 'missing' })).toBeNull()
    expect((await client.call('session.list', { workspaceId: workspace.id, title: "' OR 1=1 --" })).items).toEqual([])
    expect((await client.call('session.list', { workspaceId: workspace.id, title: '审查' })).items).toHaveLength(1)
    const page = await first.view.commands.execute('session.list', { workspaceId: workspace.id, limit: 1 })
    expect(page.items).toHaveLength(1)
    expect(page.nextCursor).not.toBeNull()
    const rest = await first.view.commands.execute('session.list', {
      workspaceId: workspace.id,
      after: page.nextCursor ?? '',
    })
    expect(rest.items.some((item) => item.id === page.items[0]?.id)).toBe(false)
    expect([page.items[0]?.id, ...rest.items.map((item) => item.id)].sort()).toEqual(
      [firstSession.id, secondSession.id].sort(),
    )
    await expect(client.call('session.list', { workspaceId: workspace.id, limit: 201 })).rejects.toThrow()
    await client.call('session.archive', { sessionId: firstSession.id, archived: true })
    const refreshed = await first.view.commands.execute('session.get', { sessionId: firstSession.id })
    expect(refreshed?.archived).toBe(true)
    expect(first.view.state.navigation.getSnapshot().sessionId).toBeNull()
    expect(second.view.state.navigation.getSnapshot().sessionId).toBe(secondSession.id)
    expect((await client.call('session.list', { workspaceId: workspace.id })).items.map((item) => item.id)).toEqual([
      secondSession.id,
    ])
    expect(
      (await client.call('session.list', { workspaceId: workspace.id, includeArchived: true })).items,
    ).toHaveLength(2)
  } finally {
    first.dispose()
    second.dispose()
  }
})
