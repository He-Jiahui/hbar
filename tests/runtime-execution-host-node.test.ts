import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nodeFloorSchema } from '@hbar/contracts/node'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { runNode } from '@hbar/node'
import { NodeStateStorage } from '@hbar/storage/node-state'
import { createPathLayout } from '@hbar/storage'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { startServer } from '../apps/host/src/server'

async function until(check: () => boolean | Promise<boolean>, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('The real Host and workspace node did not converge')
    await Bun.sleep(20)
  }
}

test('the owned Host Kernel routes fake-model workspace reads and writes to B without touching A files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-managed-host-node-execution-'))
  const hostWorkspace = join(root, 'a-workspace')
  const nodeWorkspace = join(root, 'b-workspace')
  const nodeHome = join(root, 'node-home')
  await mkdir(hostWorkspace)
  await mkdir(nodeWorkspace)
  await mkdir(nodeHome)
  await writeFile(join(nodeWorkspace, 'remote-input.txt'), 'content stored on B')
  const nodeState = new NodeStateStorage(join(nodeHome, 'node.sqlite'))
  await nodeState.call('ready', {})
  await nodeState.call(
    'floor.set',
    nodeFloorSchema.parse({ roots: [{ rootId: 'engine', name: 'Engine', path: nodeWorkspace, access: 'write' }] }),
  )
  await nodeState.close()

  const layout = createPathLayout(join(root, 'a-data'), join(root, 'a-cache'), join(root, 'pointer.json'))
  const runtime = await ProcessHostRuntime.create({
    layout,
    sourceRoot: process.cwd(),
    workspace: hostWorkspace,
    demo: true,
    noLocalExec: true,
    secrets: new MemorySecrets(),
  })
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let node: Awaited<ReturnType<typeof runNode>> | undefined
  try {
    host = await startServer(runtime.kernel, {
      port: 0,
      runtime,
      controller: runtime.controller,
      nodeLink: runtime.nodeLink,
    })
    const url = `http://127.0.0.1:${host.server.port}`
    const invitation = await runtime.nodeLink.invite('execution-builder')
    node = await runNode(
      ['--home', nodeHome, '--join', url, '--code', invitation.code, '--fingerprint', invitation.fingerprint],
      { registerSignals: false },
    )
    const liveNode = node
    await until(async () =>
      (await runtime.nodeLink.list({ limit: 10 })).items.some(
        (item) => item.nodeId === liveNode.node.id && item.online,
      ),
    )

    const workspace = await runtime.kernel.createNodeWorkspace({ nodeId: liveNode.node.id, rootId: 'engine' })
    expect(runtime.kernel.options.noLocalExec).toBe(true)
    const localWorkspace = (await runtime.storage.call('workspaces')).find((item) => item.path === hostWorkspace)
    if (!localWorkspace) throw new Error('The conversation-only Host fixture has no registered local placeholder')
    const localSession = await runtime.storage.call('createSession', localWorkspace.id)
    const conversation = await runtime.kernel.submit(
      localSession.id,
      'conversation-without-local-execution',
      { text: 'Model-only conversation', images: [] },
      'local-fixture',
    )
    await runtime.waitForIdle()
    expect((await runtime.storage.call('run', conversation.id)).status).toBe('completed')
    const forbidden = await runtime.kernel.submit(
      localSession.id,
      'local-write-disabled',
      { text: '/tool write_file {"path":"remote-output.txt","text":"must be refused"}', images: [], approval: 'allow' },
      'local-fixture',
    )
    await runtime.waitForIdle()
    const refused = (await runtime.storage.call('snapshot', localSession.id)).messages
      .filter((message) => message.runId === forbidden.id)
      .flatMap((message) => message.content)
      .find((block) => block.type === 'tool_result' && block.name === 'write_file')
    expect(refused).toMatchObject({ type: 'tool_result', isError: true })
    if (!refused || refused.type !== 'tool_result') throw new Error('The refused managed local tool has no result')
    expect(refused.text).toContain('Local workspace execution is disabled')
    expect(await Bun.file(join(hostWorkspace, 'remote-output.txt')).exists()).toBe(false)
    const session = await runtime.storage.call('createSession', workspace.id)
    await runtime.kernel.setPermissionMode('allow')

    const readRun = await runtime.kernel.submit(
      session.id,
      'remote-read',
      { text: '/tool read_file {"path":"remote-input.txt"}', images: [] },
      'local-fixture',
    )
    await runtime.waitForIdle()
    expect(await runtime.storage.call('run', readRun.id)).toMatchObject({ status: 'completed' })

    const writeRun = await runtime.kernel.submit(
      session.id,
      'remote-write',
      { text: '/tool write_file {"path":"remote-output.txt","text":"written on B"}', images: [], approval: 'allow' },
      'local-fixture',
    )
    await runtime.waitForIdle()
    expect(await runtime.storage.call('run', writeRun.id)).toMatchObject({ status: 'completed' })

    const events = await runtime.storage.call('events', session.id, 0, 2_000)
    const readMessages = events.filter((event) => event.runId === readRun.id && event.type === 'message.committed')
    const writeMessages = events.filter((event) => event.runId === writeRun.id && event.type === 'message.committed')
    expect(JSON.stringify(readMessages)).toContain('content stored on B')
    expect(JSON.stringify(readMessages)).not.toContain('Tool failed')
    expect(JSON.stringify(writeMessages)).not.toContain('Tool failed')
    expect(await readFile(join(nodeWorkspace, 'remote-output.txt'), 'utf8')).toBe('written on B')
    await expect(readFile(join(hostWorkspace, 'remote-output.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  } finally {
    await node?.close()
    await host?.close()
    await runtime.close()
    await rm(root, { recursive: true, force: true })
  }
}, 120_000)
