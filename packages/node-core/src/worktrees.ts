import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import {
  nodeWorktreeProvisioningAuthoritySchema,
  type NodeWorktreeProvisioningAuthority,
} from '@hbar/contracts/node-worktree-provisioning'
import type { NodeLaunchTargetConfirmationIdentity } from '@hbar/contracts/node-confirmations'
import {
  nodeManagedWorktreeSchema,
  nodeWorktreeCreateSchema,
  nodeWorktreeMethods,
  nodeWorktreeRemoveSchema,
  type NodeManagedWorktree,
  type NodeWorktreeCreate,
  type NodeWorktreeCreateRequest,
  type NodeWorktreeRemove,
} from '@hbar/contracts/node-worktree'
import { nodeRootIdSchema, type NodeFloor } from '@hbar/contracts/node'

const MAX_MANAGED_WORKTREES = 64
const MAX_SHARED_ROOTS = 64
const METADATA_VERSION = 1
const gitWorktreeDirectory = '.hbar-worktrees'

const recordSchema = nodeManagedWorktreeSchema.extend({
  version: z.literal(METADATA_VERSION),
  status: z.enum(['creating', 'ready', 'removing']),
  createOperationId: z.string().min(1).max(330),
  removeOperationId: z.string().min(1).max(330).optional(),
  startPoint: z.string().min(1).max(255).optional(),
  createBranch: z.boolean(),
  provisioning: nodeWorktreeProvisioningAuthoritySchema,
  removeProvisioning: nodeWorktreeProvisioningAuthoritySchema.optional(),
  requestDigest: z.string().regex(/^[a-f0-9]{64}$/),
})
type ManagedRecord = ReturnType<typeof recordSchema.parse>

function publicRecord(record: ManagedRecord): NodeManagedWorktree {
  return nodeManagedWorktreeSchema.parse({
    worktreeId: record.worktreeId,
    sessionId: record.sessionId,
    createdByRunId: record.provisioning.runId,
    targetRevision: record.targetRevision,
    worktreeRootId: record.worktreeRootId,
    parentRootId: record.parentRootId,
    nodePath: record.nodePath,
    branch: record.branch,
    createdAt: record.createdAt,
  })
}

export type ManagedNodeWorktreeGitOperation =
  | {
      readonly kind: 'add'
      readonly worktreeId: string
      readonly branch: string
      readonly createBranch: boolean
      readonly startPoint?: string
    }
  | { readonly kind: 'remove'; readonly worktreeId: string }

/** Implemented by NodeGitOperationService: one admitted `git.worktree` call and receipt per operationId. */
export interface ManagedNodeWorktreeGitPort {
  worktree(
    input: {
      readonly operationId: string
      readonly rootId: string
      readonly expectedRoot: string
      readonly provisioning: NodeWorktreeProvisioningAuthority
      readonly operation: ManagedNodeWorktreeGitOperation
    },
    signal: AbortSignal,
  ): Promise<{ readonly path: string }>
}

export interface ManagedNodeWorktreeRootPort {
  register(record: NodeManagedWorktree, access: 'read' | 'write'): Promise<void>
  unregister(worktreeRootId: string, worktreeId: string): Promise<void>
}

export interface ManagedNodeWorktreeAllocator {
  create(input: NodeWorktreeCreateRequest, signal: AbortSignal): Promise<NodeManagedWorktree>
  remove(input: NodeWorktreeRemove, signal: AbortSignal): Promise<void>
  get(
    input: {
      readonly rootId: string
      readonly expectedRoot: string
      readonly operationId: string
      readonly branch: string
      readonly startPoint?: string
      readonly createBranch: boolean
      readonly provisioning: NodeWorktreeProvisioningAuthority
    },
    signal: AbortSignal,
  ): Promise<NodeManagedWorktree | null>
  authorizeGitOperation(input: {
    readonly operationId: string
    readonly rootId: string
    readonly expectedRoot: string
    readonly provisioning: NodeWorktreeProvisioningAuthority
    readonly operation: ManagedNodeWorktreeGitOperation
  }): Promise<{
    readonly path: string
    readonly commonGitDir: string
    readonly protectedSiblingPaths: readonly string[]
  }>
  provisioningCurrent(identity: NodeLaunchTargetConfirmationIdentity, signal: AbortSignal): Promise<boolean>
  close(): Promise<void>
}

