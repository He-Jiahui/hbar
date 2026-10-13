import type { KernelControllerPort, KernelControllerCapabilities, KernelPluginControllerPort } from './controller-port'
import type { RuntimeValuePort, IpcCallOptions } from '@hbar/runtime'

type Callable = (...args: never[]) => unknown
type Methods<Target> = {
  [Key in keyof Target]-?: NonNullable<Target[Key]> extends Callable ? Key : never
}[keyof Target]
type MethodValue<Target, Key extends keyof Target> = Extract<NonNullable<Target[Key]>, Callable>
export interface RuntimeApplicationTargets extends KernelControllerCapabilities {
  readonly kernel: Omit<KernelControllerPort, 'subscribe'>
  readonly plugins: Omit<KernelPluginControllerPort, 'get' | 'openScope'>
  readonly directory: KernelControllerPort['directoryQueries']
  readonly schema: KernelControllerPort['schemaCallbacks']
  readonly sandbox: KernelControllerPort['sandboxProfiles']
  readonly workspaceSandbox: KernelControllerPort['workspaceSandboxes']
  readonly launchTarget: KernelControllerPort['sessionLaunchTargets']
  readonly branchTarget: KernelControllerPort['sessionBranchTargets']
  readonly workspaceQuery: NonNullable<KernelControllerCapabilities['execution']['workspaceQuery']>
}
/** Explicit public methods only. Contexts, registries, private Kernel members and executable schemas are never exposed. */
export const RUNTIME_APPLICATION_METHODS = {
  kernel: [
    'applyStorageLocations',
    'automationGet',
    'automationSet',
    'bootstrap',
    'changePlugin',
    'changePluginTree',
    'compact',
    'createWorkspace',
    'createNodeWorkspace',
    'deleteProvider',
    'editQueuedRunText',
    'getContextUsage',
    'getSessionLaunchTarget',
    'guideQueuedRun',
    'installPlugin',
    'models',
    'moveSession',
    'paths',
    'providerProfiles',
    'reconcileSessionBranchTarget',
    'reconcileSessionLaunchTarget',
    'reconcileSessionLaunchTargetPreparation',
    'removeChatDatabaseResource',
    'removeChatDatabaseSession',
    'removeQueuedRun',
    'reorderQueued',
    'resetSetting',
    'resolveApproval',
    'resolvePlanExit',
    'resolveUserInput',
    'saveProvider',
    'searchSettings',
    'selectSessionBranchTarget',
    'sessionSummaries',
    'sessionSandboxProfileId',
    'setPaths',
    'setPermissionMode',
    'setSessionLaunchTarget',
    'setSetting',
    'settingsCatalog',
    'settingsSnapshot',
    'skills',
    'snapshot',
    'startSessionLaunchTargetPreparation',
    'storageLocations',
    'submit',
    'updateSession',
    'upload',
    'validatePaths',
    'cancel',
    'cancelSessionLaunchTarget',
    'cancelSessionLaunchTargetPreparation',
    'readSessionLaunchTargetPreparation',
    'prepareSessionLaunchTarget',
    'continueInterrupted',
    'undoFileChanges',
  ],
  plugins: ['remove', 'resolve', 'graph', 'lock', 'doctor', 'clientCode', 'assetPath'],
  directory: ['execute', 'dispatch', 'describe', 'list'],
  schema: ['query'],
  sandbox: ['list', 'get', 'save', 'delete', 'receipt'],
  workspaceSandbox: ['prepare'],
  launchTarget: ['workspaceForRun'],
  branchTarget: ['list'],
  goal: [
    'resumeOnStartup',
    'snapshot',
    'get',
    'create',
    'set',
    'update',
    'clear',
    'requestContinuation',
    'reconcileRun',
    'recoveryReason',
  ],
  plan: ['snapshot', 'get', 'withRevision', 'update', 'clear'],
  mode: ['get', 'set', 'commitExit'],
  budget: ['get', 'set', 'setCommand', 'getCommandReceipt', 'clear', 'assertCanStart', 'reconcileRun'],
  workflow: [
    'get',
    'focus',
    'savePlan',
    'start',
    'activate',
    'expandScope',
    'checkpoint',
    'delegate',
    'acceptCheck',
    'complete',
  ],
  agent: ['policy', 'setPolicy', 'create', 'list', 'cancel', 'result', 'applyPatch'],
  browser: [
    'status',
    'navigate',
    'go',
    'snapshot',
    'click',
    'type',
    'press',
    'screenshot',
    'evaluate',
    'close',
    'history',
  ],
  computer: ['status', 'screenshot', 'click', 'doubleClick', 'type', 'key', 'scroll', 'move', 'wait', 'launch'],
  execution: ['list', 'read', 'readBytes', 'write', 'exec', 'restoreFiles'],
  workspaceQuery: ['find', 'search', 'readRange', 'invalidate'],
  git: [
    'info',
    'status',
    'diff',
    'log',
    'stats',
    'commit',
    'stage',
    'unstage',
    'branch',
    'createLaunchBranch',
    'worktree',
    'launchBranchSnapshot',
    'diffToRemote',
  ],
} as const satisfies {
  readonly [Target in keyof RuntimeApplicationTargets]: readonly Extract<
    Methods<RuntimeApplicationTargets[Target]>,
    string
  >[]
}
export const RUNTIME_APPLICATION_CONTROLS = [
  'kernel.cancel',
  'kernel.resolveApproval',
  'kernel.resolveUserInput',
  'kernel.resolvePlanExit',
  'kernel.cancelSessionLaunchTarget',
  'kernel.cancelSessionLaunchTargetPreparation',
  'agent.cancel',
] as const
export function callRuntimeApplication<
  Target extends keyof RuntimeApplicationTargets,
  Method extends Extract<Methods<RuntimeApplicationTargets[Target]>, string>,
>(
  port: RuntimeValuePort,
  target: Target,
  method: Method,
  args: Parameters<MethodValue<RuntimeApplicationTargets[Target], Method>>,
  options?: IpcCallOptions,
): Promise<Awaited<ReturnType<MethodValue<RuntimeApplicationTargets[Target], Method>>>> {
  return port.call(`${target}.${method}`, args, options)
}
