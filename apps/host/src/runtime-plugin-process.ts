import { z } from 'zod'
import {
  Context,
  RunControlSignal,
  service,
  osConfinementOptionsSchema,
  type HbarPlugin,
  type HbarAPI,
  type HookEvents,
  type ToolDefinition,
} from '@hbar/plugin-sdk'
import { HbarError, runSchema, type ToolWindowContribution } from '@hbar/contracts'
import { sessionSchema, workspaceSchema } from '@hbar/contracts/directory'
import { nodeCallAuthoritySchema } from '@hbar/contracts/node'
import {
  runtimePluginStateSchema,
  runtimePluginManifestSchema,
  describeRuntimeTool,
  describeRuntimeHook,
  restoreRuntimeHook,
  RUNTIME_PLUGIN_HOOKS,
  type RuntimePluginHook,
} from '@hbar/plugin-sdk/runtime-plugin'
import {
  RuntimeValuePort,
  procedure,
  runtimeDomainError,
  type RuntimeProcessContext,
  type RuntimeProcessService,
} from '@hbar/runtime'
import { STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import {
  PLUGIN_RUNTIME_FINGERPRINT,
  RUNTIME_PLUGIN_SERVICES,
  runtimePluginConfigurationSchema,
  runtimePluginInvocationSchema,
  RUNTIME_PLUGIN_CALLBACK_TIMEOUT_MS,
} from './runtime-plugin-contract'
import {
  RuntimePluginHooks,
  createRuntimePluginAPI,
  provideRuntimePluginDependencies,
  runtimePluginInvocationTools,
  runtimePluginInvocation,
  withRuntimePluginInvocation,
  type RuntimePluginHostInvoker,
} from './runtime-plugin-api'

interface Owner {
  readonly ctx: Context
  readonly api: HbarAPI
  readonly tools: Map<string, ToolDefinition>
  readonly hooks: RuntimePluginHooks
  readonly panels: Map<string, ToolWindowContribution>
}
export interface RuntimePluginFactory {
  readonly plugins: readonly HbarPlugin[]
}
const toolContextSchema = z
  .object({
    session: sessionSchema,
    workspace: workspaceSchema,
    run: runSchema,
    signal: z.instanceof(AbortSignal),
    callId: z.string().min(1).max(160),
    timeoutMs: z.number().int().positive().optional(),
    parentCallId: z.string().min(1).max(160).optional(),
    environment: z.record(z.string(), z.string()).optional(),
    osConfinement: osConfinementOptionsSchema.optional(),
    nodeAuthority: nodeCallAuthoritySchema.optional(),
    executeSequence: z
      .custom<NonNullable<import('@hbar/plugin-sdk').ToolContext['executeSequence']>>(
        (value) => typeof value === 'function',
      )
      .optional(),
    reportProgress: z
      .custom<NonNullable<import('@hbar/plugin-sdk').ToolContext['reportProgress']>>(
        (value) => typeof value === 'function',
      )
      .optional(),
  })
  .superRefine((value, result) => {
    if (value.run.sessionId !== value.session.id || value.session.workspaceId !== value.workspace.id)
      result.addIssue({ code: 'custom', message: 'Tool context identities do not share an admitted execution' })
    const authority = value.nodeAuthority
    if (
      authority &&
      (authority.sessionId !== value.session.id ||
        authority.runId !== value.run.id ||
        authority.callId !== value.callId)
    )
      result.addIssue({ code: 'custom', message: 'Workspace routing authority does not match this tool call' })
    if (
      authority &&
      ((authority.sandbox?.digest ?? null) !== (value.run.input.sandbox?.digest ?? null) ||
        (authority.sandbox?.profileId ?? null) !== (value.run.input.sandbox?.profileId ?? null))
    )
      result.addIssue({ code: 'custom', message: 'Workspace routing authority does not match the pinned Run sandbox' })
  })

/** One plugin's Context, schemas, hooks and executable capabilities live entirely in this managed owner. */
export function createRuntimePlugin(
  context: RuntimeProcessContext,
  factory: RuntimePluginFactory,
): RuntimeProcessService {
  const configuration = runtimePluginConfigurationSchema.parse(context.configuration)
  const plugins = [...factory.plugins]
  if (!plugins.length || plugins.length > 16)
    throw new HbarError('RUNTIME_PLUGIN_INVALID', 'An owned plugin group needs a bounded manifest')
  for (const plugin of plugins) runtimePluginManifestSchema.parse(plugin.manifest)
  const config = plugins.at(-1)?.configSchema?.parse(configuration.config) ?? configuration.config
  const values = new RuntimeValuePort(context.peer, {
    prefix: 'plugin.application',
    // The callback is decoded before the invocation's AsyncLocalStorage scope exists.
    // Bound it at the maximum owner deadline; the captured request signal and each
    // outer call's validated deadline remain the tighter cancellation boundaries.
    callbackTimeoutMs: RUNTIME_PLUGIN_CALLBACK_TIMEOUT_MS,
  })
  let owner: Owner | undefined
  let calls = 0,
    preflight = true
  let capabilityMethods: Readonly<Record<string, readonly string[]>> = {}
  const fallback: RuntimePluginHostInvoker = (method, args) => {
    const settlement =
      method === 'execution.nodeSettlement' ? z.number().int().min(1).max(1_200_000).safeParse(args[5]) : undefined
    return values.call(
      'host.read',
      [method, [...args]],
      settlement?.success ? { timeoutMs: Math.min(settlement.data + 5_000, 1_325_000) } : {},
    )
  }
  const construct = async (shadow: boolean): Promise<Owner> => {
    const ctx = new Context(),
      tools = new Map<string, ToolDefinition>(),
      hooks = new RuntimePluginHooks(),
      panels = new Map<string, ToolWindowContribution>()
    const api = createRuntimePluginAPI({
      ctx,
      entries: tools,
      hooks,
      panels,
      ownerId: z.string().parse(plugins.at(-1)?.manifest.id),
      preparing: () => shadow,
      fallback,
      resources: {
        retain: async (descriptor) => {
          if (shadow || preflight || context.preparing())
            throw new HbarError('RUNTIME_PREPARING', 'A candidate cannot acquire native resources')
          const id = z
            .string()
            .uuid()
            .parse(await values.call('resource.retain', [descriptor]))
          let released = false
          return async () => {
            if (!released) {
              await values.call('resource.release', [id])
              released = true
            }
          }
        },
      },
    })
    const provided = new Set(plugins.flatMap((plugin) => Object.keys(plugin.manifest.provides ?? {})))
    const dependencies = [
      ...new Set(
        plugins.flatMap((plugin) => Object.keys({ ...plugin.manifest.requires, ...plugin.manifest.optional })),
      ),
    ].filter((name) => !provided.has(name))
    provideRuntimePluginDependencies(ctx, dependencies, fallback)
    try {
      for (const plugin of plugins)
        await plugin.apply(ctx, plugin.configSchema?.parse(configuration.config) ?? configuration.config)
      return { ctx, api, tools, hooks, panels }
    } catch (error) {
      await ctx.fiber.dispose()
      throw error
    }
  }
  const state = () => {
    if (!owner) throw new HbarError('RUNTIME_PREPARING', 'The owned plugin has not finished preparing')
    const capabilities: Record<string, readonly string[]> = {}
    for (const name of new Set(plugins.flatMap((plugin) => Object.keys(plugin.manifest.provides ?? {})))) {
      if (!Object.hasOwn(RUNTIME_PLUGIN_SERVICES, name))
        throw new HbarError('RUNTIME_RESTART_REQUIRED', 'The plugin provides an undeclared capability')
      const target: unknown = service(owner.ctx, name)
      const declared = RUNTIME_PLUGIN_SERVICES[name as keyof typeof RUNTIME_PLUGIN_SERVICES]
      capabilities[name] = declared.filter(
        (method) => target !== null && typeof target === 'object' && typeof Reflect.get(target, method) === 'function',
      )
      if (name === 'execution' && target && typeof target === 'object' && 'workspaceQuery' in target)
        capabilities.workspaceQuery = RUNTIME_PLUGIN_SERVICES.workspaceQuery
    }
    const schema = plugins.at(-1)?.configSchema
    capabilityMethods = capabilities
    return runtimePluginStateSchema.parse({
      manifests: plugins.map((plugin) => plugin.manifest),
      config,
      configSchema: schema ? z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) : null,
      tools: [...owner.tools.values()].map(describeRuntimeTool),
      hooks: [...owner.hooks.events.keys()],
      panels: [...owner.panels.values()],
      capabilities,
    })
  }
  context.peer.register('plugin.state', procedure(z.undefined(), runtimePluginStateSchema, state))
  values.register('invoke', async ([description, argsValue, hostValue], callSignal) => {
    if (preflight || context.preparing() || !owner)
      throw new HbarError('RUNTIME_PREPARING', 'A candidate cannot invoke production plugin code')
    const request = runtimePluginInvocationSchema.parse(description),
      args = z.array(z.unknown()).max(32).parse(argsValue)
    if (typeof hostValue !== 'function')
      throw new HbarError('RUNTIME_HOST_REQUIRED', 'The invocation needs its named host port')
    const capturedWorkspaceScope = request.workspaceExecutionScope
      ? {
          workspace: structuredClone(request.workspaceExecutionScope.workspace),
          ...(request.workspaceExecutionScope.authority
            ? { authority: structuredClone(request.workspaceExecutionScope.authority) }
            : {}),
          signal: request.workspaceExecutionScope.signal,
        }
      : undefined
    const host: RuntimePluginHostInvoker = async (method, parameters) => {
      const result: unknown = await Reflect.apply(hostValue, undefined, [method, [...parameters]])
      return result
    }
    const pending = new Set<Promise<unknown>>()
    const current = owner
    const catalog = runtimePluginInvocationTools(request.catalog, host)
    calls++
    let deadline: ReturnType<typeof setTimeout> | undefined
    const remoteExecution =
      request.workspaceExecutionScope?.workspace.location?.kind === 'node' &&
      request.workspaceExecutionScope.authority !== undefined
    const aborted = () => {
      deadline ??= setTimeout(() => process.exit(76), remoteExecution ? 125_000 : 5_000)
    }
    callSignal.addEventListener('abort', aborted, { once: true })
    try {
      return await withRuntimePluginInvocation(
        {
          host,
          tools: catalog,
          pending,
          settleHost: fallback,
          ...(request.invocationId ? { invocationId: request.invocationId } : {}),
          ...(request.mount ? { mount: request.mount } : {}),
          ...(capturedWorkspaceScope ? { workspaceExecutionScope: capturedWorkspaceScope } : {}),
          ...(request.toolTimeoutMs !== undefined ? { toolTimeoutMs: request.toolTimeoutMs } : {}),
        },
        async () => {
          try {
            let result: unknown
            if (request.operation === 'validate') {
              const tool = current.tools.get(request.name)
              if (!tool) throw new HbarError('RUNTIME_TOOL_NOT_FOUND', 'The bound tool is not registered in this owner')
              result = z.record(z.string(), z.unknown()).parse(await tool.inputSchema.parseAsync(args[0]))
            } else if (request.operation === 'execute') {
              const tool = current.tools.get(request.name)
              if (!tool) throw new HbarError('RUNTIME_TOOL_NOT_FOUND', 'The bound tool is not registered in this owner')
              const parsed = toolContextSchema.parse(args[1])
              const contextValue: import('@hbar/plugin-sdk').ToolContext = {
                session: parsed.session,
                workspace: parsed.workspace,
                run: parsed.run,
                signal: parsed.signal,
                callId: parsed.callId,
                ...(parsed.timeoutMs !== undefined ? { timeoutMs: parsed.timeoutMs } : {}),
                ...(parsed.parentCallId ? { parentCallId: parsed.parentCallId } : {}),
                ...(parsed.environment ? { environment: parsed.environment } : {}),
                ...(parsed.executeSequence ? { executeSequence: parsed.executeSequence } : {}),
                ...(parsed.osConfinement ? { osConfinement: parsed.osConfinement } : {}),
                ...(parsed.nodeAuthority ? { nodeAuthority: parsed.nodeAuthority } : {}),
                ...(parsed.reportProgress ? { reportProgress: parsed.reportProgress } : {}),
              }
              const invocation = runtimePluginInvocation()
              if (!invocation)
                throw new HbarError('RUNTIME_EXECUTION_REQUIRED', 'Workspace execution scope is unavailable')
              const workspaceExecutionScope: import('@hbar/plugin-sdk').WorkspaceExecutionScope = {
                workspace: structuredClone(parsed.workspace),
                ...(parsed.nodeAuthority ? { authority: structuredClone(parsed.nodeAuthority) } : {}),
                signal: parsed.signal,
              }
              const toolArgs = z.record(z.string(), z.unknown()).parse(await tool.inputSchema.parseAsync(args[0]))
              result = await withRuntimePluginInvocation(
                {
                  ...invocation,
                  workspaceExecutionScope,
                  ...(parsed.timeoutMs !== undefined ? { toolTimeoutMs: parsed.timeoutMs } : {}),
                },
                () => tool.execute(toolArgs, contextValue),
              )
            } else if (request.operation === 'hook' || request.operation === 'commitGoal') {
              const event = z.enum(RUNTIME_PLUGIN_HOOKS).parse(request.name)
              const value = restoreRuntimeHook(event, args[0], catalog)
              const next = await current.hooks.dispatch(event, value)
              if (request.operation === 'commitGoal') {
                const checked = next as HookEvents['goal.beforeComplete']
                if (event !== 'goal.beforeComplete' || typeof checked.commit !== 'function')
                  throw new HbarError('RUNTIME_HOOK_INVALID', 'Goal completion requires an owned commit port')
                await checked.commit()
                result = undefined
              } else result = describeRuntimeHook(event as RuntimePluginHook, next, true)
            } else {
              const allowed = capabilityMethods[request.name]
              if (!request.method || !allowed?.includes(request.method))
                throw new HbarError('RUNTIME_METHOD_UNAVAILABLE', 'Capability method is absent from this owner')
              const capability: unknown =
                request.name === 'workspaceQuery'
                  ? Reflect.get(service<object>(current.ctx, 'execution'), 'workspaceQuery')
                  : service(current.ctx, request.name)
              const method: unknown =
                capability && typeof capability === 'object' ? Reflect.get(capability, request.method) : undefined
              if (typeof method !== 'function')
                throw new HbarError('RUNTIME_METHOD_UNAVAILABLE', 'Capability method is unavailable')
              result = await Reflect.apply(method, capability, args)
            }
            return { kind: 'value', value: result }
          } catch (error) {
            if (error instanceof RunControlSignal) return { kind: 'control', control: error.control }
            const domain = runtimeDomainError(error)
            return {
              kind: 'error',
              code: domain?.code ?? (error instanceof z.ZodError ? 'INVALID_TOOL_INPUT' : 'RUNTIME_PLUGIN_FAILED'),
              message: domain?.message ?? 'The owned plugin invocation failed',
            }
          } finally {
            await Promise.allSettled([...pending])
          }
        },
      )
    } finally {
      calls--
      clearTimeout(deadline)
      callSignal.removeEventListener('abort', aborted)
      if (request.invocationId) {
        try {
          await context.peer.notify('plugin.finished', { invocationId: request.invocationId })
        } catch {
          process.exit(76)
        }
      }
    }
  })
  return {
    async prepare() {
      owner = await construct(true)
      state()
      return {
        contractFingerprint: PLUGIN_RUNTIME_FINGERPRINT,
        storageSchema: STORAGE_SCHEMA_VERSION,
        capabilities: ['plugin.state', 'plugin.application.invoke'],
      }
    },
    async activate() {
      await owner?.ctx.fiber.dispose()
      owner = await construct(false)
      state()
      preflight = false
    },
    async drain() {
      return { runs: 0, requests: calls, resources: 0 }
    },
    async dispose() {
      preflight = true
      await owner?.ctx.fiber.dispose()
      owner = undefined
      values.dispose()
    },
  }
}
