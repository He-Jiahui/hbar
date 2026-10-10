import { join } from 'node:path'
import localTools, { localExecutionPlugin } from '@hbar/local-tools'
import type { RuntimeProcessContext } from '@hbar/runtime'
import { createRuntimePlugin } from './runtime-plugin-process'
import { runtimePluginConfigurationSchema } from './runtime-plugin-contract'
import { runtimePluginInvocation } from './runtime-plugin-api'
import { HbarError } from '@hbar/contracts'

export const create = (context: RuntimeProcessContext) => {
  const configuration = runtimePluginConfigurationSchema.parse(context.configuration)
  const host = (method: string, args: readonly unknown[]) => {
    const invocation = runtimePluginInvocation()
    if (!invocation) throw new HbarError('RUNTIME_EXECUTION_REQUIRED', 'Workspace access requires an admitted execution')
    return invocation.host(method, args)
  }
  return createRuntimePlugin(context, { plugins: [
    localExecutionPlugin([configuration.dataRoot], { root: join(configuration.dataRoot, 'worktrees'), protectedRoot: configuration.dataRoot,
      verify: async root => Boolean(await host('execution.isBoundWorktree', [root])) },
      { get: root => { const mount = runtimePluginInvocation()?.mount; return mount?.root === root ? mount : undefined },
        verify: async (mount, signal) => { await host('workspace.mount.verify', [mount, signal]) } }),
    localTools,
  ] })
}
