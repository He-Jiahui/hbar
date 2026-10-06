import { readdir, realpath, stat, writeFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  HbarError,
  approvalModeSchema,
  inputSchema,
  modelSelectionId,
  normalizeThinkingLevel,
  providerSchema,
  resolveProviderModel,
  userInputRequestSchema,
  userInputResponseSchema,
  settingScopeSchema,
  automationStateSchema,
  taskNotificationSchema,
  themeProfileSchema,
} from '@hbar/contracts'
import type {
  ApprovalMode,
  Approval,
  ArtifactRef,
  Bootstrap,
  ContentBlock,
  ToolOutcome,
  HostInfo,
  LiveStream,
  ModelInfo,
  ProviderConfig,
  ProviderInput,
  Run,
  RunFailure,
  SessionEvent,
  SessionSnapshot,
  SessionSummary,
  Workspace,
  UserInputRequest,
  UserInputResponse,
  UserInput,
  WireNotification,
  SettingScope,
  SettingsCatalog,
  SettingsSnapshot,
  AutomationState,
  TaskNotificationKind,
  ThinkingLevel,
} from '@hbar/contracts'
import { definePlugin, prependModelInstructions, provide, RunControlSignal } from '@hbar/plugin-sdk'
import type {
  CompactionProvider,
  BudgetService,
  GoalService,
  DriverInput,
  HarnessDriver,
  ModelRegistry,
  ModelRequest,
  ModeService,
  PolicyProvider,
  ToolContext,
  ToolDefinition,
  ToolResult,
  UserInputService,
} from '@hbar/plugin-sdk'
import { Storage, ensurePathLayout, resolvePathLayout, validatePathRoots, writePathPointer } from '@hbar/storage'
import type {
  PathLayout,
  SessionLaunchTargetMutationInput,
  SessionLaunchTargetPreparationStartMutationInput,
  StoragePort,
} from '@hbar/storage'
import type {
  SessionLaunchTargetPreparationOperationInput,
  SessionLaunchTargetPreparationSnapshot,
  SessionLaunchTargetPreparationStartReceipt,
} from '@hbar/contracts/commands/session-launch-target'
import type { HbarPlugin } from '@hbar/plugin-sdk'
import { buildSettingsCatalog, resolveSettings, searchSettings, settingDescriptors, validateSettingValue } from './settings.ts'
import type {
  QueuedRunEditTextInput,
  QueuedRunGuideInput,
  QueuedRunGuideReceipt,
  QueuedRunRemoveInput,
  RunCommandRecord,
} from '@hbar/contracts/commands/run'
import piPlugin from '@hbar/pi-driver'
import localTools, { localExecutionPlugin } from '@hbar/local-tools'
import goalPlugin from '@hbar/goal'
import planPlugin from '@hbar/plan'
import budgetPlugin from '@hbar/budget'
import gitPlugin from '@hbar/git'
import browserPlugin from '@hbar/browser-use'
import computerPlugin from '@hbar/computer-use'
import agentPlugin from '@hbar/agent'
import workflowPlugin from '@hbar/workflow'
import { Hooks, PluginManager, Tools } from './plugins.ts'
import type { RuntimeScope } from './plugins.ts'
export type { RuntimeScope } from './plugins.ts'
export { createBudgetCommands } from './budget-commands'
export { createRunCommands } from './run-commands'
export { createInteractionCommands } from './interaction-commands'
export { createGoalPlanCommands } from './goal-plan-commands'
export { createModelCommands, createModelSettingsValidator } from './model-commands'
export { createFileCommands } from './file-commands'
export { createAgentCommands } from './agent-commands'
export { createBrowserCommands } from './browser-commands'
export { createComputerCommands } from './computer-commands'
export { createConfigurationCommands, HBAR_PROVIDER_EDITOR_DESCRIPTION } from './configuration-commands'
export { createGitCommands } from './git-commands'
export { createWorkspaceSessionCommands } from './workspace-session-commands'
export { createSessionLaunchTargetCommands } from './session-launch-target-commands'
export { createSessionLaunchBranchesCommands } from './session-launch-branches-commands'
export { SessionLaunchTargetService } from './session-launch-target-service'
import { SessionLaunchTargetService } from './session-launch-target-service'
export { SessionLaunchTargetPreparationService } from './session-launch-target-preparation-service'
import { SessionLaunchTargetPreparationService } from './session-launch-target-preparation-service'
export { createSettingsCommands } from './settings-commands'
export { createSandboxCommands } from './sandbox-commands'
export { createSandboxSettingsValidator } from './sandbox-settings'
export { SandboxProfileService } from './sandbox-service'
export type { SandboxProfileStoragePort, SandboxWriteIdentity } from './sandbox-service'
export { createUsageCommands } from './usage-commands'
export { createWorkflowCommands } from './workflow-commands'
export {
  createScheduleCommands,
  createPromptTemplateCommands,
  createNotificationCommands,
  createRunBoardCommands,
} from './feature-commands'
export { createScheduleService } from './schedule-service'
export type { ScheduleService } from './schedule-service'
export { previewSchedule } from './schedule-service'
export { latestDueSchedule } from './schedule-service'
export { createScheduleDueReader } from './schedule-due-reader'
export type { ScheduleDueReaderPort } from './schedule-due-reader'
export { createPromptTemplateService } from './prompt-template-service'
export {
  BUILTIN_SANDBOX_PROFILES,
  evaluateSandbox,
  isBuiltinSandboxProfileId,
  normalizeSandboxAbsolutePath,
  parseSandboxCommand,
  resolveSandboxProfile,
} from './sandbox-policy'
export type {
  ParsedSandboxCommand,
  SandboxEvaluationOptions,
  SandboxPathTarget,
  SandboxProfileLookup,
  SandboxReason,
  SandboxToolCall,
  SandboxVerdict,
} from './sandbox-policy'
export { createNotificationService } from './notification-service'
export { createScheduleRunner, ScheduleRunFailure } from './schedule-runner'
export type { ScheduleExecutionPort } from './schedule-runner'
export {
  SettingsService,
  HBAR_SETTINGS_DEFINITIONS,
  HBAR_SETTINGS_DESCRIPTION,
  HBAR_SETTINGS_SCHEMA_VERSION,
} from './settings-service'
import { createDirectoryQueries } from './directory-queries'
import { createAgentSessionConfiguration } from './agent-session-configuration'
import { createSchemaCallbackRegistry, encodePath } from '@hbar/schema-core'
import { createUsageFact, describeUsageAttempt } from '@hbar/usage'
import { classifyRunFailure } from './run-failure.ts'
import { hostAbortToolOutcome } from './tool-outcome'
import { captureToolPresentations, enrichToolCallPresentations } from './tool-presentation'
import { SessionWakeups } from './session-wakeups.ts'
import { createToolSequenceExecutor } from './tool-sequence'
import { buildSteeringContext, type RunSteeringContext, type SteeringDelivery } from './run-steering-context'
import {
  SettingsService,
  SESSION_APPROVAL_SETTING_PATH,
  SESSION_SANDBOX_PROFILE_SETTING_PATH,
} from './settings-service'
import { SandboxProfileService } from './sandbox-service'
import { describeSandboxReason, evaluateSandboxCall } from './sandbox-gate'
import { isBuiltinSandboxProfileId } from './sandbox-policy'
import { sandboxProfileIdSchema } from '@hbar/contracts/sandbox'

const MAX_ARTIFACT_BYTES = 10 * 1024 * 1024
const MAX_ATTACHMENTS = 12
const SESSION_ACTIVITY_EVENT_TYPES = new Set(['run.queued', 'run.status', 'run.settled', 'run.cancelRequested'])
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

function waitForSessionLaunchTargetLock(previous: Promise<void>, signal?: AbortSignal): Promise<void> {
  if (!signal) return previous
  if (signal.aborted)
    return Promise.reject(
      signal.reason instanceof HbarError ? signal.reason : new HbarError('USER_CANCELLED', 'Request was cancelled'),
    )
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort)
      reject(
        signal.reason instanceof HbarError ? signal.reason : new HbarError('USER_CANCELLED', 'Request was cancelled'),
      )
    }
    signal.addEventListener('abort', onAbort, { once: true })
    previous.then(
      () => {
        signal.removeEventListener('abort', onAbort)
        resolve()
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
    if (signal.aborted) onAbort()
  })
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
  context: RuntimeScope
  steeringReady?: boolean
}
type ApprovalResolution =
  | { source: 'approval'; status: 'allowed' | 'denied' | 'cancelled'; feedback?: string }
  | { source: 'abort'; reason: unknown }

