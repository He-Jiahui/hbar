import { expect, test } from 'bun:test'
import type { z } from 'zod'
import { ExecutionRouter, type NodeExecutionPort, type NodeExecutionScope } from '@hbar/node-link'
import { HbarError } from '@hbar/contracts'
import {
  nodeWorkspaceMethods,
  nodeWorkspaceLocator,
  nodeFloorSummarySchema,
  type NodeWorkspaceMethod,
} from '@hbar/contracts/node'
import type { ExecutionProvider } from '@hbar/plugin-sdk'
import { SANDBOX_EVALUATOR_FINGERPRINT } from '@hbar/sandbox'
test('query captures original public current authority synchronously before returning its Promise', async () => {
  const workspace = {
    path: nodeWorkspaceLocator('node', 'engine'),
    location: { kind: 'node' as const, nodeId: 'node', rootId: 'engine', nodePath: '/remote' },
  }
  let scope: NodeExecutionScope = {
    workspace,
    authority: { sessionId: 'session', runId: 'runA', callId: 'callA', sandbox: null, admission: { kind: 'allow' } },
    signal: new AbortController().signal,
  }
  const seen: string[] = []
  class Port implements NodeExecutionPort {
    call<Method extends NodeWorkspaceMethod>(
      nodeId: string,
      method: Method,
      input: z.input<(typeof nodeWorkspaceMethods)[Method]['input']>,
    ): Promise<z.output<(typeof nodeWorkspaceMethods)[Method]['output']>>
    async call(_nodeId: string, method: NodeWorkspaceMethod, input: unknown): Promise<unknown> {
      const value: unknown =
        method === 'node.capabilities'
          ? {
              protocol: 1,
              nodeId: 'node',
              platform: 'linux',
              evaluator: SANDBOX_EVALUATOR_FINGERPRINT,
              roots: [{ rootId: 'engine', name: 'Engine', access: 'write', nodePath: '/remote' }],
              sandbox: { backends: [], filesystem: 'none', network: 'none' },
              floor: nodeFloorSummarySchema.parse({}),
            }
          : undefined
      if (method === 'query.invalidate')
        seen.push(nodeWorkspaceMethods['query.invalidate'].input.parse(input).authority.callId)
      if (method !== 'node.capabilities') throw new HbarError('FILE_NOT_FOUND', 'Known scoped fixture result')
      // Generic selection stays at the same public schema-validated transport boundary as production adapters.
      return nodeWorkspaceMethods[method].output.parse(value)
    }
  }
  const node = new Port()
  const unused = (): Promise<never> => Promise.reject(new Error('Unexpected local call'))
  const local: ExecutionProvider = { list: unused, read: unused, readBytes: unused, write: unused, exec: unused }
  const router = new ExecutionRouter({ local, node, current: () => scope, loadSnapshot: unused })
  const operation = router.workspaceQuery.invalidate(workspace.path, 'x').catch((error: unknown) => {
    expect(error).toMatchObject({ code: 'FILE_NOT_FOUND' })
  })
  scope = {
    ...scope,
    authority: { sessionId: 'session', runId: 'runB', callId: 'callB', sandbox: null, admission: { kind: 'allow' } },
  }
  try {
    await operation
    expect(seen).toEqual(['callA'])
    expect(router.idleRequests()).toBe(0)
  } finally {
    await router.dispose()
  }
})
