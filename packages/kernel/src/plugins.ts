import { mkdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, relative, isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context, HbarService, service } from '@hbar/plugin-sdk'
import type {
  Disposer,
  HbarAPI,
  HbarPlugin,
  HookEvents,
  HookRegistry,
  PluginManifest,
  ScopeDescriptor,
  ScopeKind,
  ToolDefinition,
  ToolRegistry,
} from '@hbar/plugin-sdk'
import type { PluginInfo, UIContribution } from '@hbar/contracts'
import { HbarError, terminalCommandSchema } from '@hbar/contracts'
import { satisfies, valid } from 'semver'
import { z } from 'zod'
import type { StoragePort } from '@hbar/storage'
import {
  installPluginTree,
  packageNameSchema,
  pluginDirectory,
  readPluginPackage,
  stagePlugin,
  treeIntegrity,
} from './plugin-package.ts'

export class Tools implements ToolRegistry {
  constructor(private parent?: ToolRegistry) {}
  private entries = new Map<string, ToolDefinition>()
  register(tool: ToolDefinition): Disposer {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(tool.name)) throw new Error(`Invalid tool name: ${tool.name}`)
    if (this.entries.has(tool.name)) throw new Error(`Duplicate tool: ${tool.name}`)
    this.entries.set(tool.name, tool)
    return () => {
      if (this.entries.get(tool.name) === tool) this.entries.delete(tool.name)
    }
  }
  get(name: string) {
    return this.entries.get(name) ?? this.parent?.get(name)
  }
  list() {
    return [
      ...new Map([...(this.parent?.list() ?? []), ...this.entries.values()].map((tool) => [tool.name, tool])).values(),
    ]
  }
}
export class Hooks implements HookRegistry {
  constructor(private parent?: HookRegistry) {}
  private entries = new Map<string, Set<(value: unknown) => unknown>>()
  on<K extends keyof HookEvents>(
    event: K,
    listener: (value: HookEvents[K]) => void | HookEvents[K] | Promise<void | HookEvents[K]>,
  ): Disposer {
    const set = this.entries.get(event) ?? new Set()
    const fn = listener as (value: unknown) => unknown
    set.add(fn)
    this.entries.set(event, set)
    return () => {
      set.delete(fn)
      if (!set.size) this.entries.delete(event)
    }
  }
  async dispatch<K extends keyof HookEvents>(event: K, value: HookEvents[K]): Promise<HookEvents[K]> {
    let current = this.parent ? await this.parent.dispatch(event, value) : value
    for (const listener of this.entries.get(event) ?? []) {
      const result = await listener(current)
      if (result !== undefined) current = result as HookEvents[K]
    }
    return current
  }
}
const manifestSchema = z.object({
  id: z.union([z.string().regex(/^[a-z][a-z0-9.-]{0,95}$/), packageNameSchema]),
  packageName: packageNameSchema.optional(),
  name: z.string().min(1),
  version: z.string().refine((v) => Boolean(valid(v))),
  apiVersion: z.string(),
  description: z.string(),
  scope: z.enum(['host', 'workspace', 'session', 'run', 'client']),
  installScope: z.enum(['global', 'project']).optional(),
  required: z.boolean().optional(),
  restartRequired: z.boolean().optional(),
  provides: z.record(z.string(), z.string()).optional(),
  requires: z.record(z.string(), z.string()).optional(),
  optional: z.record(z.string(), z.string()).optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
  peerDependencies: z.record(z.string(), z.string()).optional(),
  optionalDependencies: z.record(z.string(), z.string()).optional(),
  activationEvents: z.array(z.string()).optional(),
  contributes: z
    .object({
      commands: z.array(terminalCommandSchema),
      panels: z.array(z.record(z.string(), z.unknown())),
      renderers: z.array(z.record(z.string(), z.unknown())),
    })
    .optional(),
  permissions: z.array(z.string()),
  clientEntry: z.string().optional(),
})
interface Installed {
  plugin: HbarPlugin
  enabled: boolean
  config: Record<string, unknown>
  path?: string | undefined
  info: PluginInfo
  clientCode?: string | undefined
  dispose?: Disposer | undefined
  projectId?: string | undefined
}
export interface RuntimeScope {
  ctx: Context
  tools: Tools
  hooks: Hooks
  descriptor: ScopeDescriptor
  dispose(): Promise<void>
}