export class Kernel {
  readonly directoryQueries: ReturnType<typeof createDirectoryQueries>
  readonly storage: StoragePort
  readonly sessionLaunchTargets: SessionLaunchTargetService
  readonly sessionLaunchPreparations: SessionLaunchTargetPreparationService
  readonly sandboxProfiles: SandboxProfileService
  readonly tools = new Tools()
  readonly hooks = new Hooks()
  readonly schemaCallbacks = createSchemaCallbackRegistry()
  readonly plugins: PluginManager
  readonly instanceId = crypto.randomUUID()
  readonly secrets: SecretStore
  readonly streams = new Map<string, LiveStream>()
  private streamPublished = new Map<string, { text: string; thinking: string; version: number }>()
  readonly active = new Map<string, ActiveRun>()
  private drains = new Map<string, Promise<void>>()
  private scheduledWakeups = new SessionWakeups((sessionId) => this.kick(sessionId))
  private wakeups = new Set<string>()
  private listeners = new Set<(event: WireNotification) => void>()
  private approvals = new Map<string, (resolution: ApprovalResolution) => void>()
  private boundaryStops = new Map<string, RunControlSignal>()
  private userInputs = new Map<
    string,
    { request: UserInputRequest; settle: (response?: UserInputResponse, error?: unknown) => Promise<boolean> }
  >()
  private cancelled = new Set<string>()
  private streamTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private summaryTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private summaryPending = new Map<string, { activity?: SessionSummary['activity']; activeRunId?: string | null }>()
  private maintenance = false
  private permissionModeValue: ApprovalMode = 'ask'
  private readonly permissionSettings: SettingsService
  private admissions = 0
  private readonly sessionLaunchTargetLocks = new Map<string, Promise<void>>()
  private readonly sharedCheckoutLocks = new Map<string, Promise<void>>()
  private sharedCheckoutWaiters = 0
  private closing = false
  private automation = new Map<string, { unattended: boolean; goalEnabled: boolean }>()
  private readyForRuns = false
  recovered = 0
  private constructor(
    readonly options: ResolvedKernelOptions,
    storage?: StoragePort,
  ) {
    this.storage = storage ?? new Storage(options.layout.database, options.layout)
    this.sessionLaunchTargets = new SessionLaunchTargetService(
      this.storage,
      options.layout,
      undefined,
      (_sessionId, targetPath, signal) => this.assertSharedCheckoutIdle(targetPath, signal),
    )
    this.sessionLaunchPreparations = new SessionLaunchTargetPreparationService(
      this.storage,
      {
        prepare: (sessionId, revision, signal) => this.prepareSessionLaunchTarget(sessionId, revision, signal),
        reconcile: (sessionId, revision, signal) => this.reconcileSessionLaunchTarget(sessionId, revision, signal),
        reconcileCancellation: (sessionId, revision, signal) =>
          this.withSharedCheckoutLock(
            sessionId,
            () => this.sessionLaunchTargets.reconcileCancelledPreparation(sessionId, revision, signal),
            signal,
          ),
        readTarget: (sessionId) => this.getSessionLaunchTarget(sessionId),
      },
      () => this.changed('session-launch-target'),
    )
    this.permissionSettings = new SettingsService(this.storage)
    this.sandboxProfiles = new SandboxProfileService(
      {
        list: () => this.storage.call('sandboxProfiles'),
        get: (id) => this.storage.call('sandboxProfile', id),
        save: (input, identity) => this.storage.call('saveSandboxProfile', input, identity),
        delete: (input, identity) => this.storage.call('deleteSandboxProfile', input, identity),
        receipt: (commandId, input, identity) => this.storage.call('sandboxProfileReceipt', commandId, input, identity),
        putSnapshot: (record) => this.storage.call('putSandboxSnapshot', record),
        snapshot: (digest) => this.storage.call('sandboxSnapshot', digest),
      },
      () => this.changed('sandbox-profiles'),
    )
    this.directoryQueries = createDirectoryQueries({
      workspacePage: (input) => this.storage.call('workspacePage', input),
      workspaceSidebarPage: (input) => this.storage.call('workspaceSidebarPage', input),
      globalSessionActivityPage: (input) => this.storage.call('globalSessionActivityPage', input),
      sessionExecutionSnapshot: (input) => this.storage.call('sessionExecutionSnapshot', input),
      workspaceActivityPage: (input) => this.storage.call('workspaceActivityPage', input),
      sessionActivityPage: (input) => this.storage.call('sessionActivityPage', input),
      sidebarSessionActivityPage: (input) => this.storage.call('sidebarSessionActivityPage', input),
      sessionAgentChildren: (input) => this.storage.call('sessionAgentChildren', input),
      sessionAgentAncestors: (sessionId) => this.storage.call('sessionAgentAncestors', sessionId),
      sessionPage: (input) => this.storage.call('sessionPage', input),
      findWorkspace: (id) => this.storage.call('findWorkspace', id),
      findSession: (id) => this.storage.call('findSession', id),
    })
    this.secrets =
      options.secrets ??
      new NativeSecrets(`hbar.${createHash('sha256').update(options.home).digest('hex').slice(0, 20)}`)
    this.plugins = new PluginManager(
      this.storage,
      {
        tools: this.tools,
        hooks: this.hooks,
        sessions: {
          agentConfiguration: createAgentSessionConfiguration({
            settings: this.permissionSettings,
            model: (id) => this.plugins.get<ModelRegistry>('models').get(id),
            runs: async (id) => (await this.snapshot(id)).runs,
            permission: () => this.permissionModeValue,
          }),
          get: (id) => this.storage.call('session', id),
          list: async (workspaceId) => {
            const sessions = await this.storage.call('sessions')
            return workspaceId ? sessions.filter((session) => session.workspaceId === workspaceId) : sessions
          },
          children: (parentId, after, limit) => this.storage.call('childSessions', parentId, after, limit),
          events: (id, after, limit) => this.storage.call('events', id, after ?? 0, limit),
          create: (id, title, parentId) => this.createSession(id, title, parentId),
          submit: (...args) => this.submit(...args),
          wake: (id) => this.kick(id),
          cancel: (id) => this.cancel(id),
          snapshot: (id) => this.snapshot(id),
          workspace: (id) => this.storage.call('workspace', id),
          createWorkspace: (path) => this.createWorkspace(path),
          append: (id, type, data, runId, stepId) => this.append(id, type, data, runId, stepId),
        },
        userInput: {
          request: (request, signal) => this.requestUserInput(request, signal),
        } satisfies UserInputService,
        notify: (event) => this.publish(event),
        taskNotification: (kind, sessionId, runId, title, message) => this.taskNotification(kind, sessionId, runId, title, message),
        changed: (kind) => this.changed(kind),
        automationSet: (sessionId, unattended, goalEnabled) => this.automationSet(sessionId, unattended, goalEnabled),
      },
      {
        pluginRoot: options.layout.plugins,
        pluginLock: options.layout.pluginLock,
        pluginExtract: options.layout.cache.pluginExtract,
      },
    )
    this.registerSettingsSchemaCallbacks()
    this.hooks.on('goal.replaced', async ({ sessionId, previous, goal, supersededRunIds = [] }) => {
      if (!previous.goalId || !goal.goalId) return
      const stop = new RunControlSignal({ stop: 'goal_replaced', previousGoalId: previous.goalId, goalId: goal.goalId })
      const ids = new Set(supersededRunIds)
      for (const runId of ids) this.boundaryStops.set(runId, stop)
      for (const entry of [...this.userInputs.values()])
        if (entry.request.sessionId === sessionId && ids.has(entry.request.runId)) await entry.settle(undefined, stop)
      if (ids.size) {
        const snapshot = await this.storage.call('snapshot', sessionId, undefined, 40)
        for (const approval of snapshot.approvals)
          if (ids.has(approval.runId) && approval.status === 'pending')
            await this.resolveApproval(approval.id, 'cancelled')
      }
    })
  }

