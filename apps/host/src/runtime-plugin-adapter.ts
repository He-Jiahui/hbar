import { z } from 'zod'
import { HbarError, type PluginInfo } from '@hbar/contracts'
import { definePlugin, provide, RunControlSignal, type HbarAPI, type HbarPlugin, type HookEvents, type ToolDefinition } from '@hbar/plugin-sdk'
import { describeRuntimeTool, describeRuntimeHook, restoreRuntimeHook, runtimeToolAdapter, type RuntimePluginState } from '@hbar/plugin-sdk/runtime-plugin'
import type { Kernel } from '@hbar/kernel'
import { RuntimeValuePort, type IpcPeer } from '@hbar/runtime'
import { runtimePluginAuthoritySchema, runtimePluginCatalogSchema, runtimePluginInvocationSchema, runtimePluginResultSchema, RUNTIME_PLUGIN_SERVICES } from './runtime-plugin-contract'

type Catalog = z.infer<typeof runtimePluginCatalogSchema>
type Invocation = z.infer<typeof runtimePluginInvocationSchema>
/** The Kernel owns API functions and admission. Remote registrations contain descriptions alone. */
export class RuntimePluginAdapter {
  private readonly values: RuntimeValuePort
  private catalog: Catalog = []
  private readonly tools = new Map<string, Array<() => void>>()
  private readonly registeredHooks = new Map<string, Set<keyof HookEvents>>()
  constructor(peer: IpcPeer, private readonly kernel: () => Kernel) { this.values = new RuntimeValuePort(peer, { prefix: 'kernel.plugins' }) }
  async load(): Promise<Record<string, HbarPlugin>> {
    this.catalog = runtimePluginCatalogSchema.parse(await this.values.call('catalog', []))
    return Object.fromEntries(this.catalog.flatMap(({ unitId, state }) => state.manifests.map((manifest, index) => [
      manifest.id, definePlugin({ manifest, configSchema: z.record(z.string(), z.unknown()), apply: ctx => {
        const api = ctx.hbar.api
        for (const [name, methods] of Object.entries(state.capabilities)) {
          if (!manifest.provides?.[name] && name !== 'workspaceQuery') continue
          if (name === 'workspaceQuery') continue
          const capability: Record<string, unknown> = Object.fromEntries(methods.map(method => [method,
            (...args: unknown[]) => this.invoke(unitId, { operation: 'capability', name, method }, args, api)]))
          if (name === 'execution' && state.capabilities.workspaceQuery)
            capability.workspaceQuery = Object.fromEntries(state.capabilities.workspaceQuery.map(method => [method,
              (...args: unknown[]) => this.invoke(unitId, { operation: 'capability', name: 'workspaceQuery', method }, args, api)]))
          provide(ctx, name, capability)
        }
        if (index !== state.manifests.length - 1) return
        this.registerTools(unitId, state, api)
        for (const panel of state.panels) api.panels.register(panel)
        this.registerHooks(unitId, state, api)
      } }),
    ])))
  }
  projectInfo(values: readonly PluginInfo[]): PluginInfo[] {
    return values.map(info => {
      const entry = this.catalog.find(entry => entry.state.manifests.some(manifest => manifest.id === info.id))
      return entry ? { ...info, config: entry.state.config, ...(entry.state.configSchema ? { configSchema: entry.state.configSchema } : {}) } : info
    })
  }
  publishMetadata(): void {
    for (const entry of this.catalog) for (const manifest of entry.state.manifests)
      this.kernel().plugins.setRuntimeMetadata(manifest.id, { config: entry.state.config, configSchema: entry.state.configSchema })
  }
  private registerHooks(unitId: string, state: RuntimePluginState, api: HbarAPI): void {
    const registered = this.registeredHooks.get(unitId) ?? new Set<keyof HookEvents>()
    this.registeredHooks.set(unitId, registered)
    for (const event of state.hooks) {
      if (registered.has(event)) continue
      registered.add(event)
      api.hooks.on(event, async value => {
          if (event === 'goal.beforeComplete') {
            const original = value as HookEvents['goal.beforeComplete']
            return { ...original, commit: () => this.invoke<void>(unitId, { operation: 'commitGoal', name: event }, [describeRuntimeHook(event, original)], api) } as HookEvents[typeof event]
          }
          const result = await this.invoke(unitId, { operation: 'hook', name: event }, [describeRuntimeHook(event, value)], api)
          return restoreRuntimeHook(event, result, this.hookTools(value, api), value)
      })
    }
  }
  private hookTools(value: unknown, api: HbarAPI): ToolDefinition[] {
    const input = value && typeof value === 'object' ? value : {}
    const selected: unknown = Reflect.get(input, 'tools'), single: unknown = Reflect.get(input, 'tool')
    return Array.isArray(selected) && selected.every(tool => tool && typeof tool === 'object' && typeof Reflect.get(tool, 'execute') === 'function')
      ? selected as ToolDefinition[] : single && typeof single === 'object' && typeof Reflect.get(single, 'execute') === 'function'
      ? [single as ToolDefinition, ...api.tools.list()] : api.tools.list()
  }
  private registerTools(unitId: string, state: RuntimePluginState, api: HbarAPI): void {
    for (const dispose of this.tools.get(unitId) ?? []) dispose()
    this.tools.set(unitId, state.tools.map(tool => api.tools.register({ ...runtimeToolAdapter(tool, {
      validate: (name, args) => this.invoke(unitId, { operation: 'validate', name }, [args], api),
      execute: (name, args, context) => this.invoke(unitId, { operation: 'execute', name }, [args, context], api),
    }), runtimeOwner: unitId })))
  }
  async refresh(): Promise<void> {
    const next = runtimePluginCatalogSchema.parse(await this.values.call('catalog', []))
    const api = this.kernel().plugins.runtimeAPI()
    for (const entry of next) {
      const prior = this.catalog.find(value => value.unitId === entry.unitId)
      if (JSON.stringify(prior?.state.tools) !== JSON.stringify(entry.state.tools)) this.registerTools(entry.unitId, entry.state, api)
      this.registerHooks(entry.unitId, entry.state, api)
    }
    this.catalog = next
    this.publishMetadata()
  }
  private async invoke<Result>(unitId: string, operation: Omit<Invocation, 'catalog'>, args: readonly unknown[], api: HbarAPI): Promise<Result> {
    const kernel = this.kernel(), execution = kernel.runtimeExecution()
    const first = args[0], context = args[1]
    const sessionId = execution?.sessionId ?? (typeof first === 'string' && ['goal', 'plan', 'mode', 'budget', 'workflow', 'agent', 'browser', 'computer'].includes(operation.name) ? first :
      first && typeof first === 'object' && 'sessionId' in first && typeof first.sessionId === 'string' ? first.sessionId : undefined)
    const contextRoot = context && typeof context === 'object' && 'workspace' in context && context.workspace && typeof context.workspace === 'object' && 'path' in context.workspace ? context.workspace.path : undefined
    const mount = kernel.workspaceSandboxes.get(typeof contextRoot === 'string' ? contextRoot : typeof first === 'string' ? first : '')
    const request = runtimePluginInvocationSchema.parse({ ...operation, catalog: this.hookTools(first, api).map(describeRuntimeTool), ...(mount ? { mount } : {}) })
    const result = runtimePluginResultSchema.parse(await this.values.call('invoke', [unitId,
      runtimePluginAuthoritySchema.parse({ ...(execution ? { execution } : {}), ...(sessionId ? { sessionId } : {}) }),
      request, [...args], (method: string, parameters: readonly unknown[]) => this.host(api, method, parameters)]))
    if (result.kind === 'error') throw new HbarError(result.code, result.message)
    if (result.kind === 'control') throw new RunControlSignal(result.control)
    // The named capability or Hook fixes Result; its plain graph was validated by both application ports.
    return result.value as Result
  }
  private async host(api: HbarAPI, method: string, args: readonly unknown[]): Promise<unknown> {
    if (method === 'notify') { api.notify(args[0] as Parameters<HbarAPI['notify']>[0]); return }
    if (method === 'changed') { api.changed(z.string().parse(args[0])); return }
    if (method === 'hooks.completeGoal') {
      const value = args[0] as HookEvents['goal.beforeComplete']
      const next = await api.hooks.dispatch('goal.beforeComplete', value); await next.commit(); return
    }
    if (method.startsWith('hooks.')) {
      const event = z.enum(['budget.committed', 'budget.beforeContinue', 'plan.implementationRequested', 'goal.beforeContinue', 'goal.replaced', 'goal.cleared', 'agent.patch', 'agent.settled']).parse(method.slice(6))
      const value = restoreRuntimeHook(event, args[0], api.tools.list())
      return describeRuntimeHook(event, await api.hooks.dispatch(event, value), true)
    }
    if (method === 'workspace.mount.verify') return this.kernel().workspaceSandboxes.verify(args[0] as Parameters<Kernel['workspaceSandboxes']['verify']>[0], args[1] instanceof AbortSignal ? args[1] : undefined)
    if (method === 'execution.isBoundWorktree') return this.kernel().sessionLaunchTargets.isBoundWorktreeExecutionRoot(z.string().parse(args[0]))
    const segments = method.split('.')
    let object: unknown, name: string | undefined
    if (segments[0] === 'service') {
      const serviceName = segments[1]; name = segments[2]
      const allowed = serviceName && Object.hasOwn(RUNTIME_PLUGIN_SERVICES, serviceName) ? RUNTIME_PLUGIN_SERVICES[serviceName as keyof typeof RUNTIME_PLUGIN_SERVICES] : []
      if (!name || !(allowed as readonly string[]).includes(name)) throw new HbarError('RUNTIME_METHOD_UNAVAILABLE', 'Undeclared service callback')
      object = api.service(serviceName ?? '')
    } else if (segments[0] === 'sessions' && ['get', 'list', 'children', 'events', 'readEventPage', 'create', 'submit', 'cancel', 'wake', 'snapshot', 'workspace', 'createWorkspace', 'append'].includes(segments[1] ?? '')) { object = api.sessions; name = segments[1] }
    else if (segments[0] === 'agentConfiguration' && ['read', 'initialize', 'policy', 'setPolicy'].includes(segments[1] ?? '')) { object = api.sessions.agentConfiguration; name = segments[1] }
    else if (method === 'userInput.request') { object = api.userInput; name = 'request' }
    else if (method === 'taskNotification' || method === 'automationSet') { object = api; name = method }
    else if (method === 'tools.validate' || method === 'tools.execute') {
      const tool = api.tools.get(z.string().parse(args[0])); if (!tool) throw new HbarError('TOOL_NOT_FOUND', 'The tool is outside this invocation')
      if (method === 'tools.validate') return tool.validate ? tool.validate(args[1]) : tool.inputSchema.parseAsync(args[1])
      const context = args[2]
      const execute: unknown = context && typeof context === 'object' ? Reflect.get(context, 'executeSequence') : undefined
      if (typeof execute !== 'function') throw new HbarError('RUNTIME_EXECUTION_REQUIRED', 'Nested tools need the Run admission gateway')
      const result: unknown = await Reflect.apply(execute, undefined, [[{ name: tool.name, arguments: z.record(z.string(), z.unknown()).parse(args[1]) }]])
      const entries = z.array(z.object({ text: z.string(), isError: z.boolean() })).parse(result)
      const entry = entries[0]; if (!entry) throw new HbarError('RUNTIME_TOOL_FAILED', 'Nested tool did not settle')
      return entry
    }
    const implementation: unknown = object && typeof object === 'object' && name ? Reflect.get(object, name) : undefined
    if (typeof implementation !== 'function') throw new HbarError('RUNTIME_METHOD_UNAVAILABLE', 'Undeclared host callback')
    return Reflect.apply(implementation, object, [...args])
  }
  dispose(): void { this.values.dispose() }
}