function packageId(manifest: PluginManifest) {
  return manifest.packageName ?? manifest.id
}

export function packageDependencyOrder(manifests: PluginManifest[]): string[] {
  const byPackage = new Map(manifests.map((manifest) => [packageId(manifest), manifest]))
  if (byPackage.size !== manifests.length) throw new HbarError('PLUGIN_CONFLICT', 'Duplicate plugin package id')
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const order: string[] = []
  const visit = (manifest: PluginManifest, chain: string[]) => {
    const id = packageId(manifest)
    if (visiting.has(id)) throw new HbarError('PLUGIN_CYCLE', [...chain, id].join(' -> '))
    if (visited.has(id)) return
    visiting.add(id)
    for (const [dependency, range] of Object.entries({
      ...manifest.peerDependencies,
      ...manifest.dependencies,
    })) {
      const upstream = byPackage.get(dependency)
      if (!upstream)
        throw new HbarError(
          'PLUGIN_DEPENDENCY',
          `${id} requires ${dependency}@${range}; install the missing dependency before enabling ${id}`,
        )
      if (!satisfies(upstream.version, range))
        throw new HbarError(
          'PLUGIN_VERSION',
          `${id} requires ${dependency}@${range}, found ${upstream.version}; install a compatible version first`,
        )
      visit(upstream, [...chain, id])
    }
    for (const [dependency, range] of Object.entries(manifest.optionalDependencies ?? {})) {
      const upstream = byPackage.get(dependency)
      if (upstream && satisfies(upstream.version, range)) visit(upstream, [...chain, id])
    }
    visiting.delete(id)
    visited.add(id)
    order.push(manifest.id)
  }
  for (const manifest of manifests) visit(manifest, [])
  return order
}

export function dependencyOrder(manifests: PluginManifest[]): string[] {
  const providers = new Map<string, { id: string; version: string }>()
  const map = new Map(manifests.map((m) => [m.id, m]))
  if (map.size !== manifests.length) throw new HbarError('PLUGIN_CONFLICT', 'Duplicate plugin id')
  for (const manifest of manifests) {
    manifestSchema.parse(manifest)
    if (!satisfies('1.0.0', manifest.apiVersion))
      throw new HbarError('PLUGIN_VERSION', `Incompatible API: ${manifest.id}`)
    for (const [name, version] of Object.entries(manifest.provides ?? {})) {
      if (providers.has(name)) throw new HbarError('PLUGIN_CONFLICT', `Multiple providers for ${name}`)
      if (!valid(version)) throw new HbarError('PLUGIN_VERSION', `Invalid service version: ${name}`)
      providers.set(name, { id: manifest.id, version })
    }
  }
  const visited = new Set<string>(),
    visiting = new Set<string>(),
    order: string[] = []
  function visit(id: string, chain: string[]) {
    if (visiting.has(id)) throw new HbarError('PLUGIN_CYCLE', [...chain, id].join(' -> '))
    if (visited.has(id)) return
    const manifest = map.get(id)!
    visiting.add(id)
    const dependencies = { ...manifest.optional, ...manifest.requires }
    for (const [name, range] of Object.entries(dependencies)) {
      const provider = providers.get(name)
      if (!provider && manifest.requires?.[name])
        throw new HbarError('PLUGIN_DEPENDENCY', `${id} requires ${name}@${range}`)
      if (!provider) continue
      const depth = { host: 0, workspace: 1, session: 2, run: 3, client: 1 }
      const providerScope = map.get(provider.id)!.scope
      if (
        depth[providerScope] > depth[manifest.scope] ||
        (providerScope === 'client' && manifest.scope !== 'client') ||
        (manifest.scope === 'client' && !['host', 'client'].includes(providerScope))
      )
        throw new HbarError('PLUGIN_SCOPE', `${id} cannot depend on the narrower ${providerScope} service ${name}`)
      if (!satisfies(provider.version, range))
        throw new HbarError('PLUGIN_VERSION', `${id} requires ${name}@${range}, found ${provider.version}`)
      if (provider.id !== id) visit(provider.id, [...chain, id])
      else throw new HbarError('PLUGIN_CYCLE', `${id} depends on its own service ${name}`)
    }
    visiting.delete(id)
    visited.add(id)
    order.push(id)
  }
  for (const manifest of manifests) visit(manifest.id, [])
  return order
}

