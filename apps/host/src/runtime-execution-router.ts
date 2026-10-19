import { join } from 'node:path'
import { HbarError } from '@hbar/contracts'
import { nodeRequestTimeoutMs, nodeWorkspaceMethods, type NodeWorkspaceMethod } from '@hbar/contracts/node'
import { parseNodeWorkspaceLocator } from '@hbar/contracts/node-address'
import { LocalExecution, type VerifiedManagedWorkspaceAccess, type WorkspaceMountAccess } from '@hbar/local-tools'
import { ExecutionRouter, type NodeExecutionPort } from '@hbar/node-link'
import { definePlugin, provide, type WorkspaceExecutionScope } from '@hbar/plugin-sdk'
import type { WorkspaceDirectoryService } from '@hbar/plugin-sdk/workspace-directories'
import { runtimePluginInvocation } from './runtime-plugin-api'
import type { z } from 'zod'

export interface RuntimeExecutionRouterOptions {
  readonly dataRoot: string
  readonly workspaceDirectory: string
  readonly localEnabled: boolean
  readonly invokeHost: (method: string, args: readonly unknown[]) => Promise<unknown>
  readonly loadSnapshot: (
    ref: import('@hbar/contracts/sandbox').SandboxSnapshotRef,
    signal: AbortSignal,
  ) => Promise<import('@hbar/contracts/sandbox').ResolvedSandboxProfile>
  readonly mounts: WorkspaceMountAccess
  readonly verifyWorktree: (path: string) => Promise<boolean>
}

/** Installs the router in the same owner that constructs workspace tools. */
export function runtimeExecutionRouterPlugin(options: RuntimeExecutionRouterOptions) {
  return definePlugin({
    manifest: {
      id: 'execution.local',
      name: 'Workspace execution',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      description: 'Owner-routed workspace files, queries, and processes',
      scope: 'host',
      required: true,
      provides: { execution: '1.0.0', 'workspace-directories': '1.0.0' },
      permissions: ['fs', 'process'],
    },
    apply(ctx) {
      const managedWorkspace: VerifiedManagedWorkspaceAccess = {
        root: options.workspaceDirectory,
        protectedRoot: options.dataRoot,
        verify: options.verifyWorktree,
      }
      const local = new LocalExecution([options.dataRoot], managedWorkspace, options.mounts)
      const node: NodeExecutionPort = {
        async call<Method extends NodeWorkspaceMethod>(
          nodeId: string,
          method: Method,
          input: z.input<(typeof nodeWorkspaceMethods)[Method]['input']>,
          signal?: AbortSignal,
        ) {
          signal?.throwIfAborted()
          const timeoutMs = nodeRequestTimeoutMs(method, input)
          const invocation = runtimePluginInvocation()
          let result: unknown
          if (method === 'exec.cancel' || method === 'exec.receipt' || method === 'node.confirmation.cancel') {
            if (!invocation?.settleHost || !invocation.invocationId)
              throw new HbarError('NODE_SETTLEMENT_UNAVAILABLE', 'The stable Host cannot reconcile this node execution')
            result = await invocation.settleHost('execution.nodeSettlement', [
              invocation.invocationId,
              nodeId,
              method,
              input,
              signal,
              timeoutMs,
            ])
          } else {
            result = await options.invokeHost('execution.nodeCall', [nodeId, method, input, signal, timeoutMs])
          }
          signal?.throwIfAborted()
          return nodeWorkspaceMethods[method].output.parse(result) as z.output<
            (typeof nodeWorkspaceMethods)[Method]['output']
          >
        },
      }
      const router = new ExecutionRouter({
        local,
        node,
        current: (): WorkspaceExecutionScope | undefined => runtimePluginInvocation()?.workspaceExecutionScope,
        loadSnapshot: options.loadSnapshot,
        localEnabled: options.localEnabled,
      })
      ctx.hbar.api.runtimeIdle?.register((authority) => {
        const proof = local.idleCheckpoint(authority)
        return { ...proof, requests: proof.requests + router.idleRequests() }
      })
      ctx.effect(() => () => router.dispose())
      provide(ctx, 'execution', router)
      provide<WorkspaceDirectoryService>(ctx, 'workspace-directories', {
        resolve: (root, path) => {
          // Keep virtual node locators on the LocalExecution rejection path; never
          // reinterpret them as local paths. Local directories are gated first.
          if (!parseNodeWorkspaceLocator(root) && !options.localEnabled)
            throw new HbarError(
              'LOCAL_EXECUTION_DISABLED',
              'Local workspace execution is disabled on this conversation node',
            )
          return local.resolveDirectory(root, path)
        },
      })
    },
  })
}

export function runtimeWorkspaceMounts(invokeHost: RuntimeExecutionRouterOptions['invokeHost']): WorkspaceMountAccess {
  return {
    get(root) {
      const mount = runtimePluginInvocation()?.mount
      return mount?.root === root ? mount : undefined
    },
    async verify(mount, signal) {
      signal?.throwIfAborted()
      await invokeHost('workspace.mount.verify', [mount, signal])
      signal?.throwIfAborted()
    },
  }
}

export function runtimeManagedWorkspace(
  dataRoot: string,
  invokeHost: RuntimeExecutionRouterOptions['invokeHost'],
): Pick<RuntimeExecutionRouterOptions, 'workspaceDirectory' | 'verifyWorktree'> {
  const workspaceDirectory = join(dataRoot, 'worktrees')
  return {
    workspaceDirectory,
    async verifyWorktree(path) {
      const value = await invokeHost('execution.isBoundWorktree', [path])
      if (typeof value !== 'boolean')
        throw new HbarError('RUNTIME_RESPONSE_INVALID', 'Managed workspace verification was invalid')
      return value
    },
  }
}
