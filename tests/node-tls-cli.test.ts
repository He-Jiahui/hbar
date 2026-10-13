import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { nodeInviteSchema } from '@hbar/contracts/node-registry'
import { nodeListPageSchema } from '@hbar/contracts/node-management'
import { nodeConsoleConnectionSchema, nodeConsoleMethods } from '@hbar/contracts/node-console'
import { createNodeIdentity } from '@hbar/node-core'
import { WorkspaceNodeClient } from '@hbar/node-link'

const cli = resolve('apps/cli/src/main.ts')
const cert = resolve('tests/fixtures/node-tls/localhost-cert.pem')
const key = resolve('tests/fixtures/node-tls/localhost-key.pem')
const hostConnectionSchema = z.object({
  url: z.url(),
  pid: z.number().int().positive(),
  supervisorPid: z.number().int().positive(),
})

async function command(argv: readonly string[], cwd: string): Promise<unknown> {
  const child = Bun.spawn([process.execPath, cli, ...argv], {
    cwd,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    windowsHide: true,
    env: { ...process.env, SSL_CERT_FILE: cert, NODE_TLS_REJECT_UNAUTHORIZED: '1' },
  })
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  expect(code, stderr).toBe(0)
  return JSON.parse(stdout)
}

test('source service roles forward TLS and global paths; untrusted WSS refuses joining while a trusted CA completes it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-node-tls-cli-'))
  const data = join(root, 'a-data'),
    cache = join(root, 'a-cache'),
    home = join(root, 'b-node'),
    workspace = join(root, 'workspace')
  await mkdir(workspace)
  const host = Bun.spawn(
    [
      process.execPath,
      cli,
      '--data-root',
      data,
      '--cache-root',
      cache,
      '--project',
      workspace,
      '--cert',
      cert,
      '--key',
      key,
      'serve',
      '--role',
      'conversation',
      '--host',
      '127.0.0.1',
      '--port',
      '0',
    ],
    {
      cwd: root,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      windowsHide: true,
    },
  )
  const hostErrors = new Response(host.stderr).text(),
    hostOutput = new Response(host.stdout).text()
  let connection: z.infer<typeof hostConnectionSchema> | undefined, node: Bun.Subprocess | undefined
  let nodeErrors: Promise<string> | undefined, nodeOutput: Promise<string> | undefined
  const untrusted = new WorkspaceNodeClient({ identity: createNodeIdentity(), handle: async () => ({}) })
  try {
    const deadline = Date.now() + 30_000
    while (!connection) {
      if (host.exitCode !== null) throw new Error(await hostErrors)
      try {
        connection = hostConnectionSchema.parse(
          JSON.parse(await readFile(join(data, 'settings', 'connection.json'), 'utf8')),
        )
      } catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error
      }
      if (Date.now() > deadline) throw new Error('TLS conversation Host did not start')
      if (!connection) await Bun.sleep(25)
    }
    expect(connection.url).toStartWith('https://127.0.0.1:')
    const health = await fetch(connection.url + '/livez', { tls: { ca: Bun.file(cert), rejectUnauthorized: true } })
    expect(health.ok).toBe(true)
    while (!(await fetch(connection.url + '/healthz', { tls: { ca: Bun.file(cert), rejectUnauthorized: true } })).ok) {
      if (Date.now() > deadline) throw new Error('TLS conversation Kernel did not become ready')
      await Bun.sleep(25)
    }
    const hostArgs = ['--data-root', data, '--cache-root', cache, '--connect-only']
    const invitation = nodeInviteSchema.parse(
      await command([...hostArgs, 'exec', 'node.invite', '--name', 'tls-box'], root),
    )
    const refusal: unknown = await untrusted
      .connect({ url: connection.url, code: invitation.code, fingerprint: invitation.fingerprint })
      .catch((error: unknown) => error)
    expect(refusal).toMatchObject({ code: 'NODE_OFFLINE' })
    expect(nodeListPageSchema.parse(await command([...hostArgs, 'exec', 'node.list'], root)).items).toHaveLength(0)
    await command(['--home', home, 'node', 'share', workspace, '--id', 'engine', '--access', 'read'], root)
    const nodeProcess = Bun.spawn(
      [
        process.execPath,
        cli,
        '--home',
        home,
        '--role',
        'workspace',
        'serve',
        '--join',
        connection.url,
        '--code',
        invitation.code,
        '--fingerprint',
        invitation.fingerprint,
      ],
      {
        cwd: root,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        windowsHide: true,
        env: { ...process.env, SSL_CERT_FILE: cert, NODE_TLS_REJECT_UNAUTHORIZED: '1' },
      },
    )
    node = nodeProcess
    nodeErrors = new Response(nodeProcess.stderr).text()
    nodeOutput = new Response(nodeProcess.stdout).text()
    let online = false
    while (!online) {
      if (node.exitCode !== null) throw new Error(await nodeErrors)
      try {
        const control = nodeConsoleConnectionSchema.parse(
          JSON.parse(await readFile(join(home, 'control.json'), 'utf8')),
        )
        const response = await fetch(control.url, {
          method: 'POST',
          headers: { authorization: 'Bearer ' + control.token },
          body: JSON.stringify({ method: 'node.status', input: {} }),
        })
        const status = z
          .object({ result: nodeConsoleMethods['node.status'].output })
          .parse(await response.json()).result
        online = status.connection.phase === 'online'
      } catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error
      }
      if (Date.now() > deadline) throw new Error('Trusted TLS workspace node did not join')
      if (!online) await Bun.sleep(25)
    }
    const registered = nodeListPageSchema.parse(await command([...hostArgs, 'exec', 'node.list'], root))
    expect(registered.items).toMatchObject([
      { name: 'tls-box', online: true, capabilities: { roots: [{ rootId: 'engine' }] } },
    ])
  } finally {
    untrusted.close()
    if (node?.exitCode === null) node.kill('SIGTERM')
    await node?.exited
    await Promise.all([nodeErrors, nodeOutput])
    // Both PIDs came from this fixture's isolated connection file, never from a global Host record.
    if (connection) {
      try {
        process.kill(connection.supervisorPid, 'SIGTERM')
      } catch {
        /* Already stopped. */
      }
      const deadline = Date.now() + 15_000
      while (host.exitCode === null && Date.now() < deadline) await Bun.sleep(25)
    }
    if (host.exitCode === null) host.kill('SIGTERM')
    await host.exited
    await Promise.all([hostErrors, hostOutput])
    await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  }
}, 90_000)
