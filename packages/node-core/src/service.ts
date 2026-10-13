import { createHash } from 'node:crypto'
import { lstat, readdir, realpath } from 'node:fs/promises'
import { HbarError } from '@hbar/contracts'
import { z } from 'zod'
import { join, resolve } from 'node:path'
import { isPathWithin } from '@hbar/contracts/path-containment'
import type { ExecutionProvider, GitService, OsConfinementOptions } from '@hbar/plugin-sdk'
import {
  NODE_PROTOCOL_VERSION,
  NODE_LIMITS,
  nodeFloorSchema,
  nodeCapabilitiesSchema,
  nodeExecStartSchema,
  nodeExecResultSchema,
  type NodeFloor,
  type NodeCapabilities,
  type NodeExecStart,
  type NodeReceipt,
  type NodeCallAuthority,
  type NodeExecResult,
} from '@hbar/contracts/node'
import { nodeCallAuthoritySchema } from '@hbar/contracts/node-authority'
import { nodeWorkspaceMountManifestSchema } from '@hbar/contracts/node-workspace-mount-plan'
import { type NodeGitMethod } from '@hbar/contracts/node-git'
import type { NodeStatePort } from '@hbar/contracts/node-state'
import type { ResolvedSandboxProfile, SandboxSnapshotRef } from '@hbar/contracts/sandbox'
import type { ParsedWorkspaceSearchInput, ParsedWorkspaceFindInput } from '@hbar/contracts/workspace-query'
import type { ToolFileChange } from '@hbar/contracts/run-file-changes'
import {
  canonicalSandboxJSON,
  evaluateSandboxCall,
  verifySandboxSnapshot,
  SANDBOX_EVALUATOR_FINGERPRINT,
} from '@hbar/sandbox'
import {
  nodeOwnedPath,
  localNodePaths,
  localProcessPermissionPaths,
  validateNodeRoots,
  nodeProtectedPaths,
} from './paths'
import { createProcessPermissionManifest } from './process-permissions'
import { createNodeWorkspaceMountPlan, nodeWorkspaceMountManifestDigest } from './workspace-mount-plan'
import type { NodeExecutionBackend } from './execution-backend'
import { NodeGitOperationService, type NodeGitAdmissionContext, type NodeGitRequest } from './git-operation'
import { NodeGitQueryOperationService, type NodeGitQueryRequest } from './git-query-operation'
import { NodeLocalConfirmationService } from './local-confirmations'
import {
  nodeLocalConfirmationIdentitySchema,
  nodeLocalConfirmationResolveSchema,
  nodeLocalConfirmationLookupSchema,
  type NodeLocalConfirmationPort,
  type NodeManualGitQueryConfirmation,
  type NodeManualLocalOperationConfirmation,
} from '@hbar/contracts/node-confirmations'
import {
  nodeWorktreeProvisioningAuthoritySchema,
  type NodeWorktreeProvisioningAuthority,
} from '@hbar/contracts/node-worktree-provisioning'
import { NodeExecutionOutputBuffer, type NodeExecOutputChunk, type NodeExecOutputPage } from './execution-output'
import type { NodeProcessReservation } from './process-lifecycle'
import {
  createManagedNodeWorktreeAllocator,
  type ManagedNodeWorktreeAllocator,
  type ManagedNodeWorktreeGitPort,
  type ManagedNodeWorktreeGitOperation,
} from './worktrees'
import { ManagedNodeRootRegistry, managedNodeFloor } from './managed-root-registry'
import {
  nodeWorktreeCreateSchema,
  nodeWorktreeMethods,
  nodeWorktreeRemoveSchema,
  type NodeManagedWorktree,
} from '@hbar/contracts/node-worktree'
export type {
  NodeExecutionBackend,
  NodeExecutionBackendOptions,
  NodeExecutionWorkspaceMount,
  NodeExecutionInternalMount,
  NodeArgvResult,
} from './execution-backend'

const dangerousEnvironment = /^(?:PATH|PATHEXT|LD_PRELOAD|LD_LIBRARY_PATH|DYLD_.*|BASH_ENV|ENV|NODE_OPTIONS)$/i
const unsafeGitEnvironment =
  /^(?:HOME|USERPROFILE|GIT_(?:DIR|WORK_TREE|COMMON_DIR|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CEILING_DIRECTORIES|PREFIX|EXEC_PATH|SSH.*|ASKPASS|CONFIG.*|TRACE.*|ATTR.*))$/i
