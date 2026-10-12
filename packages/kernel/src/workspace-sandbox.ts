import { createHash } from 'node:crypto'
import { mkdir, lstat, realpath, symlink } from 'node:fs/promises'
import { join, resolve, isAbsolute } from 'node:path'
import { mountedPath } from '@hbar/local-tools/workspace-mounts'
import { HbarError } from '@hbar/contracts'
import { assertLocalWorkspace } from '@hbar/contracts/local-workspace'
import type { StoragePort } from '@hbar/storage'
import type { WorkspaceMount, WorkspaceMountAccess } from '@hbar/local-tools/workspace-mounts'

const key = (path: string) => (process.platform === 'win32' ? path.toLowerCase() : path)

/** Immutable per-revision link containers. Never copies, moves or deletes a user's root. */
export class WorkspaceSandboxService implements WorkspaceMountAccess {
  private readonly mounts = new Map<string, WorkspaceMount>()
  constructor(
    private readonly storage: StoragePort,
    private readonly base: string,
  ) {}
  get(root: string) {
    return this.mounts.get(key(root))
  }
  dispose() {
    this.mounts.clear()
  }
  instructions(root: string): string {
    const mount = this.get(root)
    return mount
      ? `\nVirtual workspace folders, in priority order: ${mount.folders.map((folder) => `${folder.alias}/`).join(', ')}. File tools accept these relative aliases; an unprefixed file uses the first folder. Shell commands start in the first folder; HBAR_WORKSPACE_ROOT points to the virtual root for the other aliases.`
      : ''
  }
  grantPaths(root: string, path: string): string[] {
    assertLocalWorkspace(root)
    if (isAbsolute(path) || /^[a-z]:/i.test(path)) return [path]
    const mount = this.get(root)
    if (!mount) return [resolve(root, path)]
    if (mount.folders.some((folder) => path === folder.alias || path.startsWith(`${folder.alias}/`))) {
      const target = mountedPath(mount, path)
      return [resolve(target.folder.path, target.path)]
    }
    return mount.folders.map((folder) => resolve(folder.path, path))
  }

  async verify(mount: WorkspaceMount, signal?: AbortSignal) {
    signal?.throwIfAborted()
    assertLocalWorkspace(mount.root)
    for (const folder of mount.folders) assertLocalWorkspace(folder.path)
    if (key(await realpath(mount.root)) !== key(resolve(mount.root)))
      throw new HbarError('PATH_DENIED', 'Virtual workspace container was redirected')
    for (const folder of mount.folders) {
      signal?.throwIfAborted()
      const link = join(mount.root, folder.alias)
      if (!(await lstat(link)).isSymbolicLink() || key(await realpath(link)) !== key(folder.path))
        throw new HbarError('PATH_DENIED', 'Virtual workspace mount changed; reopen the workspace')
    }
    signal?.throwIfAborted()
  }

  async prepare(workspaceId: string, checkoutPath: string, signal: AbortSignal): Promise<string> {
    signal.throwIfAborted()
    assertLocalWorkspace(checkoutPath)
    const owner = await this.storage.call('workspace', workspaceId)
    assertLocalWorkspace(owner)
    const snapshot = await this.storage.call('workspaceFolders', workspaceId)
    if (snapshot.revision === 0) return checkoutPath
    for (const folder of snapshot.folders) assertLocalWorkspace(folder.path)
    const folders = snapshot.folders.map((folder) => ({
      alias: folder.alias,
      path: folder.path === owner.path ? checkoutPath : folder.path,
    }))
    if (checkoutPath !== owner.path && !snapshot.folders.some((folder) => folder.path === owner.path))
      throw new HbarError('STALE_TARGET', 'The session checkout root was removed from its workspace')
    const hash = createHash('sha256')
      .update(JSON.stringify([workspaceId, snapshot.revision, folders]))
      .digest('hex')
      .slice(0, 32)
    await mkdir(this.base, { recursive: true })
    const root = join(await realpath(this.base), hash)
    const existing = this.get(root)
    if (existing) {
      await this.verify(existing, signal)
      signal.throwIfAborted()
      return root
    }
    if (this.mounts.size >= 256)
      throw new HbarError('CAPACITY_EXCEEDED', 'Too many retained virtual workspace revisions; reconnect the Host')
    await mkdir(root, { recursive: true })
    if (key(await realpath(root)) !== key(resolve(root)))
      throw new HbarError('PATH_DENIED', 'Virtual workspace container was redirected')
    for (const folder of folders) {
      signal.throwIfAborted()
      const target = await realpath(folder.path)
      if (key(target) !== key(folder.path)) throw new HbarError('PATH_DENIED', 'Workspace root was redirected')
      const link = join(root, folder.alias)
      try {
        await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir')
      } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error
      }
    }
    const mount = Object.freeze({ root, folders: Object.freeze(folders.map((folder) => Object.freeze(folder))) })
    await this.verify(mount, signal)
    signal.throwIfAborted()
    this.mounts.set(key(root), mount)
    return root
  }
}
