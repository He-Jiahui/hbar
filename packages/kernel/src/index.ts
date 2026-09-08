import { readdir, realpath, stat, writeFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { HbarError, approvalModeSchema, inputSchema, providerSchema } from '@hbar/contracts'
import type {
  Approval,
  ArtifactRef,
  Bootstrap,
  ContentBlock,
  HostInfo,
  LiveStream,
  ModelInfo,
  ProviderConfig,
  Run,
  SessionEvent,
  SessionSnapshot,
  UserInput,
  WireNotification,
} from '@hbar/contracts'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type {
  CompactionProvider,
  DriverInput,
  HarnessDriver,
  ModelRegistry,
  ModelRequest,
  ModeService,
  PolicyProvider,
  ToolContext,
  ToolResult,
} from '@hbar/plugin-sdk'
import { Storage, ensurePathLayout, resolvePathLayout, validatePathRoots, writePathPointer } from '@hbar/storage'
import type { PathLayout, StoragePort } from '@hbar/storage'
import type { HbarPlugin } from '@hbar/plugin-sdk'
import piPlugin from '@hbar/pi-driver'
import localTools, { executionPlugin, LocalExecution } from '@hbar/local-tools'
import goalPlugin from '@hbar/goal'
import planPlugin from '@hbar/plan'
import budgetPlugin from '@hbar/budget'
import gitPlugin from '@hbar/git'
import browserPlugin from '@hbar/browser-use'
import computerPlugin from '@hbar/computer-use'
import { Hooks, PluginManager, Tools } from './plugins.ts'
import type { RuntimeScope } from './plugins.ts'
export type { RuntimeScope } from './plugins.ts'

const MAX_ARTIFACT_BYTES = 10 * 1024 * 1024
const MAX_ATTACHMENTS = 12
const MAX_FILE_TEXT = 120_000
const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const
const TEXT_EXTENSIONS = new Set([
  '.c',
  '.cc',
  '.cfg',
  '.conf',
  '.cpp',
  '.css',
  '.csv',
  '.h',
  '.hpp',
  '.html',
  '.ini',
  '.java',
  '.js',
  '.json',
  '.jsx',
  '.log',
  '.md',
  '.mjs',
  '.rs',
  '.scss',
  '.sh',
  '.sql',
  '.svg',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
  '.xml',
])
function isImageMime(mime: string): boolean {
  return (IMAGE_MIMES as readonly string[]).includes(mime)
}
function isTextArtifact(mime: string, name: string): boolean {
  if (mime.startsWith('text/')) return true
  if (
    [
      'application/json',
      'application/ld+json',
      'application/javascript',
      'application/typescript',
      'application/xml',
      'application/x-sh',
      'application/x-yaml',
    ].includes(mime)
  )
    return true
  const dot = name.lastIndexOf('.')
  return dot >= 0 && TEXT_EXTENSIONS.has(name.slice(dot).toLowerCase())
}

export interface SecretStore {
  get(id: string): Promise<string | null>
  set(id: string, value: string): Promise<void>
  delete(id: string): Promise<void>
}
export class MemorySecrets implements SecretStore {
  private values = new Map<string, string>()
  async get(id: string) {
    return this.values.get(id) ?? null
  }
  async set(id: string, value: string) {
    this.values.set(id, value)
  }
  async delete(id: string) {
    this.values.delete(id)
  }
}
class NativeSecrets implements SecretStore {
  constructor(private namespace: string) {}
  get(id: string) {
    return Bun.secrets.get({ service: this.namespace, name: id })
  }
  async set(id: string, value: string) {
    await Bun.secrets.set({ service: this.namespace, name: id, value })
  }
  async delete(id: string) {
    await Bun.secrets.delete({ service: this.namespace, name: id })
  }
}
export interface KernelOptions {
  /** Former single-root option, retained for embedded and test callers. */
  home?: string | undefined
  dataRoot?: string | undefined
  cacheRoot?: string | undefined
  pointerFile?: string | undefined
  layout?: PathLayout | undefined
  demo?: boolean | undefined
  workspace?: string | undefined
  secrets?: SecretStore | undefined
  profile?: KernelProfile | undefined
}
interface ResolvedKernelOptions extends KernelOptions {
  home: string
  layout: PathLayout
}
export interface KernelProfile {
  replacements?: Record<string, HbarPlugin>
  plugins?: HbarPlugin[]
  createStorage?(home: string): Promise<StoragePort>
}
interface ActiveRun {
  run: Run
  controller: AbortController
  context: { dispose(): Promise<void> }
}

export class Kernel {
  readonly storage: StoragePort
  readonly tools = new Tools()
  readonly hooks = new Hooks()
  readonly plugins: PluginManager
  readonly instanceId = crypto.randomUUID()
  readonly secrets: SecretStore
  readonly streams = new Map<string, LiveStream>()
  private streamPublished = new Map<string, { text: string; thinking: string; version: number }>()
  readonly active = new Map<string, ActiveRun>()
  private drains = new Map<string, Promise<void>>()
  private wakeups = new Set<string>()
  private listeners = new Set<(event: WireNotification) => void>()
  private approvals = new Map<string, (allowed: boolean) => void>()
  private cancelled = new Set<string>()
  private streamTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private maintenance = false
  private permissionModeValue: 'deny' | 'allow' | 'ask' = 'ask'
  private admissions = 0
  private closing = false
  recovered = 0
  private constructor(
    readonly options: ResolvedKernelOptions,
    storage?: StoragePort,
  ) {
    this.storage = storage ?? new Storage(options.layout.database, options.layout)
    this.secrets =
      options.secrets ??
      new NativeSecrets(`hbar.${createHash('sha256').update(options.home).digest('hex').slice(0, 20)}`)
    this.plugins = new PluginManager(
      this.storage,
      {
        tools: this.tools,
        hooks: this.hooks,
        sessions: {
          get: (id) => this.storage.call('session', id),
          list: async (workspaceId) => {
            const sessions = await this.storage.call('sessions')
            return workspaceId ? sessions.filter((session) => session.workspaceId === workspaceId) : sessions
          },
          events: (id, after, limit) => this.storage.call('events', id, after ?? 0, limit),
          create: (id, title) => this.createSession(id, title),
          submit: (...args) => this.submit(...args),
          cancel: (id) => this.cancel(id),
          snapshot: (id) => this.snapshot(id),
          append: (id, type, data, runId, stepId) => this.append(id, type, data, runId, stepId),
        },
        notify: (event) => this.publish(event),
        changed: (kind) => this.changed(kind),
      },
      {
        pluginRoot: options.layout.plugins,
        pluginLock: options.layout.pluginLock,
        pluginExtract: options.layout.cache.pluginExtract,
      },
    )
  }
  static async create(options: KernelOptions): Promise<Kernel> {
    const layout =
      options.layout ??
      (await resolvePathLayout({
        home: options.home,
        dataRoot: options.dataRoot,
        cacheRoot: options.cacheRoot,
        pointerFile: options.pointerFile,
      }))
    await ensurePathLayout(layout)
    const resolved: ResolvedKernelOptions = { ...options, home: layout.dataRoot, layout }
    const kernel = new Kernel(resolved, await options.profile?.createStorage?.(layout.dataRoot))
    try {
      await kernel.storage.call('ready')
      const storedPermission = await kernel.storage.call('getSetting', 'permission.mode')
      const parsedPermission = approvalModeSchema.safeParse(storedPermission)
      kernel.permissionModeValue = parsedPermission.success ? parsedPermission.data : 'ask'
      kernel.recovered = await kernel.storage.call('recover')
      kernel.registerDefaults()
      for (const [id, plugin] of Object.entries(options.profile?.replacements ?? {})) kernel.plugins.replace(id, plugin)
      for (const plugin of options.profile?.plugins ?? []) kernel.plugins.add(plugin)
      await kernel.plugins.start()
      if (options.workspace) await kernel.createWorkspace(options.workspace)
      if (options.demo)
        await kernel.storage.call(
          'saveProvider',
          providerSchema.parse({
            id: 'local-fixture',
            name: 'Local fixture',
            protocol: 'mock',
            baseUrl: 'http://127.0.0.1',
            model: 'fixture',
            imageInput: true,
          }),
        )
      for (const sessionId of await kernel.storage.call('queuedSessions')) kernel.kick(sessionId)
      return kernel
    } catch (error) {
      await kernel.storage.close()
      throw error
    }
  }
  private registerDefaults() {
    const registry: ModelRegistry = {
      list: () => this.storage.call('providers'),
      get: async (id) => {
        const provider = (await this.storage.call('providers')).find((p) => p.id === id)
        if (!provider) throw new HbarError('MODEL_NOT_FOUND', `Model ${id} not found`)
        if (provider.protocol === 'mock' && !this.options.demo)
          throw new HbarError('DEMO_DISABLED', 'Fixture models are disabled')
        return provider
      },
      secret: (id) => this.secrets.get(id),
    }
    this.plugins.add(
      definePlugin({
        manifest: {
          id: 'storage.sqlite',
          name: 'SQLite storage',
          version: '1.0.0',
          apiVersion: '^1.0.0',
          scope: 'host',
          required: true,
          restartRequired: true,
          description: 'WAL event log and durable projections',
          provides: { storage: '1.0.0' },
          permissions: ['storage'],
        },
        apply: (ctx) => provide(ctx, 'storage', this.storage),
      }),
    )
    this.plugins.add(
      definePlugin({
        manifest: {
          id: 'models.registry',
          name: 'Model registry',
          version: '1.0.0',
          apiVersion: '^1.0.0',
          scope: 'host',
          required: true,
          description: 'Provider profiles and credential references',
          provides: { models: '1.0.0' },
          requires: { storage: '^1.0.0' },
          permissions: ['credentials'],
        },
        apply: (ctx) => provide(ctx, 'models', registry),
      }),
    )
    this.plugins.add(piPlugin)
    this.plugins.add({
      ...executionPlugin,
      apply: (ctx) => provide(ctx, 'execution', new LocalExecution([this.options.layout.dataRoot])),
    })
    this.plugins.add(
      definePlugin({
        manifest: {
          id: 'policy.approval',
          name: 'Approval policy',
          version: '1.0.0',
          apiVersion: '^1.0.0',
          scope: 'host',
          required: true,
          description: 'Approve writes and process execution',
          provides: { policy: '1.0.0' },
          permissions: [],
        },
        apply: (ctx) =>
          provide<PolicyProvider>(ctx, 'policy', {
            decide: async (tool) => (tool.effect === 'read' ? 'allow' : 'ask'),
          }),
      }),
    )
    this.plugins.add(
      definePlugin({
        manifest: {
          id: 'context.summary',
          name: 'Context compaction',
          version: '1.0.0',
          apiVersion: '^1.0.0',
          scope: 'host',
          required: true,
          description: 'Append-only context summaries',
          provides: { compaction: '1.0.0' },
          requires: { driver: '^1.0.0', models: '^1.0.0' },
          permissions: ['network'],
        },
        configSchema: z.object({
          threshold: z.number().min(0.3).max(0.95).default(0.8),
          retainMessages: z.number().int().min(2).max(100).default(8),
        }),
        apply: (ctx, config) =>
          provide<CompactionProvider>(ctx, 'compaction', {
            shouldCompact: (request) =>
              JSON.stringify(request.messages).length / 3 + request.system.length / 3 + request.model.maxOutput >
              request.model.contextWindow * (config.threshold as number),
            retainMessages: config.retainMessages as number,
          }),
      }),
    )
    this.plugins.add(localTools)
    this.plugins.add(goalPlugin)
    this.plugins.add(planPlugin)
    this.plugins.add(budgetPlugin)
    this.plugins.add(gitPlugin)
    this.plugins.add(browserPlugin)
    this.plugins.add(computerPlugin)
  }
  subscribe(listener: (event: WireNotification) => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private publish(event: WireNotification) {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (error) {
        console.error('Subscriber failed:', error)
      }
    }
  }
  changed(kind: string) {
    this.publish({ method: 'host.changed', params: { kind } })
  }
  async append(sessionId: string, type: string, data: unknown, runId?: string, stepId?: string) {
    const event = await this.storage.call('append', sessionId, type, data, runId, stepId)
    this.publish({ method: 'session.event', params: event })
    return event
  }
  private publishEvent(event: SessionEvent) {
    this.publish({ method: 'session.event', params: event })
  }
  async createWorkspace(path: string) {
    const resolved = await realpath(path)
    if (!(await stat(resolved)).isDirectory())
      throw new HbarError('INVALID_WORKSPACE', 'Workspace must be an existing directory')
    const workspace = await this.storage.call('createWorkspace', resolved, basename(resolved) || resolved)
    this.changed('workspaces')
    return workspace
  }
  async createSession(workspaceId: string, title?: string) {
    const session = await this.storage.call('createSession', workspaceId, title)
    this.changed('sessions')
    return session
  }
  async updateSession(id: string, update: { title?: string; archived?: boolean }) {
    const { session, event } = await this.storage.call('updateSession', id, update)
    this.publishEvent(event)
    this.changed('sessions')
    return session
  }
  async models(): Promise<ModelInfo[]> {
    const providers = (await this.storage.call('providers')).filter((p) => p.protocol !== 'mock' || this.options.demo)
    return Promise.all(
      providers.map(async (provider) => ({
        ...provider,
        hasKey: provider.protocol === 'mock' ? false : Boolean(await this.secrets.get(provider.id)),
      })),
    )
  }
  async saveProvider(config: ProviderConfig, apiKey?: string) {
    this.assertIdle()
    this.maintenance = true
    try {
      const provider = providerSchema.parse(config)
      if (provider.protocol === 'mock' && !this.options.demo)
        throw new HbarError('DEMO_DISABLED', 'Fixture models are disabled')
      if (!['http:', 'https:'].includes(new URL(provider.baseUrl).protocol))
        throw new HbarError('INVALID_URL', 'Provider requires an HTTP or HTTPS URL')
      if (apiKey !== undefined) {
        if (apiKey) await this.secrets.set(provider.id, apiKey)
        else await this.secrets.delete(provider.id)
      }
      await this.storage.call('saveProvider', provider)
      this.changed('models')
      return { ...provider, hasKey: Boolean(await this.secrets.get(provider.id)) }
    } finally {
      this.maintenance = false
    }
  }
  permissionMode() {
    return this.permissionModeValue
  }
  async setPermissionMode(mode: 'deny' | 'allow' | 'ask') {
    const next = approvalModeSchema.parse(mode)
    await this.storage.call('setSetting', 'permission.mode', next)
    this.permissionModeValue = next
    this.changed('permissions')
    return { mode: this.permissionModeValue }
  }
  async deleteProvider(id: string) {
    this.assertIdle()
    this.maintenance = true
    try {
      await this.storage.call('deleteProvider', id)
      await this.secrets.delete(id)
      this.changed('models')
    } finally {
      this.maintenance = false
    }
  }
  async bootstrap(host: HostInfo): Promise<Bootstrap> {
    return {
      host,
      workspaces: await this.storage.call('workspaces'),
      sessions: await this.storage.call('sessions'),
      models: await this.models(),
      plugins: this.plugins.list(),
      panels: [...this.plugins.panels.values()],
    }
  }
  async snapshot(id: string, before?: number, limit?: number): Promise<SessionSnapshot> {
    const snapshot = await this.storage.call('snapshot', id, before, limit)
    snapshot.streams = [...this.streams.values()].filter((s) => s.sessionId === id)
    return snapshot
  }
  async submit(sessionId: string, requestId: string, input: UserInput, modelId: string) {
    input = inputSchema.parse(input)
    const files = input.files ?? []
    if (input.images.length + files.length > MAX_ATTACHMENTS)
      throw new HbarError('FILE_LIMIT', `A message can include at most ${MAX_ATTACHMENTS} attachments`)
    input = { ...input, files }
    const mode = input.mode ?? (await this.plugins.get<ModeService>('mode').get(sessionId)).mode
    input = {
      ...input,
      mode,
      ...(input.source === undefined ? { source: 'user' as const } : {}),
    }
    if (this.maintenance || this.closing) throw new HbarError('BUSY', 'Host is changing its plugin composition')
    this.admissions++
    try {
      if (!input.text.trim() && !input.images.length && !files.length && input.source !== 'goal')
        throw new HbarError('EMPTY_INPUT', 'Enter a message or attach an image or file')
      const model = await this.plugins.get<ModelRegistry>('models').get(modelId)
      if (input.images.length && !model.imageInput)
        throw new HbarError('UNSUPPORTED_IMAGE', 'Selected model does not accept images')
      input = {
        ...input,
        images: await Promise.all(input.images.map((image) => this.storage.call('artifact', image.id))),
        files: await Promise.all(files.map((file) => this.storage.call('artifact', file.id))),
      }
      const run = await this.storage.call('enqueue', sessionId, requestId, input, modelId)
      if (run.status === 'queued') {
        if (run.queuedEvent) this.publishEvent(run.queuedEvent)
        this.kick(sessionId)
      }
      this.changed('sessions')
      return run
    } finally {
      this.admissions--
    }
  }
  private kick(sessionId: string) {
    this.wakeups.add(sessionId)
    if (this.drains.has(sessionId) || this.closing) return
    const drain = this.drain(sessionId)
      .catch((error) => {
        console.error('Session driver failed:', error)
      })
      .finally(() => {
        this.drains.delete(sessionId)
        if (this.wakeups.delete(sessionId) && !this.closing) this.kick(sessionId)
      })
    this.drains.set(sessionId, drain)
  }
  private async drain(sessionId: string) {
    while (!this.closing) {
      this.wakeups.delete(sessionId)
      const run = await this.storage.call('claim', sessionId)
      if (!run) return
      if (this.cancelled.has(run.id)) {
        this.publishEvent(await this.storage.call('setRun', run.id, 'cancelled'))
        this.cancelled.delete(run.id)
        continue
      }
      const controller = new AbortController()
      let scope: RuntimeScope
      try {
        const sessionForScope = await this.storage.call('session', sessionId)
        const workspaceScope = await this.plugins.openScope('workspace', sessionForScope.workspaceId)
        const sessionScope = await this.plugins.openScope('session', sessionId, workspaceScope)
        scope = await this.plugins.openScope('run', run.id, sessionScope)
      } catch (error) {
        this.publishEvent(
          await this.storage.call(
            'setRun',
            run.id,
            'failed',
            `Plugin scope failed: ${error instanceof Error ? error.message : String(error)}`,
          ),
        )
        this.changed('sessions')
        continue
      }
      scope.ctx.effect(() => () => controller.abort())
      this.active.set(sessionId, { run, controller, context: scope })
      if (this.cancelled.has(run.id)) controller.abort(new Error('Cancelled by user'))
      const timer = setTimeout(() => controller.abort(new Error('Run exceeded its 20-minute limit')), 20 * 60_000)
      let status: Run['status'] = 'completed',
        failure: string | undefined
      try {
        this.publishEvent(await this.storage.call('setRun', run.id, 'running'))
        const session = await this.storage.call('session', sessionId)
        const workspace = await this.storage.call('workspace', session.workspaceId)
        const model = await this.plugins.get<ModelRegistry>('models').get(run.modelId)
        const apiKey = model.protocol === 'mock' ? null : await this.secrets.get(model.id)
        const content: ContentBlock[] = [
          ...(run.input.text ? [{ type: 'text' as const, text: run.input.text }] : []),
          ...run.input.images.map((artifact) => ({ type: 'image' as const, artifact })),
          ...(run.input.files ?? []).map((artifact) => ({ type: 'file' as const, artifact })),
        ]
        this.publishEvent((await this.storage.call('commit', sessionId, run.id, 'user', content)).event)
        if (session.title === 'New session')
          await this.updateSession(sessionId, {
            title: (
              run.input.text.trim() ||
              run.input.images[0]?.name ||
              run.input.files?.[0]?.name ||
              'Attachment session'
            ).slice(0, 80),
          })
        const driver = this.plugins.get<HarnessDriver>('driver')
        const input: DriverInput = {
          session,
          workspace,
          run,
          request: await this.buildRequest(sessionId, model, scope.hooks, run),
          apiKey,
          signal: controller.signal,
          tools: scope.tools.list(),
          resolveKey: (id) => this.plugins.get<ModelRegistry>('models').secret(id),
          readImage: async (id) => {
            const artifact = await this.storage.call('artifact', id)
            return {
              mime: artifact.mime,
              data: Buffer.from(await Bun.file(join(this.options.layout.artifacts, id)).arrayBuffer()).toString(
                'base64',
              ),
            }
          },
          readFile: async (id) => {
            const artifact = await this.storage.call('artifact', id)
            const bytes = new Uint8Array(await Bun.file(join(this.options.layout.artifacts, id)).arrayBuffer())
            if (!isTextArtifact(artifact.mime, artifact.name))
              return { name: artifact.name, mime: artifact.mime, size: artifact.size, text: null, truncated: false }
            let text: string | null
            try {
              const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
              text = decoded.includes('\u0000') ? null : decoded
            } catch {
              text = null
            }
            const truncated = text !== null && text.length > MAX_FILE_TEXT
            return {
              name: artifact.name,
              mime: artifact.mime,
              size: artifact.size,
              text: text === null ? null : text.slice(0, MAX_FILE_TEXT),
              truncated,
            }
          },
          emit: (type, data, stepId) => this.append(sessionId, type, data, run.id, stepId),
          commit: async (role, blocks, messageId, providerData) => {
            const result = await this.storage.call('commit', sessionId, run.id, role, blocks, messageId, providerData)
            if (messageId) this.clearStream(messageId)
            this.publishEvent(result.event)
            return result.message
          },
          stream: (id, text, thinking) => this.updateStream({ id, sessionId, runId: run.id, text, thinking }),
          execute: (name, args, callId) =>
            this.execute(name, args, { session, workspace, run, signal: controller.signal, callId }, scope),
          beforeRequest: async (_request, stepId) => {
            controller.signal.throwIfAborted()
            let request = await this.buildRequest(sessionId, model, scope.hooks, run)
            if (this.plugins.get<CompactionProvider>('compaction').shouldCompact(request)) {
              await this.compactInternal(sessionId, model, controller.signal, run.id)
              request = await this.buildRequest(sessionId, model, scope.hooks, run)
            }
            request = await scope.hooks.dispatch('model.request', request)
            const registered = await this.plugins.get<ModelRegistry>('models').get(request.model.id)
            if (
              request.model.baseUrl !== registered.baseUrl ||
              request.model.protocol !== registered.protocol ||
              request.model.model !== registered.model
            )
              throw new HbarError('INVALID_MODEL_OVERRIDE', 'Model hooks must select a registered provider endpoint')
            controller.signal.throwIfAborted()
            await this.append(
              sessionId,
              'request.started',
              {
                attemptId: crypto.randomUUID(),
                request,
                tools: input.tools.map((tool) => ({
                  name: tool.name,
                  description: tool.description,
                  schema: z.toJSONSchema(tool.inputSchema),
                })),
              },
              run.id,
              stepId,
            )
            return request
          },
          stepEnded: (stepId) => scope.hooks.dispatch('step.end', { sessionId, runId: run.id, stepId }).then(() => {}),
        }
        await driver.run(input)
      } catch (error) {
        status = controller.signal.aborted ? 'cancelled' : 'failed'
        failure = error instanceof Error ? error.message : String(error)
      } finally {
        clearTimeout(timer)
        for (const stream of this.streams.values()) if (stream.runId === run.id) this.clearStream(stream.id)
        const settledEvent = await this.storage.call('setRun', run.id, status, failure)
        this.publishEvent(settledEvent)
        this.active.delete(sessionId)
        this.cancelled.delete(run.id)
        await scope.hooks
          .dispatch('run.end', { sessionId, runId: run.id, status, run: await this.storage.call('run', run.id) })
          .catch((error) => console.error('Run observer failed:', error))
        await scope.dispose()
        this.changed('sessions')
      }
    }
  }
  private async buildRequest(
    sessionId: string,
    model: ProviderConfig,
    hooks = this.hooks,
    run?: Run,
  ): Promise<ModelRequest> {
    const context = await this.storage.call('context', sessionId)
    const session = await this.storage.call('session', sessionId)
    const workspace = await this.storage.call('workspace', session.workspaceId)
    return hooks.dispatch('context.build', {
      system: `You are hbar, a coding assistant. Work in ${workspace.path}. Use the available tools. Respect approval results. Report uncertainty and errors accurately.${context.summary ? `\n\nEarlier conversation summary:\n${context.summary}` : ''}`,
      messages: context.messages,
      model,
      context: {
        sessionId,
        ...(run ? { runId: run.id } : {}),
        ...(run?.input.mode ? { mode: run.input.mode } : {}),
        ...(run?.input.source ? { source: run.input.source } : {}),
      },
    })
  }
  private updateStream(stream: Omit<LiveStream, 'offset' | 'version'>) {
    const published = this.streamPublished.get(stream.id)
    this.streams.set(stream.id, {
      ...stream,
      offset: stream.text.length + stream.thinking.length,
      version: published?.version ?? 0,
    })
    if (this.streamTimers.has(stream.id)) return
    this.streamTimers.set(
      stream.id,
      setTimeout(() => {
        this.streamTimers.delete(stream.id)
        const current = this.streams.get(stream.id)
        if (current) {
          const prior = this.streamPublished.get(stream.id) ?? { text: '', thinking: '', version: 0 }
          const append = current.text.startsWith(prior.text) && current.thinking.startsWith(prior.thinking)
          const version = prior.version + 1
          this.publish({
            method: 'stream.update',
            params: {
              id: current.id,
              sessionId: current.sessionId,
              runId: current.runId,
              operation: append ? 'append' : 'reset',
              text: append ? current.text.slice(prior.text.length) : current.text,
              thinking: append ? current.thinking.slice(prior.thinking.length) : current.thinking,
              textOffset: append ? prior.text.length : 0,
              thinkingOffset: append ? prior.thinking.length : 0,
              version,
            },
          })
          this.streamPublished.set(stream.id, { text: current.text, thinking: current.thinking, version })
          current.version = version
        }
      }, 33),
    )
  }
  private clearStream(id: string) {
    clearTimeout(this.streamTimers.get(id))
    this.streamTimers.delete(id)
    this.streams.delete(id)
    this.streamPublished.delete(id)
  }
  private async execute(
    name: string,
    rawArgs: Record<string, unknown>,
    context: ToolContext,
    scope: RuntimeScope,
  ): Promise<ToolResult> {
    const tool = scope.tools.get(name)
    if (!tool) throw new HbarError('TOOL_NOT_FOUND', name)
    let result: ToolResult,
      started = false
    try {
      context.signal.throwIfAborted()
      const initial = tool.inputSchema.parse(rawArgs) as Record<string, unknown>
      const transformed = await scope.hooks.dispatch('tool.before', {
        name,
        args: structuredClone(initial),
        context,
        tool,
      })
      const args = tool.inputSchema.parse(transformed.args) as Record<string, unknown>
      const decision = await this.plugins.get<PolicyProvider>('policy').decide(tool, args, context)
      const mode = context.run.input.approval ?? this.permissionModeValue
      if (decision === 'deny' || (decision === 'ask' && mode === 'deny'))
        throw new HbarError('DENIED', 'Tool denied by policy')
      if (decision === 'ask' && mode === 'ask' && !(await this.requestApproval(name, args, context)))
        throw new HbarError('DENIED', 'User denied the tool call')
      context.signal.throwIfAborted()
      this.publishEvent(
        await this.storage.call('toolStart', context.session.id, context.run.id, context.callId, name, args),
      )
      started = true
      result = await tool.execute(args, context)
      result = (await scope.hooks.dispatch('tool.after', { name, result, context })).result
    } catch (error) {
      result = { text: error instanceof Error ? error.message : String(error), isError: true }
    }
    if (result.text.length > 128_000) result = { ...result, text: `${result.text.slice(0, 128_000)}\n[truncated]` }
    const { event } = await this.storage.call('commit', context.session.id, context.run.id, 'tool', [
      {
        type: 'tool_result',
        callId: context.callId,
        name,
        text: result.text,
        isError: Boolean(result.isError),
        details: result.details,
      },
    ])
    if (started) await this.storage.call('toolEnd', context.session.id, context.run.id, context.callId)
    this.publishEvent(event)
    return result
  }
  private async requestApproval(tool: string, args: Record<string, unknown>, context: ToolContext) {
    const approval: Approval = {
      id: crypto.randomUUID(),
      sessionId: context.session.id,
      runId: context.run.id,
      callId: context.callId,
      tool,
      args,
      status: 'pending',
      createdAt: Date.now(),
    }
    let resolve!: (value: boolean) => void
    const outcome = new Promise<boolean>((done) => {
      resolve = done
    })
    this.approvals.set(approval.id, resolve)
    const onAbort = () => {
      void this.resolveApproval(approval.id, 'cancelled').catch((error) => {
        console.error(error)
        resolve(false)
      })
    }
    try {
      this.publishEvent(await this.storage.call('createApproval', approval))
      this.publishEvent(await this.storage.call('setRun', context.run.id, 'waiting_approval'))
      context.signal.addEventListener('abort', onAbort, { once: true })
      if (context.signal.aborted) onAbort()
      return await outcome
    } finally {
      context.signal.removeEventListener('abort', onAbort)
      this.approvals.delete(approval.id)
      this.publishEvent(await this.storage.call('setRun', context.run.id, 'running'))
    }
  }
  async resolveApproval(id: string, decision: Approval['status']) {
    const result = await this.storage.call('resolveApproval', id, decision)
    if (result) {
      this.publishEvent(result.event)
      this.approvals.get(id)?.(decision === 'allowed')
    }
  }
  async cancel(runId: string) {
    this.cancelled.add(runId)
    for (const active of this.active.values())
      if (active.run.id === runId) active.controller.abort(new Error('Cancelled by user'))
    const run = await this.storage.call('run', runId)
    if (run.status === 'queued') this.publishEvent(await this.storage.call('setRun', runId, 'cancelled'))
    else if (!['running', 'waiting_approval'].includes(run.status)) this.cancelled.delete(runId)
  }
  async compact(sessionId: string, modelId: string) {
    this.assertIdle()
    this.maintenance = true
    try {
      return await this.compactInternal(
        sessionId,
        await this.plugins.get<ModelRegistry>('models').get(modelId),
        AbortSignal.timeout(120_000),
      )
    } finally {
      this.maintenance = false
    }
  }
  private async compactInternal(sessionId: string, model: ProviderConfig, signal: AbortSignal, runId?: string) {
    const request = await this.buildRequest(sessionId, model)
    const retain = this.plugins.get<CompactionProvider>('compaction').retainMessages
    let boundary = -1
    for (let i = 1; i <= request.messages.length - retain; i++) if (request.messages[i]?.role === 'user') boundary = i
    if (boundary < 1) {
      if (!runId) throw new HbarError('NOTHING_TO_COMPACT', 'More completed conversation history is needed')
      return { summary: '' }
    }
    const older = request.messages.slice(0, boundary)
    const summarization: ModelRequest = {
      ...request,
      system: `Summarize the conversation faithfully. Preserve objectives, files, tool outcomes, constraints, and unresolved work. Do not execute tools.\n${request.system}`,
      messages: older,
    }
    await this.append(sessionId, 'compaction.request', { request: summarization }, runId)
    const result = await this.plugins
      .get<HarnessDriver>('driver')
      .summarize(summarization, model.protocol === 'mock' ? null : await this.secrets.get(model.id), signal)
    await this.append(sessionId, 'usage.recorded', result.usage, runId)
    signal.throwIfAborted()
    if (!result.text.trim()) throw new HbarError('COMPACTION_FAILED', 'Provider returned an empty summary')
    this.publishEvent(await this.storage.call('compact', sessionId, older.at(-1)!.seq, result.text, model.id))
    return { summary: result.text }
  }
  async upload(name: string, mime: string, bytes: Uint8Array): Promise<ArtifactRef> {
    const normalizedMime = (mime.trim().split(';', 1)[0] || 'application/octet-stream').toLowerCase()
    if (normalizedMime.length > 120 || /[\r\n]/.test(normalizedMime))
      throw new HbarError('UNSUPPORTED_TYPE', 'File type is invalid')
    if (!bytes.length || bytes.length > MAX_ARTIFACT_BYTES)
      throw new HbarError('FILE_LIMIT', 'File size must be between 1 byte and 10 MiB')
    if (isImageMime(normalizedMime)) {
      const signature = Buffer.from(bytes)
      const valid =
        normalizedMime === 'image/png'
          ? signature.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : normalizedMime === 'image/jpeg'
            ? signature[0] === 255 && signature[1] === 216
            : normalizedMime === 'image/gif'
              ? signature.subarray(0, 3).toString() === 'GIF'
              : signature.subarray(0, 4).toString() === 'RIFF' && signature.subarray(8, 12).toString() === 'WEBP'
      if (!valid) throw new HbarError('UNSUPPORTED_TYPE', 'Image data does not match its declared type')
    }
    const id = createHash('sha256').update(bytes).digest('hex')
    const artifact = {
      id,
      name: basename(name).slice(0, 240) || 'attachment',
      mime: normalizedMime,
      size: bytes.length,
    }
    try {
      await writeFile(join(this.options.layout.artifacts, id), bytes, { flag: 'wx', mode: 0o600 })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
    await this.storage.call('putArtifact', artifact)
    return artifact
  }
  assertIdle() {
    if (this.active.size || this.drains.size || this.admissions || this.maintenance || this.closing)
      throw new HbarError('BUSY', 'Wait for active and queued runs to settle')
  }
  private async cacheSize(root: string): Promise<number> {
    let total = 0
    let entries = 0
    const visit = async (path: string): Promise<void> => {
      if (entries > 50_000) return
      for (const entry of await readdir(path, { withFileTypes: true }).catch(() => [])) {
        entries++
        const child = join(path, entry.name)
        if (entry.isDirectory()) await visit(child)
        else if (entry.isFile()) total += (await stat(child).catch(() => ({ size: 0 }))).size
      }
    }
    await visit(root)
    return total
  }
  async paths() {
    const { layout } = this.options
    return {
      dataRoot: layout.dataRoot,
      cacheRoot: layout.cacheRoot,
      database: layout.database,
      sessions: layout.sessions,
      skills: layout.skills,
      plugins: layout.plugins,
      diagnostics: layout.diagnostics,
      settings: layout.settings,
      artifacts: layout.artifacts,
      pointerFile: layout.pointerFile,
      cacheBytes: await this.cacheSize(layout.cacheRoot),
      restartRequired: false,
    }
  }
  async validatePaths(dataRoot: string, cacheRoot: string) {
    const layout = await validatePathRoots(dataRoot, cacheRoot, this.options.layout.pointerFile)
    return { dataRoot: layout.dataRoot, cacheRoot: layout.cacheRoot, valid: true as const }
  }
  async setPaths(dataRoot: string, cacheRoot: string) {
    this.assertIdle()
    this.maintenance = true
    try {
      const layout = await validatePathRoots(dataRoot, cacheRoot, this.options.layout.pointerFile)
      await writePathPointer(layout)
      this.changed('paths')
      return { ...(await this.paths()), dataRoot: layout.dataRoot, cacheRoot: layout.cacheRoot, restartRequired: true }
    } finally {
      this.maintenance = false
    }
  }
  async changePlugin(id: string, enabled: boolean, config?: Record<string, unknown>) {
    this.assertIdle()
    this.maintenance = true
    try {
      const plugins = await this.plugins.set(id, enabled, config)
      this.changed('plugins')
      return plugins
    } finally {
      this.maintenance = false
    }
  }
  async installPlugin(path: string, projectId?: string) {
    this.assertIdle()
    this.maintenance = true
    try {
      if (projectId) await this.storage.call('workspace', projectId)
      const plugins = await this.plugins.install(path, projectId)
      this.changed('plugins')
      return plugins
    } finally {
      this.maintenance = false
    }
  }
  async waitForIdle() {
    while (this.drains.size) await Promise.all([...this.drains.values()])
  }
  async close() {
    this.closing = true
    for (const active of this.active.values()) active.controller.abort(new Error('Host shutting down'))
    await this.waitForIdle()
    await this.plugins.close()
    await this.storage.close()
  }
}
