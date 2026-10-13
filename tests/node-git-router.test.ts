import { afterEach, expect, it } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  nodeWorkspaceLocator,
  nodeWorkspaceMethods,
  type NodeCallAuthority,
  type NodeWorkspaceMethod,
} from '@hbar/contracts/node'
import { nodeGitMethods, type NodeGitMethod } from '@hbar/contracts/node-git'
import { SANDBOX_EVALUATOR_FINGERPRINT } from '@hbar/sandbox'
import type { z } from 'zod'
import { GitRuntime, gitConfigSchema } from '../plugins/git/src/index'
import type { NodeGitPort, NodeGitRouterOptions } from '../packages/node-link/src/git-router'
import { NodeGitRouter } from '../packages/node-link/src/git-router'
import type { NodeExecutionPort, NodeExecutionScope } from '../packages/node-link/src/execution-port'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function createRepository() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-node-git-router-'))
  roots.push(root)
  const child = Bun.spawn(['git', 'init', '--initial-branch=main'], {
    cwd: root,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (code !== 0) throw new Error(stderr || stdout || `git exited with ${code}`)
  await writeFile(join(root, 'tracked.txt'), 'local repository\n')
  return root
}

it('keeps the captured node binding and authority when the live scope changes during admission', async () => {
  const localRoot = await createRepository()
  const originalAuthority: NodeCallAuthority = {
    sessionId: 'session-before',
    runId: 'run-before',
    callId: 'call-before',
    sandbox: null,
    admission: { kind: 'allow' },
  }
  const originalWorkspace: NodeExecutionScope['workspace'] = {
    path: nodeWorkspaceLocator('node-before', 'root-before'),
    location: {
      kind: 'node',
      nodeId: 'node-before',
      rootId: 'root-before',
      nodePath: 'C:\\remote\\before',
    },
  }
  const replacementAuthority: NodeCallAuthority = {
    ...originalAuthority,
    sessionId: 'session-after',
    runId: 'run-after',
    callId: 'call-after',
  }
  let workspace = originalWorkspace
  let authority: NodeCallAuthority = originalAuthority
  const scope: NodeExecutionScope = {
    get workspace() {
      return workspace
    },
    get authority() {
      return authority
    },
    signal: new AbortController().signal,
  }
  let releaseCapabilities: (() => void) | undefined
  let markCapabilitiesStarted: (() => void) | undefined
  const capabilityGate = new Promise<void>((resolve) => {
    releaseCapabilities = resolve
  })
  const capabilityStarted = new Promise<void>((resolve) => {
    markCapabilitiesStarted = resolve
  })
  const capabilities = {
    protocol: 1 as const,
    nodeId: 'node-before',
    platform: 'win32' as const,
    evaluator: SANDBOX_EVALUATOR_FINGERPRINT,
    roots: [{ rootId: 'root-before', name: 'remote', access: 'write' as const, nodePath: 'C:\\remote\\before' }],
    sandbox: { backends: ['windows-restricted' as const], filesystem: 'enforced' as const, network: 'none' as const },
    floor: {
      process: true,
      network: false,
      terminal: false,
      osConfinement: 'required' as const,
      backend: 'windows-restricted' as const,
      maxConcurrentProcesses: 2,
      maxTimeoutMs: 60_000,
      localConfirm: 'none' as const,
    },
  }
  const node: NodeExecutionPort = {
    async call<Method extends NodeWorkspaceMethod>(
      _nodeId: string,
      method: Method,
      _input: z.input<(typeof nodeWorkspaceMethods)[Method]['input']>,
    ): Promise<z.output<(typeof nodeWorkspaceMethods)[Method]['output']>> {
      if (method === 'node.capabilities') {
        markCapabilitiesStarted?.()
        await capabilityGate
        return nodeWorkspaceMethods[method].output.parse(capabilities) as z.output<
          (typeof nodeWorkspaceMethods)[Method]['output']
        >
      }
      throw new Error(`Unexpected workspace-node method: ${method}`)
    },
  }
  let gitRequest: { nodeId: string; method: NodeGitMethod; input: unknown } | undefined
  const git: NodeGitPort = {
    async call<Method extends NodeGitMethod>(
      nodeId: string,
      method: Method,
      input: z.input<(typeof nodeGitMethods)[Method]['input']>,
    ): Promise<z.output<(typeof nodeGitMethods)[Method]['output']>> {
      gitRequest = { nodeId, method, input: nodeGitMethods[method].input.parse(input) }
      const commitInfo = {
        sha: 'b'.repeat(40),
        shortSha: 'b'.repeat(7),
        author: 'test',
        authoredAt: '2026-10-12T00:00:00Z',
        committedAt: '2026-10-12T00:00:00Z',
        subject: 'captured commit',
        provenance: {
          source: 'manual' as const,
          recordedAt: 1,
          sessionId: 'session-before',
          runId: 'run-before',
          operationId: 'call-before',
        },
      }
      return nodeGitMethods[method].output.parse(commitInfo) as z.output<(typeof nodeGitMethods)[Method]['output']>
    },
  }
  const options: NodeGitRouterOptions = {
    local: new GitRuntime(localRoot, gitConfigSchema.parse({})),
    node,
    git,
    confirmation: {
      status: async () => 'absent',
      cancel: async () => ({ state: 'absent' }),
    },
    current: () => scope,
    loadSnapshot: async () => {
      throw new Error('No snapshot expected')
    },
  }
  const router = new NodeGitRouter(options)
  const result = router.commit(originalWorkspace.path, {
    message: 'captured commit',
    provenance: {
      source: 'manual',
      sessionId: originalAuthority.sessionId,
      runId: originalAuthority.runId,
      operationId: originalAuthority.callId,
    },
  })

  await capabilityStarted
  workspace = {
    path: nodeWorkspaceLocator('node-after', 'root-after'),
    location: {
      kind: 'node',
      nodeId: 'node-after',
      rootId: 'root-after',
      nodePath: 'C:\\remote\\after',
    },
  }
  authority = replacementAuthority
  releaseCapabilities?.()
  const commit = await result
  expect(commit).toMatchObject({ subject: 'captured commit' })
  expect(gitRequest).toMatchObject({
    nodeId: 'node-before',
    method: 'git.commit',
    input: {
      rootId: 'root-before',
      expectedRoot: 'C:\\remote\\before',
      authority: originalAuthority,
      cwd: '.',
      source: 'manual',
    },
  })
})