export class PluginManager {
  readonly ctx = new Context()
  readonly panels = new Map<string, UIContribution>()
  private entries = new Map<string, Installed>()
  private mounted: string[] = []
  private scopes = new Map<string, Promise<RuntimeScope>>()
  constructor(
    private storage: StoragePort,
    private api: Omit<HbarAPI, 'panels' | 'service' | 'scope'>,
    private options: { pluginRoot?: string; pluginLock?: string; pluginExtract?: string } = {},
  ) {
    new HbarService(this.ctx, this.makeAPI('core', this.ctx))
  }
  private makeAPI(
    owner: string,
    ctx: Context,
    scope: ScopeDescriptor = { kind: 'host', id: 'host' },
    tools = this.api.tools,
    hooks = this.api.hooks,
  ): HbarAPI {
    return {
      ...this.api,
      scope,
      tools: {
        list: () => tools.list(),
        get: (name) => tools.get(name),
        register: (tool) => ctx.effect(() => tools.register(tool)),
      },
      hooks: {
        dispatch: (name, value) => hooks.dispatch(name, value),
        on: (name, listener) => ctx.effect(() => hooks.on(name, listener)),
      },
      service: (name) => service(ctx, name),
      panels: {
        register: (panel) =>
          ctx.effect(() => {
            const id = `${owner}:${scope.kind === 'host' ? '' : `${scope.id}:`}${panel.id}`
            if (this.panels.has(id)) throw new Error(`Duplicate panel ${id}`)
            this.panels.set(id, { ...panel, id, owner })
            return () => {
              this.panels.delete(id)
            }
          }),
      },
    }
  }
  add(plugin: HbarPlugin, path?: string, projectId?: string) {
    const manifest = manifestSchema.parse(plugin.manifest)
    if (this.entries.has(manifest.id)) throw new HbarError('PLUGIN_CONFLICT', `Already installed: ${manifest.id}`)
    this.entries.set(manifest.id, {
      plugin,
      enabled: true,
      config: {},
      path,
      projectId,
      info: {
        id: manifest.id,
        packageName: manifest.packageName,
        name: manifest.name,
        version: manifest.version,
        required: Boolean(manifest.required),
        status: 'disabled',
        description: manifest.description,
        provides: Object.keys(manifest.provides ?? {}),
        requires: Object.keys(manifest.requires ?? {}),
        config: {},
        installScope: manifest.installScope,
        runtimeScope: manifest.scope,
        dependencies: manifest.dependencies,
        peerDependencies: manifest.peerDependencies,
        optionalDependencies: manifest.optionalDependencies,
        activationEvents: manifest.activationEvents,
        contributes: manifest.contributes,
        terminalCommands: manifest.contributes?.commands,
        path,
        projectId,
      },
    })
  }
  replace(id: string, plugin: HbarPlugin) {
    if (this.mounted.length) throw new HbarError('RESTART_REQUIRED', 'Provider replacement requires a Host restart')
    const existing = this.entries.get(id)
    if (!existing) throw new HbarError('NOT_FOUND', `No default plugin ${id}`)
    if (id === 'storage.sqlite') throw new HbarError('STORAGE_PROFILE', 'Select storage through profile.createStorage')
    for (const [name, version] of Object.entries(existing.plugin.manifest.provides ?? {})) {
      if (!plugin.manifest.provides?.[name] || !satisfies(plugin.manifest.provides[name]!, `^${version}`))
        throw new HbarError('PLUGIN_DEPENDENCY', `Replacement must provide ${name}@^${version}`)
    }
    if (plugin.manifest.scope !== existing.plugin.manifest.scope)
      throw new HbarError('PLUGIN_SCOPE', 'Replacement must use the same scope')
    this.entries.delete(id)
    this.add({
      ...plugin,
      manifest: {
        ...plugin.manifest,
        required: existing.plugin.manifest.required,
        restartRequired: existing.plugin.manifest.restartRequired,
      },
    })
  }
  async loadLocal(path: string, projectId?: string) {
    const root = await realpath(path)
    const pkg = await readPluginPackage(root)
    const entry = await realpath(resolve(root, pkg.hbar.host))
    const rel = relative(root, entry)
    if (rel.startsWith('..') || isAbsolute(rel))
      throw new HbarError('PLUGIN_MANIFEST', 'Host entry must be inside the plugin directory')
    const loaded = (await import(pathToFileURL(entry).href)) as { default?: HbarPlugin }
    if (!loaded.default || typeof loaded.default.apply !== 'function')
      throw new HbarError('PLUGIN_MANIFEST', 'Export a default HbarPlugin')
    const plugin: HbarPlugin = {
      ...loaded.default,
      manifest: manifestSchema.parse({
        ...loaded.default.manifest,
        id: pkg.name,
        packageName: pkg.name,
        version: pkg.version,
        apiVersion: pkg.hbar.apiVersion,
        installScope: pkg.hbar.scope,
        scope: pkg.hbar.runtimeScope ?? loaded.default.manifest.scope,
        clientEntry: pkg.hbar.client ?? loaded.default.manifest.clientEntry,
        dependencies: pkg.hbar.dependencies,
        peerDependencies: pkg.hbar.peerDependencies,
        optionalDependencies: pkg.hbar.optionalDependencies,
        activationEvents: pkg.hbar.activationEvents,
        contributes: pkg.hbar.contributes,
        permissions: pkg.hbar.permissions.length ? pkg.hbar.permissions : loaded.default.manifest.permissions,
      }),
    }
    if (pkg.hbar.scope === 'project' && !projectId)
      throw new HbarError('PLUGIN_SCOPE', `Project plugin ${pkg.name} has no project owner`)
    if (pkg.hbar.scope === 'project' && ['host', 'client'].includes(plugin.manifest.scope))
      throw new HbarError('PLUGIN_SCOPE', 'Project plugins must use workspace, session, or run runtime scope')
    this.add(plugin, root, projectId)
    if (plugin.manifest.clientEntry) {
      try {
        const clientEntry = await realpath(resolve(root, plugin.manifest.clientEntry))
        const clientRelative = relative(root, clientEntry)
        if (clientRelative.startsWith('..') || isAbsolute(clientRelative))
          throw new HbarError('PLUGIN_MANIFEST', 'Client entry must be inside the plugin directory')
        const result = await Bun.build({ entrypoints: [clientEntry], target: 'browser', minify: true })
        if (!result.success) throw new AggregateError(result.logs, 'Client plugin build failed')
        if (result.outputs.length !== 1)
          throw new HbarError('PLUGIN_MANIFEST', 'Client entry must bundle into one self-contained JavaScript module')
        const installed = this.entries.get(plugin.manifest.id)!
        installed.clientCode = await result.outputs[0]!.text()
        installed.info.clientEntry = `/api/plugins/${encodeURIComponent(installed.info.id)}/client.js?v=${createHash('sha256').update(installed.clientCode).digest('hex').slice(0, 12)}`
      } catch (error) {
        this.entries.delete(plugin.manifest.id)
        throw error
      }
    }
    return plugin.manifest.id
  }
  async start() {
    for (const stored of await this.storage.call('plugins')) {
      if (stored.path && !this.entries.has(stored.id)) {
        try {
          const relativePath = this.options.pluginRoot
            ? relative(this.options.pluginRoot, stored.path).replaceAll('\\', '/')
            : ''
          const projectId = relativePath.startsWith('projects/') ? relativePath.split('/')[1] : undefined
          await this.loadLocal(stored.path, projectId)
        } catch (error) {
          console.error(`Plugin ${stored.id}:`, error)
        }
      }
      const entry = this.entries.get(stored.id)
      if (entry) {
        entry.enabled = Boolean(entry.plugin.manifest.required) || stored.enabled
        entry.config = stored.config
      }
    }
    await this.mountAll()
  }
  openScope(kind: Exclude<ScopeKind, 'host'>, id: string, parent?: RuntimeScope): Promise<RuntimeScope> {
    const key = `${kind}:${id}`
    const existing = this.scopes.get(key)
    if (existing) return existing
    const pending = this.mountScope(kind, id, parent).catch((error) => {
      this.scopes.delete(key)
      throw error
    })
    this.scopes.set(key, pending)
    return pending
  }
  private async mountScope(kind: Exclude<ScopeKind, 'host'>, id: string, parent?: RuntimeScope): Promise<RuntimeScope> {
    const descriptor: ScopeDescriptor = { ...parent?.descriptor, kind, id, [`${kind}Id`]: id }
    const tools = new Tools(parent?.tools ?? this.api.tools),
      hooks = new Hooks(parent?.hooks ?? this.api.hooks)
    const workspaceId = descriptor.workspaceId
    const entries = [...this.entries.values()].filter(
      (entry) => entry.enabled && (!entry.projectId || entry.projectId === workspaceId),
    )
    const order = dependencyOrder(entries.map((e) => e.plugin.manifest))
    const local = order.map((key) => this.entries.get(key)!).filter((e) => e.plugin.manifest.scope === kind)
    let owned!: Context
    const fiber = (parent?.ctx ?? this.ctx).plugin({
      name: `scope:${kind}:${id}`,
      apply: (ctx) => {
        owned = ['hbar', ...local.flatMap((entry) => Object.keys(entry.plugin.manifest.provides ?? {}))].reduce(
          (current, name) => current.isolate(name),
          ctx,
        )
        new HbarService(owned, this.makeAPI('core', owned, descriptor, tools, hooks))
      },
    })
    try {
      await fiber.await()
      fiber.assertActive()
      for (const entry of local) {
        const manifest = entry.plugin.manifest
        let error: unknown
        const instance = owned.plugin({
          name: manifest.id,
          inject: ['hbar', ...Object.keys(manifest.requires ?? {})],
          apply: async (ctx) => {
            const pluginContext = ctx.isolate('hbar')
            new HbarService(pluginContext, this.makeAPI(manifest.id, pluginContext, descriptor, tools, hooks))
            try {
              await entry.plugin.apply(pluginContext, entry.plugin.configSchema?.parse(entry.config) ?? entry.config)
            } catch (failure) {
              error = failure
              throw failure
            }
          },
        })
        await instance.await()
        if (error) throw error
        instance.assertActive()
        for (const name of Object.keys(manifest.provides ?? {})) service(owned, name)
      }
      return {
        ctx: owned,
        tools,
        hooks,
        descriptor,
        dispose: async () => {
          this.scopes.delete(`${kind}:${id}`)
          await fiber.dispose()
        },
      }
    } catch (error) {
      await fiber.dispose()
      throw error
    }
  }
  private async mountAll() {
    const active = [...this.entries.values()].filter((entry) => entry.enabled && !entry.projectId)
    packageDependencyOrder(active.map((entry) => entry.plugin.manifest))
    const order = dependencyOrder(active.map((entry) => entry.plugin.manifest))
    try {
      for (const id of order) {
        const entry = this.entries.get(id)!
        const manifest = entry.plugin.manifest
        const config = entry.plugin.configSchema ? entry.plugin.configSchema.parse(entry.config) : entry.config
        if (manifest.scope !== 'host') {
          entry.info = { ...entry.info, status: 'active', config }
          continue
        }
        let startupError: unknown
        const fiber = this.ctx.plugin({
          name: id,
          inject: ['hbar', ...Object.keys(manifest.requires ?? {})],
          apply: async (ctx) => {
            const owned = ctx.isolate('hbar')
            new HbarService(owned, this.makeAPI(id, owned))
            try {
              await entry.plugin.apply(owned, config)
            } catch (error) {
              startupError = error
              throw error
            }
          },
        })
        entry.dispose = fiber.dispose
        this.mounted.push(id)
        await fiber.await()
        if (startupError) throw startupError
        fiber.assertActive()
        for (const name of Object.keys(manifest.provides ?? {})) service(this.ctx, name)
        entry.info = { ...entry.info, status: 'active', config }
      }
    } catch (error) {
      await this.unmountAll()
      throw error
    }
  }
  private async unmountAll() {
    for (const scope of [...this.scopes.values()].reverse()) await (await scope).dispose()
    this.scopes.clear()
    for (const id of [...this.mounted].reverse()) {
      const entry = this.entries.get(id)!
      await entry.dispose?.()
      entry.dispose = undefined
      entry.info.status = 'disabled'
    }
    this.mounted = []
  }
  async set(id: string, enabled: boolean, config?: Record<string, unknown>) {
    const entry = this.entries.get(id)
    if (!entry) throw new HbarError('NOT_FOUND', 'Plugin not found')
    if (entry.plugin.manifest.required && !enabled)
      throw new HbarError('REQUIRED_PLUGIN', 'This capability is required by the active profile')
    if (entry.plugin.manifest.restartRequired)
      throw new HbarError('RESTART_REQUIRED', 'Change this provider through the startup profile and restart the host')
    const old = new Map(
      [...this.entries].map(([key, value]) => [key, { enabled: value.enabled, config: value.config }]),
    )
    if (enabled) {
      const byPackage = new Map([...this.entries.values()].map((value) => [packageId(value.plugin.manifest), value]))
      const enable = (value: Installed, chain: string[]) => {
        const name = packageId(value.plugin.manifest)
        if (chain.includes(name)) throw new HbarError('PLUGIN_CYCLE', [...chain, name].join(' -> '))
        for (const [dependency, range] of Object.entries({
          ...value.plugin.manifest.peerDependencies,
          ...value.plugin.manifest.dependencies,
        })) {
          const upstream = byPackage.get(dependency)
          if (!upstream) throw new HbarError('PLUGIN_DEPENDENCY', `${name} requires missing ${dependency}@${range}`)
          if (!satisfies(upstream.plugin.manifest.version, range))
            throw new HbarError(
              'PLUGIN_VERSION',
              `${name} requires ${dependency}@${range}, found ${upstream.plugin.manifest.version}`,
            )
          enable(upstream, [...chain, name])
        }
        value.enabled = true
      }
      enable(entry, [])
    } else {
      const name = packageId(entry.plugin.manifest)
      const dependent = [...this.entries.values()].find(
        (value) =>
          value.enabled &&
          value !== entry &&
          Boolean(value.plugin.manifest.dependencies?.[name] ?? value.plugin.manifest.peerDependencies?.[name]),
      )
      if (dependent)
        throw new HbarError(
          'PLUGIN_DEPENDENCY',
          `${packageId(dependent.plugin.manifest)} depends on ${name}; disable it first`,
        )
      entry.enabled = false
    }
    entry.config = config ?? entry.config
    try {
      packageDependencyOrder([...this.entries.values()].filter((e) => e.enabled).map((e) => e.plugin.manifest))
      dependencyOrder([...this.entries.values()].filter((e) => e.enabled).map((e) => e.plugin.manifest))
      entry.plugin.configSchema?.parse(entry.config)
      await this.unmountAll()
      await this.mountAll()
      await this.storage.call(
        'setPlugins',
        [...this.entries].map(([key, value]) => ({
          id: key,
          enabled: value.enabled,
          config: value.config,
          path: value.path,
        })),
      )
      await this.writeLock()
    } catch (error) {
      for (const [key, state] of old) {
        const value = this.entries.get(key)
        if (value) Object.assign(value, state)
      }
      await this.storage.call(
        'setPlugins',
        [...old].map(([key, state]) => ({
          id: key,
          enabled: state.enabled,
          config: state.config,
          path: this.entries.get(key)?.path,
        })),
      )
      if (!this.mounted.length) await this.mountAll()
      throw error
    }
    return this.list()
  }
  async install(path: string, projectId?: string) {
    if (!this.options.pluginRoot || !this.options.pluginExtract)
      throw new HbarError('PLUGIN_STORAGE', 'Managed plugin directories are not configured')
    const staged = await stagePlugin(path, this.options.pluginExtract)
    let destination = ''
    let id = ''
    let installedTree = false
    try {
      const pkg = await readPluginPackage(staged.root)
      if (this.entries.has(pkg.name)) throw new HbarError('PLUGIN_CONFLICT', `Already installed: ${pkg.name}`)
      if (pkg.hbar.scope === 'project' && !projectId)
        throw new HbarError('PLUGIN_SCOPE', 'Project plugin installation requires a project id')
      destination = pluginDirectory(
        pkg.hbar.scope === 'global'
          ? join(this.options.pluginRoot, 'global')
          : join(this.options.pluginRoot, 'projects', projectId!),
        pkg.name,
      )
      await installPluginTree(staged.root, destination)
      installedTree = true
      id = await this.loadLocal(destination, projectId)
      const entry = this.entries.get(id)!
      entry.enabled = false
      return await this.set(id, true)
    } catch (error) {
      if (id) this.entries.delete(id)
      if (installedTree) await rm(destination, { recursive: true, force: true })
      throw error
    } finally {
      await staged.cleanup()
    }
  }
  async remove(id: string) {
    const entry = this.entries.get(id)
    if (!entry) throw new HbarError('NOT_FOUND', 'Plugin not found')
    if (entry.plugin.manifest.required) throw new HbarError('REQUIRED_PLUGIN', 'Required plugins cannot be removed')
    if (entry.enabled) throw new HbarError('PLUGIN_ACTIVE', 'Disable the plugin before removing it')
    this.entries.delete(id)
    try {
      await this.storage.call('removePlugin', id)
      await this.writeLock()
      if (entry.path && this.options.pluginRoot) {
        const rel = relative(this.options.pluginRoot, entry.path)
        if (rel.startsWith('..') || isAbsolute(rel))
          throw new HbarError('PLUGIN_STORAGE', 'Refusing to remove an unmanaged path')
        await rm(entry.path, { recursive: true, force: true })
      }
    } catch (error) {
      this.entries.set(id, entry)
      await this.storage.call('setPlugin', id, entry.enabled, entry.config, entry.path)
      throw error
    }
    return this.list()
  }
  graph() {
    const nodes = [...this.entries.values()].map((entry) => ({
      id: packageId(entry.plugin.manifest),
      version: entry.plugin.manifest.version,
      enabled: entry.enabled,
    }))
    const edges = [...this.entries.values()].flatMap((entry) => {
      const from = packageId(entry.plugin.manifest)
      return [
        ...Object.entries(entry.plugin.manifest.dependencies ?? {}).map(([to, range]) => ({
          from,
          to,
          range,
          kind: 'dependency',
        })),
        ...Object.entries(entry.plugin.manifest.peerDependencies ?? {}).map(([to, range]) => ({
          from,
          to,
          range,
          kind: 'peerDependency',
        })),
        ...Object.entries(entry.plugin.manifest.optionalDependencies ?? {}).map(([to, range]) => ({
          from,
          to,
          range,
          kind: 'optionalDependency',
        })),
      ]
    })
    return { nodes, edges }
  }
  resolve(id?: string) {
    const entries = [...this.entries.values()].filter((entry) => entry.enabled || entry.info.id === id)
    const order = packageDependencyOrder(entries.map((entry) => entry.plugin.manifest))
    dependencyOrder(entries.map((entry) => entry.plugin.manifest))
    return { order, enabled: entries.map((entry) => entry.info.id) }
  }
  doctor() {
    try {
      return { ok: true, errors: [], order: this.resolve().order }
    } catch (error) {
      return { ok: false, errors: [error instanceof Error ? error.message : String(error)] }
    }
  }
  async lock() {
    return this.lockData()
  }
  private async lockData() {
    const plugins: Record<string, unknown> = {}
    for (const entry of this.entries.values()) {
      if (!entry.path) continue
      const manifest = entry.plugin.manifest
      plugins[packageId(manifest)] = {
        version: manifest.version,
        scope: manifest.installScope ?? 'global',
        source: 'local',
        path: this.options.pluginRoot
          ? relative(this.options.pluginRoot, entry.path).replaceAll('\\', '/')
          : entry.path,
        integrity: await treeIntegrity(entry.path),
        enabled: entry.enabled,
        dependencies: manifest.dependencies ?? {},
        peerDependencies: manifest.peerDependencies ?? {},
        optionalDependencies: manifest.optionalDependencies ?? {},
        activationEvents: manifest.activationEvents ?? [],
        contributes: manifest.contributes ?? { commands: [], panels: [], renderers: [] },
      }
    }
    return { version: 1 as const, plugins }
  }
  private async writeLock() {
    if (!this.options.pluginLock) return
    const temporary = `${this.options.pluginLock}.${process.pid}.tmp`
    await mkdir(resolve(this.options.pluginLock, '..'), { recursive: true })
    await writeFile(temporary, `${JSON.stringify(await this.lockData(), null, 2)}\n`, { mode: 0o600 })
    try {
      await rename(temporary, this.options.pluginLock)
    } finally {
      await rm(temporary, { force: true })
    }
  }
  list(): PluginInfo[] {
    return [...this.entries.values()].map((e) => ({
      ...e.info,
      config: e.info.status === 'active' ? e.info.config : e.config,
    }))
  }
  clientCode(id: string): string {
    const entry = this.entries.get(id)
    if (entry?.info.status !== 'active' || !entry.clientCode)
      throw new HbarError('NOT_FOUND', 'Active client plugin not found')
    return entry.clientCode
  }
  get<T>(name: string): T {
    return service<T>(this.ctx, name)
  }
  async close() {
    await this.unmountAll()
    await this.ctx.fiber.dispose()
  }
}