function digest(input: NodeWorktreeCreate): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        rootId: input.rootId,
        expectedRoot: input.expectedRoot,
        workspaceId: input.provisioning.workspaceId,
        sessionId: input.provisioning.sessionId,
        nodeId: input.provisioning.nodeId,
        targetRevision: input.provisioning.targetRevision,
        branch: input.branch,
        ...(input.startPoint ? { startPoint: input.startPoint } : {}),
        createBranch: input.createBranch,
        acceptedTargetDigest: input.provisioning.acceptedTargetDigest,
      }),
    )
    .digest('hex')
}

function managedWorktreeId(
  input: Pick<NodeWorktreeCreate, 'rootId' | 'branch' | 'startPoint' | 'provisioning'>,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        sessionId: input.provisioning.sessionId,
        workspaceId: input.provisioning.workspaceId,
        nodeId: input.provisioning.nodeId,
        rootId: input.rootId,
        targetRevision: input.provisioning.targetRevision,
        branch: input.branch,
        startPoint: input.startPoint ?? null,
      }),
    )
    .digest('hex')
    .slice(0, 32)
}

function worktreeIdFromProvisioning(rootId: string, provisioning: NodeWorktreeProvisioningAuthority): string {
  const selection = provisioning.selection
  if (selection.mode === 'shared-current') throw new HbarError('NODE_DENIED', 'Shared-current has no worktree')
  const plan =
    selection.mode === 'shared-branch'
      ? { branch: selection.branch.ref.slice('refs/heads/'.length), startPoint: undefined }
      : selection.branch.kind === 'existing'
        ? { branch: selection.branch.name, startPoint: undefined }
        : selection.branch.kind === 'new'
          ? { branch: selection.branch.name, startPoint: selection.branch.startPoint }
          : {
              branch: `hbar/session-launch/${createHash('sha256')
                .update(`${provisioning.sessionId}\0${provisioning.targetRevision}`)
                .digest('hex')}`,
              startPoint: selection.branch.baseRef.slice('refs/heads/'.length),
            }
  return managedWorktreeId({ rootId, provisioning, ...plan })
}

function within(root: string, path: string): boolean {
  const value = relative(root, path)
  return value === '' || (!isAbsolute(value) && value !== '..' && !value.startsWith(`..${sep}`))
}

