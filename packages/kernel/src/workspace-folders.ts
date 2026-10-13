import { opendir, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { CommandError, type CommandRegistry } from '@hbar/commands'
import { HbarError, LOCAL_EXECUTION_ENABLED, assertLocalExecutionAllowed } from '@hbar/contracts'
import type { LocalExecutionPolicy } from '@hbar/contracts/local-execution-policy'
import { assertLocalWorkspace } from '@hbar/contracts/local-workspace'
import { isNodeWorkspacePath, parseNodeWorkspaceLocator } from '@hbar/contracts/node-address'
import {
  WORKSPACE_DIRECTORY_PAGE_SIZE,
  workspaceDirectoryPageSchema,
  workspaceFolderCommands,
  type WorkspaceDirectoryPage,
  type WorkspaceFolder,
  type WorkspaceFolderMutation,
} from '@hbar/contracts/commands/workspace-folders'
import type { StoragePort } from '@hbar/storage'
import type { NodeWorkspaceInspectionPort } from './node-workspace-inspection'

const SCAN_LIMIT = 5000
const within = (root: string, path: string) => {
  const part = relative(root, path)
  return (
    part === '' ||
    (!part.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && part !== '..' && !isAbsolute(part))
  )
}

export class WorkspaceFolderService {
  constructor(
    private readonly storage: StoragePort,
    private readonly protectedPaths: readonly string[],
    private readonly localExecutionPolicy: LocalExecutionPolicy = LOCAL_EXECUTION_ENABLED,
    private readonly verifyRemoteFolders?: NodeWorkspaceInspectionPort['verifyWorkspaceFolders'],
  ) {}

  async canonicalFolders(folders: readonly WorkspaceFolder[], signal: AbortSignal) {
    const remote = folders.some((folder) => isNodeWorkspacePath(folder.path))
    if (remote) {
      if (folders.some((folder) => !isNodeWorkspacePath(folder.path)))
        throw new HbarError('WORKSPACE_NODE_MISMATCH', 'Local and node-owned folders cannot be mixed')
      let nodeId: string
      try {
        const address = parseNodeWorkspaceLocator(folders[0]?.path ?? '')
        if (!address) throw new Error('not a node locator')
        nodeId = address.nodeId
        for (const folder of folders) {
          const next = parseNodeWorkspaceLocator(folder.path)
          if (!next || next.nodeId !== nodeId)
            throw new HbarError('WORKSPACE_NODE_MISMATCH', 'Cross-node workspace folders are not supported')
        }
      } catch (error) {
        if (error instanceof HbarError) throw error
        throw new HbarError('INVALID_WORKSPACE', 'Remote folders must use exact registered-root locators')
      }
      if (!this.verifyRemoteFolders)
        throw new HbarError('NODE_LINK_UNAVAILABLE', 'Remote folder roots cannot be verified by the Host')
      return [...(await this.verifyRemoteFolders(nodeId, folders, signal))]
    }
    assertLocalExecutionAllowed(this.localExecutionPolicy, 'Workspace folder filesystem access')
    for (const folder of folders) assertLocalWorkspace(folder.path)
    const protectedRoots = await Promise.all(
      this.protectedPaths.map((path) => realpath(path).catch(() => resolve(path))),
    )
    const resolved: WorkspaceFolder[] = []
    const seen = new Set<string>()
    for (const folder of folders) {
      signal.throwIfAborted()
      let path: string
      try {
        if (!isAbsolute(folder.path)) throw new Error('absolute directory required')
        path = await realpath(folder.path)
        if (!(await stat(path)).isDirectory()) throw new Error('not a directory')
      } catch {
        throw new HbarError('INVALID_WORKSPACE', 'Every root must be an existing accessible absolute directory')
      }
      if (protectedRoots.some((root) => within(root, path)))
        throw new HbarError('PATH_DENIED', 'Host runtime directories cannot be workspace roots')
      const key = process.platform === 'win32' ? path.toLowerCase() : path
      if (seen.has(key)) throw new HbarError('DUPLICATE_FOLDER', 'A physical folder can only be mounted once')
      seen.add(key)
      resolved.push({ ...folder, path })
    }
    signal.throwIfAborted()
    return resolved
  }

  async browse(
    input: { readonly path?: string | undefined; readonly after?: string | undefined },
    signal: AbortSignal,
  ): Promise<WorkspaceDirectoryPage> {
    assertLocalExecutionAllowed(this.localExecutionPolicy, 'Workspace directory browsing')
    signal.throwIfAborted()
    if (input.path !== undefined) assertLocalWorkspace(input.path)
    let path: string
    try {
      path = await realpath(input.path ?? homedir())
    } catch {
      throw new HbarError('INVALID_WORKSPACE', 'Directory is unavailable')
    }
    if (this.protectedPaths.some((root) => within(resolve(root), path)))
      throw new HbarError('PATH_DENIED', 'Host runtime directories cannot be browsed')
    const roots = [{ name: homedir(), path: homedir() }]
    if (process.platform === 'win32') {
      for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
        signal.throwIfAborted()
        const drive = `${letter}:\\`
        if (
          await stat(drive).then(
            (info) => info.isDirectory(),
            () => false,
          )
        )
          roots.push({ name: drive, path: drive })
      }
    } else roots.push({ name: '/', path: '/' })
    for (const owner of (await this.storage.call('workspaces')).slice(0, 32))
      if (
        owner.location?.kind !== 'node' &&
        !isNodeWorkspacePath(owner.path) &&
        !roots.some((root) => root.path === owner.path)
      )
        roots.push({ name: owner.name, path: owner.path })
    const items: WorkspaceDirectoryPage['items'] = []
    let scanned = 0
    let scanTruncated = false
    try {
      const directory = await opendir(path)
      for await (const entry of directory) {
        signal.throwIfAborted()
        if (++scanned > SCAN_LIMIT) {
          scanTruncated = true
          break
        }
        const child = join(path, entry.name)
        if (this.protectedPaths.some((root) => within(resolve(root), child))) continue
        if (
          entry.isDirectory() ||
          (entry.isSymbolicLink() &&
            (await stat(child).then(
              (info) => info.isDirectory(),
              () => false,
            )))
        )
          items.push({ name: entry.name, path: child })
      }
    } catch (error) {
      signal.throwIfAborted()
      if (error instanceof HbarError) throw error
      throw new HbarError('DIRECTORY_UNAVAILABLE', 'Directory cannot be listed')
    }
    signal.throwIfAborted()
    const ordered = items
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .filter((item) => !input.after || item.name > input.after)
    const page = ordered.slice(0, WORKSPACE_DIRECTORY_PAGE_SIZE)
    return workspaceDirectoryPageSchema.parse({
      path,
      parent: dirname(path) === path ? null : dirname(path),
      roots,
      items: page,
      nextCursor: ordered.length > page.length ? (page.at(-1)?.name ?? null) : null,
      scanTruncated,
    })
  }

  async apply(actorId: string, key: string, request: WorkspaceFolderMutation, signal: AbortSignal) {
    signal.throwIfAborted()
    const previous = await this.storage.call('workspaceFolderReceipt', actorId, key, request)
    if (previous) return previous.result
    if (request.operation === 'save') {
      const workspace = await this.storage.call('workspace', request.input.workspaceId)
      if (!isNodeWorkspacePath(workspace.path)) assertLocalWorkspace(workspace)
      else {
        const owner = parseNodeWorkspaceLocator(workspace.path)
        const selected = parseNodeWorkspaceLocator(request.input.folders[0]?.path ?? '')
        if (!owner || !selected || owner.nodeId !== selected.nodeId)
          throw new HbarError('WORKSPACE_NODE_MISMATCH', 'Workspace folders must remain on the owner node')
      }
    }
    const folders = await this.canonicalFolders(request.input.folders, signal)
    signal.throwIfAborted()
    return this.storage.call('applyWorkspaceFolders', { actorId, idempotencyKey: key, request, folders })
  }
}

