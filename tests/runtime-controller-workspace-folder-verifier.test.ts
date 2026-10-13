import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { RUNTIME_APPLICATION_METHODS } from '@hbar/kernel/runtime-application'
import { IpcPeer, RuntimeValuePort } from '@hbar/runtime'
import { createPathLayout } from '@hbar/storage'
import { workspaceFoldersSchema } from '@hbar/contracts/commands/workspace-folders'
import { runtimeControllerScopeSchema } from '../apps/host/src/runtime-controller-contract'
import { RuntimeControllerKernel } from '../apps/host/src/runtime-controller-kernel'

test('workspace verification and sandbox profile lookup use the scoped private Host bridge', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-runtime-controller-bridge-'))
  const calls: Array<{ method: string; args: readonly unknown[]; signal?: AbortSignal }> = []
  const folders = workspaceFoldersSchema.parse([{ id: 'folder-1', alias: 'engine', path: 'hbar-node://node-1/engine' }])
  const hostOwner = { unitId: 'host', generation: 1, incarnation: 'host-bridge-test' }
  const kernelOwner = { unitId: 'kernel', generation: 1, incarnation: 'kernel-bridge-test' }
  let kernelPeer: IpcPeer | undefined
  const hostPeer = new IpcPeer({
    owner: hostOwner,
    remote: kernelOwner,
    transport: { send: (frame) => kernelPeer?.receive(frame) },
  })
  kernelPeer = new IpcPeer({
    owner: kernelOwner,
    remote: hostOwner,
    transport: { send: (frame) => hostPeer.receive(frame) },
  })
  const hostValues = new RuntimeValuePort(hostPeer, { prefix: 'kernel.application' })
  const kernelValues = new RuntimeValuePort(kernelPeer, { prefix: 'kernel.application' })
  kernelValues.register('workspace.verifyFolders', (args, signal) => {
    const [invocationId, nodeId, verifiedFolders] = z
      .tuple([z.string(), z.string(), workspaceFoldersSchema])
      .parse(args)
    calls.push({ method: 'workspace.verifyFolders', args: [invocationId, nodeId, verifiedFolders], signal })
    return verifiedFolders
  })
  kernelValues.register('kernel.sessionSandboxProfileId', (args) => {
    const [invocationId, sessionId] = z.tuple([z.string(), z.string()]).parse(args)
    calls.push({ method: 'kernel.sessionSandboxProfileId', args: [invocationId, sessionId] })
    return 'workspace-write'
  })
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'paths.json'))
  const controller = new RuntimeControllerKernel(hostValues, layout, false, 'controller-test')
  const scope = runtimeControllerScopeSchema.parse({
    invocationId: 'invocation-authorized',
    actorId: 'user-1',
    host: {
      version: 'test',
      protocol: 1,
      instanceId: 'controller-test',
      platform: process.platform,
      addresses: [],
      activeRuns: 0,
      demo: false,
    },
    kernel: {
      instanceId: 'controller-test',
      permission: 'ask',
      recovered: 0,
      driverIsolation: 'managed',
      active: [],
      tools: [],
      plugins: [],
      protectedRoots: [],
      idle: true,
      userInputs: [],
      protection: [],
      modes: [],
    },
    streams: [],
  })
  const abort = new AbortController()

  try {
    const result = await controller.pin(scope, () =>
      controller.api.options.nodeWorkspaceInspection?.verifyWorkspaceFolders?.('node-1', folders, abort.signal),
    )
    expect(result).toEqual(folders)
    expect(await controller.pin(scope, () => controller.api.sessionSandboxProfileId('session-1'))).toBe(
      'workspace-write',
    )
    expect(calls).toHaveLength(2)
    expect(calls[0]).toMatchObject({
      method: 'workspace.verifyFolders',
      args: ['invocation-authorized', 'node-1', folders],
    })
    expect(calls[0]?.signal).toBeInstanceOf(AbortSignal)
    expect(calls[1]).toEqual({
      method: 'kernel.sessionSandboxProfileId',
      args: ['invocation-authorized', 'session-1'],
    })
    expect(Object.values(RUNTIME_APPLICATION_METHODS).flat()).not.toContain('workspace.verifyFolders')
  } finally {
    hostValues.dispose()
    kernelValues.dispose()
    hostPeer.close()
    kernelPeer.close()
    await rm(root, { recursive: true, force: true })
  }
})
