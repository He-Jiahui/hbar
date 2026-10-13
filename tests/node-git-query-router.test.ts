import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarError } from '@hbar/contracts'
import { nodeWorkspaceLocator } from '@hbar/contracts/node-address'
import { nodeGitQueryMethods, type NodeGitQueryMethod } from '@hbar/contracts/node-git-query'
import { nodeLocalConfirmationManualQueryLookupSchema } from '@hbar/contracts/node-confirmations'
import type { GitService } from '@hbar/plugin-sdk'
import { GitRuntime, gitConfigSchema } from '../plugins/git/src/index'
import type { NodeGitQueryRouterOptions } from '../packages/node-link/src/git-query-router'
import { NodeGitQueryRouter } from '../packages/node-link/src/git-query-router'
import type { z } from 'zod'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

async function createBaseGit(): Promise<GitService> {
  const root = await mkdtemp(join(tmpdir(), 'hbar-query-router-'))
  roots.push(root)
  return new GitRuntime(root, gitConfigSchema.parse({}))
}

function scope(operationId: string) {
  return {
    workspace: {
      path: nodeWorkspaceLocator('node-query', 'repo'),
      location: { kind: 'node' as const, nodeId: 'node-query', rootId: 'repo', nodePath: 'C:\\shared\\repo' },
    },
    deviceId: 'device-authenticated-by-host',
    workspaceId: 'workspace-captured-by-host',
    sessionId: null,
    operationId,
    platform: 'win32' as const,
    signal: new AbortController().signal,
  }
}

describe('NodeGitQueryRouter', () => {
  it('uses the captured manual identity and retries the exact read request after B approval', async () => {
    const payloads: unknown[] = []
    const statuses: string[] = []
    let live = scope('host-query:stable-operation')
    const launchSnapshot = {
      repository: {
        kind: 'repository' as const,
        workspaceScope: 'repository-root' as const,
        head: { kind: 'unborn' as const, ref: 'refs/heads/main', name: 'main' },
      },
      branches: [],
      incomplete: false,
    }
    const options: NodeGitQueryRouterOptions = {
      base: await createBaseGit(),
      current: () => live,
      node: {
        async call<Method extends NodeGitQueryMethod>(
          nodeId: string,
          method: Method,
          input: z.input<(typeof nodeGitQueryMethods)[Method]['input']>,
        ): Promise<z.output<(typeof nodeGitQueryMethods)[Method]['output']>> {
          expect(nodeId).toBe('node-query')
          if (method !== 'git.query.launchBranchSnapshot') throw new Error(`Unexpected Git query method: ${method}`)
          payloads.push(input)
          if (payloads.length === 1) throw new HbarError('NODE_LOCAL_CONFIRMATION_PENDING', 'waiting for B operator')
          // The method check and its concrete output schema bind this generic adapter response.
          return nodeGitQueryMethods['git.query.launchBranchSnapshot'].output.parse(launchSnapshot) as z.output<
            (typeof nodeGitQueryMethods)[Method]['output']
          >
        },
      },
      confirmation: {
        async status(_nodeId, input) {
          statuses.push(nodeLocalConfirmationManualQueryLookupSchema.parse(input).kind)
          live = scope('mutated-operation-must-not-rebind')
          return statuses.length === 1 ? 'waiting' : 'approved'
        },
        async cancel() {
          return { state: 'absent' }
        },
      },
    }
    const router = new NodeGitQueryRouter(options)
    try {
      const result = await router.launchBranchSnapshot(scope('ignored').workspace.path)
      expect(result).toEqual(launchSnapshot)
      expect(payloads).toHaveLength(2)
      expect(payloads[1]).toBe(payloads[0])
      const request = nodeGitQueryMethods['git.query.launchBranchSnapshot'].input.parse(payloads[0])
      expect(request.authority.kind).toBe('manual-query')
      expect(request).toMatchObject({
        authority: {
          operationId: 'host-query:stable-operation',
          deviceId: 'device-authenticated-by-host',
          workspaceId: 'workspace-captured-by-host',
          sessionId: null,
          nodeId: 'node-query',
          rootId: 'repo',
          expectedRoot: 'C:\\shared\\repo',
        },
        cwd: '.',
      })
      expect(statuses).toEqual(['manual-query', 'manual-query'])
    } finally {
      router.dispose()
    }
  })

  it('uses the local provider for local paths and never gives query authority to branch mutations', async () => {
    const base = await createBaseGit()
    let queryCalls = 0
    const options: NodeGitQueryRouterOptions = {
      base,
      current: () => undefined,
      node: {
        async call() {
          queryCalls += 1
          throw new Error('unexpected remote query')
        },
      } as NodeGitQueryRouterOptions['node'],
      confirmation: {
        async status() {
          return 'absent'
        },
        async cancel() {
          return { state: 'absent' }
        },
      },
    }
    const router = new NodeGitQueryRouter(options)
    try {
      expect(
        await router
          .branch(join(tmpdir(), 'local-repository'), { operation: 'create', name: 'feature' })
          .catch(() => null),
      ).toBeNull()
      expect(queryCalls).toBe(0)
    } finally {
      router.dispose()
    }
  })

  it('cancels the exact pending manual query on caller abort', async () => {
    let lookup: unknown
    let cancelled: unknown
    const controller = new AbortController()
    const options: NodeGitQueryRouterOptions = {
      base: await createBaseGit(),
      current: () => ({ ...scope('host-query:abort'), signal: controller.signal }),
      node: {
        async call() {
          throw new HbarError('NODE_LOCAL_CONFIRMATION_PENDING', 'waiting for B operator')
        },
      } as NodeGitQueryRouterOptions['node'],
      confirmation: {
        async status(_nodeId, input) {
          lookup = input
          return 'waiting'
        },
        async cancel(_nodeId, input) {
          cancelled = input
          return { state: 'cancelled' }
        },
      },
    }
    const router = new NodeGitQueryRouter(options)
    try {
      const pending = router.launchBranchSnapshot(scope('unused').workspace.path)
      setTimeout(() => controller.abort(new HbarError('CANCELLED', 'UI query closed')), 10)
      const error = await pending.catch((value: unknown) => value)
      expect(error).toMatchObject({ code: 'CANCELLED' })
      expect(cancelled).toEqual(lookup)
      expect(cancelled).toMatchObject({
        kind: 'manual-query',
        operationId: 'host-query:abort',
        method: 'git.query.launchBranchSnapshot',
      })
    } finally {
      router.dispose()
    }
  })
})
