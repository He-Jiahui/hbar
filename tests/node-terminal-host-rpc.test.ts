import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { HbarClient } from '@hbar/client'
import { nodeFloorSchema } from '@hbar/contracts/node'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { LocalExecution } from '@hbar/local-tools'
import {
  NodeTerminalService,
  WorkspaceNodeProtocol,
  WorkspaceNodeService,
  createNodeIdentity,
  type NodeTerminalBackend,
  type NodeExecutionBackend,
} from '@hbar/node-core'
import { nodeWorkspaceMethods, type NodeWorkspaceMethod } from '@hbar/contracts/node'
import { NodeRegistryService } from '@hbar/node-link'
import { StorageNodeRegistryPort } from '@hbar/storage/node-registry'
import { NodeStateStorage } from '@hbar/storage/node-state'
import type { RuntimeNodeLinkPort } from '../apps/host/src/runtime-node-link-contract'
import { startServer } from '../apps/host/src/server'
import { z } from 'zod'

test('real Host terminal RPC routes through B protocol and rejects observer, cross-device and cross-session access', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'hbar-node-terminal-rpc-'))
  const kernel = await Kernel.create({
    home: join(temp, 'host-data'),
    pointerFile: join(temp, 'system', 'paths.json'),
    demo: true,
    workspace: temp,
    secrets: new MemorySecrets(),
  })
  let client: HbarClient | undefined
  let observer: HbarClient | undefined
  let secondOperator: HbarClient | undefined
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let registry: NodeRegistryService | undefined
  let protocol: WorkspaceNodeProtocol | undefined
  let terminal: NodeTerminalService | undefined
  let openedNode: WorkspaceNodeService | undefined
  let state: NodeStateStorage | undefined
  let execution: LocalExecution | undefined
  try {
    const nodeRoot = join(temp, 'node-workspace')
    const nodeData = join(temp, 'node-data')
    await mkdir(join(nodeRoot, '.git', 'hooks'), { recursive: true })
    await mkdir(join(nodeRoot, '.hbar-worktrees'), { recursive: true })
    await mkdir(join(nodeRoot, '.hbar'), { recursive: true })
    await mkdir(nodeData)
    const floor = nodeFloorSchema.parse({
      roots: [{ rootId: 'engine', name: 'Engine', path: nodeRoot, access: 'write' }],
      terminal: true,
      process: true,
      maxTimeoutMs: 15_000,
    })
    let spawned = 0
    const backend: NodeTerminalBackend = {
      backend: 'bwrap',
      available: true,
      async open(input) {
        spawned++
        return {
          write(data) {
            if (data === 'ping\n') input.onOutput('pong\n')
          },
          resize() {},
          async close() {},
        }
      },
    }
    const identity = createNodeIdentity()
    registry = await NodeRegistryService.open(new StorageNodeRegistryPort(kernel.storage))
    const invitation = await registry.invite('terminal-node')
    const savedNode = await registry.join(identity.publicKey, invitation.code, 'terminal-node')
    state = new NodeStateStorage(join(nodeData, 'node.sqlite'))
    await state.call('ready', {})
    await state.call('floor.set', floor)
    execution = new LocalExecution([nodeData])
    const executionBackend: NodeExecutionBackend = {
      name: 'bwrap',
      filesystem: true,
      network: true,
      processTree: true,
      async exec() {
        throw new Error('unused')
      },
    }
    openedNode = await WorkspaceNodeService.open(savedNode.nodeId, nodeData, state, execution, executionBackend)
    await registry.touch(savedNode.nodeId, openedNode.capabilities())
    terminal = new NodeTerminalService(
      savedNode.nodeId,
      nodeData,
      () => floor,
      backend,
      () => false,
      undefined,
      openedNode,
    )
    protocol = new WorkspaceNodeProtocol(openedNode, terminal)
    const protocolHolder: { value?: WorkspaceNodeProtocol } = { value: protocol }
    const nodeLink: RuntimeNodeLinkPort = {
      async call<Method extends NodeWorkspaceMethod>(
        _nodeId: string,
        method: Method,
        input: z.input<(typeof nodeWorkspaceMethods)[Method]['input']>,
        signal?: AbortSignal,
      ): Promise<z.output<(typeof nodeWorkspaceMethods)[Method]['output']>> {
        const activeProtocol = protocolHolder.value
        if (!activeProtocol) throw new Error('Node protocol is not ready')
        const result = await activeProtocol.invoke(method, input, signal ?? new AbortController().signal)
        // The selected named-method schema validates the protocol result before this generic return narrowing.
        return nodeWorkspaceMethods[method].output.parse(result) as z.output<
          (typeof nodeWorkspaceMethods)[Method]['output']
        >
      },
      async open() {},
      async receive() {},
      closeConnection() {},
      async invite() {
        throw new Error('unused')
      },
      async list() {
        throw new Error('unused')
      },
      async revoke() {
        throw new Error('unused')
      },
    }
    host = await startServer(kernel, { port: 0, nodeLink })
    const url = `http://127.0.0.1:${host.server.port}`
    client = new HbarClient(url)
    await client.pair(host.pairing.code, 'terminal operator')
    const remoteWorkspace = await kernel.storage.call('createNodeWorkspace', {
      nodeId: savedNode.nodeId,
      rootId: 'engine',
    })
    const session = await kernel.storage.call('createSession', remoteWorkspace.id, 'Remote terminal')
    const foreignWorkspace = await kernel.storage.call('createWorkspace', join(temp, 'local'), 'Local workspace')
    const foreignSession = await kernel.storage.call('createSession', foreignWorkspace.id, 'Wrong workspace')

    observer = new HbarClient(url, (await host.auth.createDevice('terminal observer', { role: 'observer' })).token)
    await observer.connect()
    secondOperator = new HbarClient(url, (await host.auth.createDevice('other operator')).token)
    await secondOperator.connect()
    const opensBefore = spawned
    await expect(
      observer.call('terminal.open', { workspaceId: remoteWorkspace.id, sessionId: session.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      client.call('terminal.open', { workspaceId: remoteWorkspace.id, sessionId: foreignSession.id }),
    ).rejects.toMatchObject({ code: 'WORKSPACE_SCOPE' })
    expect(spawned).toBe(opensBefore)

    const info = await client.call('terminal.open', {
      workspaceId: remoteWorkspace.id,
      sessionId: session.id,
      operationId: 'same-open-operation',
    })
    expect(spawned).toBe(1)
    await expect(secondOperator.call('terminal.input', { terminalId: info.id, data: 'ping\n' })).rejects.toMatchObject({
      code: 'NODE_TERMINAL_SCOPE',
    })
    const outputs: string[] = []
    const unsubscribe = client.onEvent((event) => {
      if (event.method === 'terminal.output' && event.params.terminalId === info.id) outputs.push(event.params.data)
    })
    await client.call('terminal.input', { terminalId: info.id, data: 'ping\n' })
    await Bun.sleep(200)
    expect(outputs.join('')).toContain('pong\n')
    unsubscribe()
    await client.call('terminal.close', { terminalId: info.id })
    expect((await client.call('terminal.list', {})).some((entry) => entry.id === info.id)).toBe(false)
  } finally {
    observer?.disconnect()
    secondOperator?.disconnect()
    client?.disconnect()
    await host?.close()
    await protocol?.dispose()
    await terminal?.dispose()
    await openedNode?.dispose()
    await state?.close()
    execution?.dispose()
    registry?.dispose()
    await kernel.close()
    await rm(temp, { recursive: true, force: true })
  }
})
