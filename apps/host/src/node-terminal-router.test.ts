import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { z } from 'zod'
import {
  nodeCapabilitiesSchema,
  nodeFloorSchema,
  nodeFloorSummarySchema,
  nodeWorkspaceMethods,
  type NodeWorkspaceMethod,
} from '@hbar/contracts/node'
import { nodeTerminalMethods, type NodeTerminalOpen } from '@hbar/contracts/node-terminal'
import { resolvedSandboxProfileSchema } from '@hbar/contracts/sandbox'
import type { Device, Session, TerminalInfo } from '@hbar/contracts'
import { sandboxSnapshotContent } from '@hbar/sandbox'
import type { RuntimeNodeLinkPort } from './runtime-node-link-contract'
import { NodeTerminalRouter, type NodeTerminalRouterOptions } from './node-terminal-router'
import type { Workspace } from '@hbar/contracts/directory'

const temporary: string[] = []
afterEach(async () => Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))))

describe('NodeTerminalRouter A/B scope integration', () => {
  test('requires operator, exact session/root and owner-bound snapshot before opening B PTY', async () => {
    const base = await mkdtemp(join(tmpdir(), 'hbar-terminal-router-'))
    temporary.push(base)
    const workspacePath = join(base, 'workspace')
    await mkdir(join(workspacePath, '.git', 'hooks'), { recursive: true })
    await mkdir(join(workspacePath, '.hbar-worktrees'), { recursive: true })
    const floor = nodeFloorSchema.parse({
      roots: [{ rootId: 'engine', name: 'Engine', path: workspacePath, access: 'write' }],
      terminal: true,
      process: true,
      maxTimeoutMs: 10_000,
    })
    const {
      roots: _roots,
      protectedPaths: _protectedPaths,
      environmentAllowlist: _environmentAllowlist,
      ...floorSummary
    } = floor
    let spawned = 0
    let openedRequest: NodeTerminalOpen | undefined
    let frameSequence = 0
    const frames: Array<{ seq: number; data: string }> = []
    const closed = new Set<string>()
    const profile = resolvedSandboxProfileSchema.parse({
      version: 1,
      profileId: ':workspace-write',
      chain: [{ id: ':workspace-write', revision: 0 }],
      escalation: 'ask',
      filesystem: { default: 'write', grants: [] },
      commands: { rules: [] },
      network: { enabled: true },
      tools: { rules: [] },
      environment: { set: {} },
    })
    const content = sandboxSnapshotContent(profile)
    const snapshot = { profile, ref: { profileId: profile.profileId, digest: content.digest } }
    const workspace = {
      id: 'workspace-a',
      path: 'hbar-node://node-a/engine',
      name: 'Engine',
      createdAt: 1,
      location: { kind: 'node', nodeId: 'node-a', rootId: 'engine', nodePath: workspacePath },
    } satisfies Workspace
    const session = { id: 'session-a', workspaceId: workspace.id } as Session
    const capabilities = nodeCapabilitiesSchema.parse({
      protocol: 1,
      nodeId: 'node-a',
      platform: 'linux',
      evaluator: 'a'.repeat(64),
      roots: [{ rootId: 'engine', name: 'Engine', nodePath: workspacePath, access: 'write' }],
      sandbox: { backends: ['bwrap'], filesystem: 'enforced', network: 'enforced' },
      floor: nodeFloorSummarySchema.parse(floorSummary),
    })
    const node: Pick<RuntimeNodeLinkPort, 'call'> = {
      async call<Method extends NodeWorkspaceMethod>(
        _nodeId: string,
        method: Method,
        input: z.input<(typeof nodeWorkspaceMethods)[Method]['input']>,
        signal?: AbortSignal,
      ) {
        signal?.throwIfAborted()
        nodeWorkspaceMethods[method].input.parse(input)
        let result: unknown
        if (method === 'node.capabilities') result = capabilities
        else if (method === 'sandbox.put') {
          const request = nodeWorkspaceMethods['sandbox.put'].input.parse(input)
          if (
            request.ref.profileId !== request.profile.profileId ||
            request.ref.digest !== sandboxSnapshotContent(request.profile).digest
          )
            throw new Error('Sandbox snapshot digest is invalid')
          result = { accepted: true }
        } else if (method === 'terminal.open') {
          openedRequest = nodeTerminalMethods['terminal.open'].input.parse(input)
          spawned++
          result = {
            terminalId: 'remote-terminal-1',
            scope: openedRequest.scope,
            cwd: openedRequest.cwd,
            cols: openedRequest.cols,
            rows: openedRequest.rows,
            startedAt: new Date().toISOString(),
            backend: 'bwrap',
          }
        } else if (method === 'terminal.input' || method === 'terminal.resize') result = { accepted: true }
        else if (method === 'terminal.close') {
          const request = nodeTerminalMethods['terminal.close'].input.parse(input)
          closed.add(request.terminalId)
          result = { closed: true }
        } else if (method === 'terminal.output') {
          const request = nodeTerminalMethods['terminal.output'].input.parse(input)
          const available = frames.filter((frame) => frame.seq > request.afterSeq)
          result = {
            terminalId: request.terminalId,
            afterSeq: request.afterSeq,
            nextSeq: frameSequence,
            reset: false,
            closed: closed.has(request.terminalId),
            frames: available,
          }
        } else throw new Error(`Unexpected node workspace method: ${method}`)
        // The named method schema validates the response before narrowing this generic adapter result.
        return nodeWorkspaceMethods[method].output.parse(result) as z.output<
          (typeof nodeWorkspaceMethods)[Method]['output']
        >
      },
    }
    const local = {
      open(): TerminalInfo {
        throw new Error('local fallback should not be used')
      },
      attach: () => [],
      detach() {},
      list: () => [],
      write() {},
      resize() {},
      close: () => false,
      closeAll() {},
    } satisfies NodeTerminalRouterOptions['local']
    const routerOptions: NodeTerminalRouterOptions = {
      local,
      node,
      getWorkspace: async () => workspace,
      getSession: async (id) => (id === session.id ? session : { ...session, id, workspaceId: 'workspace-b' }),
      loadSandbox: async () => snapshot,
    }
    const router = new NodeTerminalRouter(routerOptions)
    const device: Device = {
      id: 'operator-a',
      name: 'Operator',
      createdAt: 1,
      lastSeenAt: 1,
      role: 'operator',
      workspaceIds: null,
    }
    const observer = { ...device, id: 'observer-a', role: 'observer' as const }
    const foreign = { ...session, id: 'session-b', workspaceId: 'workspace-b' }
    const output: Array<{ data: string; cursor?: { seq: number; reset?: boolean } }> = []
    const callbacks = {
      onOutput: (_id: string, data: string, cursor?: { seq: number; reset?: boolean }) => {
        output.push({ data, ...(cursor ? { cursor } : {}) })
        return new TextEncoder().encode(data).byteLength
      },
      onExit() {},
    }
    await expect(router.open(observer, workspace.id, undefined, session.id, 80, 24, callbacks)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    await expect(router.open(device, workspace.id, undefined, undefined, 80, 24, callbacks)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    })
    await expect(router.open(device, workspace.id, undefined, foreign.id, 80, 24, callbacks)).rejects.toMatchObject({
      code: 'WORKSPACE_SCOPE',
    })
    expect(spawned).toBe(0)

    const invalidSnapshotRouter = new NodeTerminalRouter({
      local,
      node,
      getWorkspace: async () => workspace,
      getSession: async () => session,
      loadSandbox: async () => ({ ...snapshot, ref: { ...snapshot.ref, digest: 'f'.repeat(64) } }),
    })
    await expect(
      invalidSnapshotRouter.open(device, workspace.id, undefined, session.id, 80, 24, callbacks),
    ).rejects.toBeDefined()
    expect(spawned).toBe(0)
    await invalidSnapshotRouter.dispose()

    const info = await router.open(device, workspace.id, 'open-op', session.id, 80, 24, callbacks)
    expect(info.id).toBeTruthy()
    expect(spawned).toBe(1)
    await router.write(device.id, info.id, 'x'.repeat(64_000))
    expect(() => router.write('other-device', info.id, 'whoami\n')).toThrow('Terminal is unavailable for this owner')
    frameSequence++
    frames.push({ seq: frameSequence, data: 'ready\n' })
    await Bun.sleep(100)
    expect(output.some((frame) => frame.data === 'ready\n' && frame.cursor?.seq === 1)).toBe(true)
    expect(openedRequest).toMatchObject({
      operationId: 'open-op',
      scope: { nodeId: 'node-a', rootId: 'engine', sessionId: session.id, ownerDeviceId: device.id },
      sandbox: snapshot.ref,
    })
    await router.dispose()
  })
})
