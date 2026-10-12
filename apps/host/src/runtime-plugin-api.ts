import { AsyncLocalStorage } from 'node:async_hooks'
import { z } from 'zod'
import { HbarError, toolWindowContributionSchema, type ToolWindowContribution, type WireNotification } from '@hbar/contracts'
import { Context, HbarService, provide, service, type HbarAPI, type HookEvents, type HookRegistry, type ToolDefinition, type ToolRegistry } from '@hbar/plugin-sdk'
import { runtimeToolAdapter, describeRuntimeHook, restoreRuntimeHook, type RuntimePluginHook, type RuntimePluginTool } from '@hbar/plugin-sdk/runtime-plugin'
import { RUNTIME_PLUGIN_SERVICES } from './runtime-plugin-contract'

export type RuntimePluginHostInvoker = (method: string, args: readonly unknown[]) => Promise<unknown>
export interface RuntimePluginInvocationScope { readonly host: RuntimePluginHostInvoker; readonly tools: readonly ToolDefinition[]; readonly pending: Set<Promise<unknown>>;
  readonly mount?: { readonly root: string; readonly folders: readonly { readonly alias: string; readonly path: string }[] } }
const scope = new AsyncLocalStorage<RuntimePluginInvocationScope>()
export const runtimePluginInvocation = () => scope.getStore()
export const withRuntimePluginInvocation = <Result>(value: RuntimePluginInvocationScope, operation: () => Promise<Result>): Promise<Result> => scope.run(value, operation)