const digestOf = (value: unknown) => createHash('sha256').update(canonicalSandboxJSON(value)).digest('hex')
const sameAuthorityValue = (left: unknown, right: unknown) => canonicalSandboxJSON(left) === canonicalSandboxJSON(right)
function outputTail(text: string): string {
  const bytes = Buffer.from(text)
  let start = Math.max(0, bytes.length - NODE_LIMITS.outputBytes)
  while (start < bytes.length && ((bytes[start] ?? 0) & 0xc0) === 0x80) start++
  return bytes.subarray(start).toString('utf8')
}
export class WorkspaceNodeService {
  private floor: NodeFloor
  private floorRevision: number
  private paused = false
  private disposed = false
  private starting = 0
  private changingPolicy = false
  private readonly snapshots = new Map<string, ResolvedSandboxProfile>()
  private readonly active = new Map<
    string,
    { controller: AbortController; finished: Promise<void>; durable?: boolean; cancel?: () => Promise<void> }
  >()
  private readonly pendingStarts = new Map<
    string,
    { controller: AbortController; finished: Promise<void>; resolve: () => void }
  >()
  private readonly startDrainWaiters = new Set<() => void>()
  private readonly locks = new Map<string, Promise<void>>()
  private readonly pendingCancellations = new Map<string, number>()
  private linkTimer: ReturnType<typeof setTimeout> | undefined
  private linkExpired = false
  private closing: Promise<void> | undefined
  private readonly completions = new Set<Promise<void>>()
  private readonly policyListeners = new Set<() => void>()
  private gitOperations: NodeGitOperationService | undefined
  private gitQueries: NodeGitQueryOperationService | undefined
  private worktrees: ManagedNodeWorktreeAllocator | undefined
  private readonly managedRoots = new ManagedNodeRootRegistry(() => this.floor)
  private localConfirmations: NodeLocalConfirmationService | undefined
  private readonly executionOutputs = new Map<string, NodeExecutionOutputBuffer>()
  private readonly outputListeners = new Set<(chunk: NodeExecOutputChunk) => void>()
  private readonly exitListeners = new Set<(event: { operationId: string; receipt: NodeReceipt }) => void>()
  constructor(
    readonly id: string,
    readonly dataRoot: string,
    private readonly state: NodeStatePort,
    private readonly execution: ExecutionProvider,
    floor: NodeFloor,
    floorRevision: number,
    private readonly backend: NodeExecutionBackend,
  ) {
    this.floor = nodeFloorSchema.parse(floor)
    this.floorRevision = floorRevision
  }
  static async open(
    id: string,
    dataRoot: string,
    state: NodeStatePort,
    execution: ExecutionProvider,
    backend: NodeExecutionBackend,
  ) {
    await state.call('ready', {})
    let snapshot = await state.call('floor.snapshot', {})
    if (!snapshot) {
      await state.call('floor.set', nodeFloorSchema.parse({ roots: [] }))
      snapshot = await state.call('floor.snapshot', {})
    }
    const floor = snapshot.floor ?? nodeFloorSchema.parse({ roots: [] })
    if (!snapshot.floor) {
      await state.call('floor.set', floor)
      snapshot = await state.call('floor.snapshot', {})
    }
    const node = new WorkspaceNodeService(
      id,
      dataRoot,
      state,
      execution,
      await validateNodeRoots(floor, dataRoot),
      snapshot.revision,
      backend,
    )
    node.paused = (await state.call('config.get', { key: 'paused' })) === true
    return node
  }
  get policy(): NodeFloor {
    return nodeFloorSchema.parse(this.floor)
  }
  installLocalConfirmations(store: NodeLocalConfirmationPort): void {
    if (this.localConfirmations)
      throw new HbarError('NODE_CONFIRMATION_ALREADY_INSTALLED', 'Confirmation gate is installed')
    this.localConfirmations = new NodeLocalConfirmationService(store)
  }
  private async confirmationIdentityCurrent(identityValue: unknown): Promise<boolean> {
    const identity = nodeLocalConfirmationIdentitySchema.parse(identityValue)
    if (
      (identity.source === 'run' && identity.operationId !== `${identity.runId}:${identity.callId}`) ||
      (identity.nodeId !== undefined && identity.nodeId !== this.id) ||
      identity.floorRevision !== this.floorRevision
    )
      return false
    try {
      if (identity.source === 'launch-target') {
        const registration = this.floor.roots.find((root) => root.rootId === identity.rootId)
        if (!registration || registration.path !== identity.rootPath || !this.worktrees) return false
        return await this.worktrees.provisioningCurrent(identity, new AbortController().signal)
      }
      if (identity.source === 'run') {
        const accepted = await this.state.call('operation.get', { operationId: identity.operationId })
        if (accepted) {
          if (!nodeCallAuthoritySchema.safeParse(accepted.authority).success) return false
          const authority = nodeCallAuthoritySchema.parse(accepted.authority)
          const manifestDigest = authority.workspaceMounts?.digest
          if (
            accepted.argumentsDigest !== identity.argumentsDigest ||
            accepted.target?.rootId !== identity.rootId ||
            authority.sessionId !== identity.sessionId ||
            authority.runId !== identity.runId ||
            authority.callId !== identity.callId ||
            digestOf({ sandbox: authority.sandbox, admission: authority.admission }) !== identity.admissionDigest ||
            !sameAuthorityValue(authority.managedWorktree ?? null, identity.managedWorktree ?? null) ||
            manifestDigest !== identity.workspaceMountsDigest ||
            accepted.receipt.state !== 'accepted'
          )
            return false
        }
      }
      if (identity.source !== 'run') {
        const registration = this.floor.roots.find((root) => root.rootId === identity.rootId)
        if (!registration || registration.path !== identity.rootPath) return false
        const target = await nodeOwnedPath(this.floor, this.dataRoot, identity.rootId, '.')
        return target.root === identity.rootPath && target.registration.path === identity.rootPath
      }
      const registration = this.floor.roots.find((root) => root.rootId === identity.rootId)
      if (identity.managedWorktree) {
        if (!identity.sessionId || registration) return false
        const managed = await this.managedRoots.resolve(identity.rootId, {
          sessionId: identity.sessionId,
          managedWorktree: identity.managedWorktree,
        })
        return managed?.nodePath === identity.rootPath
      }
      if (registration) {
        if (registration.path !== identity.rootPath) return false
        const target = await nodeOwnedPath(this.floor, this.dataRoot, identity.rootId, '.')
        return target.root === identity.rootPath && target.registration.path === identity.rootPath
      }
      return false
    } catch {
      return false
    }
  }
  async confirmLocalOperation(
    input: {
      readonly operationId: string
      readonly authority: NodeCallAuthority
      readonly rootId: string
      readonly rootPath: string
      readonly tool: string
      readonly effects: readonly ('read' | 'write' | 'process')[]
      readonly argumentsDigest: string
      readonly summary: string
    },
    signal?: AbortSignal,
  ): Promise<void> {
    signal?.throwIfAborted()
    const mode = this.floor.localConfirm
    const required =
      mode === 'always' ||
      (mode === 'write' && input.effects.includes('write')) ||
      (mode === 'process' && input.effects.includes('process'))
    if (!required) return
    if (!this.localConfirmations)
      throw new HbarError('NODE_LOCAL_CONFIRMATION_REQUIRED', 'B-local confirmation storage is unavailable')
    const authority = nodeCallAuthoritySchema.parse(input.authority)
    const identity = nodeLocalConfirmationIdentitySchema.parse({
      operationId: input.operationId,
      sessionId: authority.sessionId,
      runId: authority.runId,
      callId: authority.callId,
      source: 'run',
      ownerDeviceId: null,
      ...(authority.managedWorktree ? { managedWorktree: authority.managedWorktree } : {}),
      ...(authority.workspaceMounts ? { workspaceMountsDigest: authority.workspaceMounts.digest } : {}),
      rootId: input.rootId,
      rootPath: input.rootPath,
      floorRevision: this.floorRevision,
      admissionDigest: digestOf({ sandbox: authority.sandbox, admission: authority.admission }),
      argumentsDigest: input.argumentsDigest,
      tool: input.tool,
      summary: input.summary.slice(0, 4_000),
    })
    try {
      await this.localConfirmations.require(identity, (candidate) => this.confirmationIdentityCurrent(candidate))
      signal?.throwIfAborted()
    } catch (error) {
      if (signal?.aborted) await this.localConfirmations.cancelOperation(input.operationId)
      throw error
    }
  }
  async confirmLaunchTargetOperation(
    input: {
      readonly operationId: string
      readonly provisioning: NodeWorktreeProvisioningAuthority
      readonly rootId: string
      readonly rootPath: string
      readonly tool: 'worktree.create' | 'worktree.get' | 'worktree.remove'
      readonly argumentsDigest: string
      readonly summary: string
      readonly worktreeId?: string
    },
    signal?: AbortSignal,
  ): Promise<void> {
    signal?.throwIfAborted()
    const mode = this.floor.localConfirm
    const writing = input.tool === 'worktree.create' || input.tool === 'worktree.remove'
    const required = mode === 'always' || (writing && (mode === 'process' || mode === 'write'))
    if (!required) return
    if (!this.localConfirmations)
      throw new HbarError('NODE_LOCAL_CONFIRMATION_REQUIRED', 'B-local confirmation storage is unavailable')
    const provisioning = nodeWorktreeProvisioningAuthoritySchema.parse(input.provisioning)
    const identity = nodeLocalConfirmationIdentitySchema.parse({
      operationId: input.operationId,
      source: 'launch-target',
      sessionId: provisioning.sessionId,
      runId: provisioning.runId,
      callId: null,
      ownerDeviceId: null,
      workspaceId: provisioning.workspaceId,
      nodeId: provisioning.nodeId,
      targetRevision: provisioning.targetRevision,
      selection: provisioning.selection,
      acceptedTargetDigest: provisioning.acceptedTargetDigest,
      workspaceFolderRevision: provisioning.workspaceFolderRevision,
      workspaceFolderDigest: provisioning.workspaceFolderDigest,
      ...(input.worktreeId ? { worktreeId: input.worktreeId } : {}),
      rootId: input.rootId,
      rootPath: input.rootPath,
      floorRevision: this.floorRevision,
      argumentsDigest: input.argumentsDigest,
      tool: input.tool,
      summary: input.summary.slice(0, 4_000),
    })
    try {
      await this.localConfirmations.require(identity, (candidate) => this.confirmationIdentityCurrent(candidate))
      signal?.throwIfAborted()
    } catch (error) {
      if (signal?.aborted) await this.localConfirmations.cancelOperation(input.operationId)
      throw error
    }
  }
  async confirmManualLocalOperation(input: NodeManualLocalOperationConfirmation): Promise<void> {
    const mode = this.floor.localConfirm
    const required =
      mode === 'always' ||
      (mode === 'write' && input.effect === 'write') ||
      (mode === 'process' && input.effect === 'process')
    if (!required) return
    if (!this.localConfirmations)
      throw new HbarError('NODE_LOCAL_CONFIRMATION_REQUIRED', 'B-local confirmation storage is unavailable')
    const identity = nodeLocalConfirmationIdentitySchema.parse({
      operationId: input.operationId,
      source: input.source ?? 'manual',
      sessionId: input.sessionId,
      runId: null,
      callId: null,
      ownerDeviceId: input.ownerDeviceId,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.nodeId ? { nodeId: input.nodeId } : {}),
      rootId: input.rootId,
      rootPath: input.rootPath,
      floorRevision: this.floorRevision,
      admissionDigest: input.snapshotDigest,
      argumentsDigest: input.argumentsDigest,
      tool: input.tool,
      summary: input.summary.slice(0, 4_000),
    })
    // The owner device belongs to A's authenticated terminal session. B-local
    // console identities are separate and are checked only when resolving consent.
    await this.localConfirmations.require(identity, (candidate) => this.confirmationIdentityCurrent(candidate))
  }
  async confirmManualGitQuery(inputValue: NodeManualGitQueryConfirmation): Promise<void> {
    const input = nodeLocalConfirmationLookupSchema.parse(inputValue)
    if (!('kind' in input) || input.kind !== 'manual-query' || input.nodeId !== this.id)
      throw new HbarError('WORKSPACE_SCOPE', 'Manual Git query belongs to another node')
    const registration = this.floor.roots.find((root) => root.rootId === input.rootId)
    if (!registration || registration.path !== input.expectedRoot)
      throw new HbarError('NODE_ROOT_CHANGED', 'Manual Git query root differs from the current node floor')
    await this.confirmManualLocalOperation({
      operationId: input.operationId,
      sessionId: input.sessionId,
      ownerDeviceId: input.deviceId,
      workspaceId: input.workspaceId,
      nodeId: input.nodeId,
      rootId: input.rootId,
      rootPath: input.expectedRoot,
      tool: input.method,
      effect: 'process',
      snapshotDigest: digestOf({
        kind: input.kind,
        deviceId: input.deviceId,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        nodeId: input.nodeId,
        rootId: input.rootId,
        expectedRoot: input.expectedRoot,
        method: input.method,
      }),
      argumentsDigest: input.argumentsDigest,
      summary: JSON.stringify({ method: input.method, rootId: input.rootId }),
      source: 'manual-query',
    })
  }
  async listLocalConfirmations(includeResolved = false) {
    if (!this.localConfirmations)
      throw new HbarError('NODE_LOCAL_CONFIRMATION_UNAVAILABLE', 'B-local confirmation storage is unavailable')
    return { entries: await this.localConfirmations.list(includeResolved) }
  }
  async resolveLocalConfirmation(
    device: { readonly deviceId: string; readonly role: 'operator' | 'observer' },
    inputValue: unknown,
  ) {
    if (!this.localConfirmations)
      throw new HbarError('NODE_LOCAL_CONFIRMATION_UNAVAILABLE', 'B-local confirmation storage is unavailable')
    const input = nodeLocalConfirmationResolveSchema.parse(inputValue)
    const storedDevice =
      device.deviceId === 'bootstrap-local'
        ? null
        : await this.state.call('console.device.get', { deviceId: device.deviceId })
    if (
      device.deviceId !== 'bootstrap-local' &&
      (!storedDevice || storedDevice.revokedAt !== null || storedDevice.role !== 'operator')
    )
      throw new HbarError('NODE_CONSOLE_FORBIDDEN', 'B-local operator device is no longer active')
    return await this.localConfirmations.resolve(device, input, async (candidate) => {
      if (!(await this.confirmationIdentityCurrent(candidate))) return false
      if (!storedDevice) return true
      const current = await this.state.call('console.device.get', { deviceId: device.deviceId })
      if (!current || current.revokedAt !== null || current.role !== 'operator') return false
      const identity = nodeLocalConfirmationIdentitySchema.parse(candidate)
      return current.roots.length === 0 || current.roots.includes(identity.rootId)
    })
  }
  async localConfirmationStatus(identity: unknown) {
    if (!this.localConfirmations)
      throw new HbarError('NODE_LOCAL_CONFIRMATION_UNAVAILABLE', 'B-local confirmation storage is unavailable')
    return await this.localConfirmations.status(identity, (candidate) => this.confirmationIdentityCurrent(candidate))
  }
  async localConfirmationRunStatus(inputValue: unknown) {
    if (!this.localConfirmations)
      throw new HbarError('NODE_LOCAL_CONFIRMATION_UNAVAILABLE', 'B-local confirmation storage is unavailable')
    const input = nodeLocalConfirmationLookupSchema.parse(inputValue)
    const stored = await this.localConfirmations.lookup(input)
    if (!stored) return 'absent'
    return await this.localConfirmations.status(stored, (candidate) => this.confirmationIdentityCurrent(candidate))
  }
  async cancelLocalConfirmationRun(inputValue: unknown) {
    if (!this.localConfirmations)
      throw new HbarError('NODE_LOCAL_CONFIRMATION_UNAVAILABLE', 'B-local confirmation storage is unavailable')
    const input = nodeLocalConfirmationLookupSchema.parse(inputValue)
    return { state: await this.localConfirmations.cancelRun(input) }
  }
  async cancelLocalConfirmation(identity: unknown) {
    if (!this.localConfirmations)
      throw new HbarError('NODE_LOCAL_CONFIRMATION_UNAVAILABLE', 'B-local confirmation storage is unavailable')
    return { state: await this.localConfirmations.cancel(identity) }
  }
  async cancelLocalConfirmationsForDevice(deviceId: string): Promise<void> {
    await this.localConfirmations?.cancelDevice(deviceId)
  }
  installGit(gitForRoot: (root: string) => GitService): void {
    if (this.gitOperations) throw new HbarError('NODE_GIT_ALREADY_INSTALLED', 'Git operations are already installed')
    this.gitOperations = new NodeGitOperationService({
      state: this.state,
      backend: this.backend,
      gitForRoot,
      available: (operationId) => this.availableToStart(operationId),
      admit: (request, effect, signal) => this.admitGit(request, effect, signal),
      confirm: (request, effect, argumentsDigest, signal) => {
        if (request.method === 'git.worktree')
          return this.confirmLaunchTargetOperation(
            {
              operationId: request.operationId,
              provisioning: request.provisioning,
              rootId: request.rootId,
              rootPath: request.expectedRoot,
              tool: request.operation.kind === 'add' ? 'worktree.create' : 'worktree.remove',
              worktreeId: request.operation.worktreeId,
              argumentsDigest,
              summary: `${request.operation.kind} managed Git worktree ${request.operation.worktreeId}`,
            },
            signal,
          )
        return this.confirmLocalOperation(
          {
            operationId: request.operationId,
            authority: request.authority,
            rootId: request.rootId,
            rootPath: request.expectedRoot,
            tool: request.method,
            effects: ['process', effect],
            argumentsDigest,
            summary: JSON.stringify({
              method: request.method,
              cwd: request.cwd,
              paths: request.paths,
              message: request.message,
            }),
          },
          signal,
        )
      },
      registerOperation: ({ operationId, controller, finished }) => {
        this.active.set(operationId, { controller, finished })
        this.completions.add(finished)
        return () => {
          if (this.active.get(operationId)?.controller === controller) this.active.delete(operationId)
          this.completions.delete(finished)
        }
      },
    })
  }
  async git(method: NodeGitMethod, input: unknown, signal: AbortSignal): Promise<unknown> {
    if (!this.gitOperations) throw new HbarError('NODE_GIT_UNAVAILABLE', 'Git service is not installed on this node')
    return await this.gitOperations.invoke(method, input, signal)
  }
  installGitQueries(gitForRoot: ConstructorParameters<typeof NodeGitQueryOperationService>[0]['gitForRoot']): void {
    if (this.gitQueries) throw new HbarError('NODE_GIT_ALREADY_INSTALLED', 'Git query service is already installed')
    this.gitQueries = new NodeGitQueryOperationService({
      backend: this.backend,
      gitForRoot,
      available: () => this.available(),
      reserveProcess: (operationId) => this.reserveProcess(operationId),
      admit: (request, argumentsDigest, signal) => this.admitManualGitQuery(request, argumentsDigest, signal),
      audit: async (record) => {
        await this.state.call('git-query.audit.append', {
          source: 'manual-query',
          operationId: record.operationId,
          deviceId: record.deviceId,
          workspaceId: record.workspaceId,
          sessionId: record.sessionId,
          rootId: record.rootId,
          expectedRoot: record.expectedRoot,
          tool: record.method,
          argumentsDigest: record.argumentsDigest,
          decision: record.decision,
          backend: record.backend,
          code: record.code,
        })
      },
    })
  }
  async gitQuery(
    method: import('@hbar/contracts/node-git-query').NodeGitQueryMethod,
    input: unknown,
    signal: AbortSignal,
  ) {
    if (!this.gitQueries) throw new HbarError('NODE_GIT_UNAVAILABLE', 'Git query service is not installed on this node')
    return await this.gitQueries.invoke(method, input, signal)
  }
  installWorktrees(allocator: ManagedNodeWorktreeAllocator): void {
    if (this.worktrees)
      throw new HbarError('NODE_WORKTREE_ALREADY_INSTALLED', 'Managed worktree service is already installed')
    this.worktrees = allocator
  }
  async createWorktreeAllocator(git: ManagedNodeWorktreeGitPort): Promise<ManagedNodeWorktreeAllocator> {
    return await createManagedNodeWorktreeAllocator({
      dataRoot: this.dataRoot,
      floor: () => this.floor,
      git,
      roots: {
        register: (record, access) => this.registerManagedWorktreeRoot(record, access),
        unregister: (rootId, worktreeId) => this.unregisterManagedWorktreeRoot(rootId, worktreeId),
      },
    })
  }
  async authorizeManagedWorktreeGitOperation(input: {
    readonly operationId: string
    readonly rootId: string
    readonly expectedRoot: string
    readonly provisioning: NodeWorktreeProvisioningAuthority
    readonly operation: ManagedNodeWorktreeGitOperation
  }): Promise<Awaited<ReturnType<ManagedNodeWorktreeAllocator['authorizeGitOperation']>>> {
    if (!this.worktrees) throw new HbarError('NODE_WORKTREE_UNAVAILABLE', 'Managed worktree service is not installed')
    return await this.worktrees.authorizeGitOperation(input)
  }
  registerManagedWorktreeRoot(record: NodeManagedWorktree, access: 'read' | 'write') {
    return this.managedRoots.register(record, access)
  }
  unregisterManagedWorktreeRoot(rootId: string, worktreeId: string) {
    return this.managedRoots.unregister(rootId, worktreeId)
  }
  async resolveManagedWorktree(
    rootId: string,
    expectedRoot: string,
    authority: NodeCallAuthority,
  ): Promise<NodeManagedWorktree> {
    const resolved = await this.managedRoots.resolveDetails(rootId, {
      sessionId: authority.sessionId,
      ...(authority.managedWorktree ? { managedWorktree: authority.managedWorktree } : {}),
    })
    if (!resolved || resolved.path !== expectedRoot)
      throw new HbarError('NODE_ROOT_CHANGED', 'Managed worktree is not bound to this Run and exact path')
    return resolved.worktree
  }
  async managedFloorFor(rootId: string, expectedRoot: string, authority: NodeCallAuthority): Promise<NodeFloor> {
    const worktree = await this.resolveManagedWorktree(rootId, expectedRoot, authority)
    return managedNodeFloor(this.floor, worktree)
  }
  private async ownedPath(
    rootId: string,
    path: string,
    authority?: NodeCallAuthority,
    writing = false,
    expectedRoot?: string,
  ) {
    if (!this.floor.roots.some((root) => root.rootId === rootId)) {
      if (!authority) throw new HbarError('NODE_DENIED', 'Managed worktree access requires a Run authority')
      const resolved = await this.managedRoots.resolveDetails(rootId, {
        sessionId: authority.sessionId,
        ...(authority.managedWorktree ? { managedWorktree: authority.managedWorktree } : {}),
      })
      if (!resolved) throw new HbarError('NODE_DENIED', 'Managed worktree is not registered for this Run')
      if (expectedRoot !== undefined && expectedRoot !== resolved.path)
        throw new HbarError('NODE_ROOT_CHANGED', 'Managed worktree path differs from the captured binding')
      const manifest = authority.workspaceMounts
        ? nodeWorkspaceMountManifestSchema.parse(authority.workspaceMounts)
        : undefined
      if (!manifest)
        throw new HbarError('NODE_MOUNT_ADMISSION_MISSING', 'Managed worktree access requires its Run mount manifest')
      const { digest, ...unsigned } = manifest
      const parentBinding = manifest.roots.find((root) => root.rootId === resolved.worktree.parentRootId)
      const parentRegistration = this.floor.roots.find((root) => root.rootId === resolved.worktree.parentRootId)
      if (
        manifest.nodeId !== this.id ||
        manifest.primaryRootId !== resolved.worktree.parentRootId ||
        nodeWorkspaceMountManifestDigest(unsigned) !== digest ||
        !parentBinding ||
        !parentRegistration ||
        parentBinding.expectedRoot !== resolved.parent ||
        parentRegistration.path !== resolved.parent
      )
        throw new HbarError('NODE_MOUNT_MANIFEST_INVALID', 'Managed worktree is outside its exact pinned primary mount')
      const target = await nodeOwnedPath(
        managedNodeFloor(this.floor, resolved.worktree),
        this.dataRoot,
        rootId,
        path,
        writing,
      )
      if (target.root !== resolved.path) throw new HbarError('NODE_ROOT_CHANGED', 'Managed worktree root changed')
      return target
    }
    const mountManifest = authority?.workspaceMounts
      ? nodeWorkspaceMountManifestSchema.parse(authority.workspaceMounts)
      : undefined
    if (mountManifest) {
      const { digest, ...unsigned } = mountManifest
      const binding = mountManifest.roots.find((item) => item.rootId === rootId)
      if (
        mountManifest.nodeId !== this.id ||
        nodeWorkspaceMountManifestDigest(unsigned) !== digest ||
        !binding ||
        (expectedRoot !== undefined && binding.expectedRoot !== expectedRoot)
      )
        throw new HbarError(
          'NODE_MOUNT_MANIFEST_INVALID',
          'The file target is outside its pinned same-node mount manifest',
        )
      const registration = this.floor.roots.find((item) => item.rootId === rootId)
      if (!registration || registration.path !== binding.expectedRoot)
        throw new HbarError('NODE_ROOT_CHANGED', 'A mounted file target no longer matches B’s registered root')
    }
    const target = await nodeOwnedPath(this.floor, this.dataRoot, rootId, path, writing)
    if (expectedRoot !== undefined && target.root !== expectedRoot)
      throw new HbarError('NODE_ROOT_CHANGED', 'Workspace path differs from the captured binding')
    if (
      isPathWithin(join(target.root, '.hbar-worktrees'), target.path, {
        separator: process.platform === 'win32' ? '\\' : '/',
        caseInsensitive: process.platform === 'win32' || process.platform === 'darwin',
      })
    )
      throw new HbarError('NODE_DENIED', 'Managed worktree storage is private to the B allocator')
    return target
  }
  async worktree(method: 'worktree.create' | 'worktree.remove' | 'worktree.get', input: unknown, signal: AbortSignal) {
    if (!this.worktrees) throw new HbarError('NODE_WORKTREE_UNAVAILABLE', 'Managed worktree service is not installed')
    if (method === 'worktree.create') {
      const parsed = nodeWorktreeCreateSchema.parse(input)
      this.assertLaunchTargetRoot(parsed.provisioning, parsed.rootId, parsed.expectedRoot)
      return await this.worktrees.create(parsed, signal)
    }
    if (method === 'worktree.remove') {
      const parsed = nodeWorktreeRemoveSchema.parse(input)
      this.assertLaunchTargetRoot(parsed.provisioning, parsed.rootId, parsed.expectedRoot)
      if (this.active.size || this.starting)
        throw new HbarError('NODE_BUSY', 'Cannot remove a managed worktree while node processes are active')
      await this.worktrees.remove(parsed, signal)
      return { accepted: true as const }
    }
    const parsed = nodeWorktreeMethods['worktree.get'].input.parse(input)
    this.assertLaunchTargetRoot(parsed.provisioning, parsed.rootId, parsed.expectedRoot)
    return await this.serial(parsed.operationId, async () => {
      const argumentsDigest = digestOf({ method, request: parsed })
      await this.confirmLaunchTargetOperation(
        {
          operationId: parsed.operationId,
          provisioning: parsed.provisioning,
          rootId: parsed.rootId,
          rootPath: parsed.expectedRoot,
          tool: 'worktree.get',
          argumentsDigest,
          summary: `Read managed Git worktree for ${parsed.branch}`,
        },
        signal,
      )
      try {
        // This is a safe metadata read. Always query B's current private registry instead of
        // replaying an earlier `null` result from before the same Run allocated its worktree.
        const value = await this.worktrees?.get(
          {
            rootId: parsed.rootId,
            expectedRoot: parsed.expectedRoot,
            operationId: parsed.operationId,
            branch: parsed.branch,
            ...(parsed.startPoint ? { startPoint: parsed.startPoint } : {}),
            createBranch: parsed.createBranch,
            provisioning: parsed.provisioning,
          },
          signal,
        )
        await this.auditLaunchTargetOperation({ ...parsed, tool: 'worktree.get' }, argumentsDigest, 'allow', 0)
        return nodeWorktreeMethods['worktree.get'].output.parse(value)
      } catch (error) {
        await this.auditLaunchTargetOperation(
          { ...parsed, tool: 'worktree.get' },
          argumentsDigest,
          'deny',
          error instanceof HbarError ? error.code : 'WORKTREE_LOOKUP_FAILED',
        )
        throw error
      }
    })
  }
  private async auditLaunchTargetOperation(
    input: {
      readonly operationId: string
      readonly rootId: string
      readonly expectedRoot: string
      readonly provisioning: NodeWorktreeProvisioningAuthority
      readonly tool: 'worktree.create' | 'worktree.get' | 'worktree.remove'
    },
    argumentsDigest: string,
    decision: 'allow' | 'deny',
    code: string | number | null,
  ): Promise<void> {
    await this.state.call('audit.append', {
      operationId: input.operationId,
      source: 'launch-target',
      sessionId: input.provisioning.sessionId,
      runId: input.provisioning.runId,
      workspaceId: input.provisioning.workspaceId,
      nodeId: input.provisioning.nodeId,
      targetRevision: input.provisioning.targetRevision,
      acceptedTargetDigest: input.provisioning.acceptedTargetDigest,
      workspaceFolderRevision: input.provisioning.workspaceFolderRevision,
      workspaceFolderDigest: input.provisioning.workspaceFolderDigest,
      rootId: input.rootId,
      rootPath: input.expectedRoot,
      tool: input.tool,
      argumentsDigest,
      decision,
      backend: this.backend.name,
      code,
    })
  }
  private assertLaunchTargetRoot(
    provisioningValue: NodeWorktreeProvisioningAuthority,
    rootId: string,
    expectedRoot: string,
  ): void {
    const provisioning = nodeWorktreeProvisioningAuthoritySchema.parse(provisioningValue)
    if (provisioning.nodeId !== this.id)
      throw new HbarError('WORKSPACE_SCOPE', 'Launch-target provisioning belongs to another node')
    const registration = this.floor.roots.find((root) => root.rootId === rootId)
    if (!registration || registration.access !== 'write' || registration.path !== expectedRoot)
      throw new HbarError(
        'NODE_ROOT_CHANGED',
        'Launch-target provisioning differs from the pinned writable parent root',
      )
  }
  async verifyWorkspaceRootBinding(rootId: string, expectedRoot: string, authorityValue: unknown): Promise<void> {
    const authority = nodeCallAuthoritySchema.parse(authorityValue)
    await this.ownedPath(rootId, '.', authority, false, expectedRoot)
  }
  get running(): string[] {
    return [...new Set([...this.active.keys(), ...this.pendingStarts.keys()])]
  }
  async setPolicy(value: unknown): Promise<NodeFloor> {
    const result = await this.updatePolicy(value, this.floorRevision)
    return result.floor
  }
  async updatePolicy(value: unknown, expectedRevision: number): Promise<{ floor: NodeFloor; revision: number }> {
    if (this.active.size || this.starting || this.locks.size || this.changingPolicy)
      throw new HbarError('NODE_BUSY', 'Stop active operations before changing the floor')
    this.changingPolicy = true
    try {
      const floor = await validateNodeRoots(nodeFloorSchema.parse(value), this.dataRoot, true)
      const updated = await this.state.call('floor.update', { floor, expectedRevision })
      this.floor = updated.floor
      this.floorRevision = updated.revision
      for (const listener of this.policyListeners) {
        try {
          listener()
        } catch {
          /* A notification observer cannot roll back the persisted floor. */
        }
      }
      return { floor: this.policy, revision: this.floorRevision }
    } finally {
      this.changingPolicy = false
    }
  }
  get isPaused(): boolean {
    return this.paused
  }
  onPolicyChanged(listener: () => void): () => void {
    this.policyListeners.add(listener)
    return () => this.policyListeners.delete(listener)
  }
  onExecutionOutput(listener: (chunk: NodeExecOutputChunk) => void): () => void {
    this.outputListeners.add(listener)
    return () => this.outputListeners.delete(listener)
  }
  onExecutionExit(listener: (event: { operationId: string; receipt: NodeReceipt }) => void): () => void {
    this.exitListeners.add(listener)
    return () => this.exitListeners.delete(listener)
  }
  readExecutionOutput(operationId: string, afterSeq: number, limitBytes?: number): NodeExecOutputPage {
    const output = this.executionOutputs.get(operationId)
    if (!output)
      throw new HbarError('NODE_OUTPUT_UNAVAILABLE', 'Transient output is unavailable; reconcile the durable receipt')
    return output.read(afterSeq, limitBytes)
  }
  creditExecutionOutput(operationId: string, input: { streamId: string; throughSeq: number; bytes: number }) {
    const output = this.executionOutputs.get(operationId)
    if (!output)
      throw new HbarError('NODE_OUTPUT_UNAVAILABLE', 'Transient output is unavailable; reconcile the durable receipt')
    output.grant(input)
    return { accepted: true as const, availableBytes: output.availableCreditBytes }
  }
  private createExecutionOutput(operationId: string): NodeExecutionOutputBuffer {
    for (const [key, value] of this.executionOutputs) {
      if (this.executionOutputs.size < 64) break
      if (value.isTerminal) this.executionOutputs.delete(key)
    }
    if (this.executionOutputs.size >= 64) throw new HbarError('NODE_BUSY', 'Node output replay capacity is full')
    const output = new NodeExecutionOutputBuffer(operationId, (chunk) => {
      for (const listener of this.outputListeners) {
        try {
          listener(chunk)
        } catch {
          // A transport observer cannot alter execution or the durable result.
        }
      }
    })
    this.executionOutputs.set(operationId, output)
    return output
  }
  private finishExecutionOutput(operationId: string, output: NodeExecutionOutputBuffer): void {
    output.finish()
    void this.state
      .call('operation.get', { operationId })
      .then((record) => {
        const receipt = record?.receipt
        if (!receipt || receipt.state === 'accepted' || receipt.state === 'started') return
        const event = { operationId, receipt }
        for (const listener of this.exitListeners) {
          try {
            listener(event)
          } catch {
            // The settled receipt remains available when an exit notification is missed.
          }
        }
      })
      .catch(() => {
        // A-side receipt reconciliation remains authoritative after a notification failure.
      })
  }
  capabilities(): NodeCapabilities {
    const { roots, protectedPaths: _paths, environmentAllowlist: _env, ...floor } = this.floor
    return nodeCapabilitiesSchema.parse({
      protocol: NODE_PROTOCOL_VERSION,
      nodeId: this.id,
      platform: process.platform,
      evaluator: SANDBOX_EVALUATOR_FINGERPRINT,
      roots: roots.map(({ path, ...root }) => ({ ...root, nodePath: path })),
      sandbox: {
        backends: [this.backend.name],
        filesystem: this.backend.filesystem ? 'enforced' : 'none',
        network: this.backend.network ? 'enforced' : 'none',
      },
      floor,
    })
  }
  putSnapshot(ref: SandboxSnapshotRef, value: unknown): void {
    const profile = verifySandboxSnapshot(ref, value)
    this.snapshots.delete(ref.digest)
    this.snapshots.set(ref.digest, profile)
    while (this.snapshots.size > 64) this.snapshots.delete(this.snapshots.keys().next().value ?? '')
  }
  private profile(authority: NodeCallAuthority): ResolvedSandboxProfile | null {
    if (!authority.sandbox) return null
    const profile = this.snapshots.get(authority.sandbox.digest)
    if (!profile || profile.profileId !== authority.sandbox.profileId)
      throw new HbarError('SANDBOX_SNAPSHOT_NOT_FOUND', 'The node has no verified snapshot for this call')
    return profile
  }
  private async admitGit(
    request: NodeGitRequest,
    effect: 'read' | 'write',
    signal: AbortSignal,
  ): Promise<NodeGitAdmissionContext> {
    signal.throwIfAborted()
    this.availableToStart(request.operationId)
    const provisioning =
      request.method === 'git.worktree' ? nodeWorktreeProvisioningAuthoritySchema.parse(request.provisioning) : null
    const authority = request.method === 'git.worktree' ? null : nodeCallAuthoritySchema.parse(request.authority)
    if (request.method === 'git.worktree' && provisioning) {
      if (provisioning.nodeId !== this.id)
        throw new HbarError('WORKSPACE_SCOPE', 'Git worktree provisioning belongs to another node')
      const expectedSuffix = request.operation.kind === 'add' ? 'worktree-create' : 'worktree-remove'
      if (request.operationId !== `${provisioning.runId}:${expectedSuffix}`)
        throw new HbarError('WORKSPACE_SCOPE', 'Git worktree operation key differs from launch-target authority')
    } else if (authority && request.operationId !== `${authority.runId}:${authority.callId}`)
      throw new HbarError('WORKSPACE_SCOPE', 'Git operation key does not match Host admission')
    let managed: Awaited<ReturnType<ManagedNodeRootRegistry['resolveDetails']>> = null
    let scopedFloor = this.floor
    let registration = this.floor.roots.find((root) => root.rootId === request.rootId)
    if (!registration) {
      if (!authority?.managedWorktree)
        throw new HbarError('NODE_DENIED', 'Git worktree access requires the Run-scoped managed target')
      managed = await this.managedRoots.resolveDetails(request.rootId, {
        sessionId: authority.sessionId,
        managedWorktree: authority.managedWorktree,
      })
      if (!managed) throw new HbarError('NODE_DENIED', 'Git worktree is not registered for this Run')
      if (request.expectedRoot !== managed.path)
        throw new HbarError('NODE_ROOT_CHANGED', 'Git request differs from the exact managed worktree path')
      scopedFloor = managedNodeFloor(this.floor, managed.worktree)
      registration = scopedFloor.roots.find((root) => root.rootId === request.rootId)
    }
    if (!registration) throw new HbarError('NODE_DENIED', 'Git root is not registered on this node')
    if (!managed && request.expectedRoot !== registration.path)
      throw new HbarError('NODE_ROOT_CHANGED', 'Git request does not match the registered root path')
    let worktreeGitGrant: Awaited<ReturnType<ManagedNodeWorktreeAllocator['authorizeGitOperation']>> | undefined
    if (request.method === 'git.worktree') {
      if (managed)
        throw new HbarError('NODE_DENIED', 'Managed worktree administration must target its registered parent root')
      worktreeGitGrant = await this.authorizeManagedWorktreeGitOperation({
        operationId: request.operationId,
        rootId: request.rootId,
        expectedRoot: request.expectedRoot,
        provisioning: provisioning!,
        operation:
          request.operation.kind === 'add'
            ? {
                kind: 'add',
                worktreeId: request.operation.worktreeId,
                branch: request.operation.branch,
                createBranch: request.operation.createBranch,
                ...(request.operation.startPoint ? { startPoint: request.operation.startPoint } : {}),
              }
            : request.operation,
      })
    }
    if (effect === 'write' && registration.access !== 'write')
      throw new HbarError('NODE_DENIED', 'The registered root is read only')
    if (!this.floor.process) throw new HbarError('NODE_DENIED', 'Processes are disabled by the node floor')
    if (this.floor.backend !== 'auto' && this.backend.name !== this.floor.backend)
      throw new HbarError(
        'NODE_BACKEND_CHANGED',
        'The active backend differs from the node floor; restart and re-probe the node',
      )
    if (
      this.backend.name === 'none' ||
      !this.backend.filesystem ||
      !this.backend.network ||
      !this.backend.processTree ||
      !this.backend.execArgv
    )
      throw new HbarError(
        'NODE_CONFINEMENT_UNAVAILABLE',
        'Git requires filesystem, network and process-tree confinement',
      )
    const release = () => undefined
    try {
      const target = await nodeOwnedPath(scopedFloor, this.dataRoot, request.rootId, request.cwd, effect === 'write')
      signal.throwIfAborted()
      if (target.root !== request.expectedRoot || target.registration.path !== request.expectedRoot)
        throw new HbarError('NODE_ROOT_CHANGED', 'Git cwd resolved outside the captured registered root')
      const profile = authority ? this.profile(authority) : null
      if (profile) {
        const args: Record<string, unknown> = { cwd: request.cwd }
        if (request.method === 'git.diff') Object.assign(args, { cached: request.cached, paths: request.paths })
        if (request.method === 'git.log') Object.assign(args, { limit: request.limit })
        if (request.method === 'git.stage' || request.method === 'git.unstage')
          Object.assign(args, { paths: request.paths })
        if (request.method === 'git.commit')
          Object.assign(args, { message: request.message, paths: request.paths, stage: request.stage })
        if (request.method === 'git.worktree') Object.assign(args, { operation: request.operation })
        const toolNames: Record<NodeGitMethod, string> = {
          'git.info': 'git_info',
          'git.status': 'git_status',
          'git.diff': 'git_diff',
          'git.log': 'git_log',
          'git.stage': 'git_stage',
          'git.unstage': 'git_unstage',
          'git.commit': 'git_commit',
          'git.worktree': 'git_worktree',
        }
        const verdict = await evaluateSandboxCall(
          profile,
          {
            workspace: target.root,
            tool: { name: toolNames[request.method], effect, workspaceAccess: { kind: 'workspace' } },
            args,
          },
          localNodePaths,
        )
        signal.throwIfAborted()
        if (verdict.decision === 'deny' || (verdict.decision === 'ask' && authority?.admission.kind !== 'approved'))
          throw new HbarError('NODE_DENIED', 'Node sandbox reevaluation refused the Git operation')
      }
      const environment = profile?.environment.set ?? {}
      if (Object.keys(environment).some((name) => dangerousEnvironment.test(name) || unsafeGitEnvironment.test(name)))
        throw new HbarError('NODE_DENIED', 'The snapshot contains an unsafe Git process environment variable')
      const floorProtectedPaths = nodeProtectedPaths(
        scopedFloor,
        this.dataRoot,
        target.root,
        String(request.method) === 'git.worktree',
      )
      const baseManifest = await createProcessPermissionManifest({
        root: target.root,
        cwd: target.path,
        registrationAccess: target.registration.access,
        profile,
        floorProtectedPaths,
        paths: localProcessPermissionPaths,
      })
      let manifest = baseManifest
      if (request.method === 'git.worktree') {
        const grant = worktreeGitGrant
        if (!grant || !request.operation)
          throw new HbarError('NODE_DENIED', 'Git worktree operation has no verified allocator grant')
        if (!baseManifest.writableRoots.some((path) => resolve(path) === target.root))
          throw new HbarError('NODE_DENIED', 'Git worktree operation is denied by the active sandbox profile')
        const metadataRoot = resolve(grant.commonGitDir, 'worktrees')
        const worktreeWriteRoot =
          request.operation.kind === 'remove' ? resolve(target.root, '.hbar-worktrees') : grant.path
        const writableRoots = [worktreeWriteRoot, metadataRoot]
        if (request.operation.kind === 'add' && request.operation.createBranch) {
          writableRoots.push(resolve(grant.commonGitDir, 'refs', 'heads'))
          writableRoots.push(resolve(grant.commonGitDir, 'logs', 'refs', 'heads'))
        }
        for (const path of writableRoots) {
          const canonical = await realpath(path)
          if (canonical !== resolve(path) || !isPathWithin(target.root, canonical, localNodePaths))
            throw new HbarError(
              'NODE_DENIED',
              'Git worktree write grant is not a canonical path beneath its parent root',
            )
        }
        const protectedPaths = baseManifest.protectedPaths.filter(
          (path) => resolve(path) !== resolve(target.root, '.hbar-worktrees'),
        )
        protectedPaths.push(...grant.protectedSiblingPaths)
        for (const name of await readdir(metadataRoot)) {
          const path = resolve(metadataRoot, name)
          const info = await lstat(path)
          if (info.isSymbolicLink() || (await realpath(path)) !== path)
            throw new HbarError('NODE_DENIED', 'Sibling Git worktree metadata contains a link')
          if (name === request.operation.worktreeId) {
            if (request.operation.kind === 'add')
              throw new HbarError('EFFECT_UNKNOWN', 'Git metadata already exists for this pending worktree creation')
            continue
          }
          protectedPaths.push(path)
        }
        manifest = {
          readableRoots: [target.root],
          writableRoots,
          protectedPaths,
          readOnlyPaths: [],
        }
      }
      signal.throwIfAborted()
      const timeoutMs = Math.min(120_000, this.floor.maxTimeoutMs)
      const confinement: OsConfinementOptions = {
        level: 'elevated',
        readableRoots: [...manifest.readableRoots],
        writableRoots: [...manifest.writableRoots],
        networkEnabled: false,
        envOverrides: environment,
      }
      return {
        rootPath: target.root,
        cwd: target.path,
        registrationAccess: target.registration.access,
        timeoutMs,
        environment,
        environmentAllowlist: this.floor.environmentAllowlist.filter((name) => !unsafeGitEnvironment.test(name)),
        confinement,
        protectedPaths: [...manifest.protectedPaths],
        readOnlyPaths: [...manifest.readOnlyPaths],
        manifest,
        ...(worktreeGitGrant ? { managedWorktreePath: worktreeGitGrant.path } : {}),
        hooksPath: join(this.dataRoot, 'disabled-git-hooks'),
        networkEnabled: false,
        maxOutputBytes: 48 * 1024,
        release,
      }
    } catch (error) {
      release()
      throw error
    }
  }
  private async admitManualGitQuery(
    request: NodeGitQueryRequest,
    argumentsDigest: string,
    signal: AbortSignal,
  ): Promise<NodeGitAdmissionContext> {
    signal.throwIfAborted()
    this.available()
    const authority = request.authority
    if (authority.nodeId !== this.id)
      throw new HbarError('WORKSPACE_SCOPE', 'Manual Git query targets a different workspace node')
    const registration = this.floor.roots.find((root) => root.rootId === authority.rootId)
    if (!registration) throw new HbarError('NODE_DENIED', 'Manual Git query root is not registered on this node')
    if (registration.path !== authority.expectedRoot)
      throw new HbarError('NODE_ROOT_CHANGED', 'Manual Git query does not match the registered root path')
    if (!this.floor.process) throw new HbarError('NODE_DENIED', 'Processes are disabled by the node floor')
    if (this.floor.backend !== 'auto' && this.backend.name !== this.floor.backend)
      throw new HbarError(
        'NODE_BACKEND_CHANGED',
        'The active backend differs from the node floor; restart and re-probe the node',
      )
    if (
      this.backend.name === 'none' ||
      !this.backend.filesystem ||
      !this.backend.network ||
      !this.backend.processTree ||
      !this.backend.execArgv
    )
      throw new HbarError('NODE_CONFINEMENT_UNAVAILABLE', 'Manual Git query requires managed argv confinement')
    // The query operation already owns a floor-wide process reservation before admission.
    const release = () => {}
    try {
      const target = await nodeOwnedPath(this.floor, this.dataRoot, authority.rootId, request.cwd)
      signal.throwIfAborted()
      if (target.root !== authority.expectedRoot || target.registration.path !== authority.expectedRoot)
        throw new HbarError('NODE_ROOT_CHANGED', 'Manual Git query cwd escaped its captured registered root')
      await this.confirmManualGitQuery({
        kind: 'manual-query',
        operationId: authority.operationId,
        deviceId: authority.deviceId,
        workspaceId: authority.workspaceId,
        sessionId: authority.sessionId,
        nodeId: authority.nodeId,
        rootId: authority.rootId,
        expectedRoot: authority.expectedRoot,
        method: request.method,
        argumentsDigest,
      })
      signal.throwIfAborted()
      this.available()
      const profile = null
      const floorProtectedPaths = nodeProtectedPaths(this.floor, this.dataRoot)
      const manifest = await createProcessPermissionManifest({
        root: target.root,
        cwd: target.path,
        registrationAccess: 'read',
        profile,
        floorProtectedPaths,
        paths: localProcessPermissionPaths,
      })
      signal.throwIfAborted()
      const environment: Record<string, string> = {}
      const confinement: OsConfinementOptions = {
        level: 'elevated',
        readableRoots: [...manifest.readableRoots],
        writableRoots: [...manifest.writableRoots],
        networkEnabled: false,
        envOverrides: environment,
      }
      return {
        rootPath: target.root,
        cwd: target.path,
        registrationAccess: 'read',
        timeoutMs: Math.min(120_000, this.floor.maxTimeoutMs),
        environment,
        environmentAllowlist: this.floor.environmentAllowlist.filter((name) => !unsafeGitEnvironment.test(name)),
        confinement,
        protectedPaths: [...manifest.protectedPaths],
        readOnlyPaths: [...manifest.readOnlyPaths],
        manifest,
        hooksPath: join(this.dataRoot, 'disabled-git-hooks'),
        networkEnabled: false,
        maxOutputBytes: 48 * 1024,
        release,
      }
    } catch (error) {
      release()
      throw error
    }
  }
  private available(): void {
    if (this.disposed) throw new HbarError('NODE_OFFLINE', 'Workspace node is closed')
    if (this.linkExpired) throw new HbarError('NODE_OFFLINE', 'Owning node link exceeded its loss grace period')
    if (this.paused) throw new HbarError('NODE_PAUSED', 'Workspace node is paused locally')
    if (this.changingPolicy) throw new HbarError('NODE_BUSY', 'Node floor is being changed locally')
  }
  assertProcessAvailable(): void {
    this.available()
  }
  /** Reserve the same floor-wide process slot used by exec and admitted Git work. */
  reserveProcess(operationId: string): NodeProcessReservation {
    this.availableToStart(operationId)
    if (this.active.has(operationId) || this.pendingStarts.has(operationId))
      throw new HbarError('NODE_BUSY', 'Operation already owns a process slot')
    if (this.active.size + this.starting >= this.floor.maxConcurrentProcesses)
      throw new HbarError('NODE_BUSY', 'Node process capacity reached')
    this.starting++
    let reserved = true
    const controller = new AbortController()
    let resolvePending!: () => void
    const finished = new Promise<void>((resolve) => {
      resolvePending = resolve
    })
    const pending = { controller, finished, resolve: () => resolvePending() }
    this.pendingStarts.set(operationId, pending)
    const release = () => {
      if (!reserved) return
      reserved = false
      if (this.pendingStarts.get(operationId) === pending) this.pendingStarts.delete(operationId)
      pending.resolve()
      this.releaseStarting()
    }
    return {
      operationId,
      controller,
      signal: controller.signal,
      release,
      activate: ({ controller, finished, cancel }) => {
        if (!reserved)
          throw new HbarError('NODE_PROCESS_RESERVATION_RELEASED', 'Process reservation is no longer active')
        const unregister = this.registerActiveProcess(operationId, {
          controller,
          finished,
          durable: false,
          ...(cancel ? { cancel } : {}),
        })
        release()
        return unregister
      },
    }
  }
  private async waitForStartsToDrain(): Promise<void> {
    while (this.starting > 0)
      await new Promise<void>((resolve) => {
        this.startDrainWaiters.add(resolve)
      })
  }
  private releaseStarting(): void {
    this.starting--
    if (this.starting === 0) {
      for (const wake of this.startDrainWaiters) wake()
      this.startDrainWaiters.clear()
    }
  }
  private registerActiveProcess(
    operationId: string,
    entry: { controller: AbortController; finished: Promise<void>; durable?: boolean; cancel?: () => Promise<void> },
  ): () => void {
    if (this.active.has(operationId)) throw new HbarError('NODE_BUSY', 'Operation already owns a process slot')
    this.active.set(operationId, entry)
    this.completions.add(entry.finished)
    const unregister = () => {
      if (this.active.get(operationId)?.controller === entry.controller) this.active.delete(operationId)
      this.completions.delete(entry.finished)
    }
    entry.finished.then(unregister, unregister)
    return unregister
  }
  private availableToStart(operationId: string): void {
    this.available()
    if (this.pendingCancellations.has(operationId))
      throw new HbarError('CANCELLED', 'Execution was cancelled before process launch')
  }
  async canonicalize(rootId: string, paths: readonly string[], expectedRoot?: string) {
    this.available()
    const result: string[] = []
    let root = ''
    for (const requested of paths) {
      let checked
      if (this.floor.roots.some((root) => root.rootId === rootId)) {
        checked = await this.ownedPath(rootId, requested, undefined, false, expectedRoot)
      } else {
        const managed = expectedRoot ? await this.managedRoots.resolveCanonicalPath(rootId, expectedRoot) : null
        if (!managed)
          throw new HbarError('NODE_DENIED', 'Managed root canonicalization requires its exact registered path')
        checked = await nodeOwnedPath(managedNodeFloor(this.floor, managed.worktree), this.dataRoot, rootId, requested)
      }
      root = checked.root
      result.push(checked.path)
    }
    return {
      root,
      paths: result,
      dialect: process.platform === 'win32' ? ('win32' as const) : ('posix' as const),
      caseInsensitive: localNodePaths.caseInsensitive,
    }
  }
  async checkFile(rootId: string, path: string, authority: NodeCallAuthority, writing = false): Promise<string> {
    this.available()
    const target = await this.ownedPath(rootId, path, authority, writing)
    const mountManifest = authority.workspaceMounts
      ? nodeWorkspaceMountManifestSchema.parse(authority.workspaceMounts)
      : undefined
    const managedPrimary =
      !!authority.managedWorktree &&
      rootId === `wt_${authority.managedWorktree.worktreeId}` &&
      mountManifest?.primaryRootId ===
        this.managedRoots.list().find((item) => item.worktreeRootId === rootId)?.parentRootId
    const mount =
      mountManifest?.roots.find((item) => item.rootId === rootId) ??
      (managedPrimary ? mountManifest?.roots.find((item) => item.rootId === mountManifest.primaryRootId) : undefined)
    const profile = this.profile(authority)
    if (profile) {
      const verdict = await evaluateSandboxCall(
        profile,
        {
          workspace: target.root,
          tool: {
            name: writing ? 'write_file' : 'read_file',
            effect: writing ? 'write' : 'read',
            workspaceAccess: { kind: 'paths', arguments: [{ field: 'path', access: writing ? 'write' : 'read' }] },
          },
          args: {
            path:
              mount && (mount.rootId !== mountManifest?.primaryRootId || managedPrimary)
                ? `${mount.alias}/${path}`
                : path,
          },
        },
        localNodePaths,
      )
      if (verdict.decision === 'deny' || (verdict.decision === 'ask' && authority.admission.kind !== 'approved'))
        throw new HbarError('NODE_DENIED', 'Node sandbox reevaluation refused the file operation')
    }
    return target.root
  }
  async list(rootId: string, path: string, authority: NodeCallAuthority) {
    const root = await this.checkFile(rootId, path, authority)
    const entries = await this.execution.list(root, path)
    const safe: typeof entries = []
    for (const entry of entries) {
      try {
        await this.checkFile(rootId, entry.path, authority)
        safe.push(entry)
      } catch (error) {
        if (!(error instanceof HbarError) || error.code !== 'NODE_DENIED') throw error
      }
    }
    return safe
  }
  async read(rootId: string, path: string, authority: NodeCallAuthority): Promise<Uint8Array> {
    const data = await this.execution.readBytes(await this.checkFile(rootId, path, authority), path)
    await this.checkFile(rootId, path, authority)
    return data
  }
  async fileVersion(
    rootId: string,
    expectedRoot: string,
    operationId: string,
    version: 'before' | 'after',
  ): Promise<Uint8Array> {
    const operation = await this.state.call('operation.get', { operationId })
    if (
      !operation?.versions ||
      !operation.target ||
      operation.target.rootId !== rootId ||
      !operation.target.nodePath ||
      operation.target.nodePath !== expectedRoot
    )
      throw new HbarError('NODE_RECEIPT_SCOPE', 'The file receipt has no verified target in this root')
    const authority = nodeCallAuthoritySchema.safeParse(operation.authority)
    if (!authority.success) throw new HbarError('NODE_RECEIPT_SCOPE', 'The file receipt has no tool-call authority')
    const registration = this.floor.roots.find((root) => root.rootId === rootId)
    if (registration && registration.path !== operation.target.nodePath)
      throw new HbarError('NODE_RECEIPT_SCOPE', 'The file receipt belongs to a different shared root location')
    const target = await this.ownedPath(rootId, operation.target.path, authority.data, false, expectedRoot)
    if (target.root !== operation.target.nodePath)
      throw new HbarError('NODE_RECEIPT_SCOPE', 'The file receipt target differs from its verified root')
    await this.checkFile(rootId, operation.target.path, authority.data)
    return Buffer.from(operation.versions[version])
  }
  async search(rootId: string, query: ParsedWorkspaceSearchInput, authority: NodeCallAuthority, signal: AbortSignal) {
    const root = await this.checkFile(rootId, query.path, authority)
    if (!this.execution.workspaceQuery) throw new HbarError('QUERY_UNAVAILABLE', 'Node search backend unavailable')
    const result = await this.execution.workspaceQuery.search(root, query, signal)
    const matches: typeof result.matches = []
    for (const match of result.matches) {
      try {
        await this.checkFile(rootId, match.path, authority)
        matches.push(match)
      } catch (error) {
        if (!(error instanceof HbarError) || error.code !== 'NODE_DENIED') throw error
      }
    }
    // Counts in a filtered page cannot reveal matches outside this authority.
    if (matches.length !== result.matches.length) {
      const { pagination: _pagination, ...visible } = result
      return {
        ...visible,
        matches,
        truncated: true,
        filesChecked: 0,
        cache: { contentHits: 0, contentMisses: 0, matchHits: 0, matchMisses: 0, bytesRead: 0 },
      }
    }
    return { ...result, matches }
  }
  async find(rootId: string, query: ParsedWorkspaceFindInput, authority: NodeCallAuthority, signal: AbortSignal) {
    const root = await this.checkFile(rootId, query.path, authority)
    if (!this.execution.workspaceQuery) throw new HbarError('QUERY_UNAVAILABLE', 'Node search backend unavailable')
    const result = await this.execution.workspaceQuery.find(root, query, signal)
    const paths: string[] = []
    for (const path of result.paths) {
      try {
        await this.checkFile(rootId, path, authority)
        paths.push(path)
      } catch (error) {
        if (!(error instanceof HbarError) || error.code !== 'NODE_DENIED') throw error
      }
    }
    return { ...result, paths, truncated: result.truncated || paths.length !== result.paths.length }
  }
  async readRange(
    rootId: string,
    path: string,
    authority: NodeCallAuthority,
    startLine: number,
    lineCount: number,
    signal: AbortSignal,
  ) {
    const root = await this.checkFile(rootId, path, authority)
    if (!this.execution.workspaceQuery) throw new HbarError('QUERY_UNAVAILABLE', 'Node ranged reads unavailable')
    const data = await this.execution.workspaceQuery.readRange(root, path, startLine, lineCount, signal)
    await this.checkFile(rootId, path, authority)
    return data
  }
  async invalidate(rootId: string, path: string, authority: NodeCallAuthority) {
    this.available()
    const target = await this.ownedPath(rootId, path, authority)
    await this.execution.workspaceQuery?.invalidate(target.root, path)
  }
  private async serial<Value>(id: string, action: () => Promise<Value>): Promise<Value> {
    const prior = this.locks.get(id) ?? Promise.resolve()
    let unlock: (() => void) | undefined
    const next = new Promise<void>((resolve) => {
      unlock = resolve
    })
    this.locks.set(id, next)
    await prior
    try {
      return await action()
    } finally {
      unlock?.()
      if (this.locks.get(id) === next) this.locks.delete(id)
    }
  }
  private result(error: unknown, started: boolean): NodeExecResult {
    return {
      text: outputTail(error instanceof Error ? error.message : 'Node execution failed'),
      isError: true,
      details: {
        code: error instanceof HbarError ? error.code : 'NODE_EXECUTION_FAILED',
        exitCode: null,
        executionStarted: started,
        truncated: false,
        backend: this.backend.name,
      },
    }
  }
  private async audit(request: NodeExecStart, result: NodeExecResult): Promise<void> {
    await this.state.call('audit.append', {
      operationId: request.operationId,
      sessionId: request.sessionId,
      runId: request.runId,
      callId: request.callId,
      tool: 'shell',
      argumentsDigest: digestOf(request),
      decision: result.details.executionStarted ? 'allow' : 'deny',
      admission: request.admission,
      backend: this.backend.name,
      code: result.details.code,
    })
  }
  async start(value: unknown, transportSignal?: AbortSignal): Promise<NodeReceipt> {
    transportSignal?.throwIfAborted()
    const request = nodeExecStartSchema.parse(value)
    return this.serial(request.operationId, async () => {
      // A disconnected peer can be waiting behind another request for this id.
      // Fence it before any durable acceptance when its transport has closed.
      transportSignal?.throwIfAborted()
      const prior = await this.state.call('operation.get', { operationId: request.operationId })
      transportSignal?.throwIfAborted()
      const argumentsDigest = digestOf(request)
      if (prior) {
        if (prior.argumentsDigest !== argumentsDigest)
          throw new HbarError('IDEMPOTENCY_CONFLICT', 'Execution key has different parameters')
        if (prior.receipt.state !== 'accepted') return prior.receipt
      }
      if (this.floor.backend !== 'auto' && this.backend.name !== this.floor.backend)
        throw new HbarError(
          'NODE_BACKEND_CHANGED',
          'The active backend differs from the node floor; restart and re-probe the node',
        )
      this.available()
      if (this.active.size + this.starting >= this.floor.maxConcurrentProcesses)
        throw new HbarError('NODE_BUSY', 'Node process capacity reached')
      this.starting++
      try {
        transportSignal?.throwIfAborted()
        const accepted = prior
          ? { accepted: false, operation: prior }
          : await this.state.call('operation.accept', {
              operationId: request.operationId,
              argumentsDigest,
              kind: 'exec',
              target: { rootId: request.rootId, path: request.cwd },
              authority: {
                sessionId: request.sessionId,
                runId: request.runId,
                callId: request.callId,
                sandbox: request.sandbox,
                admission: request.admission,
                ...(request.managedWorktree ? { managedWorktree: request.managedWorktree } : {}),
                ...(request.workspaceMounts ? { workspaceMounts: request.workspaceMounts } : {}),
              },
            })
        if (!accepted.accepted && !prior) return accepted.operation.receipt
        try {
          // From acceptance until durable start, cancellation settles a no-start receipt.
          // Once started, transport loss belongs to the independent process controller.
          transportSignal?.throwIfAborted()
          if (!this.floor.process) throw new HbarError('NODE_DENIED', 'Processes are disabled by the node floor')
          const mountManifest = request.workspaceMounts
          let managedMount: Awaited<ReturnType<ManagedNodeRootRegistry['resolveDetails']>> = null
          if (!this.floor.roots.some((root) => root.rootId === request.rootId) && request.managedWorktree) {
            managedMount = await this.managedRoots.resolveDetails(request.rootId, {
              sessionId: request.sessionId,
              ...(request.managedWorktree ? { managedWorktree: request.managedWorktree } : {}),
            })
            if (!managedMount || managedMount.path !== request.expectedRoot)
              throw new HbarError(
                'NODE_ROOT_CHANGED',
                'Managed execution target differs from its B-registered checkout',
              )
          }
          const managedPrimary = !!managedMount && mountManifest?.primaryRootId === managedMount.worktree.parentRootId
          if (mountManifest && mountManifest.primaryRootId !== request.rootId && !managedPrimary)
            throw new HbarError(
              'NODE_MOUNT_MANIFEST_INVALID',
              'Execution root must match the pinned primary mount or its B-proven managed checkout',
            )
          const mountPlan = mountManifest
            ? await createNodeWorkspaceMountPlan({
                nodeId: this.id,
                dataRoot: this.dataRoot,
                floor: this.floor,
                manifest: mountManifest,
                ...(managedPrimary && managedMount
                  ? { sourceRootOverrides: new Map([[mountManifest.primaryRootId, managedMount.path]]) }
                  : {}),
                signal: transportSignal ?? new AbortController().signal,
                snapshotPermissions: async (rootId, alias, root, signal) => {
                  signal.throwIfAborted()
                  const registration =
                    managedPrimary && rootId === mountManifest.primaryRootId && managedMount
                      ? managedNodeFloor(this.floor, managedMount.worktree).roots.find(
                          (item) => item.rootId === request.rootId,
                        )
                      : this.floor.roots.find((item) => item.rootId === rootId)
                  if (!registration) throw new HbarError('NODE_DENIED', 'Mounted root is no longer registered')
                  const sourceProfile = this.profile(request)
                  const grants = sourceProfile?.filesystem.grants.flatMap((grant) => {
                    if (grant.path === alias) return [{ ...grant, path: '.' }]
                    if (grant.path.startsWith(`${alias}/`))
                      return [{ ...grant, path: grant.path.slice(alias.length + 1) }]
                    if (
                      (rootId === request.rootId || (managedPrimary && rootId === mountManifest.primaryRootId)) &&
                      !grant.path.startsWith('/')
                    )
                      return [grant]
                    return []
                  })
                  const profile = sourceProfile
                    ? { ...sourceProfile, filesystem: { ...sourceProfile.filesystem, grants: grants ?? [] } }
                    : null
                  const permissions = await createProcessPermissionManifest({
                    root,
                    cwd: root,
                    registrationAccess: registration.access,
                    profile,
                    floorProtectedPaths: nodeProtectedPaths(
                      managedPrimary && rootId === mountManifest.primaryRootId && managedMount
                        ? managedNodeFloor(this.floor, managedMount.worktree)
                        : this.floor,
                      this.dataRoot,
                      root,
                      managedPrimary && rootId === mountManifest.primaryRootId,
                    ).filter((path) => !managedPrimary || !managedMount || path !== join(root, '.git/hooks')),
                    paths: localProcessPermissionPaths,
                  })
                  signal.throwIfAborted()
                  return permissions
                },
              })
            : undefined
          const internalMounts =
            managedPrimary && managedMount && mountPlan
              ? [
                  {
                    kind: 'common-git' as const,
                    worktreeId: managedMount.worktree.worktreeId,
                    parentRootId: managedMount.worktree.parentRootId,
                    sourcePath: managedMount.commonGitDir,
                    targetPath: managedMount.commonGitDir,
                    access: 'read' as const,
                  },
                  {
                    kind: 'worktree-metadata' as const,
                    worktreeId: managedMount.worktree.worktreeId,
                    parentRootId: managedMount.worktree.parentRootId,
                    sourcePath: join(managedMount.commonGitDir, 'worktrees', managedMount.worktree.worktreeId),
                    targetPath: join(managedMount.commonGitDir, 'worktrees', managedMount.worktree.worktreeId),
                    access: 'read' as const,
                  },
                  {
                    kind: 'managed-worktree' as const,
                    worktreeId: managedMount.worktree.worktreeId,
                    parentRootId: managedMount.worktree.parentRootId,
                    sourcePath: managedMount.path,
                    targetPath: managedMount.path,
                    access:
                      mountPlan.mounts.find((mount) => mount.rootId === mountPlan.primaryRootId)?.access ?? 'read',
                  },
                ]
              : []
          const managedProtectedPaths = managedMount
            ? [join(managedMount.commonGitDir, 'hooks'), join(managedMount.commonGitDir, 'worktrees')]
            : []
          const requestedMount =
            mountPlan?.mounts.find((mount) => mount.rootId === request.rootId) ??
            (managedPrimary ? mountPlan?.mounts.find((mount) => mount.rootId === mountPlan.primaryRootId) : undefined)
          const logicalCwd = mountPlan?.mounts.find(
            (mount) => request.cwd === mount.alias || request.cwd.startsWith(`${mount.alias}/`),
          )
          const cwdMount = logicalCwd ?? requestedMount
          const cwdRelative = logicalCwd
            ? request.cwd === logicalCwd.alias
              ? '.'
              : request.cwd.slice(logicalCwd.alias.length + 1)
            : request.cwd
          const cwdUsesManagedPrimary =
            !!managedPrimary && (!logicalCwd || logicalCwd.rootId === mountPlan?.primaryRootId)
          const target = await this.ownedPath(
            cwdUsesManagedPrimary ? request.rootId : (cwdMount?.rootId ?? request.rootId),
            cwdRelative,
            request,
            false,
            cwdUsesManagedPrimary ? managedMount?.path : cwdMount?.expectedRoot,
          )
          const executionCwd = cwdMount
            ? `${cwdMount.target}${cwdRelative === '.' ? '' : `/${cwdRelative}`}`
            : target.path
          transportSignal?.throwIfAborted()
          const profile = this.profile(request)
          if (profile) {
            const verdict = await evaluateSandboxCall(
              profile,
              {
                workspace: target.root,
                tool: {
                  name: 'shell',
                  effect: 'process',
                  commandArgument: 'command',
                  workspaceAccess: { kind: 'workspace' },
                },
                args: { command: request.command },
              },
              localNodePaths,
            )
            if (verdict.decision === 'deny' || (verdict.decision === 'ask' && request.admission.kind !== 'approved'))
              throw new HbarError('NODE_DENIED', 'Node sandbox reevaluation refused the command')
          }
          const network = this.floor.network && (profile?.network.enabled ?? true)
          const requireConfinement =
            !!mountPlan ||
            this.floor.osConfinement === 'required' ||
            !!profile?.osConfinement?.enabled ||
            target.registration.access === 'read' ||
            !network ||
            nodeProtectedPaths(this.floor, this.dataRoot).length > 0 ||
            !!managedMount
          if (
            (requireConfinement && !this.backend.filesystem) ||
            (!network && !this.backend.network) ||
            !this.backend.processTree
          )
            throw new HbarError(
              'NODE_CONFINEMENT_UNAVAILABLE',
              'The node cannot enforce the requested filesystem, network or process-tree isolation',
            )
          const environment = profile?.environment.set ?? {}
          if (Object.keys(environment).some((name) => dangerousEnvironment.test(name)))
            throw new HbarError('NODE_DENIED', 'The snapshot contains an unsafe process environment variable')
          const manifest = await createProcessPermissionManifest({
            root: target.root,
            cwd: target.path,
            registrationAccess: target.registration.access,
            profile,
            floorProtectedPaths: nodeProtectedPaths(
              managedMount ? managedNodeFloor(this.floor, managedMount.worktree) : this.floor,
              this.dataRoot,
              target.root,
              !!managedMount,
            ).filter((path) => !managedMount || path !== join(target.root, '.git/hooks')),
            paths: localProcessPermissionPaths,
          })
          await this.confirmLocalOperation(
            {
              operationId: request.operationId,
              authority: {
                sessionId: request.sessionId,
                runId: request.runId,
                callId: request.callId,
                sandbox: request.sandbox,
                admission: request.admission,
                ...(request.managedWorktree ? { managedWorktree: request.managedWorktree } : {}),
                ...(request.workspaceMounts ? { workspaceMounts: request.workspaceMounts } : {}),
              },
              rootId: target.registration.rootId,
              rootPath: target.registration.path,
              tool: 'shell',
              effects: ['process'],
              argumentsDigest,
              summary: request.command,
            },
            transportSignal,
          )
          const confinement: OsConfinementOptions | null =
            requireConfinement || (this.floor.osConfinement === 'preferred' && this.backend.filesystem)
              ? {
                  level: 'elevated',
                  readableRoots: [
                    ...manifest.readableRoots,
                    ...(mountPlan?.mounts.map((mount) => mount.sourceRoot) ?? []),
                    ...internalMounts.filter((mount) => mount.kind === 'common-git').map((mount) => mount.sourcePath),
                  ],
                  writableRoots: [
                    ...manifest.writableRoots,
                    ...(mountPlan?.mounts.flatMap((mount) => [
                      ...(mount.access === 'write' ? [mount.sourceRoot] : []),
                      ...mount.writePaths.map((path) => path.sourcePath),
                    ]) ?? []),
                  ],
                  networkEnabled: network,
                  envOverrides: environment,
                }
              : null
          const controller = new AbortController()
          const output = this.createExecutionOutput(request.operationId)
          this.availableToStart(request.operationId)
          transportSignal?.throwIfAborted()
          const started = await this.state.call('operation.start', { operationId: request.operationId })
          if (started.receipt.state !== 'started') return started.receipt
          this.availableToStart(request.operationId)
          transportSignal?.throwIfAborted()
          const timeoutMs = Math.min(request.timeoutMs, this.floor.maxTimeoutMs)
          const finished = Promise.resolve()
            .then(async () => {
              let result: NodeExecResult
              try {
                this.availableToStart(request.operationId)
                controller.signal.throwIfAborted()
                const execution = await this.backend.exec(executionCwd, request.command, controller.signal, {
                  timeoutMs,
                  environment,
                  confinement,
                  protectedPaths: [...manifest.protectedPaths, ...managedProtectedPaths],
                  readOnlyPaths: [...manifest.readOnlyPaths],
                  ...(mountPlan
                    ? {
                        workspaceMounts: mountPlan.mounts,
                        ...(internalMounts.length > 0 ? { internalMounts } : {}),
                        protectedPaths: [
                          ...manifest.protectedPaths.filter(
                            (path) =>
                              !mountPlan.mounts.some((mount) =>
                                isPathWithin(mount.sourceRoot, path, {
                                  separator: localNodePaths.separator,
                                  caseInsensitive: localNodePaths.caseInsensitive,
                                }),
                              ),
                          ),
                          ...mountPlan.mounts.flatMap((mount) => mount.protectedPaths.map((path) => path.targetPath)),
                          ...managedProtectedPaths,
                        ],
                        readOnlyPaths: [
                          ...manifest.readOnlyPaths.filter(
                            (path) =>
                              !mountPlan.mounts.some((mount) =>
                                isPathWithin(mount.sourceRoot, path, {
                                  separator: localNodePaths.separator,
                                  caseInsensitive: localNodePaths.caseInsensitive,
                                }),
                              ),
                          ),
                          ...mountPlan.mounts.flatMap((mount) => mount.readOnlyPaths.map((path) => path.targetPath)),
                        ],
                      }
                    : {}),
                  environmentAllowlist: this.floor.environmentAllowlist,
                  onOutput: (text) => output.append(text),
                  onOutputReset: () => output.reset(),
                })
                const details = z
                  .object({
                    code: z.union([z.string(), z.number(), z.null()]).optional(),
                    exitCode: z.number().nullable().optional(),
                    truncated: z.boolean().optional(),
                  })
                  .parse(execution.details ?? {})
                const text = outputTail(execution.text)
                result = nodeExecResultSchema.parse({
                  text,
                  isError: !!execution.isError,
                  details: {
                    code: details.code ?? null,
                    exitCode: details.exitCode ?? (typeof details.code === 'number' ? details.code : null),
                    truncated: !!details.truncated || text.length !== execution.text.length,
                    executionStarted: true,
                    backend: this.backend.name,
                    timeoutMs,
                  },
                })
              } catch (error) {
                if (error instanceof HbarError && error.code === 'EFFECT_UNKNOWN') {
                  await this.state.call('operation.lost', { operationId: request.operationId, reason: 'unknown' })
                  this.finishExecutionOutput(request.operationId, output)
                  return
                }
                result = this.result(error, true)
              }
              await this.state.call('operation.settle', { operationId: request.operationId, result })
              await this.audit(request, result)
              this.finishExecutionOutput(request.operationId, output)
            })
            .finally(() => {
              this.active.delete(request.operationId)
              this.completions.delete(finished)
            })
          this.active.set(request.operationId, { controller, finished })
          this.completions.add(finished)
          finished.catch(() => {
            this.paused = true
          })
          return started.receipt
        } catch (error) {
          if (error instanceof HbarError && error.code === 'NODE_LOCAL_CONFIRMATION_PENDING')
            return accepted.operation.receipt
          const result = this.result(error, false)
          const settled = await this.state.call('operation.settle', { operationId: request.operationId, result })
          await this.audit(request, result)
          return settled.receipt
        }
      } finally {
        this.releaseStarting()
      }
    })
  }

  async write(
    rootId: string,
    path: string,
    text: string,
    operationId: string,
    authority: NodeCallAuthority,
    expectedRevision?: string,
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted()
    if (Buffer.byteLength(text) > NODE_LIMITS.fileBytes)
      throw new HbarError('LIMIT_EXCEEDED', 'Node file write exceeds its limit')
    return this.serial(operationId, async () => {
      const argumentsDigest = digestOf({ rootId, path, text, authority, expectedRevision })
      const prior = await this.state.call('operation.get', { operationId })
      if (prior) {
        if (prior.argumentsDigest !== argumentsDigest)
          throw new HbarError('IDEMPOTENCY_CONFLICT', 'File operation key has different parameters')
        if (prior.versions) {
          if (
            !prior.target?.nodePath ||
            this.floor.roots.find((root) => root.rootId === rootId)?.path !== prior.target.nodePath
          )
            throw new HbarError('NODE_RECEIPT_SCOPE', 'The file receipt belongs to a different shared root location')
          await this.checkFile(rootId, path, authority, true)
          return prior.versions
        }
        if (prior.receipt.state === 'settled' && prior.receipt.result.isError)
          throw new HbarError(
            String(prior.receipt.result.details.code ?? 'NODE_WRITE_FAILED'),
            prior.receipt.result.text,
          )
        throw new HbarError('EFFECT_UNKNOWN', 'The prior file write has no verified versions; do not replay it')
      }
      const root = await this.checkFile(rootId, path, authority, true)
      await this.confirmLocalOperation(
        {
          operationId,
          authority,
          rootId,
          rootPath: this.floor.roots.find((item) => item.rootId === rootId)?.path ?? root,
          tool: 'write_file',
          effects: ['write'],
          argumentsDigest,
          summary: JSON.stringify({ path, bytes: Buffer.byteLength(text), preview: text.slice(0, 3_200) }),
        },
        signal,
      )
      signal?.throwIfAborted()
      await this.state.call('operation.accept', {
        operationId,
        argumentsDigest,
        kind: 'write',
        authority,
        target: { rootId, path, nodePath: root },
      })
      await this.state.call('operation.start', { operationId })
      try {
        signal?.throwIfAborted()
        this.available()
        const versions = await this.execution.write(root, path, text, {
          ...(expectedRevision ? { expectedRevision } : {}),
        })
        const stored = {
          before: versions.before,
          after: versions.after,
          path: versions.path,
          revision: versions.revision,
          created: !!versions.created,
        }
        await this.state.call('operation.settle', {
          operationId,
          versions: stored,
          result: {
            text: '',
            isError: false,
            details: { code: 0, exitCode: 0, executionStarted: true, truncated: false, backend: 'none' },
          },
        })
        await this.state.call('audit.append', {
          operationId,
          sessionId: authority.sessionId,
          runId: authority.runId,
          callId: authority.callId,
          tool: 'write_file',
          argumentsDigest,
          decision: 'allow',
          admission: authority.admission,
          backend: 'none',
          code: 0,
        })
        return stored
      } catch (error) {
        await this.state.call('operation.settle', { operationId, result: this.result(error, true) })
        throw error
      }
    })
  }
  async receipt(operationId: string): Promise<NodeReceipt> {
    return (await this.state.call('operation.get', { operationId }))?.receipt ?? { state: 'absent' }
  }
  async restore(
    rootId: string,
    operationId: string,
    authority: NodeCallAuthority,
    changes: readonly ToolFileChange[],
    signal: AbortSignal,
  ): Promise<void> {
    return this.serial(operationId, async () => {
      const argumentsDigest = digestOf({ rootId, authority, changes })
      const prior = await this.state.call('operation.get', { operationId })
      if (prior) {
        if (prior.argumentsDigest !== argumentsDigest)
          throw new HbarError('IDEMPOTENCY_CONFLICT', 'Restore key has different parameters')
        if (prior.receipt.state !== 'settled') throw new HbarError('EFFECT_UNKNOWN', 'Prior restore outcome is unknown')
        if (prior.receipt.result.isError)
          throw new HbarError(String(prior.receipt.result.details.code), prior.receipt.result.text)
        return
      }
      let root = ''
      for (const change of changes) root = await this.checkFile(rootId, change.path, authority, true)
      if (!changes.length || !this.execution.restoreFiles)
        throw new HbarError('NODE_RESTORE_UNAVAILABLE', 'Node restore backend unavailable')
      signal.throwIfAborted()
      await this.confirmLocalOperation(
        {
          operationId,
          authority,
          rootId,
          rootPath: this.floor.roots.find((item) => item.rootId === rootId)?.path ?? root,
          tool: 'restore_files',
          effects: ['write'],
          argumentsDigest,
          summary: JSON.stringify({ paths: changes.slice(0, 40).map((change) => change.path), count: changes.length }),
        },
        signal,
      )
      await this.state.call('operation.accept', {
        operationId,
        argumentsDigest,
        kind: 'restore',
        authority,
        target: { rootId, path: '.', nodePath: root },
      })
      await this.state.call('operation.start', { operationId })
      try {
        this.available()
        await this.execution.restoreFiles(root, changes, signal)
        await this.state.call('operation.settle', {
          operationId,
          result: {
            text: '',
            isError: false,
            details: { code: 0, exitCode: 0, executionStarted: true, truncated: false, backend: 'none' },
          },
        })
        await this.state.call('audit.append', {
          operationId,
          sessionId: authority.sessionId,
          runId: authority.runId,
          callId: authority.callId,
          tool: 'restore_files',
          argumentsDigest,
          decision: 'allow',
          admission: authority.admission,
          backend: 'none',
          code: 0,
        })
      } catch (error) {
        await this.state.call('operation.lost', { operationId, reason: 'unknown' })
        throw error
      }
    })
  }
  async cancel(operationId: string): Promise<NodeReceipt> {
    this.pendingCancellations.set(operationId, (this.pendingCancellations.get(operationId) ?? 0) + 1)
    try {
      return await this.serial(operationId, async () => {
        await this.localConfirmations?.cancelOperation(operationId)
        const pending = this.pendingStarts.get(operationId)
        pending?.controller.abort(new HbarError('CANCELLED', 'Process start was cancelled by its owning node'))
        if (pending) await pending.finished
        const active = this.active.get(operationId)
        active?.controller.abort(new HbarError('CANCELLED', 'Execution cancelled locally or by its owning node link'))
        await active?.cancel?.()
        if (active) await active.finished
        const prior = await this.state.call('operation.get', { operationId })
        if (prior?.kind === 'exec' && prior.receipt.state === 'accepted') {
          const authority = nodeCallAuthoritySchema.parse(prior.authority)
          const result: NodeExecResult = {
            text: 'The operation was cancelled before local confirmation completed.',
            isError: true,
            details: {
              code: 'CANCELLED',
              exitCode: null,
              executionStarted: false,
              truncated: false,
              backend: 'none',
            },
          }
          const settled = await this.state.call('operation.settle', { operationId, result })
          await this.state.call('audit.append', {
            operationId,
            sessionId: authority.sessionId,
            runId: authority.runId,
            callId: authority.callId,
            tool: 'shell',
            argumentsDigest: prior.argumentsDigest,
            decision: 'deny',
            admission: authority.admission,
            backend: 'none',
            code: 'CANCELLED',
          })
          return settled.receipt
        }
        return this.receipt(operationId)
      })
    } finally {
      const remaining = (this.pendingCancellations.get(operationId) ?? 1) - 1
      if (remaining) this.pendingCancellations.set(operationId, remaining)
      else this.pendingCancellations.delete(operationId)
    }
  }
  async pause(value = true): Promise<void> {
    this.paused = value
    await this.state.call('config.set', { key: 'paused', value })
    if (!value) return
    const pendingConfirmations = await this.localConfirmations?.cancelPending()
    await Promise.all((pendingConfirmations ?? []).map((operationId) => this.cancel(operationId)))
    await Promise.all(this.running.map((operationId) => this.cancel(operationId)))
    // A start still preparing will hit the paused availability fence before creating a process.
    await Promise.all(this.running.map((operationId) => this.cancel(operationId)))
  }
  linkRestored(): void {
    clearTimeout(this.linkTimer)
    this.linkTimer = undefined
    this.linkExpired = false
  }
  linkLost(): void {
    if (this.localConfirmations) {
      const task = this.localConfirmations
        .cancelPending()
        .then((operationIds) => Promise.all(operationIds.map((operationId) => this.cancel(operationId))))
        .then(() => undefined)
      this.completions.add(task)
      task.then(
        () => this.completions.delete(task),
        () => {
          this.completions.delete(task)
          this.paused = true
        },
      )
    }
    if (this.floor.onLinkLost.action === 'continue' || this.linkTimer) return
    this.linkTimer = setTimeout(() => {
      this.linkTimer = undefined
      this.linkExpired = true
      const pendingStartIds = [...this.pendingStarts.keys()]
      const task = Promise.all(
        [...this.active].map(async ([id, active]) => {
          if (active.durable !== false)
            await this.state.call('operation.lost', { operationId: id, reason: 'link-lost' })
          active.controller.abort(new HbarError('EFFECT_UNKNOWN', 'Owning node link was lost'))
          await active.cancel?.()
          await active.finished
        }),
      ).then(async () => {
        await Promise.all(pendingStartIds.map((operationId) => this.cancel(operationId)))
        await Promise.all(
          [...this.active].map(async ([operationId, active]) => {
            if (active.durable !== false) await this.state.call('operation.lost', { operationId, reason: 'link-lost' })
            active.controller.abort(new HbarError('EFFECT_UNKNOWN', 'Owning node link was lost'))
            await active.cancel?.()
            await active.finished
          }),
        )
      })
      this.completions.add(task)
      task.then(
        () => this.completions.delete(task),
        () => {
          this.completions.delete(task)
          this.paused = true
        },
      )
    }, this.floor.onLinkLost.graceMs)
  }
  dispose(): Promise<void> {
    return (this.closing ??= this.close())
  }
  private async close(): Promise<void> {
    this.disposed = true
    this.policyListeners.clear()
    this.linkRestored()
    const pendingStarts = [...this.pendingStarts]
    for (const [, pending] of pendingStarts)
      pending.controller.abort(new HbarError('CANCELLED', 'Workspace node is stopping'))
    await Promise.all(pendingStarts.map(([operationId]) => this.localConfirmations?.cancelOperation(operationId)))
    for (const active of this.active.values())
      active.controller.abort(new HbarError('CANCELLED', 'Workspace node is stopping'))
    await Promise.all([...this.active.values()].map((active) => active.cancel?.()))
    await this.gitOperations?.dispose()
    await this.gitQueries?.dispose()
    await this.worktrees?.close()
    await Promise.allSettled([...this.locks.values()])
    await Promise.allSettled([...this.completions])
    await this.waitForStartsToDrain()
    await this.backend.dispose?.()
    await this.execution.dispose?.()
  }
}
