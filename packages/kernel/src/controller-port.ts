import type { ControllerKernelContract } from './controller-kernel-contract'
import type { NodeWorkspaceInspectionPort } from './node-workspace-inspection'
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

/** Application use-case ports select the explicit public contract without depending on the concrete Kernel runtime class. */
export type ConfigurationCommandKernelPort = Pick<
  ControllerKernelContract,
  'providerProfiles' | 'permissionMode' | 'setPermissionMode' | 'saveProvider' | 'models' | 'deleteProvider'
>
export type RunCommandKernelPort = Pick<
  ControllerKernelContract,
  | 'storage'
  | 'submit'
  | 'cancel'
  | 'compact'
  | 'editQueuedRunText'
  | 'removeQueuedRun'
  | 'guideQueuedRun'
  | 'undoFileChanges'
> &
  Partial<Pick<ControllerKernelContract, 'continueInterrupted'>>
export type InteractionCommandKernelPort = Pick<
  ControllerKernelContract,
  'storage' | 'resolvePlanExit' | 'resolveApproval' | 'snapshot' | 'resolveUserInput'
>
export type ModelCommandKernelPort = Pick<ControllerKernelContract, 'models' | 'getContextUsage'>
export type WorkspaceSessionCommandKernelPort = Pick<
  ControllerKernelContract,
  'storage' | 'changed' | 'createWorkspace' | 'createNodeWorkspace' | 'updateSession'
> & {
  readonly options: Pick<ControllerKernelContract['options'], 'layout'> & {
    readonly nodeWorkspaceInspection?: Pick<NodeWorkspaceInspectionPort, 'verifyWorkspaceFolders'> | undefined
  }
  readonly active: { has(sessionId: string): boolean }
}
export type SessionLaunchTargetCommandKernelPort = Pick<
  ControllerKernelContract,
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
  ControllerKernelContract,
  'storage' | 'selectSessionBranchTarget' | 'reconcileSessionBranchTarget'
> & {
  readonly sessionBranchTargets: Pick<ControllerKernelContract['sessionBranchTargets'], 'list'>
}
export type SandboxCommandPort = Pick<
  ControllerKernelContract['sandboxProfiles'],
  'list' | 'get' | 'save' | 'delete' | 'receipt'
>
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
  ControllerKernelContract['plugins'],
  'list' | 'remove' | 'lock' | 'protectedResourceRoots' | 'assetPath'
> & {
  resolve(
    ...args: Parameters<ControllerKernelContract['plugins']['resolve']>
  ):
    | ReturnType<ControllerKernelContract['plugins']['resolve']>
    | Promise<ReturnType<ControllerKernelContract['plugins']['resolve']>>
  graph(
    ...args: Parameters<ControllerKernelContract['plugins']['graph']>
  ):
    | ReturnType<ControllerKernelContract['plugins']['graph']>
    | Promise<ReturnType<ControllerKernelContract['plugins']['graph']>>
  doctor():
    | ReturnType<ControllerKernelContract['plugins']['doctor']>
    | Promise<ReturnType<ControllerKernelContract['plugins']['doctor']>>
  clientCode(id: string): string | Promise<string>
  get<Capability extends keyof KernelControllerCapabilities>(
    capability: Capability,
  ): KernelControllerCapabilities[Capability]
  openScope(kind: 'client', id: string): Promise<KernelClientScopePort>
}
type HostUseCases = Pick<
  ControllerKernelContract,
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
  readonly options: Pick<ControllerKernelContract['options'], 'layout' | 'demo' | 'noLocalExec'> & {
    readonly nodeWorkspaceInspection?: Pick<NodeWorkspaceInspectionPort, 'verifyWorkspaceFolders'> | undefined
  }
  readonly active: { readonly size: number; has(sessionId: string): boolean }
  readonly streams: ReadonlyMap<string, LiveStream>
  readonly plugins: KernelPluginControllerPort
  readonly tools: { list(): Array<{ readonly name: string }> }
  readonly directoryQueries: Pick<
    ControllerKernelContract['directoryQueries'],
    'execute' | 'dispatch' | 'dispatchPrepared' | 'describe' | 'list'
  > &
    Partial<Pick<ControllerKernelContract['directoryQueries'], 'dispatchPreparedTracked'>>
  readonly schemaCallbacks: Pick<ControllerKernelContract['schemaCallbacks'], 'query'>
  readonly sandboxProfiles: SandboxCommandPort
  readonly sessionSandboxProfileId: ControllerKernelContract['sessionSandboxProfileId']
  readonly workspaceSandboxes: Pick<ControllerKernelContract['workspaceSandboxes'], 'prepare'>
  readonly sessionLaunchTargets: Pick<ControllerKernelContract['sessionLaunchTargets'], 'workspaceForRun'>
}