  private registerSettingsSchemaCallbacks(): void {
    const modelPath = encodePath([{ kind: 'field', name: 'provider.model' }])
    const revision = (value: unknown): string =>
      `models:${createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)}`
    this.schemaCallbacks.registerQuery('settings.getModels', {
      version: 1,
      valueType: 'string',
      execute: async (request) => {
        const models = (await this.models()).sort((left, right) => left.id.localeCompare(right.id))
        const search = request.search?.trim().toLocaleLowerCase()
        const filtered = search
          ? models.filter((model) =>
              `${model.providerName}\n${model.modelName}\n${model.id}`.toLocaleLowerCase().includes(search),
            )
          : models
        const offset = request.cursor === undefined ? 0 : Number(request.cursor)
        if (!Number.isSafeInteger(offset) || offset < 0 || offset > filtered.length)
          throw new HbarError('INVALID_CURSOR', 'Model option cursor is invalid')
        const page = filtered.slice(offset, offset + 200)
        return {
          kind: 'options',
          status: 'ready',
          options: page.map((model) => ({
            value: model.id,
            label: { kind: 'literal' as const, text: `${model.providerName} · ${model.modelName}` },
            disabled: false,
          })),
          dependencyFingerprint: request.dependencyFingerprint,
          capabilityRevision: revision(
            models.map(({ id, providerId, modelId, thinkingLevels }) => ({
              id,
              providerId,
              modelId,
              thinkingLevels,
            })),
          ),
          ...(offset + page.length < filtered.length ? { nextCursor: String(offset + page.length) } : {}),
        }
      },
    })
    this.schemaCallbacks.registerQuery('settings.getThinkingLevels', {
      version: 1,
      valueType: 'string',
      execute: async (request) => {
        const modelId = request.dependencies[modelPath]
        if (typeof modelId !== 'string' || !modelId)
          return { kind: 'options', status: 'unavailable', reasonCode: 'missing_model' }
        const model = (await this.models()).find((candidate) => candidate.id === modelId)
        if (!model) return { kind: 'options', status: 'unavailable', reasonCode: 'model_unavailable' }
        return {
          kind: 'options',
          status: 'ready',
          options: model.thinkingLevels.map((level) => ({
            value: level,
            label: { kind: 'i18n' as const, key: `settings.thinkingLevels.${level}` },
            disabled: false,
          })),
          dependencyFingerprint: request.dependencyFingerprint,
          capabilityRevision: revision({ id: model.id, levels: model.thinkingLevels }),
        }
      },
    })
    this.schemaCallbacks.registerQuery('settings.getSandboxProfiles', {
      version: 1,
      valueType: 'string',
      execute: async (request) => {
        const profiles = await this.sandboxProfiles.list()
        return {
          kind: 'options',
          status: 'ready',
          options: profiles.map((profile) => ({
            value: profile.id,
            // Clients localize built-ins; stored profiles show their own name.
            label: isBuiltinSandboxProfileId(profile.id)
              ? { kind: 'i18n' as const, key: `i18n:settings.sandboxProfiles.${profile.id.slice(1)}` }
              : { kind: 'literal' as const, text: profile.name },
            disabled: false,
          })),
          dependencyFingerprint: request.dependencyFingerprint,
          capabilityRevision: `sandbox:${createHash('sha256')
            .update(JSON.stringify(profiles.map(({ id, revision: profileRevision }) => [id, profileRevision])))
            .digest('hex')
            .slice(0, 16)}`,
        }
      },
    })
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
      await kernel.restoreAutomation()
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
            reasoning: true,
          }),
        )
      kernel.readyForRuns = true
      await kernel.sessionLaunchPreparations.resumePending()
      // Only persisted continuation intents can start new work. Old active
      // Goals without an intent remain inert during this startup scan.
      for (const session of await kernel.storage.call('sessions')) kernel.kick(session.id)
      return kernel
    } catch (error) {
      await kernel.storage.close()
      throw error
    }
  }
  private async restoreAutomation() {
    this.automation.clear()
    for (const session of await this.storage.call('sessions')) {
      const events = await this.storage.call('events', session.id, 0, 2_000)
      for (const event of events) {
        if (event.type !== 'automation.changed') continue
        const parsed = automationStateSchema.safeParse(event.data)
        if (parsed.success && parsed.data.sessionId === session.id)
          this.automation.set(session.id, { unattended: parsed.data.unattended, goalEnabled: parsed.data.goalEnabled })
      }
    }
  }
  private registerDefaults() {
    const registry: ModelRegistry = {
      list: () => this.storage.call('providers'),
      get: async (id) => {
        const providers = await this.storage.call('providers')
        const direct = providers.find((p) => p.id === id)
        const provider = direct ?? providers.find((candidate) => id.startsWith(`${candidate.id}/`))
        if (!provider) throw new HbarError('MODEL_NOT_FOUND', `Model ${id} not found`)
        if (provider.protocol === 'mock' && !this.options.demo)
          throw new HbarError('DEMO_DISABLED', 'Fixture models are disabled')
        if (
          !direct &&
          provider.models.length > 1 &&
          !provider.models.some((model) => `${provider.id}/${model.id}` === id)
        )
          throw new HbarError('MODEL_NOT_FOUND', `Model ${id} not found`)
        return resolveProviderModel(provider, id)
      },
      secret: async (id) => {
        const providers = await this.storage.call('providers')
        const provider = providers.find((candidate) => candidate.id === id || id.startsWith(`${candidate.id}/`))
        return provider ? this.secrets.get(provider.id) : null
      },
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
    this.plugins.add(
      localExecutionPlugin([this.options.layout.dataRoot], {
        root: this.options.layout.worktrees,
        protectedRoot: this.options.layout.dataRoot,
        verify: (workspace) => this.sessionLaunchTargets.isBoundWorktreeExecutionRoot(workspace),
      }),
    )
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
    this.plugins.add(agentPlugin)
    this.plugins.add(workflowPlugin)
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
    this.publishEvent(event)
    return event
  }
  private publishEvent(event: SessionEvent) {
    this.publish({ method: 'session.event', params: event })
    this.scheduleSessionSummary(event.sessionId)
    if (SESSION_ACTIVITY_EVENT_TYPES.has(event.type)) this.changed('session-activity')
  }
  private scheduleSessionSummary(
    sessionId: string,
    activity?: SessionSummary['activity'],
    activeRunId?: string | null,
  ) {
    const pending = this.summaryPending.get(sessionId) ?? {}
    this.summaryPending.set(sessionId, {
      ...pending,
      ...(activity ? { activity } : {}),
      ...(activeRunId === undefined ? {} : { activeRunId }),
    })
    if (this.summaryTimers.has(sessionId)) return
    const timer = setTimeout(() => {
      this.summaryTimers.delete(sessionId)
      const override = this.summaryPending.get(sessionId)
      this.summaryPending.delete(sessionId)
      void this.publishSessionSummary(sessionId, override?.activity, override?.activeRunId)
    }, 80)
    this.summaryTimers.set(sessionId, timer)
  }
  private async publishSessionSummary(sessionId: string, activity?: SessionSummary['activity'], activeRunId?: string | null) {
    try {
      const summary = await this.storage.call('sessionSummary', sessionId)
      this.publish({
        method: 'session.summary',
        params: {
          ...summary,
          ...(activity ? { activity } : {}),
          ...(activeRunId === undefined ? {} : { activeRunId }),
        },
      })
    } catch (error) {
      console.error('Session summary failed:', error)
    }
  }
  async createWorkspace(path: string) {
    let resolved: string
    let isDirectory: boolean
    try {
      resolved = await realpath(path)
      isDirectory = (await stat(resolved)).isDirectory()
    } catch {
      // Path validation is read-only. Do not include the storage mutation in
      // this catch: its failure may leave a successfully registered workspace.
      throw new HbarError('INVALID_WORKSPACE', 'Workspace must be an existing accessible directory')
    }
    if (!isDirectory) throw new HbarError('INVALID_WORKSPACE', 'Workspace must be an existing directory')
    const workspace = await this.storage.call('createWorkspace', resolved, basename(resolved) || resolved)
    this.changed('workspaces')
    return workspace
  }
  async createSession(workspaceId: string, title?: string, parentId?: string) {
    const session = await this.storage.call('createSession', workspaceId, title, parentId)
    this.changed('sessions')
    return session
  }
  async updateSession(id: string, update: { title?: string; archived?: boolean; expectedTitle?: string }) {
    const { session, event } = await this.storage.call('updateSession', id, update)
    if (event) this.publishEvent(event)
    this.changed('sessions')
    return session
  }
  async moveSession(id: string, workspaceId: string) {
    const { session, event } = await this.storage.call('moveSession', id, workspaceId)
    this.publishEvent(event)
    this.changed('sessions')
    return session
  }
  async sessionSummaries(ids: string[]): Promise<SessionSummary[]> {
    return this.storage.call('sessionSummaries', ids)
  }
  async models(options: { includeHidden?: boolean } = {}): Promise<ModelInfo[]> {
    const providers = (await this.storage.call('providers')).filter(
      (provider) => (provider.protocol !== 'mock' || this.options.demo) && (options.includeHidden || provider.visible),
    )
    return (
      await Promise.all(
        providers.map(async (provider) => {
          const hasKey = provider.protocol === 'mock' ? false : Boolean(await this.secrets.get(provider.id))
          return provider.models
            .filter((model) => options.includeHidden || model.visible)
            .map((model) => ({
              ...provider,
              ...model,
              id: modelSelectionId(provider.id, model.id, provider.models.length),
              name: provider.name,
              visible: provider.visible,
              model: model.id,
              providerId: provider.id,
              providerName: provider.name,
              providerVisible: provider.visible,
              modelId: model.id,
              modelName: model.name,
              modelVisible: model.visible,
              hasKey,
              canExecute: provider.protocol === 'mock' ? this.options.demo === true : hasKey,
            }))
        }),
      )
    ).flat()
  }
  async providerProfiles() {
    const providers = (await this.storage.call('providers')).filter((p) => p.protocol !== 'mock' || this.options.demo)
    return Promise.all(
      providers.map(async (provider) => ({
        provider,
        hasKey: provider.protocol === 'mock' ? false : Boolean(await this.secrets.get(provider.id)),
      })),
    )
  }
  async saveProvider(config: ProviderInput, apiKey?: string) {
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
      const selected = provider.models.find((model) => model.id === provider.model) ?? provider.models[0]!
      return {
        ...provider,
        ...selected,
        id: modelSelectionId(provider.id, selected.id, provider.models.length),
        name: provider.name,
        visible: provider.visible,
        model: selected.id,
        providerId: provider.id,
        providerName: provider.name,
        providerVisible: provider.visible,
        modelId: selected.id,
        modelName: selected.name,
        modelVisible: selected.visible,
        hasKey: provider.protocol === 'mock' ? false : Boolean(await this.secrets.get(provider.id)),
        canExecute: provider.protocol === 'mock' ? this.options.demo === true : Boolean(await this.secrets.get(provider.id)),
      }
    } finally {
      this.maintenance = false
    }
  }
  permissionMode() {
    return this.permissionModeValue
  }
  /** The session setting is an override; its absence retains the existing Host-wide default. */
  async sessionPermissionMode(sessionId: string): Promise<ApprovalMode> {
    const snapshot = await this.permissionSettings.get({ kind: 'session', targetId: sessionId })
    const report = snapshot.resolution.reports[encodePath(SESSION_APPROVAL_SETTING_PATH)]
    if (!report) throw new HbarError('SETTING_NOT_FOUND', 'Session approval setting is unavailable')
    const override = approvalModeSchema.nullable().safeParse(report.effectiveValue)
    if (!override.success) throw new HbarError('INVALID_SETTING', 'Session approval setting is invalid')
    return override.data ?? this.permissionModeValue
  }
  async sessionSandboxProfileId(sessionId: string) {
    const snapshot = await this.permissionSettings.get({ kind: 'session', targetId: sessionId })
    const report = snapshot.resolution.reports[encodePath(SESSION_SANDBOX_PROFILE_SETTING_PATH)]
    if (!report) throw new HbarError('SETTING_NOT_FOUND', 'Session sandbox profile setting is unavailable')
    const id = sandboxProfileIdSchema.safeParse(report.effectiveValue)
    if (!id.success) throw new HbarError('INVALID_SETTING', 'Session sandbox profile setting is invalid')
    return id.data
  }
  /** Pin the sandbox rules a Run is admitted with; other approval modes never carry them. */
  private async admitSandbox(sessionId: string, input: UserInput): Promise<UserInput> {
    const { sandbox, ...rest } = input
    if (input.approval !== 'sandbox') return rest
    // A caller may pin an existing Host snapshot, e.g. a child Agent inheriting its parent Run.
    if (sandbox) {
      await this.sandboxProfiles.loadSnapshot(sandbox)
      return input
    }
    return { ...rest, sandbox: await this.sandboxProfiles.createSnapshot(await this.sessionSandboxProfileId(sessionId)) }
  }
  async setPermissionMode(mode: ApprovalMode) {
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
  async settingsCatalog(): Promise<SettingsCatalog> {
    return buildSettingsCatalog(this.plugins.list())
  }
  async automationGet(sessionId: string): Promise<AutomationState> {
    await this.storage.call('session', sessionId)
    const current = this.automation.get(sessionId) ?? { unattended: false, goalEnabled: false }
    return { sessionId, ...current }
  }
  async automationSet(sessionId: string, unattended?: boolean, goalEnabled?: boolean): Promise<AutomationState> {
    await this.storage.call('session', sessionId)
    const current = this.automation.get(sessionId) ?? { unattended: false, goalEnabled: false }
    const next = automationStateSchema.parse({
      sessionId,
      unattended: unattended ?? current.unattended,
      goalEnabled: goalEnabled ?? current.goalEnabled,
    })
    await this.append(sessionId, 'automation.changed', next)
    this.automation.set(sessionId, { unattended: next.unattended, goalEnabled: next.goalEnabled })
    this.publish({ method: 'automation.changed', params: next })
    return next
  }
  private async taskNotification(
    kind: TaskNotificationKind,
    sessionId: string,
    runId: string | null,
    title: string,
    message: string,
  ) {
    const values = (await this.storage.call('getSettings', 'global')).values
    const setting =
      kind === 'completed'
        ? 'notifications.taskCompleted'
        : kind === 'user_input'
          ? 'notifications.userInteraction'
          : 'notifications.retryFailed'
    if (values[setting] === false) return
    const notification = taskNotificationSchema.parse({
      notificationId: crypto.randomUUID(),
      kind,
      sessionId,
      ...(runId ? { runId } : {}),
      title,
      message,
    })
    this.publish({ method: 'task.notification', params: notification })
  }
  private async settingDocuments(scope: SettingScope, targetId?: string) {
    settingScopeSchema.parse(scope)
    let projectId: string | undefined
    if (scope === 'project' && targetId) {
      await this.storage.call('workspace', targetId)
      projectId = targetId
    }
    if (scope === 'session' && targetId) {
      const session = await this.storage.call('session', targetId)
      projectId = session.workspaceId
    }
    const global = await this.storage.call('getSettings', 'global')
    const project = projectId
      ? await this.storage.call('getSettings', 'project', projectId)
      : { version: 1 as const, revision: '', values: {} }
    const session = scope === 'session' ? await this.storage.call('getSettings', 'session', targetId) : { version: 1 as const, revision: '', values: {} }
    return { global, project, session }
  }
  async settingsSnapshot(scope: SettingScope, targetId?: string): Promise<SettingsSnapshot> {
    const catalog = await this.settingsCatalog()
    const documents = await this.settingDocuments(scope, targetId)
    const values = resolveSettings(catalog.settings, scope, documents.global.values, documents.project.values, documents.session.values)
    const revision = createHash('sha256')
      .update([documents.global.revision, documents.project.revision, documents.session.revision].join(':'))
      .digest('hex')
    return { schemaVersion: 1, revision, scope, ...(targetId ? { targetId } : {}), values }
  }
  async setSetting(scope: SettingScope, targetId: string | undefined, id: string, value: unknown, expectedRevision?: string) {
    const catalog = await this.settingsCatalog()
    const descriptor = settingDescriptors(catalog).get(id)
    if (!descriptor) throw new HbarError('NOT_FOUND', `Setting not found: ${id}`)
    if (!descriptor.scopes.includes(scope)) throw new HbarError('INVALID_INPUT', `Setting ${id} is not editable at ${scope} scope`)
    validateSettingValue(descriptor.schema, value)
    if (id === 'appearance.profile') {
      const profile = themeProfileSchema.parse(value)
      const backgroundAsset = profile.surface.backgroundAsset
      if (typeof backgroundAsset === 'string' && /^[a-f0-9]{64}$/i.test(backgroundAsset)) {
        let artifact: ArtifactRef
        try {
          artifact = await this.storage.call('artifact', backgroundAsset)
        } catch {
          throw new HbarError('NOT_FOUND', 'Theme background artifact not found')
        }
        if (!isImageMime(artifact.mime))
          throw new HbarError('UNSUPPORTED_TYPE', 'Theme background must reference a supported image artifact')
        try {
          const file = await stat(join(this.options.layout.artifacts, backgroundAsset))
          if (!file.isFile()) throw new Error('not a file')
        } catch {
          throw new HbarError('NOT_FOUND', 'Theme background artifact file not found')
        }
      }
    }
    const current = await this.storage.call('getSettings', scope, targetId)
    const snapshot = await this.settingsSnapshot(scope, targetId)
    if (expectedRevision && expectedRevision !== snapshot.revision)
      throw new HbarError('SETTINGS_CONFLICT', 'Settings changed since they were read')
    await this.storage.call('setSettings', scope, targetId, { ...current.values, [id]: value }, current.revision)
    if (id === 'permission.mode' && typeof value === 'string') {
      this.permissionModeValue = approvalModeSchema.parse(value)
      await this.storage.call('setSetting', 'permission.mode', this.permissionModeValue)
    }
    const next = await this.settingsSnapshot(scope, targetId)
    this.changed('settings')
    this.publish({
      method: 'settings.changed',
      params: { scope, ...(targetId ? { targetId } : {}), revision: next.revision, ids: [id] },
    })
    return next
  }
  async resetSetting(scope: SettingScope, targetId: string | undefined, id: string, expectedRevision?: string) {
    const catalog = await this.settingsCatalog()
    const descriptor = settingDescriptors(catalog).get(id)
    if (!descriptor) throw new HbarError('NOT_FOUND', `Setting not found: ${id}`)
    if (!descriptor.scopes.includes(scope)) throw new HbarError('INVALID_INPUT', `Setting ${id} is not editable at ${scope} scope`)
    const current = await this.storage.call('getSettings', scope, targetId)
    const snapshot = await this.settingsSnapshot(scope, targetId)
    if (expectedRevision && expectedRevision !== snapshot.revision)
      throw new HbarError('SETTINGS_CONFLICT', 'Settings changed since they were read')
    const values = { ...current.values }
    delete values[id]
    await this.storage.call('setSettings', scope, targetId, values, current.revision)
    const next = await this.settingsSnapshot(scope, targetId)
    this.changed('settings')
    this.publish({
      method: 'settings.changed',
      params: { scope, ...(targetId ? { targetId } : {}), revision: next.revision, ids: [id] },
    })
    return next
  }
  async searchSettings(query: string) {
    const catalog = await this.settingsCatalog()
    return searchSettings(catalog, query)
  }
  async snapshot(id: string, before?: number, limit?: number): Promise<SessionSnapshot> {
    const snapshot = await this.storage.call('snapshot', id, before, limit)
    snapshot.streams = [...this.streams.values()].filter((s) => s.sessionId === id)
    snapshot.userInputs = [...this.userInputs.values()]
      .filter(({ request }) => request.sessionId === id)
      .map(({ request }) => request)
    return snapshot
  }
  private async withSessionLaunchTargetLock<Value>(
    sessionId: string,
    action: () => Promise<Value>,
    signal?: AbortSignal,
  ): Promise<Value> {
    signal?.throwIfAborted()
    const previous = this.sessionLaunchTargetLocks.get(sessionId) ?? Promise.resolve()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const tail = previous.then(() => gate)
    this.sessionLaunchTargetLocks.set(sessionId, tail)
    try {
      await waitForSessionLaunchTargetLock(previous, signal)
      signal?.throwIfAborted()
      return await action()
    } finally {
      release()
      void tail.then(
        () => {
          if (this.sessionLaunchTargetLocks.get(sessionId) === tail) this.sessionLaunchTargetLocks.delete(sessionId)
        },
        () => {
          if (this.sessionLaunchTargetLocks.get(sessionId) === tail) this.sessionLaunchTargetLocks.delete(sessionId)
        },
      )
    }
  }
  private sharedCheckoutKey(path: string): string {
    const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized
  }

  /** One checkout lock covers both preparation and bind+enqueue, including sibling sessions. */
  private async withSharedCheckoutLock<Value>(
    sessionId: string,
    action: () => Promise<Value>,
    signal?: AbortSignal,
  ): Promise<Value> {
    signal?.throwIfAborted()
    const session = await this.storage.call('session', sessionId)
    const workspace = await this.storage.call('workspace', session.workspaceId)
    const root = await this.sessionLaunchTargets.checkoutRootForWorkspace(workspace.path, signal)
    const key = this.sharedCheckoutKey(root)
    if (this.sharedCheckoutWaiters >= 64) throw new HbarError('BUSY', 'Shared checkout admission capacity is full')
    this.sharedCheckoutWaiters++
    const previous = this.sharedCheckoutLocks.get(key) ?? Promise.resolve()
    let release!: () => void
    const gate = new Promise<void>((resolveGate) => {
      release = resolveGate
    })
    const tail = previous.then(() => gate)
    this.sharedCheckoutLocks.set(key, tail)
    try {
      await waitForSessionLaunchTargetLock(previous, signal)
      signal?.throwIfAborted()
      return await action()
    } finally {
      this.sharedCheckoutWaiters--
      release()
      void tail.then(
        () => {
          if (this.sharedCheckoutLocks.get(key) === tail) this.sharedCheckoutLocks.delete(key)
        },
        () => {
          if (this.sharedCheckoutLocks.get(key) === tail) this.sharedCheckoutLocks.delete(key)
        },
      )
    }
  }

  private async assertSharedCheckoutIdle(targetPath: string, signal: AbortSignal): Promise<void> {
    const root = this.sharedCheckoutKey(await this.sessionLaunchTargets.checkoutRootForWorkspace(targetPath, signal))
    for (const path of await this.storage.call('activeSharedCheckoutPaths')) {
      signal.throwIfAborted()
      const activeRoot = await this.sessionLaunchTargets.checkoutRootForWorkspace(path, signal)
      if (this.sharedCheckoutKey(activeRoot) === root)
        throw new HbarError('BUSY', 'Wait for shared checkout tasks to finish before switching branches')
    }
  }

  async getSessionLaunchTarget(sessionId: string) {
    return this.sessionLaunchTargets.get(sessionId)
  }
  async setSessionLaunchTarget(input: SessionLaunchTargetMutationInput) {
    return this.withSessionLaunchTargetLock(input.sessionId, () => this.sessionLaunchTargets.set(input))
  }
  async prepareSessionLaunchTarget(sessionId: string, revision: number, signal?: AbortSignal) {
    return this.withSessionLaunchTargetLock(
      sessionId,
      () =>
        this.withSharedCheckoutLock(
          sessionId,
          () => this.sessionLaunchTargets.prepare(sessionId, revision, signal),
          signal,
        ),
      signal,
    )
  }
  async reconcileSessionLaunchTarget(sessionId: string, revision: number, signal?: AbortSignal) {
    return this.withSessionLaunchTargetLock(
      sessionId,
      () =>
        this.withSharedCheckoutLock(
          sessionId,
          () => this.sessionLaunchTargets.reconcile(sessionId, revision, signal),
          signal,
        ),
      signal,
    )
  }
  async cancelSessionLaunchTarget(sessionId: string, revision: number) {
    return this.sessionLaunchTargets.cancel(sessionId, revision)
  }
  async startSessionLaunchTargetPreparation(
    input: SessionLaunchTargetPreparationStartMutationInput,
  ): Promise<SessionLaunchTargetPreparationStartReceipt> {
    return this.sessionLaunchPreparations.start(input)
  }
  readSessionLaunchTargetPreparation(
    input: SessionLaunchTargetPreparationOperationInput,
  ): Promise<SessionLaunchTargetPreparationSnapshot> {
    return this.sessionLaunchPreparations.read(input)
  }
  cancelSessionLaunchTargetPreparation(
    input: SessionLaunchTargetPreparationOperationInput,
  ): Promise<SessionLaunchTargetPreparationSnapshot> {
    return this.sessionLaunchPreparations.cancel(input)
  }
  reconcileSessionLaunchTargetPreparation(
    input: SessionLaunchTargetPreparationOperationInput,
  ): Promise<SessionLaunchTargetPreparationSnapshot> {
    return this.sessionLaunchPreparations.reconcile(input)
  }
  async submit(
    sessionId: string,
    requestId: string,
    input: UserInput,
    modelId: string,
    command?: RunCommandRecord,
    signal?: AbortSignal,
    expectedLaunchTargetRevision?: number,
  ) {
    input = inputSchema.parse(input)
    const files = input.files ?? []
    if (input.images.length + files.length > MAX_ATTACHMENTS)
      throw new HbarError('FILE_LIMIT', `A message can include at most ${MAX_ATTACHMENTS} attachments`)
    await this.plugins.get<BudgetService>('budget').assertCanStart(sessionId, input.source)
    input = { ...input, files }
    if (expectedLaunchTargetRevision !== undefined) {
      const target = await this.getSessionLaunchTarget(sessionId)
      if (target.revision !== expectedLaunchTargetRevision)
        throw new HbarError('COMMAND_CONFLICT', 'Session launch target revision changed')
      if (target.resolution.status !== 'ready')
        throw new HbarError('SESSION_LAUNCH_TARGET_UNRESOLVED', 'Prepare the selected worktree before accepting a Run')
    }
    const mode = input.mode ?? (await this.plugins.get<ModeService>('mode').get(sessionId)).mode
    const goal = await this.plugins.get<GoalService>('goal').get(sessionId)
    if (goal.goal && ['budget_limited', 'complete', 'blocked', 'usage_limited'].includes(goal.goal.status) && input.source === 'goal')
      throw new HbarError('GOAL_NOT_ACTIVE', `Goal is ${goal.goal.status} and cannot continue automatically`)
    input = {
      ...input,
      mode,
      ...(input.source === undefined ? { source: 'user' as const } : {}),
    }
    if (this.maintenance || this.closing) throw new HbarError('BUSY', 'Host is changing its plugin composition')
    this.admissions++
    try {
      if (!input.text.trim() && !input.images.length && !files.length && !['goal', 'system'].includes(input.source ?? 'user'))
        throw new HbarError('EMPTY_INPUT', 'Enter a message or attach an image or file')
      const model = await this.plugins.get<ModelRegistry>('models').get(modelId)
      input = { ...input, thinking: normalizeThinkingLevel(model, input.thinking, mode === 'plan') }
      input = { ...input, approval: input.approval ?? (await this.sessionPermissionMode(sessionId)) }
      input = await this.admitSandbox(sessionId, input)
      if (input.images.length && !model.imageInput)
        throw new HbarError('UNSUPPORTED_IMAGE', 'Selected model does not accept images')
      const imageArtifacts = await Promise.all(input.images.map((image) => this.storage.call('artifact', image.id)))
      if (imageArtifacts.some((artifact) => !isImageMime(artifact.mime)))
        throw new HbarError('UNSUPPORTED_IMAGE', 'Image attachments must reference validated image artifacts')
      input = {
        ...input,
        images: imageArtifacts,
        files: await Promise.all(files.map((file) => this.storage.call('artifact', file.id))),
      }
      const run = await this.withSessionLaunchTargetLock(
        sessionId,
        () =>
          this.withSharedCheckoutLock(
            sessionId,
            async () => {
              const binding = await this.sessionLaunchTargets.bindForRun(
                sessionId,
                signal,
                expectedLaunchTargetRevision,
              )
              signal?.throwIfAborted()
              return this.storage.call('enqueue', sessionId, requestId, input, modelId, command, binding)
            },
            signal,
          ),
        signal,
      )
      if (run.status === 'queued') {
        if (run.queuedEvent) {
          // Only a newly accepted turn clears unresolved interactive requests.
          if (input.source !== 'goal')
            await this.clearPendingUserInputs(sessionId, new HbarError('USER_INPUT_CANCELLED', 'A new turn started'))
          this.publishEvent(run.queuedEvent)
        }
        this.kick(sessionId)
      }
      this.changed('sessions')
      return run
    } finally {
      this.admissions--
    }
  }
  private kick(sessionId: string) {
    this.scheduledWakeups.cancel(sessionId)
    this.wakeups.add(sessionId)
    if (this.drains.has(sessionId) || this.closing || this.maintenance || !this.readyForRuns) return
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
      if (!run) {
        if (
          this.active.has(sessionId) ||
          [...this.userInputs.values()].some(({ request }) => request.sessionId === sessionId)
        )
          return
        const idle = await this.hooks.dispatch('session.idle', { sessionId })
        if (this.closing) return
        if (!idle.submission) {
          if (idle.wakeAt !== undefined) this.scheduledWakeups.schedule(sessionId, idle.wakeAt)
          return
        }
        let submitted: Run
        try {
          submitted = await this.submit(
            sessionId,
            idle.submission.requestId,
            idle.submission.input,
            idle.submission.modelId,
          )
        } catch (error) {
          // Admission may have committed before its acknowledgement was lost.
          // Reconcile the same request identity, never generate a replacement.
          const found = await this.storage.call('runByRequest', sessionId, idle.submission.requestId)
          if (found) submitted = found.run
          else {
            await this.hooks.dispatch('session.continuationFailed', {
              sessionId,
              requestId: idle.submission.requestId,
              unknown: !(error instanceof HbarError) || error.code === 'RESULT_UNKNOWN',
            })
            return
          }
        }
        if (submitted.status !== 'queued') return
        continue
      }
      this.changed('session-activity')
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
            classifyRunFailure(error),
          ),
        )
        this.changed('sessions')
        continue
      }
      scope.ctx.effect(() => () => controller.abort())
      this.active.set(sessionId, { run, controller, context: scope })
      if (this.cancelled.has(run.id)) controller.abort(new HbarError('USER_CANCELLED', 'Cancelled by user'))
      const timer = setTimeout(
        () => controller.abort(new HbarError('RUN_TIMEOUT', 'Run exceeded its 20-minute limit')),
        20 * 60_000,
      )
      let status: Run['status'] = 'completed',
        failure: string | undefined,
        failureDetails: RunFailure | undefined
      try {
        this.publishEvent(await this.storage.call('setRun', run.id, 'running'))
        await scope.hooks.dispatch('run.start', {
          sessionId,
          runId: run.id,
          run: await this.storage.call('run', run.id),
        })
        const session = await this.storage.call('session', sessionId)
        const workspace = await this.storage.call('workspace', session.workspaceId)
        const workspaceForRun: Workspace = {
          ...workspace,
          path: await this.sessionLaunchTargets.workspaceForRun(sessionId, workspace.path, controller.signal),
        }
        const model = await this.plugins.get<ModelRegistry>('models').get(run.modelId)
        const apiKey = model.protocol === 'mock' ? null : await this.secrets.get(model.id)
        const content: ContentBlock[] = [
          ...(run.input.text ? [{ type: 'text' as const, text: run.input.text }] : []),
          ...run.input.images.map((artifact) => ({ type: 'image' as const, artifact })),
          ...(run.input.files ?? []).map((artifact) => ({ type: 'file' as const, artifact })),
        ]
        const initialCommit = await this.storage.call('commit', sessionId, run.id, 'user', content)
        this.publishEvent(initialCommit.event)
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
        const supportsSteering =
          driver.supportsCanonicalSteering === true && driver.supportsSteeringAdmissionClosure === true
        const steeringDeliveries: SteeringDelivery[] = []
        const steeringContext: RunSteeringContext | undefined = supportsSteering
          ? { runId: run.id, initialUserMessageId: initialCommit.message.id, deliveries: steeringDeliveries }
          : undefined
        let steeringAfterSeq = initialCommit.message.seq
        const closeSteering = async () => {
          const active = this.active.get(sessionId)
          if (active?.run.id === run.id) active.steeringReady = false
          if (supportsSteering) await this.storage.call('closeRunSteering', sessionId, run.id)
        }
        const selectedTools = await scope.hooks.dispatch('tools.select', {
          sessionId,
          runId: run.id,
          tools: scope.tools.list(),
        })
        const selectedNames = new Set(selectedTools.tools.map((tool) => tool.name))
        const toolPresentations = captureToolPresentations(selectedNames, scope.tools)
        const input: DriverInput = {
          session,
          workspace: workspaceForRun,
          run,
          request: await this.buildRequest(sessionId, model, scope.hooks, run, workspaceForRun, steeringContext),
          apiKey,
          signal: controller.signal,
          tools: selectedTools.tools,
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
          emit: (type, data, stepId) => {
            if (type === 'message.committed')
              return Promise.reject(
                new HbarError('RESERVED_EVENT', 'Drivers must commit canonical messages through commit'),
              )
            return this.append(sessionId, type, data, run.id, stepId)
          },
          commit: async (role, blocks, messageId, providerData) => {
            if (supportsSteering && role === 'user')
              throw new HbarError('RESERVED_EVENT', 'Live user messages are owned by Host queue guidance')
            const content = enrichToolCallPresentations(role, blocks, toolPresentations)
            const result = await this.storage.call('commit', sessionId, run.id, role, content, messageId, providerData)
            if (messageId) this.clearStream(messageId)
            this.publishEvent(result.event)
            return result.message
          },
          stream: (id, text, thinking) => this.updateStream({ id, sessionId, runId: run.id, text, thinking }),
          execute: async (name, args, callId) => {
            const effectiveMode = this.plugins.get<ModeService>('mode').effectiveMode(run)
            const effectiveRun =
              effectiveMode === run.input.mode ? run : { ...run, input: { ...run.input, mode: effectiveMode } }
            const context: ToolContext = {
              session,
              workspace: workspaceForRun,
              run: effectiveRun,
              signal: controller.signal,
              callId,
            }
            const sequence = createToolSequenceExecutor(
              context,
              selectedTools.tools,
              name,
              (childName, childArgs, childContext) => this.execute(childName, childArgs, childContext, scope),
              (type, data) => this.append(sessionId, type, data, run.id),
            )
            try {
              return await this.execute(name, args, { ...context, executeSequence: sequence.execute }, scope)
            } finally {
              sequence.dispose()
            }
          },
          beforeRequest: async (_request, stepId) => {
            controller.signal.throwIfAborted()
            let request = await this.buildRequest(sessionId, model, scope.hooks, run, workspaceForRun, steeringContext)
            if (this.plugins.get<CompactionProvider>('compaction').shouldCompact(request)) {
              await this.compactInternal(
                sessionId,
                model,
                controller.signal,
                run.id,
                workspaceForRun,
                supportsSteering ? initialCommit.message.seq : undefined,
                run.input.thinking,
              )
              request = await this.buildRequest(sessionId, model, scope.hooks, run, workspaceForRun, steeringContext)
            }
            request = await scope.hooks.dispatch('model.request', request)
            const registered = await this.plugins.get<ModelRegistry>('models').get(request.model.id)
            if (
              request.model.baseUrl !== registered.baseUrl ||
              request.model.protocol !== registered.protocol ||
              request.model.model !== registered.model
            )
              throw new HbarError('INVALID_MODEL_OVERRIDE', 'Model hooks must select a registered provider endpoint')
            const advertised = await scope.hooks.dispatch('tools.advertise', {
              sessionId,
              runId: run.id,
              tools: [...input.tools],
            })
            if (
              advertised.tools.some((tool) => !input.tools.includes(tool)) ||
              new Set(advertised.tools.map((tool) => tool.name)).size !== advertised.tools.length ||
              (advertised.instructions !== undefined &&
                !z.string().max(16_000).safeParse(advertised.instructions).success)
            )
              throw new HbarError(
                'INVALID_TOOL_ADVERTISEMENT',
                'Tool advertisements must be a unique subset of Run tools with at most 16000 instruction characters',
              )
            request = {
              ...prependModelInstructions(request, advertised.instructions ?? ''),
              toolNames: advertised.tools.map((tool) => tool.name),
            }
            controller.signal.throwIfAborted()
            await this.append(
              sessionId,
              'request.started',
              {
                ...describeUsageAttempt(stepId, 'model', request.model),
                request,
                tools: advertised.tools.map((tool) => ({
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
          stepEnded: async (stepId) => {
            const settled = await scope.hooks.dispatch('step.end', { sessionId, runId: run.id, stepId })
            if (settled.stop) await closeSteering()
            return settled.stop ? { stop: settled.stop } : undefined
          },
          ...(supportsSteering
            ? {
                getSteeringMessages: async (target) => {
                  if (target.sessionId !== sessionId || target.runId !== run.id)
                    throw new HbarError('COMMAND_CONFLICT', 'Steering source belongs to the original Run')
                  target.signal.throwIfAborted()
                  controller.signal.throwIfAborted()
                  const page = await this.storage.call('readRunSteering', {
                    sessionId,
                    runId: run.id,
                    afterSeq: steeringAfterSeq,
                    ...(target.closeWhenEmpty ? { closeWhenEmpty: true } : {}),
                  })
                  target.signal.throwIfAborted()
                  controller.signal.throwIfAborted()
                  if (page.messages.length) {
                    const context = await this.storage.call('context', sessionId)
                    target.signal.throwIfAborted()
                    controller.signal.throwIfAborted()
                    const insertionAfterSeq = context.messages.at(-1)?.seq ?? initialCommit.message.seq
                    for (const message of page.messages) steeringDeliveries.push({ message, insertionAfterSeq })
                  }
                  steeringAfterSeq = page.nextSeq
                  if (page.closed) {
                    const active = this.active.get(sessionId)
                    if (active?.run.id === run.id) active.steeringReady = false
                  }
                  return page.messages
                },
                closeSteeringAdmission: closeSteering,
              }
            : {}),
        }
        if (supportsSteering) {
          controller.signal.throwIfAborted()
          await this.storage.call('openRunSteering', sessionId, run.id)
          const active = this.active.get(sessionId)
          if (active?.run.id === run.id) active.steeringReady = true
        }
        await driver.run(input)
      } catch (error) {
        const cause: unknown = controller.signal.aborted ? controller.signal.reason : error
        if (!(cause instanceof RunControlSignal)) {
          failureDetails = classifyRunFailure(cause)
          status =
            failureDetails.category === 'cancelled'
              ? 'cancelled'
              : failureDetails.category === 'interrupted'
                ? 'interrupted'
                : 'failed'
          failure = cause instanceof Error ? cause.message : String(cause)
        }
      } finally {
        clearTimeout(timer)
        const active = this.active.get(sessionId)
        if (active?.run.id === run.id && active.steeringReady) {
          active.steeringReady = false
          await this.storage.call('closeRunSteering', sessionId, run.id)
        }
        for (const stream of this.streams.values()) if (stream.runId === run.id) this.clearStream(stream.id)
        const settledEvent = await this.storage.call('setRun', run.id, status, failure, failureDetails)
        this.publishEvent(settledEvent)
        this.active.delete(sessionId)
        this.cancelled.delete(run.id)
        this.boundaryStops.delete(run.id)
        await scope.hooks
          .dispatch('run.end', { sessionId, runId: run.id, status, run: await this.storage.call('run', run.id) })
          .catch((error) => console.error('Run observer failed:', error))
        if (status === 'completed') {
          const queued = (await this.storage.call('snapshot', sessionId, undefined, 40)).runs.some((item) => item.status === 'queued')
          const goalState = await this.plugins.get<GoalService>('goal').get(sessionId)
          if (!queued && (!goalState.goal || goalState.goal.status === 'complete'))
            void this.taskNotification('completed', sessionId, run.id, '任务完成', '当前任务已完成。').catch((error) =>
              console.error('Task notification failed:', error),
            )
        } else if (status === 'failed') {
          const goalState = await this.plugins.get<GoalService>('goal').get(sessionId)
          const controlled = run.input.source === 'goal' || run.input.source === 'system' ||
            ['active', 'blocked', 'usage_limited', 'budget_limited'].includes(goalState.goal?.status ?? '')
          if (controlled)
            void this.taskNotification('retry_failed', sessionId, run.id, '任务失败', '任务执行失败，请检查错误后重试。').catch((error) =>
              console.error('Task notification failed:', error),
            )
        }
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
    workspaceOverride?: Workspace,
    steering?: RunSteeringContext,
  ): Promise<ModelRequest> {
    const context = await this.storage.call('context', sessionId)
    const session = await this.storage.call('session', sessionId)
    const workspace = workspaceOverride ?? (await this.storage.call('workspace', session.workspaceId))
    return hooks.dispatch('context.build', {
      system: `You are hbar, a coding assistant. Work in ${workspace.path}. Use the available tools. Respect approval results. Report uncertainty and errors accurately.${context.summary ? `\n\nEarlier conversation summary:\n${context.summary}` : ''}`,
      messages: steering ? buildSteeringContext(context.messages, steering) : context.messages,
      model,
      context: {
        sessionId,
        thinking: normalizeThinkingLevel(model, run?.input.thinking),
        ...(run ? { runId: run.id } : {}),
        ...(run ? { mode: this.plugins.get<ModeService>('mode').effectiveMode(run) } : {}),
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
    this.scheduleSessionSummary(stream.sessionId, stream.thinking ? 'thinking' : stream.text ? 'output' : 'thinking', stream.runId)
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
    // Plugin hooks receive a mutable ToolContext. Classification and approval
    // cancellation must retain the original Host-owned signal independently.
    const hostSignal = context.signal
    const tool = scope.tools.get(name)
    if (!tool) throw new HbarError('TOOL_NOT_FOUND', name)
    let result: ToolResult,
      started = false,
      executedArgs: Record<string, unknown> | undefined
    let hostFailure: ToolResult['hostFailure']
    let hostControl: ToolResult['hostControl']
    let outcome: ToolOutcome | undefined
    const assertNotAborted = () => {
      if (!hostSignal.aborted) return
      outcome = hostAbortToolOutcome(hostSignal.reason, started)
      hostSignal.throwIfAborted()
    }
    const assertBoundary = () => {
      assertNotAborted()
      const stop = this.boundaryStops.get(context.run.id)
      if (stop) throw stop
    }
    try {
      assertBoundary()
      const initial = tool.inputSchema.parse(rawArgs) as Record<string, unknown>
      const transformed = await scope.hooks.dispatch('tool.before', {
        name,
        args: structuredClone(initial),
        context,
        tool,
      })
      const args = tool.inputSchema.parse(transformed.args) as Record<string, unknown>
      assertBoundary()
      executedArgs = args
      const mode = context.run.input.approval ?? this.permissionModeValue
      let decision = await this.plugins.get<PolicyProvider>('policy').decide(tool, args, context)
      let denial = 'Tool denied by policy'
      let environment: Readonly<Record<string, string>> | undefined
      let osConfinement: import('@hbar/plugin-sdk').OsConfinementOptions | undefined
      // A policy plugin may still forbid a call; otherwise the Run's sandbox profile decides.
      if (mode === 'sandbox' && decision !== 'deny') {
        const sandbox = await this.sandboxDecision(tool, args, context)
        decision = sandbox.decision
        denial = sandbox.denial
        environment = sandbox.environment
        osConfinement = sandbox.osConfinement
      }
      // The sandbox has already decided which calls need the user, so they are asked like `ask` mode.
      const gate = mode === 'sandbox' ? 'ask' : mode
      if (decision === 'deny' || (decision === 'ask' && gate === 'deny' && tool.humanApproval !== 'required')) {
        outcome = { kind: 'denied', executionStarted: false }
        throw new HbarError('DENIED', denial)
      }
      if (tool.humanApproval === 'required' || (decision === 'ask' && gate === 'ask')) {
        const resolution = await this.requestApproval(name, args, context, hostSignal)
        const replacementStop = this.boundaryStops.get(context.run.id)
        if (replacementStop && !hostSignal.aborted) throw replacementStop
        if (resolution.source === 'abort') {
          outcome = hostAbortToolOutcome(resolution.reason, false)
          throw resolution.reason
        }
        if (resolution.status === 'cancelled') {
          assertNotAborted()
          outcome = { kind: 'cancelled', executionStarted: false }
          throw new HbarError('APPROVAL_CANCELLED', 'Tool approval was cancelled')
        }
        if (resolution.status === 'denied') {
          outcome = { kind: 'denied', executionStarted: false }
          throw new HbarError(
            'DENIED',
            resolution.feedback
              ? `User requested further planning: ${resolution.feedback}`
              : 'User denied the tool call',
          )
        }
      }
      assertBoundary()
      this.publishEvent(
        await this.storage.call('toolStart', context.session.id, context.run.id, context.callId, name, args),
      )
      started = true
      await scope.hooks.dispatch('tool.executing', { name, args: structuredClone(args), context, tool })
      assertBoundary()
      // The environment is Host-owned: drop any value a hook placed on the mutable context and
      // give only the executing tool the sandbox profile's variables.
      const { environment: _hookEnvironment, ...plain } = context
      const execOverrides = {
        ...(environment ? { environment } : {}),
        ...(osConfinement ? { osConfinement } : {}),
      }
      result = await tool.execute(args, Object.keys(execOverrides).length ? { ...plain, ...execOverrides } : plain)
      result = (await scope.hooks.dispatch('tool.after', { name, result, context })).result
      outcome = { kind: result.isError ? 'failed' : 'succeeded', executionStarted: started }
    } catch (error) {
      if (error instanceof RunControlSignal && !hostSignal.aborted) {
        hostControl = error.control
        result = {
          text: 'The Goal was replaced; this old-goal call was cancelled at its next safe boundary.',
          isError: false,
        }
        outcome = { kind: 'cancelled', executionStarted: started, reason: 'goal_replaced' }
      } else {
        result = { text: error instanceof Error ? error.message : String(error), isError: true }
        hostFailure = { code: error instanceof HbarError ? error.code : 'TOOL_FAILED', executionStarted: started }
        // Only the exact Host signal reason establishes cancellation outside explicit gates.
        outcome ??=
          hostSignal.aborted && error === hostSignal.reason
            ? hostAbortToolOutcome(hostSignal.reason, started)
            : { kind: 'failed', executionStarted: started }
      }
    }
    result = { ...result, hostFailure, hostControl }
    if (result.text.length > 128_000) result = { ...result, text: `${result.text.slice(0, 128_000)}\n[truncated]` }
    const content: ContentBlock[] = [
      {
        type: 'tool_result',
        callId: context.callId,
        name,
        text: result.text,
        isError: Boolean(result.isError),
        details: result.details,
        outcome,
      },
    ]
    const event = context.parentCallId
      ? await this.storage.call(
          'append',
          context.session.id,
          'tool.sequence_result',
          { parentCallId: context.parentCallId, content },
          context.run.id,
        )
      : (await this.storage.call('commit', context.session.id, context.run.id, 'tool', content)).event
    const settled = started
      ? await this.storage.call('toolEnd', context.session.id, context.run.id, context.callId, Boolean(result.isError))
      : null
    this.publishEvent(event)
    if (settled) this.publishEvent(settled)
    if (settled && executedArgs)
      await scope.hooks
        .dispatch('tool.settled', { name, args: executedArgs, result, context, tool })
        .catch((error) => console.error('Tool settlement observer failed:', error))
    return result
  }
  private async sandboxDecision(
    tool: ToolDefinition,
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<{
    decision: 'allow' | 'ask' | 'deny'
    denial: string
    environment?: Readonly<Record<string, string>> | undefined
    osConfinement?: import('@hbar/plugin-sdk').OsConfinementOptions | undefined
  }> {
    const ref = context.run.input.sandbox
    let profile: Awaited<ReturnType<SandboxProfileService['loadSnapshot']>>
    try {
      if (!ref) throw new HbarError('SANDBOX_SNAPSHOT_NOT_FOUND', 'The Run has no sandbox snapshot')
      profile = await this.sandboxProfiles.loadSnapshot(ref)
    } catch (error) {
      if (!(error instanceof HbarError)) throw error
      return { decision: 'deny', denial: `Denied: ${error.message}` }
    }
    const verdict = await evaluateSandboxCall(profile, { tool, args, workspace: context.workspace.path })
    const result: {
      decision: 'allow' | 'ask' | 'deny'
      denial: string
      environment?: Readonly<Record<string, string>>
      osConfinement?: import('@hbar/plugin-sdk').OsConfinementOptions
    } = {
      decision: verdict.decision,
      denial: `Denied by sandbox profile ${profile.profileId}: ${describeSandboxReason(verdict.reason)}`,
    }
    if (Object.keys(profile.environment.set).length) result.environment = profile.environment.set
    if (profile.osConfinement?.enabled) {
      const writableRoots = profile.filesystem.grants
        .filter((g) => g.access === 'write')
        .map((g) =>
          g.path.startsWith('/') || /^[A-Za-z]:/.test(g.path)
            ? g.path
            : `${context.workspace.path}/${g.path}`,
        )
      const readableRoots = profile.filesystem.grants
        .filter((g) => g.access === 'read')
        .map((g) =>
          g.path.startsWith('/') || /^[A-Za-z]:/.test(g.path)
            ? g.path
            : `${context.workspace.path}/${g.path}`,
        )
      result.osConfinement = {
        level: profile.osConfinement.mode,
        writableRoots,
        readableRoots,
        networkEnabled: profile.network.enabled,
        envOverrides: profile.environment.set,
      }
    }
    return result
  }
  private async requestApproval(
    tool: string,
    args: Record<string, unknown>,
    context: ToolContext,
    hostSignal: AbortSignal,
  ) {
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
    let resolve!: (value: ApprovalResolution) => void
    const outcome = new Promise<ApprovalResolution>((done) => {
      resolve = done
    })
    this.approvals.set(approval.id, resolve)
    const onAbort = () => {
      void this.resolveApproval(approval.id, 'cancelled')
        .catch(async (error: unknown) => {
          console.error(error)
          // An ambiguous storage failure must not hide an already-winning decision.
          // This is one read, not a replay of cancellation or a fabricated resolution.
          try {
            const recorded = await this.storage.call('approval', approval.id)
            if (recorded.status !== 'pending')
              resolve({
                source: 'approval',
                status: recorded.status,
                ...(recorded.feedback ? { feedback: recorded.feedback } : {}),
              })
          } catch (readError) {
            console.error('Approval outcome could not be read after cancellation:', readError)
          }
        })
        // Persistence failure still ends the aborted wait, but it is not a
        // fabricated persisted approval. An earlier winning resolution remains first.
        .finally(() => resolve({ source: 'abort', reason: hostSignal.reason }))
    }
    try {
      this.publishEvent(await this.storage.call('createApproval', approval))
      this.publishEvent(await this.storage.call('setRun', context.run.id, 'waiting_approval'))
      hostSignal.addEventListener('abort', onAbort, { once: true })
      if (hostSignal.aborted) onAbort()
      if (this.boundaryStops.has(context.run.id)) await this.resolveApproval(approval.id, 'cancelled')
      return await outcome
    } finally {
      hostSignal.removeEventListener('abort', onAbort)
      this.approvals.delete(approval.id)
      this.publishEvent(await this.storage.call('setRun', context.run.id, 'running'))
    }
  }
  async requestUserInput(raw: UserInputRequest, signal: AbortSignal): Promise<UserInputResponse> {
    const parsed = userInputRequestSchema.parse(raw)
    const request = userInputRequestSchema.parse({
      ...parsed,
      questions: parsed.questions.map((question) => ({
        ...question,
        isOther: question.isOther ?? false,
        isSecret: question.isSecret ?? false,
      })),
    })
    await this.storage.call('session', request.sessionId)
    const run = await this.storage.call('run', request.runId)
    if (run.sessionId !== request.sessionId)
      throw new HbarError('USER_INPUT_INVALID', 'User input request does not belong to the current session')
    if (
      request.questions.some(
        (question, index) => request.questions.findIndex((item) => item.id === question.id) !== index,
      )
    )
      throw new HbarError('USER_INPUT_INVALID', 'Question ids must be unique')
    if (
      request.questions.some((question) => {
        const labels = (question.options ?? []).map((option) => option.label.toLocaleLowerCase())
        return new Set(labels).size !== labels.length
      })
    )
      throw new HbarError('USER_INPUT_INVALID', 'Question option labels must be unique')
    if (request.questions.some((question) => (question.options ?? []).filter((option) => option.recommended).length > 1))
      throw new HbarError('USER_INPUT_INVALID', 'Each question can have at most one recommended option')
    const unattended = this.automation.get(request.sessionId)?.unattended ?? false
    const recommended = request.questions.map((question) => (question.options ?? []).filter((option) => option.recommended))
    if (unattended && recommended.every((options) => options.length === 1)) {
      const answers = Object.fromEntries(
        request.questions.map((question, index) => [question.id, { answers: [recommended[index]![0]!.label] }]),
      )
      return { answers }
    }
    if (this.userInputs.has(request.requestId))
      throw new HbarError('USER_INPUT_EXISTS', 'A user input request with this id is already pending')
    signal.throwIfAborted()
    const boundaryStop = this.boundaryStops.get(request.runId)
    if (boundaryStop) throw boundaryStop

    let settled = false
    let resolve!: (response: UserInputResponse) => void
    let reject!: (error: unknown) => void
    const outcome = new Promise<UserInputResponse>((done, fail) => {
      resolve = done
      reject = fail
    })
    const settle = async (response?: UserInputResponse, error?: unknown) => {
      if (settled) return false
      settled = true
      this.userInputs.delete(request.requestId)
      const data = {
        requestId: request.requestId,
        sessionId: request.sessionId,
        cancelled: response === undefined,
        ...(response === undefined ? {} : { response }),
      }
      try {
        await this.append(request.sessionId, 'user_input.resolved', data, request.runId)
      } catch (appendError) {
        console.error('Failed to persist user input resolution:', appendError)
      }
      this.publish({ method: 'user_input.resolved', params: data })
      if (response === undefined)
        reject(error ?? new HbarError('USER_INPUT_CANCELLED', 'User input request was cancelled'))
      else resolve(response)
      return true
    }
    this.userInputs.set(request.requestId, { request, settle })
    const onAbort = () => {
      void settle(undefined, signal.reason ?? new HbarError('USER_INPUT_CANCELLED', 'User input request was cancelled'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    try {
      await this.append(request.sessionId, 'user_input.requested', request, request.runId)
      const stop = this.boundaryStops.get(request.runId)
      if (stop && !settled) await settle(undefined, stop)
      if (!settled) {
        this.publish({ method: 'user_input.requested', params: request })
        void this.taskNotification(
          'user_input',
          request.sessionId,
          request.runId,
          '需要你的回答',
          `${request.questions.length} 个问题正在等待处理。`,
        ).catch((error) => console.error('Task notification failed:', error))
      }
      if (signal.aborted) onAbort()
      return await outcome
    } catch (error) {
      if (!settled) await settle(undefined, error)
      throw error
    } finally {
      signal.removeEventListener('abort', onAbort)
      this.userInputs.delete(request.requestId)
    }
  }
  async resolveUserInput(requestId: string, rawAnswers: Record<string, { answers: string[] }>) {
    const entry = this.userInputs.get(requestId)
    if (!entry) return false
    const response = userInputResponseSchema.parse({ answers: rawAnswers })
    const questionIds = new Set(entry.request.questions.map((question) => question.id))
    if (Object.keys(response.answers).some((id) => !questionIds.has(id)))
      throw new HbarError('USER_INPUT_INVALID', 'Answers contain an unknown question id')
    await entry.settle(response)
    return true
  }

  pendingUserInput(requestId: string) {
    return this.userInputs.get(requestId)?.request ?? null
  }

  private async clearPendingUserInputs(sessionId: string, reason: unknown) {
    const pending = [...this.userInputs.values()].filter(({ request }) => request.sessionId === sessionId)
    for (const entry of pending) await entry.settle(undefined, reason)
  }
  async resolveApproval(id: string, decision: Approval['status']) {
    if (decision !== 'cancelled' && (await this.storage.call('approval', id)).tool === 'exit_plan_mode')
      throw new HbarError('PLAN_EXIT_DECISION_REQUIRED', 'Use the Plan exit decision for this request')
    const result = await this.storage.call('resolveApproval', id, decision)
    if (result) this.publishEvent(result.event)
    // A concurrent decision may have won. Resolve from storage, never the losing argument.
    const approval = result?.approval ?? (await this.storage.call('approval', id))
    if (approval.status !== 'pending')
      this.approvals.get(id)?.({
        source: 'approval',
        status: approval.status,
        ...(approval.feedback ? { feedback: approval.feedback } : {}),
      })
  }
  async resolvePlanExit(input: {
    sessionId: string
    approvalId: string
    runId: string
    callId: string
    decision: 'implement' | 'continue'
    feedback?: string
    actorId: string
  }) {
    const recorded = await this.storage.call('approval', input.approvalId)
    if (
      recorded.tool !== 'exit_plan_mode' ||
      recorded.sessionId !== input.sessionId ||
      recorded.runId !== input.runId ||
      recorded.callId !== input.callId
    )
      throw new HbarError('PLAN_EXIT_TARGET', 'Plan decision does not match the original request')
    if (recorded.status !== 'pending') {
      const status = input.decision === 'implement' ? 'allowed' : 'denied'
      if (
        recorded.status === status &&
        recorded.decidedBy === input.actorId &&
        (recorded.feedback ?? '') === (input.feedback?.trim() ?? '')
      )
        return recorded
      throw new HbarError('PLAN_EXIT_UNAVAILABLE', 'The original Plan request has already been resolved')
    }
    const active = this.active.get(input.sessionId)
    if (!active || active.run.id !== input.runId || !this.approvals.has(input.approvalId))
      throw new HbarError('PLAN_EXIT_UNAVAILABLE', 'The original Plan request is no longer active')
    active.controller.signal.throwIfAborted()
    const commit = () =>
      this.storage.call(
        'resolvePlanExit',
        input.approvalId,
        input.sessionId,
        input.runId,
        input.callId,
        input.decision,
        input.feedback,
        input.actorId,
      )
    const resolved =
      input.decision === 'implement'
        ? await this.plugins.get<ModeService>('mode').commitExit(input.sessionId, async () => {
            active.controller.signal.throwIfAborted()
            return commit()
          })
        : await commit()
    this.publishEvent(resolved.event)
    if (resolved.modeEvent) {
      if (resolved.modeEvent.eventId !== resolved.event.eventId) this.publishEvent(resolved.modeEvent)
      try {
        const run = await this.storage.call('run', input.runId)
        await active.context.hooks.dispatch('run.modeChanged', {
          sessionId: input.sessionId,
          runId: input.runId,
          run,
          mode: 'default',
        })
      } catch (error) {
        active.controller.abort(error)
        throw error
      }
    }
    if (resolved.approval.status === 'pending')
      throw new HbarError('INVALID_OUTPUT', 'Plan exit resolution is still pending')
    this.approvals.get(input.approvalId)?.({
      source: 'approval',
      status: resolved.approval.status,
      ...(resolved.approval.feedback ? { feedback: resolved.approval.feedback } : {}),
    })
    return resolved.approval
  }
  async cancel(runId: string) {
    const { run, event } = await this.storage.call('requestCancel', runId)
    if (event) this.publishEvent(event)
    if (['running', 'waiting_approval'].includes(run.status)) {
      this.cancelled.add(runId)
      for (const active of this.active.values())
        if (active.run.id === runId) active.controller.abort(new HbarError('USER_CANCELLED', 'Cancelled by user'))
    } else this.cancelled.delete(runId)
    if (event) await this.hooks.dispatch('run.cancelRequested', { sessionId: run.sessionId, runId, run })
  }
  async reorderQueued(sessionId: string, runIds: string[]) {
    const events = await this.storage.call('reorderQueued', sessionId, runIds)
    for (const event of events) this.publishEvent(event)
    if (events.length) this.changed('sessions')
  }
  async removeQueuedRun(request: QueuedRunRemoveInput, actorId: string, idempotencyKey: string) {
    const { receipt, event } = await this.storage.call('removeQueuedRun', { request, actorId, idempotencyKey })
    // Replaying the same committed event is safe: session subscribers deduplicate by seq/eventId.
    this.publishEvent(event)
    return receipt
  }
  async editQueuedRunText(request: QueuedRunEditTextInput, actorId: string, idempotencyKey: string) {
    const { receipt, event } = await this.storage.call('editQueuedRunText', { request, actorId, idempotencyKey })
    this.publishEvent(event)
    return receipt
  }
  async guideQueuedRun(input: {
    actorId: string
    idempotencyKey: string
    request: QueuedRunGuideInput
  }): Promise<QueuedRunGuideReceipt> {
    // Durable replay is valid even after the original driver has settled.
    // The storage transaction verifies the exact input hash and actor/key.
    const prior = await this.storage.call(
      'queuedRunGuideReceipt',
      input.actorId,
      input.idempotencyKey,
      input.request.sessionId,
    )
    if (!prior) {
      const active = this.active.get(input.request.sessionId)
      if (
        this.closing ||
        !active?.steeringReady ||
        active.run.id !== input.request.activeRunId ||
        active.controller.signal.aborted
      )
        throw new HbarError('COMMAND_CONFLICT', 'The original Run is not accepting live guidance')
    }
    const result = await this.storage.call('guideQueuedRun', input)
    this.publishEvent(result.event)
    this.changed('session-activity')
    return result.receipt
  }
  async compact(sessionId: string, modelId: string, signal?: AbortSignal) {
    this.assertIdle()
    this.maintenance = true
    try {
      return await this.compactInternal(
        sessionId,
        await this.plugins.get<ModelRegistry>('models').get(modelId),
        signal ? AbortSignal.any([signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
      )
    } finally {
      this.maintenance = false
    }
  }
  private async compactInternal(
    sessionId: string,
    model: ProviderConfig,
    signal: AbortSignal,
    runId?: string,
    workspaceOverride?: Workspace,
    protectedInitialSeq?: number,
    thinking?: ThinkingLevel,
  ) {
    const request = await this.buildRequest(sessionId, model, this.hooks, undefined, workspaceOverride)
    const retain = this.plugins.get<CompactionProvider>('compaction').retainMessages
    let boundary = -1
    for (let i = 1; i <= request.messages.length - retain; i++) {
      const message = request.messages[i]
      if (message?.role === 'user' && (protectedInitialSeq === undefined || message.seq <= protectedInitialSeq))
        boundary = i
    }
    if (boundary < 1) {
      if (!runId) throw new HbarError('NOTHING_TO_COMPACT', 'More completed conversation history is needed')
      return { summary: '' }
    }
    const older = request.messages.slice(0, boundary)
    const summarization: ModelRequest = {
      ...request,
      system: `Summarize the conversation faithfully. Preserve objectives, files, tool outcomes, constraints, and unresolved work. Do not execute tools.\n${request.system}`,
      messages: older,
      context: {
        ...request.context,
        sessionId,
        ...(runId ? { runId } : {}),
        thinking: normalizeThinkingLevel(model, thinking),
      },
    }
    const attemptId = crypto.randomUUID()
    await this.append(
      sessionId,
      'compaction.request',
      { ...describeUsageAttempt(attemptId, 'compaction', model), request: summarization },
      runId,
      attemptId,
    )
    const result = await this.plugins
      .get<HarnessDriver>('driver')
      .summarize(summarization, model.protocol === 'mock' ? null : await this.secrets.get(model.id), signal)
    await this.append(
      sessionId,
      'usage.recorded',
      createUsageFact({ usage: result.usage, runId, attemptId, source: 'compaction', model }),
      runId,
      attemptId,
    )
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
  async skills() {
    const root = join(this.options.layout.skills, 'global')
    const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
    return entries
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entry) => ({ id: entry.name, path: join(root, entry.name) }))
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
  async changePlugin(id: string, enabled: boolean, config?: Record<string, unknown>, projectId?: string) {
    this.assertIdle()
    this.maintenance = true
    try {
      if (projectId) await this.storage.call('workspace', projectId)
      const plugins = await this.plugins.set(id, enabled, config, projectId)
      this.changed('plugins')
      return plugins
    } finally {
      this.maintenance = false
    }
  }
  async changePluginTree(id: string, projectId?: string) {
    this.assertIdle()
    this.maintenance = true
    try {
      const plugins = await this.plugins.disableTree(id, projectId)
      this.changed('plugins')
      return plugins
    } finally {
      this.maintenance = false
      for (const sessionId of this.wakeups) this.kick(sessionId)
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
    while (this.drains.size || this.scheduledWakeups.waiting.length)
      await Promise.all([...this.drains.values(), ...this.scheduledWakeups.waiting])
  }
  async close() {
    this.closing = true
    for (const timer of this.summaryTimers.values()) clearTimeout(timer)
    this.summaryTimers.clear()
    this.summaryPending.clear()
    this.scheduledWakeups.close()
    this.schemaCallbacks.dispose()
    this.directoryQueries.dispose()
    for (const active of this.active.values())
      active.controller.abort(new HbarError('HOST_SHUTTING_DOWN', 'Host shutting down'))
    await this.sessionLaunchPreparations.close()
    await this.sessionLaunchTargets.close()
    await this.waitForIdle()
    for (const pending of this.userInputs.values())
      await pending.settle(undefined, new HbarError('USER_INPUT_CANCELLED', 'Host shutting down'))
    await this.plugins.close()
    await this.storage.close()
  }
}
