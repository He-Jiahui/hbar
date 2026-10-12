import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarClient, createNodeCommandClient, createWorkspace } from '@hbar/client'
import { createPathLayout } from '@hbar/storage'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { runNode, runNodeCommand } from '@hbar/node'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { startServer } from '../apps/host/src/server'
import { nodeRequestAllowed } from '../apps/host/src/node-sockets'
import { isStableRpc } from '../apps/host/src/stable-rpc'
import { parseCli } from '../apps/cli/src/args'
import { runNodeManagementCommand } from '../apps/cli/src/node-management'

async function until(check: () => Promise<boolean>, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Stable node surface did not converge')
    await Bun.sleep(20)
  }
}
async function failure(work: Promise<unknown>): Promise<unknown> {
  return work.catch((error: unknown) => error)
}

test('stable /node and operator node commands complete joining, scoped files and immediate revocation independently of /rpc', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-node-host-surface-'))
  const workspace = join(root, 'node-workspace'),
    nodeHome = join(root, 'node')
  await mkdir(workspace)
  const runtime = await ProcessHostRuntime.create({
    layout: createPathLayout(join(root, 'a-data'), join(root, 'a-cache'), join(root, 'pointer.json')),
    sourceRoot: process.cwd(),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  let host: Awaited<ReturnType<typeof startServer>> | undefined, node: Awaited<ReturnType<typeof runNode>> | undefined
  let operator: HbarClient | undefined, observer: HbarClient | undefined
  try {
    host = await startServer(runtime.kernel, {
      port: 0,
      runtime,
      controller: runtime.controller,
      nodeLink: runtime.nodeLink,
    })
    const url = `http://127.0.0.1:${host.server.port}`
    const credentials = await host.auth.createDevice('operator')
    operator = new HbarClient(url, credentials.token)
    await operator.connect()
    const commands = createNodeCommandClient(operator)
    const descriptor = await operator.call('command.describe', { commandId: 'node.invite' })
    expect(descriptor.metadata).toMatchObject({ owner: 'hbar.nodes', kind: 'command', scope: 'global' })
    const invitationOutputs: unknown[] = []
    await runNodeManagementCommand(parseCli(['exec', 'node.invite', '--name', 'build-box']), operator, (value) =>
      invitationOutputs.push(value),
    )
    const invite = (await import('@hbar/contracts/node-registry')).nodeInviteSchema.parse(invitationOutputs[0])
    await runNodeCommand(['share', workspace, '--id', 'engine', '--access', 'write', '--home', nodeHome], () => {})
    node = await runNode(
      ['--home', nodeHome, '--join', url, '--code', invite.code, '--fingerprint', invite.fingerprint],
      { registerSignals: false },
    )
    const live = node
    await until(
      async () =>
        live.link.connection.phase === 'online' && (await commands.execute('node.list', {})).items[0]?.online === true,
    )
    const registered = (await commands.execute('node.list', { limit: 1 })).items[0]
    expect(registered).toMatchObject({ name: 'build-box', nodeId: live.node.id, online: true })
    const remoteWorkspace = await createWorkspace(operator, {
      node: 'build-box',
      rootId: 'engine',
      name: 'Remote engine',
    })
    expect(remoteWorkspace).toMatchObject({
      path: `hbar-node://${live.node.id}/engine`,
      name: 'Remote engine',
      location: { kind: 'node', nodeId: live.node.id, rootId: 'engine', nodePath: workspace },
    })
    expect(await createWorkspace(operator, { node: live.node.id, rootId: 'engine' })).toMatchObject({
      id: remoteWorkspace.id,
      location: remoteWorkspace.location,
    })
    await expect(createWorkspace(operator, { node: live.node.id, rootId: 'missing' })).rejects.toMatchObject({
      code: 'NODE_ROOT_NOT_FOUND',
    })
    expect(await runtime.storage.call('devices')).toHaveLength(1)
    await writeFile(join(workspace, 'file.txt'), 'content on B')
    expect(
      await runtime.nodeLink.call(live.node.id, 'fs.readBytes', {
        rootId: 'engine',
        path: 'file.txt',
        authority: { sessionId: 'session', runId: 'run', callId: 'read', sandbox: null, admission: { kind: 'allow' } },
      }),
    ).toMatchObject({ data: Buffer.from('content on B').toString('base64') })
    const local = (await runtime.storage.call('workspaces'))[0]
    if (!local) throw new Error('Missing local fixture workspace')
    const readonly = await host.auth.createDevice('observer', { role: 'observer', workspaceIds: [local.id] })
    observer = new HbarClient(url, readonly.token)
    await observer.connect()
    const readCommands = createNodeCommandClient(observer)
    for (const work of [
      readCommands.execute('node.invite', { name: 'forbidden' }),
      readCommands.execute('node.list', {}),
      readCommands.execute('node.revoke', { selector: live.node.id }),
    ])
      expect(await failure(work)).toMatchObject({ code: 'FORBIDDEN' })
    expect((await commands.execute('node.list', {})).items).toHaveLength(1)
    for (const request of [
      new Request(url + '/node', { headers: { origin: url } }),
      new Request(url + '/node?token=' + credentials.token),
      new Request(url + '/node', { headers: { authorization: 'Bearer ' + credentials.token } }),
      new Request(url + '/node', { headers: { cookie: 'hbar_device=' + credentials.token } }),
    ])
      expect((await fetch(request)).status).toBe(403)
    const revoked = await commands.execute('node.revoke', { selector: 'build-box' })
    expect(revoked.revokedAt).not.toBeNull()
    await until(async () => live.link.connection.phase === 'blocked')
    expect(live.link.connection.reasonCode).toBe('NODE_REVOKED')
    expect((await commands.execute('node.list', {})).items[0]?.online).toBe(false)
  } finally {
    operator?.disconnect()
    observer?.disconnect()
    await node?.close()
    await host?.close()
    await runtime.close()
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)

test('node upgrades require dedicated machine authentication and encryption for non-loopback peers', () => {
  const request = new Request('http://example.test/node')
  expect(nodeRequestAllowed(request, '127.0.0.1', false)).toBe(true)
  expect(nodeRequestAllowed(request, '::1', false)).toBe(true)
  expect(nodeRequestAllowed(request, '10.0.0.2', false)).toBe(false)
  expect(nodeRequestAllowed(request, '10.0.0.2', true)).toBe(true)
  expect(nodeRequestAllowed(new Request('http://example.test/node', { method: 'POST' }), '127.0.0.1', true)).toBe(false)
  const invocation = (commandId: string) => ({
    protocol: 1,
    requestId: 'request',
    commandId,
    commandVersion: 1,
    input: {},
  })
  for (const commandId of ['node.invite', 'node.list', 'node.revoke', 'workspace.create'])
    expect(isStableRpc('command.execute', invocation(commandId))).toBe(true)
  expect(isStableRpc('node.invite', {})).toBe(false)
})
