import type { Kernel } from './index'
import type { LiveStream } from '@hbar/contracts'
import type {
  AgentService,
  BrowserUseService,
  BudgetService,
  ComputerUseService,
  ExecutionProvider,
  GitService,
  GoalService,
  ModeService,
  PlanService,
  WorkflowService,
} from '@hbar/plugin-sdk'

/** Application use-case ports; controllers need neither private Kernel state nor a concrete runtime class. */
export type ConfigurationCommandKernelPort = Pick<
  Kernel,
  'providerProfiles' | 'permissionMode' | 'setPermissionMode' | 'saveProvider' | 'models' | 'deleteProvider'
>
export type RunCommandKernelPort = Pick<
  Kernel,
  'storage' | 'submit' | 'cancel' | 'compact' | 'editQueuedRunText' | 'removeQueuedRun' | 'guideQueuedRun' | 'undoFileChanges'
> &
  Partial<Pick<Kernel, 'continueInterrupted'>>
export type InteractionCommandKernelPort = Pick<
  Kernel,
  'storage' | 'resolvePlanExit' | 'resolveApproval' | 'snapshot' | 'resolveUserInput'
>
export type ModelCommandKernelPort = Pick<Kernel, 'models' | 'getContextUsage'>
export type WorkspaceSessionCommandKernelPort = Pick<
  Kernel,
  'storage' | 'changed' | 'createWorkspace' | 'createNodeWorkspace' | 'updateSession'
> & {
  readonly options: Pick<Kernel['options'], 'layout'>
  readonly active: { has(sessionId: string): boolean }
}
export type SessionLaunchTargetCommandKernelPort = Pick<
  Kernel,
  | 'storage'
  | 'getSessionLaunchTarget'
  | 'setSessionLaunchTarget'
  | 'prepareSessionLaunchTarget'
  | 'reconcileSessionLaunchTarget'
  | 'cancelSessionLaunchTarget'
  | 'startSessionLaunchTargetPreparation'
  | 'readSessionLaunchTargetPreparation'
  | 'cancelSessionLaunchTargetPreparation'
  | 'reconcileSessionLaunchTargetPreparation'
>
export type SessionBranchTargetCommandKernelPort = Pick<
  Kernel,
  'storage' | 'selectSessionBranchTarget' | 'reconcileSessionBranchTarget'
> & {
  readonly sessionBranchTargets: Pick<Kernel['sessionBranchTargets'], 'list'>
}
export type SandboxCommandPort = Pick<Kernel['sandboxProfiles'], 'list' | 'get' | 'save' | 'delete' | 'receipt'>
export interface KernelControllerCapabilities {
  readonly mode: ModeService
  readonly goal: GoalService
  readonly plan: PlanService
  readonly execution: ExecutionProvider
  readonly agent: AgentService
  readonly browser: BrowserUseService
  readonly computer: ComputerUseService
  readonly git: GitService
  readonly budget: BudgetService
  readonly workflow: WorkflowService
}
export interface KernelClientScopePort {
  dispose(): Promise<void>
}
export type KernelPluginControllerPort = Pick<
  Kernel['plugins'],
  'list' | 'remove' | 'lock' | 'protectedResourceRoots' | 'assetPath'
> & {
  resolve(
    ...args: Parameters<Kernel['plugins']['resolve']>
  ): ReturnType<Kernel['plugins']['resolve']> | Promise<ReturnType<Kernel['plugins']['resolve']>>
  graph(
    ...args: Parameters<Kernel['plugins']['graph']>
  ): ReturnType<Kernel['plugins']['graph']> | Promise<ReturnType<Kernel['plugins']['graph']>>
  doctor(): ReturnType<Kernel['plugins']['doctor']> | Promise<ReturnType<Kernel['plugins']['doctor']>>
  clientCode(id: string): string | Promise<string>
  get<Capability extends keyof KernelControllerCapabilities>(
    capability: Capability,
  ): KernelControllerCapabilities[Capability]
  openScope(kind: 'client', id: string): Promise<KernelClientScopePort>
}
type HostUseCases = Pick<
  Kernel,
  | 'applyStorageLocations'
  | 'assertIdle'
  | 'automationGet'
  | 'automationSet'
  | 'bootstrap'
  | 'changed'
  | 'changePlugin'
  | 'changePluginTree'
  | 'chatDatabaseIsIdle'
  | 'chatDatabaseSessionProtection'
  | 'installPlugin'
  | 'instanceId'
  | 'maintainChatDatabase'
  | 'moveSession'
  | 'notifyChatDatabaseDeleted'
  | 'paths'
  | 'pendingUserInput'
  | 'permissionMode'
  | 'recovered'
  | 'removeChatDatabaseResource'
  | 'removeChatDatabaseSession'
  | 'reorderQueued'
  | 'resetSetting'
  | 'searchSettings'
  | 'sessionSummaries'
  | 'setPaths'
  | 'setSetting'
  | 'settingsCatalog'
  | 'settingsSnapshot'
  | 'skills'
  | 'snapshot'
  | 'storage'
  | 'storageLocations'
  | 'storageHealth'
  | 'subscribe'
  | 'upload'
  | 'validatePaths'
>
export interface KernelControllerPort
  extends
    HostUseCases,
    ConfigurationCommandKernelPort,
    RunCommandKernelPort,
    InteractionCommandKernelPort,
    ModelCommandKernelPort,
    WorkspaceSessionCommandKernelPort,
    SessionLaunchTargetCommandKernelPort,
    SessionBranchTargetCommandKernelPort {
  readonly options: Pick<Kernel['options'], 'layout' | 'demo'>
  readonly active: { readonly size: number; has(sessionId: string): boolean }
  readonly streams: ReadonlyMap<string, LiveStream>
  readonly plugins: KernelPluginControllerPort
  readonly tools: { list(): Array<{ readonly name: string }> }
  readonly directoryQueries: Pick<Kernel['directoryQueries'], 'execute' | 'dispatch' | 'describe' | 'list'>
  readonly schemaCallbacks: Pick<Kernel['schemaCallbacks'], 'query'>
  readonly sandboxProfiles: SandboxCommandPort
  readonly workspaceSandboxes: Pick<Kernel['workspaceSandboxes'], 'prepare'>
  readonly sessionLaunchTargets: Pick<Kernel['sessionLaunchTargets'], 'workspaceForRun'>
}