async function atomicRecord(path: string, record: ManagedRecord): Promise<void> {
  const temporary = `${path}.${crypto.randomUUID()}.tmp`
  await writeFile(temporary, JSON.stringify(record), { flag: 'wx', mode: 0o600 })
  try {
    await rename(temporary, path)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

/**
 * Creates Git worktrees only beneath a B-registered shared root. The durable
 * ownership manifest stays below B's private dataRoot; callers receive only
 * generated root IDs and canonical paths, never a deletion path.
 */
export async function createManagedNodeWorktreeAllocator(options: {
  readonly dataRoot: string
  readonly floor: NodeFloor | (() => NodeFloor)
  readonly git: ManagedNodeWorktreeGitPort
  readonly roots: ManagedNodeWorktreeRootPort
}): Promise<ManagedNodeWorktreeAllocator> {
  const currentFloor = () => (typeof options.floor === 'function' ? options.floor() : options.floor)
  const dataRoot = await realpath(options.dataRoot)
  const registryRoot = resolve(dataRoot, 'managed-worktrees')
  await mkdir(registryRoot, { recursive: true, mode: 0o700 })
  if ((await realpath(registryRoot)) !== registryRoot)
    throw new HbarError('NODE_DENIED', 'Managed worktree metadata must stay in B private storage')

  const records = new Map<string, ManagedRecord>()
  const mutex = { tail: Promise.resolve() }
  const closing = new AbortController()
  let closed = false
  let active = 0
  const serialize = async <T>(signal: AbortSignal, action: () => Promise<T>): Promise<T> => {
    const prior = mutex.tail
    let release!: () => void
    mutex.tail = new Promise<void>((resolveLock) => {
      release = resolveLock
    })
    await prior
    try {
      signal.throwIfAborted()
      if (closed) throw new HbarError('NODE_OFFLINE', 'Managed worktree service is closed')
      return await action()
    } finally {
      release()
    }
  }
  const metadataPath = (worktreeId: string) => resolve(registryRoot, `${worktreeId}.json`)
  const readRecord = async (worktreeId: string): Promise<ManagedRecord | null> => {
    const existing = records.get(worktreeId)
    if (existing) return existing
    try {
      const parsed = recordSchema.parse(JSON.parse(await readFile(metadataPath(worktreeId), 'utf8')))
      if (parsed.worktreeId !== worktreeId)
        throw new HbarError('NODE_WORKTREE_METADATA', 'Managed worktree metadata identity mismatch')
      records.set(worktreeId, parsed)
      return parsed
    } catch (error) {
      if (error instanceof Error && 'code' in error && String(error.code) === 'ENOENT') return null
      throw error
    }
  }
  const rootFor = async (rootId: string) => {
    const floor = currentFloor()
    const root = floor.roots.find((item) => item.rootId === rootId)
    if (!root || root.access !== 'write')
      throw new HbarError('NODE_DENIED', 'Worktrees require a writable registered root')
    const canonical = await realpath(root.path)
    if (canonical !== resolve(root.path))
      throw new HbarError('NODE_ROOT_CHANGED', 'The registered worktree root changed')
    if (!(await stat(canonical)).isDirectory())
      throw new HbarError('NODE_DENIED', 'The registered worktree root is unavailable')
    return { canonical, access: root.access }
  }
  const prepareGeneratedTarget = async (parent: string, worktreeId: string): Promise<string> => {
    const area = resolve(parent, gitWorktreeDirectory)
    await mkdir(area, { recursive: true })
    const areaInfo = await lstat(area)
    if (
      areaInfo.isSymbolicLink() ||
      !areaInfo.isDirectory() ||
      (await realpath(area)) !== area ||
      !within(parent, area)
    )
      throw new HbarError(
        'NODE_DENIED',
        'Managed worktree directory must be a real directory beneath the registered root',
      )
    const target = resolve(area, worktreeId)
    try {
      const targetInfo = await lstat(target)
      if (targetInfo.isSymbolicLink() || !targetInfo.isDirectory() || (await realpath(target)) !== target)
        throw new HbarError('NODE_DENIED', 'Generated managed worktree target must be a real directory beneath B root')
    } catch (error) {
      if (error instanceof HbarError) throw error
      if (!(error instanceof Error && 'code' in error && String(error.code) === 'ENOENT')) throw error
      await mkdir(target, { mode: 0o700 })
    }
    return target
  }
  const verifyGitWorktree = async (parent: string, target: string, worktreeId: string): Promise<void> => {
    const canonicalTarget = await realpath(target)
    if (canonicalTarget !== resolve(target) || !within(parent, canonicalTarget) || canonicalTarget === parent)
      throw new HbarError('NODE_DENIED', 'Git returned a worktree outside its registered parent root')
    const marker = resolve(canonicalTarget, '.git')
    const markerInfo = await lstat(marker)
    if (markerInfo.isSymbolicLink() || !markerInfo.isFile())
      throw new HbarError('NODE_WORKTREE_INVALID', 'Git worktree metadata marker is not a regular file')
    const markerText = await readFile(marker, 'utf8')
    const match = /^gitdir: (.+)\r?\n?$/.exec(markerText)
    if (!match?.[1]) throw new HbarError('NODE_WORKTREE_INVALID', 'Git worktree metadata marker is invalid')
    const metadata = await realpath(resolve(canonicalTarget, match[1]))
    const commonMetadata = await realpath(resolve(parent, '.git', 'worktrees'))
    if (!within(commonMetadata, metadata) || relative(commonMetadata, metadata) !== worktreeId)
      throw new HbarError('NODE_WORKTREE_INVALID', 'Git worktree must use common metadata inside the registered root')
    const reciprocal = await readFile(resolve(metadata, 'gitdir'), 'utf8')
    const reciprocalMatch = /^(.+?)\r?\n?$/.exec(reciprocal)
    if (
      !reciprocalMatch?.[1] ||
      (await realpath(resolve(metadata, reciprocalMatch[1]))) !== resolve(canonicalTarget, '.git')
    )
      throw new HbarError('NODE_WORKTREE_INVALID', 'Git worktree metadata must point back to the generated checkout')
  }
  const completeCreate = async (
    input: NodeWorktreeCreate,
    record: ManagedRecord,
    signal: AbortSignal,
    access: 'read' | 'write',
  ): Promise<NodeManagedWorktree> => {
    const { canonical } = await rootFor(record.parentRootId)
    const nodePath = await prepareGeneratedTarget(canonical, record.worktreeId)
    if (nodePath !== resolve(record.nodePath))
      throw new HbarError('NODE_WORKTREE_METADATA', 'Managed worktree target differs from its persisted identity')
    const created = await options.git.worktree(
      {
        operationId: input.operationId,
        rootId: record.parentRootId,
        expectedRoot: canonical,
        provisioning: record.provisioning,
        operation: {
          kind: 'add',
          worktreeId: record.worktreeId,
          branch: record.branch,
          createBranch: input.createBranch,
          ...(record.startPoint ? { startPoint: record.startPoint } : {}),
        },
      },
      signal,
    )
    if (resolve(created.path) !== nodePath)
      throw new HbarError('NODE_WORKTREE_INVALID', 'Git created a worktree at an unexpected path')
    await verifyGitWorktree(canonical, nodePath, record.worktreeId)
    const ready = recordSchema.parse({ ...record, status: 'ready' })
    await atomicRecord(metadataPath(record.worktreeId), ready)
    records.set(record.worktreeId, ready)
    const result = publicRecord(ready)
    await options.roots.register(result, access)
    return result
  }
  const completeRemove = async (record: ManagedRecord, signal: AbortSignal): Promise<void> => {
    const { canonical } = await rootFor(record.parentRootId)
    const expectedPath = resolve(canonical, gitWorktreeDirectory, record.worktreeId)
    if (expectedPath !== resolve(record.nodePath))
      throw new HbarError('NODE_WORKTREE_METADATA', 'Managed worktree target differs from its persisted identity')
    try {
      const existing = await realpath(record.nodePath)
      if (existing !== expectedPath || !within(canonical, existing))
        throw new HbarError('NODE_WORKTREE_METADATA', 'Managed worktree escaped its parent root')
      await verifyGitWorktree(canonical, existing, record.worktreeId)
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && String(error.code) === 'ENOENT')) throw error
    }
    if (!record.removeOperationId)
      throw new HbarError('NODE_WORKTREE_METADATA', 'Managed worktree removal has no durable operation id')
    await options.git.worktree(
      {
        operationId: record.removeOperationId,
        rootId: record.parentRootId,
        expectedRoot: canonical,
        provisioning: record.removeProvisioning ?? record.provisioning,
        operation: { kind: 'remove', worktreeId: record.worktreeId },
      },
      signal,
    )
    await options.roots.unregister(record.worktreeRootId, record.worktreeId)
    await rm(metadataPath(record.worktreeId), { force: true })
    records.delete(record.worktreeId)
  }
  for (const root of currentFloor().roots) {
    if (root.access !== 'write') continue
    const area = resolve(root.path, gitWorktreeDirectory)
    try {
      await mkdir(area, { recursive: true, mode: 0o700 })
      const areaInfo = await lstat(area)
      if (areaInfo.isSymbolicLink() || !areaInfo.isDirectory() || (await realpath(area)) !== area)
        throw new HbarError(
          'NODE_DENIED',
          'Managed worktree storage must be a real directory under its registered root',
        )
    } catch (error) {
      if (error instanceof HbarError) throw error
      if (!(error instanceof Error && 'code' in error && String(error.code) === 'ENOENT')) throw error
    }
  }
  const registerExisting = async () => {
    for (const name of await readdir(registryRoot)) {
      if (!/^[a-f0-9]{32}\.json$/.test(name)) continue
      const record = await readRecord(name.slice(0, -5))
      if (!record || record.status !== 'ready') continue
      if (currentFloor().roots.some((root) => root.rootId === record.worktreeRootId))
        throw new HbarError('NODE_WORKTREE_METADATA', 'Managed worktree root id collides with a shared root')
      const { canonical } = await rootFor(record.parentRootId)
      if (!within(canonical, await realpath(record.nodePath)))
        throw new HbarError('NODE_WORKTREE_METADATA', 'Persisted managed worktree escaped its parent root')
      await options.roots.register(publicRecord(record), 'write')
    }
  }
  await registerExisting()

  return {
    async create(raw, signal) {
      const input = nodeWorktreeCreateSchema.parse(raw)
      if (input.operationId !== `${input.provisioning.runId}:worktree-create`)
        throw new HbarError('WORKSPACE_SCOPE', 'Worktree create operation key does not match launch-target authority')
      const worktreeId = managedWorktreeId(input)
      const operationSignal = AbortSignal.any([signal, closing.signal])
      return await serialize(operationSignal, async () => {
        operationSignal.throwIfAborted()
        if (active >= 4) throw new HbarError('NODE_BUSY', 'B has reached its managed worktree operation limit')
        active++
        try {
          const prior = await readRecord(worktreeId)
          if (prior) {
            if (prior.requestDigest !== digest(input))
              throw new HbarError('IDEMPOTENCY_CONFLICT', 'Worktree identity has different parameters')
            if (prior.status === 'ready') {
              if (
                prior.sessionId !== input.provisioning.sessionId ||
                prior.provisioning.workspaceId !== input.provisioning.workspaceId ||
                prior.provisioning.nodeId !== input.provisioning.nodeId ||
                prior.targetRevision !== input.provisioning.targetRevision ||
                prior.provisioning.acceptedTargetDigest !== input.provisioning.acceptedTargetDigest
              )
                throw new HbarError('NODE_DENIED', 'Managed worktree belongs to a different Session target')
              const ready = publicRecord(prior)
              await options.roots.register(ready, 'write')
              return ready
            }
            if (prior.status === 'removing' || prior.createOperationId !== input.operationId)
              throw new HbarError('EFFECT_UNKNOWN', 'Pending managed worktree operation must be reconciled')
            const { access } = await rootFor(prior.parentRootId)
            return await completeCreate(input, prior, operationSignal, access)
          }
          const managedCount = (await readdir(registryRoot)).filter((name) => /^[a-f0-9]{32}\.json$/.test(name)).length
          if (managedCount >= MAX_MANAGED_WORKTREES || currentFloor().roots.length + managedCount >= MAX_SHARED_ROOTS)
            throw new HbarError('LIMIT_EXCEEDED', 'B has reached its managed worktree limit')
          const { canonical, access } = await rootFor(input.rootId)
          if (input.expectedRoot !== canonical)
            throw new HbarError('NODE_ROOT_CHANGED', 'Worktree request differs from its captured parent root')
          const nodePath = await prepareGeneratedTarget(canonical, worktreeId)
          const worktreeRootId = nodeRootIdSchema.parse(`wt_${worktreeId}`)
          if (currentFloor().roots.some((root) => root.rootId === worktreeRootId))
            throw new HbarError('NODE_WORKTREE_METADATA', 'Managed worktree root id collides with a shared root')
          const record = recordSchema.parse({
            version: METADATA_VERSION,
            status: 'creating',
            worktreeId,
            sessionId: input.provisioning.sessionId,
            createdByRunId: input.provisioning.runId,
            targetRevision: input.provisioning.targetRevision,
            worktreeRootId,
            parentRootId: input.rootId,
            nodePath,
            branch: input.branch,
            ...(input.startPoint ? { startPoint: input.startPoint } : {}),
            createBranch: input.createBranch,
            createdAt: Date.now(),
            createOperationId: input.operationId,
            provisioning: input.provisioning,
            requestDigest: digest(input),
          })
          await atomicRecord(metadataPath(worktreeId), record)
          records.set(worktreeId, record)
          return await completeCreate(input, record, operationSignal, access)
        } catch (error) {
          if (error instanceof HbarError && error.code === 'EFFECT_UNKNOWN') throw error
          throw error
        } finally {
          active--
        }
      })
    },
    async remove(raw, signal) {
      const input = nodeWorktreeRemoveSchema.parse(raw)
      if (input.operationId !== `${input.provisioning.runId}:worktree-remove`)
        throw new HbarError('WORKSPACE_SCOPE', 'Worktree removal operation key does not match launch-target authority')
      const operationSignal = AbortSignal.any([signal, closing.signal])
      return await serialize(operationSignal, async () => {
        operationSignal.throwIfAborted()
        const record = await readRecord(input.worktreeId)
        if (!record) return
        if (
          input.rootId !== record.parentRootId ||
          record.sessionId !== input.provisioning.sessionId ||
          record.provisioning.workspaceId !== input.provisioning.workspaceId ||
          record.provisioning.nodeId !== input.provisioning.nodeId ||
          record.targetRevision !== input.provisioning.targetRevision ||
          record.provisioning.acceptedTargetDigest !== input.provisioning.acceptedTargetDigest
        )
          throw new HbarError('NODE_DENIED', 'Managed worktree belongs to a different Session target')
        const { canonical } = await rootFor(record.parentRootId)
        if (input.expectedRoot !== canonical)
          throw new HbarError('NODE_ROOT_CHANGED', 'Worktree removal differs from its captured parent root')
        if (record.status === 'creating')
          throw new HbarError('EFFECT_UNKNOWN', 'Managed worktree creation is pending; reconcile its Git receipt')
        if (record.status === 'removing') {
          if (record.removeOperationId !== input.operationId)
            throw new HbarError('IDEMPOTENCY_CONFLICT', 'Pending worktree removal must use its original operation id')
          await completeRemove(record, operationSignal)
          return
        }
        if (!within(canonical, await realpath(record.nodePath)))
          throw new HbarError('NODE_WORKTREE_METADATA', 'Managed worktree escaped its parent root')
        const removing = recordSchema.parse({
          ...record,
          status: 'removing',
          removeOperationId: input.operationId,
          removeProvisioning: input.provisioning,
        })
        await atomicRecord(metadataPath(input.worktreeId), removing)
        records.set(input.worktreeId, removing)
        await completeRemove(removing, operationSignal)
      })
    },
    async get(raw, signal) {
      const input = nodeWorktreeMethods['worktree.get'].input.parse(raw)
      if (input.operationId !== `${input.provisioning.runId}:worktree-get`)
        throw new HbarError('WORKSPACE_SCOPE', 'Worktree lookup operation key does not match launch-target authority')
      const worktreeId = managedWorktreeId(input)
      const { canonical } = await rootFor(input.rootId)
      if (input.expectedRoot !== canonical)
        throw new HbarError('NODE_ROOT_CHANGED', 'Worktree lookup differs from its captured parent root')
      const operationSignal = AbortSignal.any([signal, closing.signal])
      return await serialize(operationSignal, async () => {
        operationSignal.throwIfAborted()
        const record = await readRecord(worktreeId)
        if (
          record &&
          (record.sessionId !== input.provisioning.sessionId ||
            record.provisioning.workspaceId !== input.provisioning.workspaceId ||
            record.provisioning.nodeId !== input.provisioning.nodeId ||
            record.targetRevision !== input.provisioning.targetRevision ||
            record.provisioning.acceptedTargetDigest !== input.provisioning.acceptedTargetDigest ||
            record.parentRootId !== input.rootId ||
            record.branch !== input.branch ||
            record.startPoint !== input.startPoint ||
            record.createBranch !== input.createBranch)
        )
          throw new HbarError('NODE_DENIED', 'Managed worktree belongs to a different Session target')
        return record?.status === 'ready' ? publicRecord(record) : null
      })
    },
    async authorizeGitOperation(input) {
      const provisioning = nodeWorktreeProvisioningAuthoritySchema.parse(input.provisioning)
      if (
        input.operationId !== `${provisioning.runId}:worktree-create` &&
        input.operationId !== `${provisioning.runId}:worktree-remove`
      )
        throw new HbarError('WORKSPACE_SCOPE', 'Managed Git operation key does not match launch-target authority')
      const worktreeId = z
        .string()
        .regex(/^[a-f0-9]{32}$/)
        .parse(input.operation.worktreeId)
      const record = await readRecord(worktreeId)
      if (
        !record ||
        record.parentRootId !== input.rootId ||
        record.sessionId !== provisioning.sessionId ||
        record.provisioning.workspaceId !== provisioning.workspaceId ||
        record.provisioning.nodeId !== provisioning.nodeId ||
        record.targetRevision !== provisioning.targetRevision ||
        record.provisioning.acceptedTargetDigest !== provisioning.acceptedTargetDigest
      )
        throw new HbarError('NODE_DENIED', 'Git worktree operation has no matching B-owned allocation record')
      const { canonical } = await rootFor(record.parentRootId)
      const expectedPath = resolve(canonical, gitWorktreeDirectory, worktreeId)
      if (input.expectedRoot !== canonical || resolve(record.nodePath) !== expectedPath)
        throw new HbarError('NODE_ROOT_CHANGED', 'Git worktree operation differs from its generated B target')
      const gitDirectory = resolve(canonical, '.git')
      const gitDirectoryInfo = await lstat(gitDirectory)
      if (
        gitDirectoryInfo.isSymbolicLink() ||
        !gitDirectoryInfo.isDirectory() ||
        (await realpath(gitDirectory)) !== gitDirectory
      )
        throw new HbarError('NODE_WORKTREE_METADATA', 'Registered parent Git metadata must be a real directory')
      const commonGitDir = gitDirectory
      const commonWorktrees = resolve(commonGitDir, 'worktrees')
      await mkdir(commonWorktrees, { recursive: true, mode: 0o700 })
      const commonWorktreesInfo = await lstat(commonWorktrees)
      if (
        commonWorktreesInfo.isSymbolicLink() ||
        !commonWorktreesInfo.isDirectory() ||
        (await realpath(commonWorktrees)) !== commonWorktrees
      )
        throw new HbarError('NODE_WORKTREE_METADATA', 'Common Git worktree metadata must be a real directory')
      if (input.operation.kind === 'add' && input.operation.createBranch) {
        for (const directory of [
          resolve(commonGitDir, 'refs', 'heads'),
          resolve(commonGitDir, 'logs', 'refs', 'heads'),
        ]) {
          const info = await lstat(directory)
          if (info.isSymbolicLink() || !info.isDirectory() || (await realpath(directory)) !== directory)
            throw new HbarError('NODE_WORKTREE_METADATA', 'Git branch metadata path must be a real directory')
        }
      }
      const sidecar = resolve(canonical, gitWorktreeDirectory)
      const protectedSiblingPaths: string[] = []
      for (const entry of await readdir(sidecar)) {
        const siblingPath = resolve(sidecar, entry)
        if (siblingPath === expectedPath) continue
        const info = await lstat(siblingPath)
        if (info.isSymbolicLink() || !info.isDirectory() || (await realpath(siblingPath)) !== siblingPath)
          throw new HbarError('NODE_DENIED', 'Managed worktree sidecar contains an unsafe non-directory entry')
        protectedSiblingPaths.push(siblingPath)
      }
      if (input.operation.kind === 'add') {
        if (
          record.status !== 'creating' ||
          record.createOperationId !== input.operationId ||
          record.branch !== input.operation.branch ||
          record.createBranch !== input.operation.createBranch ||
          record.startPoint !== input.operation.startPoint ||
          record.createOperationId !== input.operationId
        )
          throw new HbarError('NODE_DENIED', 'Git add does not match the allocator pending create record')
        await prepareGeneratedTarget(canonical, worktreeId)
      } else if (
        record.status !== 'removing' ||
        record.removeOperationId !== input.operationId ||
        record.removeProvisioning?.runId !== provisioning.runId
      )
        throw new HbarError('NODE_DENIED', 'Git remove does not match the allocator pending remove record')
      return { path: expectedPath, commonGitDir, protectedSiblingPaths }
    },
    async provisioningCurrent(identity, signal) {
      try {
        signal.throwIfAborted()
        const provisioning = nodeWorktreeProvisioningAuthoritySchema.parse({
          kind: 'launch-target',
          workspaceId: identity.workspaceId,
          sessionId: identity.sessionId,
          runId: identity.runId,
          nodeId: identity.nodeId,
          targetRevision: identity.targetRevision,
          selection: identity.selection,
          acceptedTargetDigest: identity.acceptedTargetDigest,
          workspaceFolderRevision: identity.workspaceFolderRevision,
          workspaceFolderDigest: identity.workspaceFolderDigest,
        })
        const { canonical } = await rootFor(identity.rootId)
        if (canonical !== identity.rootPath) return false
        const worktreeId = identity.worktreeId ?? worktreeIdFromProvisioning(identity.rootId, provisioning)
        if (identity.tool === 'worktree.create') {
          const record = await readRecord(worktreeId)
          if (!record) return true
          return Boolean(
            record &&
            record.status === 'creating' &&
            record.parentRootId === identity.rootId &&
            record.sessionId === provisioning.sessionId &&
            record.targetRevision === provisioning.targetRevision &&
            record.provisioning.acceptedTargetDigest === provisioning.acceptedTargetDigest,
          )
        }
        const record = await readRecord(worktreeId)
        return Boolean(
          record &&
          record.parentRootId === identity.rootId &&
          record.sessionId === provisioning.sessionId &&
          record.targetRevision === provisioning.targetRevision &&
          record.provisioning.acceptedTargetDigest === provisioning.acceptedTargetDigest &&
          (identity.tool === 'worktree.get' ? record.status === 'ready' : record.status === 'removing'),
        )
      } catch {
        return false
      }
    },
    async close() {
      closed = true
      if (!closing.signal.aborted) closing.abort(new HbarError('NODE_OFFLINE', 'Managed worktree service is closing'))
      await mutex.tail
    },
  }
}
