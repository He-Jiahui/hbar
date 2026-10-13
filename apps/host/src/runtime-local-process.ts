import localTools from '@hbar/local-tools'
import imageGenerationPlugin from '@hbar/image-generation'
import type { RuntimeProcessContext } from '@hbar/runtime'
import { createRuntimePlugin } from './runtime-plugin-process'
import { runtimePluginConfigurationSchema } from './runtime-plugin-contract'
import { runtimePluginInvocation } from './runtime-plugin-api'
import { HbarError } from '@hbar/contracts'
import { resolvedSandboxProfileSchema } from '@hbar/contracts/sandbox'
import {
  runtimeExecutionRouterPlugin,
  runtimeManagedWorkspace,
  runtimeWorkspaceMounts,
} from './runtime-execution-router'

export const create = (context: RuntimeProcessContext) => {
  const configuration = runtimePluginConfigurationSchema.parse(context.configuration)
  const host = (method: string, args: readonly unknown[]) => {
    const invocation = runtimePluginInvocation()
    if (!invocation)
      throw new HbarError('RUNTIME_EXECUTION_REQUIRED', 'Workspace access requires an admitted execution')
    return invocation.host(method, args)
  }
  const managedWorkspace = runtimeManagedWorkspace(configuration.dataRoot, host)
  const mounts = runtimeWorkspaceMounts(host)
  return createRuntimePlugin(context, {
    plugins: [
      runtimeExecutionRouterPlugin({
        dataRoot: configuration.dataRoot,
        workspaceDirectory: managedWorkspace.workspaceDirectory,
        verifyWorktree: managedWorkspace.verifyWorktree,
        mounts,
        localEnabled: !configuration.noLocalExec,
        invokeHost: host,
        loadSnapshot: async (ref, signal) => {
          signal.throwIfAborted()
          const value: unknown = await host('sandbox.loadSnapshot', [ref])
          signal.throwIfAborted()
          return resolvedSandboxProfileSchema.parse(value)
        },
      }),
      localTools,
      imageGenerationPlugin,
    ],
  })
}