export function registerWorkspaceFolderCommands(
  registry: CommandRegistry,
  storage: StoragePort,
  protectedPaths: readonly string[],
  changed: () => void,
  localExecutionPolicy: LocalExecutionPolicy = LOCAL_EXECUTION_ENABLED,
  verifyRemoteFolders?: NodeWorkspaceInspectionPort['verifyWorkspaceFolders'],
) {
  const service = new WorkspaceFolderService(storage, protectedPaths, localExecutionPolicy, verifyRemoteFolders)
  const translate = async <Value>(operation: () => Promise<Value>) => {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  }
  registry.register(workspaceFolderCommands['workspace.folders.get'], ({ workspaceId }) =>
    translate(() => storage.call('workspaceFolders', workspaceId)),
  )
  registry.register(workspaceFolderCommands['workspace.folders.browse'], (input, context) =>
    translate(() => service.browse(input, context.signal)),
  )
  registry.register(
    workspaceFolderCommands['workspace.folders.create'],
    (input, context) =>
      translate(async () => {
        if (!context.actorId || !context.idempotencyKey)
          throw new HbarError('UNAUTHORIZED', 'Authenticated actor and key required')
        const result = await service.apply(
          context.actorId,
          context.idempotencyKey,
          { operation: 'create', input },
          context.signal,
        )
        changed()
        return result
      }),
    { durable: true },
  )
  registry.register(
    workspaceFolderCommands['workspace.folders.save'],
    (input, context) =>
      translate(async () => {
        if (!context.actorId || !context.idempotencyKey)
          throw new HbarError('UNAUTHORIZED', 'Authenticated actor and key required')
        const result = await service.apply(
          context.actorId,
          context.idempotencyKey,
          { operation: 'save', input },
          context.signal,
        )
        changed()
        return result
      }),
    { durable: true },
  )
  registry.register(workspaceFolderCommands['workspace.folders.receipt'], (input, context) =>
    translate(() => {
      if (!context.actorId) throw new HbarError('UNAUTHORIZED', 'Authenticated actor required')
      return storage.call('workspaceFolderReceipt', context.actorId, input.idempotencyKey, input.request)
    }),
  )
}
