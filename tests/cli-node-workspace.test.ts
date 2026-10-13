import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { HbarClient, createNodeCommandClient } from '@hbar/client'
import { runNode, runNodeCommand } from '@hbar/node'
import { z } from 'zod'

const cli = resolve('apps/cli/src/main.ts')
const connectionSchema = z.object({
  url: z.string().url(),
  token: z.string().min(1),
  pid: z.number().int().positive(),
  supervisorPid: z.number().int().positive().optional(),
})

async function runCli(args: readonly string[]) {
  const child = Bun.spawn([process.execPath, cli, ...args], {
    cwd: process.cwd(),
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, NO_COLOR: '1' },
  })
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  return { code, stdout, stderr }
}

async function waitFor<Value>(read: () => Promise<Value | undefined>, timeoutMs = 30_000): Promise<Value> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await read()
    if (value !== undefined) return value
    await Bun.sleep(50)
  }
  throw new Error('Timed out waiting for the real CLI conversation Host')
}

async function stopHost(connection: z.infer<typeof connectionSchema>, launcher: Bun.Subprocess): Promise<void> {
  for (const pid of [connection.supervisorPid, connection.pid]) {
    if (!pid) continue
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      // The process already exited during test cleanup.
    }
  }
  await Promise.race([launcher.exited, Bun.sleep(3_000)])
  if (launcher.exitCode === null) launcher.kill('SIGTERM')
}

test('real no-local-exec CLI supports global invite and workspace creation on a conversation Host with no local projects', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-cli-node-workspace-'))
  const data = join(root, 'conversation-data')
  const cache = join(root, 'conversation-cache')
  const nodeHome = join(root, 'workspace-node')
  const sharedRoot = join(root, 'shared-engine')
  await mkdir(sharedRoot, { recursive: true })
  const launcher = Bun.spawn(
    [
      process.execPath,
      cli,
      '--data-root',
      data,
      '--cache-root',
      cache,
      'serve',
      '--role',
      'conversation',
      '--no-local-exec',
      '--host',
      '127.0.0.1',
      '--port',
      '0',
    ],
    { cwd: process.cwd(), stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', env: { ...process.env, NO_COLOR: '1' } },
  )
  const serverOutput = Promise.all([new Response(launcher.stdout).text(), new Response(launcher.stderr).text()])
  let connection: z.infer<typeof connectionSchema> | undefined
  let client: HbarClient | undefined
  let workspaceNode: Awaited<ReturnType<typeof runNode>> | undefined
  try {
    connection = await waitFor(async () => {
      try {
        return connectionSchema.parse(JSON.parse(await readFile(join(data, 'settings', 'connection.json'), 'utf8')))
      } catch {
        if (launcher.exitCode !== null) {
          const [stdout, stderr] = await serverOutput
          throw new Error(`conversation Host exited (${launcher.exitCode}): ${stdout}\n${stderr}`)
        }
        return undefined
      }
    })
    client = new HbarClient(connection.url, connection.token)
    await client.connect()
    await waitFor(async () => {
      try {
        return await client?.call('system.bootstrap', {})
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'RUNTIME_RECOVERING')
          return undefined
        throw error
      }
    })
    expect((await client.call('system.bootstrap', {})).workspaces).toEqual([])

    const common = ['--connect-only', '--data-root', data, '--cache-root', cache]
    const invited = await runCli([...common, 'exec', 'node.invite', '--name', 'build-box'])
    expect(invited.code).toBe(0)
    const invitation = z
      .object({ code: z.string().regex(/^\d{8}$/), fingerprint: z.string().min(1) })
      .parse(JSON.parse(invited.stdout))

    await runNodeCommand(['share', sharedRoot, '--id', 'engine', '--access', 'write', '--home', nodeHome], () => {})
    workspaceNode = await runNode(
      [
        '--home',
        nodeHome,
        '--join',
        connection.url,
        '--code',
        invitation.code,
        '--fingerprint',
        invitation.fingerprint,
      ],
      { registerSignals: false },
    )
    const nodeCommands = createNodeCommandClient(client)
    await waitFor(async () =>
      (await nodeCommands.execute('node.list', { limit: 10 })).items.some(
        (node) => node.nodeId === workspaceNode?.node.id && node.online,
      )
        ? true
        : undefined,
    )
    expect((await client.call('system.bootstrap', {})).workspaces).toEqual([])

    const created = await runCli([...common, 'exec', 'workspace.create', '--node', 'build-box', '--root', 'engine'])
    expect(created.code).toBe(0)
    const workspace = z
      .object({
        path: z.string(),
        location: z.object({ kind: z.literal('node'), nodeId: z.string(), rootId: z.string(), nodePath: z.string() }),
      })
      .parse(JSON.parse(created.stdout))
    expect(workspace).toMatchObject({
      path: `hbar-node://${workspaceNode.node.id}/engine`,
      location: { kind: 'node', nodeId: workspaceNode.node.id, rootId: 'engine', nodePath: sharedRoot },
    })
    expect((await client.call('system.bootstrap', {})).workspaces).toHaveLength(1)
  } finally {
    client?.disconnect()
    await workspaceNode?.close()
    if (connection) await stopHost(connection, launcher)
    else if (launcher.exitCode === null) launcher.kill('SIGTERM')
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
}, 120_000)
