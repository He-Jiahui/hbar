import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { NodeWorkspaceInspectionPort } from '@hbar/kernel/node-workspace-inspection'
import type { NodeExecutionTarget } from '@hbar/contracts/node-execution-target'
import { nodeExecutionTargetSchema } from '@hbar/contracts/node-execution-target'
import { nodeCapabilitiesSchema } from '@hbar/contracts/node'
import { parseNodeWorkspaceLocator } from '@hbar/contracts/node-address'
import { createNodeIdentity, nodeIdFromPublicKey } from '@hbar/node-core'
import { SANDBOX_EVALUATOR_FINGERPRINT } from '@hbar/sandbox'
import type { ExecOptions, ExecutionProvider } from '@hbar/plugin-sdk'
import { z } from 'zod'

test('Kernel rejects a disabled remote process before approval, intent, or execution', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-kernel-node-admission-'))
  const identity = createNodeIdentity()
  const nodeId = nodeIdFromPublicKey(identity.publicKey)
  let target: NodeExecutionTarget = {
    kind: 'node',
    nodeId,
    nodeName: 'Builder',
    rootId: 'engine',
    nodePath: '/srv/engine',
    rootAccess: 'write',
    capabilitySummary: {
      backends: ['bwrap'],
      selectedBackend: 'bwrap',
      filesystem: 'enforced',
      network: 'enforced',
      floor: { process: false, network: false, terminal: false, osConfinement: 'required', backend: 'auto' },
      observedAt: Date.now(),
    },
  }
  let targetCaptures = 0
  const inspection: NodeWorkspaceInspectionPort = {
    captureExecutionTarget: async () => {
      targetCaptures++
      return target
    },
    resolveWorkspaceMountManifest: async (_request, folders, primary) => {
      const unsigned = {
        schemaVersion: 1 as const,
        workspaceId: folders.workspaceId,
        revision: folders.revision,
        nodeId: primary.nodeId,
        primaryRootId: primary.rootId,
        roots: folders.folders.map((folder) => {
          const locator = parseNodeWorkspaceLocator(folder.path)
          if (!locator) throw new Error('The test mount is not a node workspace locator')
          return { rootId: locator.rootId, expectedRoot: '/srv/engine', alias: folder.alias }
        }),
      }
      return { ...unsigned, digest: createHash('sha256').update(JSON.stringify(unsigned)).digest('hex') }
    },
    verifyWorkspaceFolders: async (_nodeId, folders) => folders,
  }
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
    nodeWorkspaceInspection: inspection,
  })
  const executed: Array<{ readonly command: string; readonly options: ExecOptions | undefined }> = []
  const emitted: string[] = []
  const approvals: NodeExecutionTarget[] = []
  const asyncErrors: unknown[] = []
  let approvalResolution: Promise<void> | undefined
  const unsubscribe = kernel.subscribe((event) => {
    if (event.method !== 'session.event') return
    emitted.push(event.params.type)
    if (event.params.type !== 'approval.requested') return
    const approval = z.object({ id: z.string() }).parse(event.params.data)
    approvalResolution = (async () => {
      const approvalDetails = z
        .object({ executionTarget: nodeExecutionTargetSchema.optional() })
        .parse(event.params.data)
      if (approvalDetails.executionTarget) approvals.push(approvalDetails.executionTarget)
      await kernel.resolveApproval(approval.id, 'allowed')
    })().catch((error: unknown) => {
      asyncErrors.push(error)
    })
  })
  try {
    const workspaceCapabilities = (process: boolean, access: 'read' | 'write', backend: 'none' | 'bwrap' = 'bwrap') =>
      nodeCapabilitiesSchema.parse({
        protocol: 1,
        nodeId,
        platform: 'linux',
        evaluator: SANDBOX_EVALUATOR_FINGERPRINT,
        roots: [{ rootId: 'engine', name: 'Engine', nodePath: '/srv/engine', access }],
        sandbox: {
          backends: [backend],
          filesystem: backend === 'none' ? 'none' : 'enforced',
          network: backend === 'none' ? 'none' : 'enforced',
        },
        floor: { process, network: false, terminal: false, osConfinement: 'required' },
      })
    await kernel.storage.call('nodeRegister', {
      nodeId,
      publicKey: identity.publicKey,
      name: 'Builder',
      createdAt: Date.now(),
    })
    await kernel.storage.call('nodeTouch', nodeId, Date.now(), workspaceCapabilities(false, 'write'))
    const workspace = await kernel.createNodeWorkspace({ nodeId, rootId: 'engine' })
    const session = await kernel.createSession(workspace.id)
    const execution = kernel.plugins.get<ExecutionProvider>('execution')
    execution.exec = async (_workspace, command, _signal, options) => {
      executed.push({ command, options })
      return { text: 'read result' }
    }
    const deniedRun = await kernel.submit(
      session.id,
      'floor-process-denied',
      { text: '/tool shell {"command":"echo denied"}', images: [], approval: 'ask' },
      'local-fixture',
    )
    await kernel.waitForIdle()
    const deniedEvents = (await kernel.storage.call('events', session.id, 0)).filter(
      (event) => event.runId === deniedRun.id,
    )
    expect(deniedEvents.some((event) => event.type === 'approval.requested')).toBe(false)
    expect(deniedEvents.some((event) => event.type === 'tool.started')).toBe(false)
    expect(executed).toHaveLength(0)
    expect(emitted).not.toContain('approval.requested')

    const gitCommitRun = await kernel.submit(
      session.id,
      'floor-process-denied-git',
      { text: '/tool git_commit {"message":"must not commit"}', images: [], approval: 'ask' },
      'local-fixture',
    )
    await kernel.waitForIdle()
    const gitCommitEvents = (await kernel.storage.call('events', session.id, 0)).filter(
      (event) => event.runId === gitCommitRun.id,
    )
    expect(gitCommitEvents.some((event) => event.type === 'approval.requested')).toBe(false)
    expect(gitCommitEvents.some((event) => event.type === 'tool.started')).toBe(false)

    target = {
      ...target,
      capabilitySummary: {
        ...target.capabilitySummary,
        backends: ['none'],
        selectedBackend: 'none',
        filesystem: 'none',
        network: 'none',
        floor: { ...target.capabilitySummary.floor, process: true },
      },
    }
    await kernel.storage.call('nodeTouch', nodeId, Date.now(), workspaceCapabilities(true, 'write', 'none'))
    const gitStatusRun = await kernel.submit(
      session.id,
      'unsupported-git-backend',
      { text: '/tool git_status {}', images: [], approval: 'ask' },
      'local-fixture',
    )
    await kernel.waitForIdle()
    const gitStatusEvents = (await kernel.storage.call('events', session.id, 0)).filter(
      (event) => event.runId === gitStatusRun.id,
    )
    expect(gitStatusEvents.some((event) => event.type === 'approval.requested')).toBe(false)
    expect(gitStatusEvents.some((event) => event.type === 'tool.started')).toBe(false)

    target = {
      ...target,
      capabilitySummary: {
        ...target.capabilitySummary,
        backends: ['bwrap'],
        selectedBackend: 'bwrap',
        filesystem: 'enforced',
        network: 'enforced',
        floor: { ...target.capabilitySummary.floor, process: true },
      },
      rootAccess: 'read',
    }
    const readOnlyTarget = target
    await kernel.storage.call('nodeTouch', nodeId, Date.now(), workspaceCapabilities(true, 'read'))
    const allowedRun = await kernel.submit(
      session.id,
      'readonly-process-approved',
      { text: '/tool shell {"command":"echo read-only"}', images: [], approval: 'ask' },
      'local-fixture',
    )
    await kernel.waitForIdle()
    if (approvalResolution) await approvalResolution
    const allowedEvents = await kernel.storage.call('events', session.id, 0)
    const approvalEvent = allowedEvents.find(
      (event) => event.runId === allowedRun.id && event.type === 'approval.requested',
    )
    expect(approvalEvent?.data).toMatchObject({ executionTarget: readOnlyTarget })
    expect(approvals).toEqual([readOnlyTarget])
    expect(executed).toMatchObject([
      { command: 'echo read-only', options: { nodeAuthority: { admission: { kind: 'approved' } } } },
    ])
    expect(asyncErrors).toEqual([])

    const writeRun = await kernel.submit(
      session.id,
      'readonly-file-write-denied',
      { text: '/tool write_file {"path":"blocked.txt","text":"blocked"}', images: [], approval: 'ask' },
      'local-fixture',
    )
    await kernel.waitForIdle()
    const writeEvents = (await kernel.storage.call('events', session.id, 0)).filter(
      (event) => event.runId === writeRun.id,
    )
    expect(writeEvents.some((event) => event.type === 'approval.requested')).toBe(false)
    expect(writeEvents.some((event) => event.type === 'tool.started')).toBe(false)
    expect(targetCaptures).toBe(5)

    target = {
      ...target,
      capabilitySummary: {
        ...target.capabilitySummary,
        floor: { ...target.capabilitySummary.floor, process: false },
      },
    }
    const removeComputerProbe = kernel.tools.register({
      name: 'computer_probe',
      description: 'A process action owned by the conversation node.',
      inputSchema: z.strictObject({}),
      effect: 'process',
      workspaceAccess: { kind: 'none' },
      execute: async () => {
        executed.push({ command: 'conversation-owned-action', options: undefined })
        return { text: 'completed on conversation node' }
      },
    })
    try {
      const computerRun = await kernel.submit(
        session.id,
        'conversation-process-allowed',
        { text: '/tool computer_probe {}', images: [], approval: 'ask' },
        'local-fixture',
      )
      await kernel.waitForIdle()
      if (approvalResolution) await approvalResolution
      expect((await kernel.storage.call('run', computerRun.id)).status).toBe('completed')
      expect(targetCaptures).toBe(5)
      expect(executed.at(-1)?.command).toBe('conversation-owned-action')
      expect(approvals).toEqual([readOnlyTarget])
    } finally {
      await removeComputerProbe()
    }
  } finally {
    unsubscribe()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})