export class RuntimePluginHooks implements HookRegistry {
  readonly events = new Map<RuntimePluginHook, Set<(value: unknown) => unknown>>()
  on<Event extends keyof HookEvents>(event: Event, listener: (value: HookEvents[Event]) => void | HookEvents[Event] | Promise<void | HookEvents[Event]>) {
    const listeners = this.events.get(event) ?? new Set<(value: unknown) => unknown>()
    // Registration fixes the named Hook domain shape; listener functions remain in this owner.
    const invoke = listener as (value: unknown) => unknown
    listeners.add(invoke); this.events.set(event, listeners)
    return () => { listeners.delete(invoke); if (!listeners.size) this.events.delete(event) }
  }
  async dispatch<Event extends keyof HookEvents>(event: Event, value: HookEvents[Event]): Promise<HookEvents[Event]> {
    let current = value
    for (const listener of this.events.get(event) ?? []) {
      const next: unknown = await listener(current)
      if (next !== undefined) current = next as HookEvents[Event]
    }
    return current
  }
}
export function createRuntimePluginAPI(options: {
  readonly ctx: Context
  readonly hooks: RuntimePluginHooks
  readonly entries: Map<string, ToolDefinition>
  readonly panels: Map<string, ToolWindowContribution>
  readonly ownerId: string
  readonly preparing: () => boolean
  readonly fallback: RuntimePluginHostInvoker
  readonly resources: NonNullable<HbarAPI['resources']>
}): HbarAPI {
  const invoke = async <Result>(method: string, args: readonly unknown[]): Promise<Result> => {
    const host = scope.getStore()?.host ?? options.fallback
    const value = await host(method, args)
    // The declared named API supplies Result; transport graphs and method arguments are checked at the receiving owner.
    return value as Result
  }
  const observe = (method: string, args: readonly unknown[]) => {
    if (options.preparing()) return
    const task = invoke(method, args)
    scope.getStore()?.pending.add(task)
    task.catch(() => console.error('[hbar plugin] observer delivery failed'))
  }
  const tools: ToolRegistry = {
    register(tool) {
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(tool.name) || options.entries.has(tool.name) || options.entries.size >= 4_096)
        throw new HbarError('RUNTIME_TOOL_INVALID', 'Owned tool registration is invalid or exhausted')
      options.entries.set(tool.name, tool)
      return () => { if (options.entries.get(tool.name) === tool) options.entries.delete(tool.name) }
    },
    list: () => [...new Map([...(scope.getStore()?.tools ?? []), ...options.entries.values()].map(tool => [tool.name, tool])).values()],
    get: name => options.entries.get(name) ?? scope.getStore()?.tools.find(tool => tool.name === name),
  }
  const api: HbarAPI = {
    scope: { kind: 'host', id: 'host' }, restoreMode: 'projection', tools, resources: options.resources,
    hooks: { on: (event, listener) => options.hooks.on(event, listener),
      dispatch: async (event, value) => {
        if (event === 'goal.beforeComplete') {
          const original = value as HookEvents['goal.beforeComplete']
          return { ...original, commit: () => invoke<void>('hooks.completeGoal', [original]) } as HookEvents[typeof event]
        }
        const data = await invoke(`hooks.${event}`, [describeRuntimeHook(event, value)])
        return restoreRuntimeHook(event, data, tools.list(), value)
      },
    },
    sessions: {
      get: id => invoke('sessions.get', [id]), list: workspaceId => invoke('sessions.list', [workspaceId]),
      children: (id, after, limit) => invoke('sessions.children', [id, after, limit]), events: (id, after, limit) => invoke('sessions.events', [id, after, limit]),
      readEventPage: (input) => invoke('sessions.readEventPage', [input]),
      create: (id, title, parentId) => invoke('sessions.create', [id, title, parentId]), submit: (...args) => invoke('sessions.submit', args),
      cancel: id => invoke('sessions.cancel', [id]), wake: id => observe('sessions.wake', [id]), snapshot: id => invoke('sessions.snapshot', [id]),
      workspace: id => invoke('sessions.workspace', [id]), createWorkspace: path => invoke('sessions.createWorkspace', [path]),
      append: (...args) => invoke('sessions.append', args),
      agentConfiguration: { read: (...args) => invoke('agentConfiguration.read', args), initialize: (...args) => invoke('agentConfiguration.initialize', args),
        policy: (...args) => invoke('agentConfiguration.policy', args), setPolicy: (...args) => invoke('agentConfiguration.setPolicy', args) },
    },
    userInput: { request: (...args) => invoke('userInput.request', args) },
    notify: (event: WireNotification) => observe('notify', [event]), changed: kind => observe('changed', [kind]),
    taskNotification: (...args) => invoke('taskNotification', args), automationSet: (...args) => invoke('automationSet', args),
    service: <Capability>(name: string) => service<Capability>(options.ctx, name),
    panels: { register: panel => {
      const contribution = toolWindowContributionSchema.parse({ ...panel, owner: options.ownerId })
      if (options.panels.has(contribution.id) || options.panels.size >= 256) throw new HbarError('RUNTIME_PANEL_INVALID', 'Owned panel registration is invalid or exhausted')
      options.panels.set(contribution.id, contribution)
      return () => { if (options.panels.get(contribution.id) === contribution) options.panels.delete(contribution.id) }
    } },
  }
  new HbarService(options.ctx, api)
  return api
}
export function provideRuntimePluginDependencies(ctx: Context, names: readonly string[], fallback: RuntimePluginHostInvoker): void {
  for (const name of names) {
    if (!Object.hasOwn(RUNTIME_PLUGIN_SERVICES, name)) throw new HbarError('RUNTIME_RESTART_REQUIRED', 'The plugin needs an undeclared capability adapter')
    const methods = RUNTIME_PLUGIN_SERVICES[name as keyof typeof RUNTIME_PLUGIN_SERVICES]
    const value: Record<string, unknown> = {}
    for (const method of methods) value[method] = (...args: unknown[]) => {
      const host = scope.getStore()?.host ?? fallback
      return host(`service.${name}.${method}`, args)
    }
    provide(ctx, name, value)
  }
}
export function runtimePluginInvocationTools(descriptions: readonly RuntimePluginTool[], host: RuntimePluginHostInvoker): ToolDefinition[] {
  return descriptions.map(description => runtimeToolAdapter(description, {
    validate: (name, args) => host('tools.validate', [name, args]), execute: (name, args, context) => host('tools.execute', [name, args, context]),
  }))
}
export const runtimePluginHostMethodSchema = z.string().min(1).max(160).regex(/^[A-Za-z][A-Za-z0-9_.-]+$/)
