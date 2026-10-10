import { z } from 'zod'
import { Context, RunControlSignal, service, type HbarPlugin, type HbarAPI, type HookEvents, type ToolDefinition } from '@hbar/plugin-sdk'
import { HbarError, runSchema, type ToolWindowContribution } from '@hbar/contracts'
import { sessionSchema, workspaceSchema } from '@hbar/contracts/directory'
import { runtimePluginStateSchema, runtimePluginManifestSchema, describeRuntimeTool, describeRuntimeHook,
  restoreRuntimeHook, RUNTIME_PLUGIN_HOOKS, type RuntimePluginHook } from '@hbar/plugin-sdk/runtime-plugin'
import { RuntimeValuePort, procedure, runtimeDomainError, type RuntimeProcessContext, type RuntimeProcessService } from '@hbar/runtime'
import { STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { PLUGIN_RUNTIME_FINGERPRINT, RUNTIME_PLUGIN_SERVICES, runtimePluginConfigurationSchema, runtimePluginInvocationSchema } from './runtime-plugin-contract'
import { RuntimePluginHooks, createRuntimePluginAPI, provideRuntimePluginDependencies, runtimePluginInvocationTools,
  withRuntimePluginInvocation, type RuntimePluginHostInvoker } from './runtime-plugin-api'

interface Owner { readonly ctx: Context; readonly api: HbarAPI; readonly tools: Map<string, ToolDefinition>; readonly hooks: RuntimePluginHooks; readonly panels: Map<string, ToolWindowContribution> }
export interface RuntimePluginFactory { readonly plugins: readonly HbarPlugin[] }
const toolContextSchema = z.object({ session: sessionSchema, workspace: workspaceSchema, run: runSchema,
  signal: z.instanceof(AbortSignal), callId: z.string().min(1).max(160), timeoutMs: z.number().int().positive().optional(),
  parentCallId: z.string().min(1).max(160).optional(), environment: z.record(z.string(), z.string()).optional(),
  executeSequence: z.custom<NonNullable<import('@hbar/plugin-sdk').ToolContext['executeSequence']>>(value => typeof value === 'function').optional(),
  reportProgress: z.custom<NonNullable<import('@hbar/plugin-sdk').ToolContext['reportProgress']>>(value => typeof value === 'function').optional(),
}).superRefine((value, result) => {
  if (value.run.sessionId !== value.session.id || value.session.workspaceId !== value.workspace.id)
    result.addIssue({ code: 'custom', message: 'Tool context identities do not share an admitted execution' })
})

/** One plugin's Context, schemas, hooks and executable capabilities live entirely in this managed owner. */
export function createRuntimePlugin(context: RuntimeProcessContext, factory: RuntimePluginFactory): RuntimeProcessService {
  const configuration = runtimePluginConfigurationSchema.parse(context.configuration)
  const plugins = [...factory.plugins]
  if (!plugins.length || plugins.length > 16) throw new HbarError('RUNTIME_PLUGIN_INVALID', 'An owned plugin group needs a bounded manifest')
  for (const plugin of plugins) runtimePluginManifestSchema.parse(plugin.manifest)
  const config = plugins.at(-1)?.configSchema?.parse(configuration.config) ?? configuration.config
  const values = new RuntimeValuePort(context.peer, { prefix: 'plugin.application' })
  let owner: Owner | undefined
  let calls = 0, preflight = true
  let capabilityMethods: Readonly<Record<string, readonly string[]>> = {}
  const fallback: RuntimePluginHostInvoker = (method, args) => values.call('host.read', [method, [...args]])
  const construct = async (shadow: boolean): Promise<Owner> => {
    const ctx = new Context(), tools = new Map<string, ToolDefinition>(), hooks = new RuntimePluginHooks(), panels = new Map<string, ToolWindowContribution>()
    const api = createRuntimePluginAPI({ ctx, entries: tools, hooks, panels, ownerId: z.string().parse(plugins.at(-1)?.manifest.id), preparing: () => shadow, fallback })
    const provided = new Set(plugins.flatMap(plugin => Object.keys(plugin.manifest.provides ?? {})))
    const dependencies = [...new Set(plugins.flatMap(plugin => Object.keys({ ...plugin.manifest.requires, ...plugin.manifest.optional })))].filter(name => !provided.has(name))
    provideRuntimePluginDependencies(ctx, dependencies, fallback)
    try {
      for (const plugin of plugins) await plugin.apply(ctx, plugin.configSchema?.parse(configuration.config) ?? configuration.config)
      return { ctx, api, tools, hooks, panels }
    } catch (error) { await ctx.fiber.dispose(); throw error }
  }
  const state = () => {
    if (!owner) throw new HbarError('RUNTIME_PREPARING', 'The owned plugin has not finished preparing')
    const capabilities: Record<string, readonly string[]> = {}
    for (const name of new Set(plugins.flatMap(plugin => Object.keys(plugin.manifest.provides ?? {})))) {
      if (!Object.hasOwn(RUNTIME_PLUGIN_SERVICES, name)) throw new HbarError('RUNTIME_RESTART_REQUIRED', 'The plugin provides an undeclared capability')
      const target: unknown = service(owner.ctx, name)
      const declared = RUNTIME_PLUGIN_SERVICES[name as keyof typeof RUNTIME_PLUGIN_SERVICES]
      capabilities[name] = declared.filter(method => target !== null && typeof target === 'object' && typeof Reflect.get(target, method) === 'function')
      if (name === 'execution' && target && typeof target === 'object' && 'workspaceQuery' in target) capabilities.workspaceQuery = RUNTIME_PLUGIN_SERVICES.workspaceQuery
    }
    const schema = plugins.at(-1)?.configSchema
    capabilityMethods = capabilities
    return runtimePluginStateSchema.parse({ manifests: plugins.map(plugin => plugin.manifest), config,
      configSchema: schema ? z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) : null,
      tools: [...owner.tools.values()].map(describeRuntimeTool), hooks: [...owner.hooks.events.keys()], panels: [...owner.panels.values()], capabilities })
  }
  context.peer.register('plugin.state', procedure(z.undefined(), runtimePluginStateSchema, state))
  values.register('invoke', async ([description, argsValue, hostValue], callSignal) => {
    if (preflight || context.preparing() || !owner) throw new HbarError('RUNTIME_PREPARING', 'A candidate cannot invoke production plugin code')
    const request = runtimePluginInvocationSchema.parse(description), args = z.array(z.unknown()).max(32).parse(argsValue)
    if (typeof hostValue !== 'function') throw new HbarError('RUNTIME_HOST_REQUIRED', 'The invocation needs its named host port')
    const host: RuntimePluginHostInvoker = async (method, parameters) => {
      const result: unknown = await Reflect.apply(hostValue, undefined, [method, [...parameters]])
      return result
    }
    const pending = new Set<Promise<unknown>>()
    const current = owner
    const catalog = runtimePluginInvocationTools(request.catalog, host)
    calls++
    let deadline: ReturnType<typeof setTimeout> | undefined
    const aborted = () => { deadline ??= setTimeout(() => process.exit(76), 5_000) }
    callSignal.addEventListener('abort', aborted, { once: true })
    try {
      return await withRuntimePluginInvocation({ host, tools: catalog, pending, ...(request.mount ? { mount: request.mount } : {}) }, async () => {
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
            const contextValue: import('@hbar/plugin-sdk').ToolContext = { session: parsed.session, workspace: parsed.workspace,
              run: parsed.run, signal: parsed.signal, callId: parsed.callId,
              ...(parsed.timeoutMs !== undefined ? { timeoutMs: parsed.timeoutMs } : {}), ...(parsed.parentCallId ? { parentCallId: parsed.parentCallId } : {}),
              ...(parsed.environment ? { environment: parsed.environment } : {}), ...(parsed.executeSequence ? { executeSequence: parsed.executeSequence } : {}),
              ...(parsed.reportProgress ? { reportProgress: parsed.reportProgress } : {}),
            }
            result = await tool.execute(z.record(z.string(), z.unknown()).parse(await tool.inputSchema.parseAsync(args[0])), contextValue)
          } else if (request.operation === 'hook' || request.operation === 'commitGoal') {
            const event = z.enum(RUNTIME_PLUGIN_HOOKS).parse(request.name)
            const value = restoreRuntimeHook(event, args[0], catalog)
            const next = await current.hooks.dispatch(event, value)
            if (request.operation === 'commitGoal') {
              const checked = next as HookEvents['goal.beforeComplete']
              if (event !== 'goal.beforeComplete' || typeof checked.commit !== 'function') throw new HbarError('RUNTIME_HOOK_INVALID', 'Goal completion requires an owned commit port')
              await checked.commit(); result = undefined
            } else result = describeRuntimeHook(event as RuntimePluginHook, next, true)
          } else {
            const allowed = capabilityMethods[request.name]
            if (!request.method || !allowed?.includes(request.method)) throw new HbarError('RUNTIME_METHOD_UNAVAILABLE', 'Capability method is absent from this owner')
            const capability: unknown = request.name === 'workspaceQuery' ? Reflect.get(service<object>(current.ctx, 'execution'), 'workspaceQuery') : service(current.ctx, request.name)
            const method: unknown = capability && typeof capability === 'object' ? Reflect.get(capability, request.method) : undefined
            if (typeof method !== 'function') throw new HbarError('RUNTIME_METHOD_UNAVAILABLE', 'Capability method is unavailable')
            result = await Reflect.apply(method, capability, args)
          }
          return { kind: 'value', value: result }
        } catch (error) {
          if (error instanceof RunControlSignal) return { kind: 'control', control: error.control }
          const domain = runtimeDomainError(error)
          return { kind: 'error', code: domain?.code ?? (error instanceof z.ZodError ? 'INVALID_TOOL_INPUT' : 'RUNTIME_PLUGIN_FAILED'),
            message: domain?.message ?? 'The owned plugin invocation failed' }
        } finally { await Promise.allSettled([...pending]) }
      })
    } finally {
      calls--; clearTimeout(deadline); callSignal.removeEventListener('abort', aborted)
      if (request.invocationId) { try { await context.peer.notify('plugin.finished', { invocationId: request.invocationId }) } catch { process.exit(76) } }
    }
  })
  return {
    async prepare() { owner = await construct(true); state(); return { contractFingerprint: PLUGIN_RUNTIME_FINGERPRINT, storageSchema: STORAGE_SCHEMA_VERSION, capabilities: ['plugin.state', 'plugin.application.invoke'] } },
    async activate() { await owner?.ctx.fiber.dispose(); owner = await construct(false); state(); preflight = false },
    async drain() { return { runs: 0, requests: calls, resources: 0 } },
    async dispose() { preflight = true; await owner?.ctx.fiber.dispose(); owner = undefined; values.dispose() },
  }
}
