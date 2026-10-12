import { readFile, readdir, realpath, mkdir, writeFile, rename, stat } from 'node:fs/promises'
import { resolve, relative, dirname, isAbsolute, join, basename, posix } from 'node:path'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { definePlugin, provide, resolveToolTimeoutMs } from '@hbar/plugin-sdk'
import type { ExecOptions, ExecutionProvider, ToolResult, WorkspaceQueryProvider } from '@hbar/plugin-sdk'
import type { WorkspaceDirectoryService } from '@hbar/plugin-sdk/workspace-directories'
import { HbarError } from '@hbar/contracts'
import {
  workspaceFindInputSchema,
  workspaceFindToolInputSchema,
  workspaceListInputSchema,
  workspaceListToolInputSchema,
  workspaceReadInputSchema,
  workspaceSearchInputSchema,
  workspaceSearchToolInputSchema,
} from '@hbar/contracts/workspace-query'
import { WorkspaceQueryRuntime } from './workspace-query'
import { formatSearchText } from './search-output'
import { fileReadActivity, fileWriteActivity } from './file-activity'
import { FileMutationQueue, restoreFileVersions } from './file-mutations'
import type { ToolFileChange } from '@hbar/contracts/run-file-changes'
import { mountedPath, mountedWorkspaceQuery, type WorkspaceMountAccess } from './workspace-mounts'
export type { WorkspaceMountAccess, WorkspaceMount } from './workspace-mounts'
export { mountedPath } from './workspace-mounts'

// ---------------------------------------------------------------------------
// OS-level sandbox addon (Windows-only, optional)
// ---------------------------------------------------------------------------
interface SandboxAddon {
  isAvailable(): boolean
  spawnSandboxed(profile: Record<string, unknown>, argv: string[], cwd: string): Promise<SandboxedProcess>
}
interface SandboxedProcess {
  readonly pid: number
  readonly handleId: string
}
function loadSandboxAddon(): SandboxAddon | null {
  try {
    const mod = require('../sandbox/hbar_sandbox_win.node') as unknown
    if (
      mod !== null &&
      typeof mod === 'object' &&
      typeof (mod as Record<string, unknown>).isAvailable === 'function' &&
      typeof (mod as Record<string, unknown>).spawnSandboxed === 'function'
    ) {
      return mod as SandboxAddon
    }
  } catch {
    // Not available; fall back to plain Bun.spawn.
  }
  return null
}
const sandboxAddon = process.platform === 'win32' ? loadSandboxAddon() : null

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const MAX_TOOL_TEXT_BYTES = 64 * 1024
const TRUNCATED_MARKER = '\n[tool output truncated]'
export interface VerifiedManagedWorkspaceAccess {
  root: string
  protectedRoot: string
  verify: (canonicalWorkspace: string) => boolean | Promise<boolean>
}

function inside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return (
    rel === '' ||
    (rel !== '..' && !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(rel))
  )
}

async function effectiveBlockedPaths(
  workspace: string,
  blocked: string[],
  managedWorkspace?: VerifiedManagedWorkspaceAccess,
): Promise<string[]> {
  if (!managedWorkspace) return blocked
  let root: string
  let managedRoot: string
  let protectedRoot: string
  try {
    root = await realpath(workspace)
    managedRoot = await realpath(managedWorkspace.root)
    protectedRoot = await realpath(managedWorkspace.protectedRoot)
  } catch {
    return blocked
  }
  if (!inside(protectedRoot, managedRoot) || samePath(protectedRoot, managedRoot) || !inside(managedRoot, root))
    return blocked
  try {
    if (!(await managedWorkspace.verify(root))) return blocked
  } catch {
    return blocked
  }
  const result: string[] = []
  for (const path of blocked) {
    let canonicalBlockedPath: string
    try {
      canonicalBlockedPath = await realpath(path)
    } catch {
      canonicalBlockedPath = resolve(path)
    }
    // Only the configured dataRoot protection is exempted, and only for an
    // exact Host-verified worktree. Other blocked roots remain in force.
    if (!samePath(canonicalBlockedPath, protectedRoot) || !inside(canonicalBlockedPath, root))
      result.push(canonicalBlockedPath)
  }
  return result
}

function samePath(left: string, right: string): boolean {
  const a = resolve(left).replace(/[\\/]+$/, '')
  const b = resolve(right).replace(/[\\/]+$/, '')
  return process.platform === 'win32' ? a.toLocaleLowerCase() === b.toLocaleLowerCase() : a === b
}

function imageMime(bytes: Uint8Array): string | undefined {
  const header = Buffer.from(bytes.buffer, bytes.byteOffset, Math.min(bytes.byteLength, 12))
  if (header.subarray(0, 8).equals(PNG_SIGNATURE)) return 'image/png'
  if (header[0] === 255 && header[1] === 216 && header[2] === 255) return 'image/jpeg'
  if (header.subarray(0, 3).toString('ascii') === 'GIF') return 'image/gif'
  if (header.subarray(0, 4).toString('ascii') === 'RIFF' && header.subarray(8, 12).toString('ascii') === 'WEBP')
    return 'image/webp'
  return undefined
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  } catch {
    throw new HbarError('UNSUPPORTED_TYPE', 'File is neither valid UTF-8 text nor a supported image')
  }
}

function revision(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function byteBoundedText(parts: readonly string[], limit = MAX_TOOL_TEXT_BYTES): { text: string; truncated: boolean } {
  const budget = limit - Buffer.byteLength(TRUNCATED_MARKER)
  let text = ''
  let bytes = 0
  for (const part of parts) {
    const partBytes = Buffer.byteLength(part)
    if (bytes + partBytes <= budget) {
      text += part
      bytes += partBytes
      continue
    }
    let low = 0
    let high = part.length
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      if (Buffer.byteLength(part.slice(0, middle)) <= budget - bytes) low = middle
      else high = middle - 1
    }
    return { text: `${text}${part.slice(0, low)}${TRUNCATED_MARKER}`, truncated: true }
  }
  return { text, truncated: false }
}

export async function workspacePath(
  workspace: string,
  requested: string,
  writing = false,
  blocked: string[] = [],
): Promise<string> {
  const root = await realpath(workspace)
  const path = resolve(root, requested)
  if (!inside(root, path)) throw new HbarError('PATH_DENIED', 'Path is outside the workspace')
  let actual: string
  try {
    actual = await realpath(path)
  } catch (error) {
    if (!writing || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    let parent = dirname(path)
    for (;;) {
      try {
        actual = await realpath(parent)
        break
      } catch (nested) {
        if ((nested as NodeJS.ErrnoException).code !== 'ENOENT' || parent === dirname(parent)) throw nested
        parent = dirname(parent)
      }
    }
  }
  if (!inside(root, actual!)) throw new HbarError('PATH_DENIED', 'Symlink resolves outside the workspace')
  for (const protectedPath of blocked) {
    const relation = relative(protectedPath, actual!)
    if (!relation || (!relation.startsWith('..') && !isAbsolute(relation)))
      throw new HbarError('PATH_DENIED', 'Host runtime data is protected')
  }
  return path
}

export class LocalExecution implements ExecutionProvider {
  private readonly fileMutations = new FileMutationQueue()
  readonly workspaceQuery: WorkspaceQueryProvider

  constructor(
    private blocked: string[] = [],
    private readonly managedWorkspace?: VerifiedManagedWorkspaceAccess,
    private readonly mounts?: WorkspaceMountAccess,
  ) {
    const query = new WorkspaceQueryRuntime(
      blocked,
      (workspace, path) => this.workspacePath(workspace, path, false),
      {},
      (workspace) => this.blockedForWorkspace(workspace),
      (workspace, path) => this.workspacePath(workspace, path, true),
    )
    this.workspaceQuery = mounts ? mountedWorkspaceQuery(query, mounts) : query
  }

  private async blockedForWorkspace(workspace: string) {
    return effectiveBlockedPaths(workspace, this.blocked, this.managedWorkspace)
  }

  private async workspacePath(workspace: string, requested: string, writing = false) {
    const mount = this.mounts?.get(workspace)
    if (mount) {
      await this.mounts?.verify(mount)
      const target = mountedPath(mount, requested)
      return workspacePath(target.folder.path, target.path, writing, await this.blockedForWorkspace(target.folder.path))
    }
    return workspacePath(workspace, requested, writing, await this.blockedForWorkspace(workspace))
  }

  async list(workspace: string, requested: string): Promise<Awaited<ReturnType<ExecutionProvider['list']>>> {
    const mount = this.mounts?.get(workspace)
    if (mount) {
      await this.mounts?.verify(mount)
      if (requested === '.' || requested === '')
        return mount.folders.map((folder) => ({ name: folder.alias, path: folder.alias, directory: true }))
      const target = mountedPath(mount, requested)
      const entries = await this.list(target.folder.path, target.path)
      return entries.map((entry) => ({ ...entry, path: `${target.folder.alias}/${entry.path}` }))
    }
    const path = await this.workspacePath(workspace, requested)
    return (await readdir(path, { withFileTypes: true }))
      .slice(0, 1000)
      .map((entry) => ({
        name: entry.name,
        directory: entry.isDirectory(),
        path: relative(workspace, join(path, entry.name)).replaceAll('\\', '/'),
      }))
      .sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name))
  }
  async resolveDirectory(workspace: string, requested: string) {
    const path = await this.workspacePath(workspace, requested)
    if (!(await stat(path)).isDirectory()) throw new HbarError('INVALID_WORKSPACE', 'Working directory is unavailable')
    return path
  }
  async read(workspace: string, requested: string) {
    return decodeUtf8(await this.readBytes(workspace, requested))
  }
  async readBytes(workspace: string, requested: string) {
    const path = await this.workspacePath(workspace, requested)
    const info = await stat(path)
    if (!info.isFile() || info.size > 2 * 1024 * 1024)
      throw new HbarError('FILE_LIMIT', 'Read requires a file no larger than 2 MiB')
    return readFile(path)
  }
  async write(workspace: string, requested: string, text: string, options?: { expectedRevision?: string }) {
    const path = await this.workspacePath(workspace, requested, true)
    return this.fileMutations.run([path], () => this.writeUnlocked(workspace, requested, text, options))
  }
  private async writeUnlocked(
    workspace: string,
    requested: string,
    text: string,
    options?: { expectedRevision?: string },
  ) {
    if (Buffer.byteLength(text) > 2 * 1024 * 1024) throw new HbarError('FILE_LIMIT', 'Write exceeds 2 MiB')
    const path = await this.workspacePath(workspace, requested, true)
    let before = ''
    let created = false
    try {
      before = await this.read(workspace, requested)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      created = true
    }
    if (options?.expectedRevision && revision(before) !== options.expectedRevision)
      throw new HbarError('FILE_CONFLICT', 'File changed on disk; reload it before saving')
    await mkdir(dirname(path), { recursive: true })
    await this.workspacePath(workspace, requested, true)
    const temporary = join(dirname(path), `.${basename(path)}.hbar-${crypto.randomUUID()}`)
    try {
      await writeFile(temporary, text, { flag: 'wx', mode: 0o600 })
      await this.workspacePath(workspace, requested, true)
      await rename(temporary, path)
      await this.workspaceQuery.invalidate(workspace, requested)
    } finally {
      await Bun.file(temporary)
        .delete()
        .catch((error: unknown) => {
          if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
        })
    }
    const recordedPath = this.mounts?.get(workspace)
      ? posix.normalize(requested.replaceAll('\\', '/'))
      : relative(workspace, path).replaceAll('\\', '/')
    return { before, after: text, path: recordedPath, revision: revision(text), created }
  }
  async restoreFiles(workspace: string, changes: readonly ToolFileChange[], signal: AbortSignal): Promise<void> {
    const paths = await Promise.all(changes.map((file) => this.workspacePath(workspace, file.path, true)))
    await this.fileMutations.run(paths, () =>
      restoreFileVersions(
        changes,
        {
          read: async (path) => {
            try {
              return await this.read(workspace, path)
            } catch (error) {
              if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
              throw error
            }
          },
          put: async (requested, text) => {
            if (text !== null) await this.writeUnlocked(workspace, requested, text)
            else {
              const path = await this.workspacePath(workspace, requested, true)
              await Bun.file(path).delete()
              await this.workspaceQuery.invalidate(workspace, requested)
            }
          },
        },
        signal,
      ),
    )
  }
  async exec(workspace: string, command: string, signal: AbortSignal, options?: ExecOptions): Promise<ToolResult> {
    signal.throwIfAborted()
    if (options?.osConfinement && process.platform !== 'win32')
      return {
        text: '[hbar] No OS-level sandbox backend is available on this platform; the command was not run.',
        isError: true,
        details: { code: 'SANDBOX_BACKEND_UNAVAILABLE', executionStarted: false, truncated: false },
      }
    const timeoutMs = resolveToolTimeoutMs({ timeoutMs: options?.timeoutMs ?? 120_000 })
    const workingDirectory = await this.workspacePath(workspace, '.')
    const env: Record<string, string> = {}
    const allowed = new Set([
      'path',
      'pathext',
      'systemroot',
      'windir',
      'comspec',
      'temp',
      'tmp',
      'home',
      'userprofile',
      'appdata',
      'localappdata',
      'lang',
      'lc_all',
      'term',
    ])
    for (const [key, value] of Object.entries(process.env))
      if (value !== undefined && allowed.has(key.toLowerCase())) env[key] = value
    const mount = this.mounts?.get(workspace)
    if (mount) env.HBAR_WORKSPACE_ROOT = mount.root
    const sameName =
      process.platform === 'win32'
        ? (left: string, right: string) => left.toLowerCase() === right.toLowerCase()
        : (left: string, right: string) => left === right
    for (const [key, value] of Object.entries(options?.environment ?? {})) {
      // Program lookup stays inherited so command rules keep matching the programs they name.
      if (['path', 'pathext'].includes(key.toLowerCase())) continue
      for (const existing of Object.keys(env)) if (sameName(existing, key)) delete env[existing]
      env[key] = value
    }
    const argv =
      process.platform === 'win32'
        ? [
            'powershell.exe',
            '-NoLogo',
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            '$utf8 = New-Object System.Text.UTF8Encoding($false); [Console]::InputEncoding = $utf8; [Console]::OutputEncoding = $utf8; $OutputEncoding = $utf8; ' +
              command,
          ]
        : ['/bin/sh', '-c', command]

    // Route through the OS-level sandbox addon when confinement is requested.
    if (options?.osConfinement && process.platform === 'win32') {
      if (!sandboxAddon) {
        // Addon missing (not built yet or build skipped). Fail loudly so the user
        // knows confinement was requested but not applied — better than silent bypass.
        return {
          text: '[hbar] OS-level sandbox addon (hbar_sandbox_win.node) is not available; the command was not run.',
          isError: true,
          details: { code: 'SANDBOX_BACKEND_UNAVAILABLE', executionStarted: false, truncated: false },
        }
      }
      const { osConfinement } = options
      const profile = {
        workspaceRoot: workingDirectory,
        writableRoots: osConfinement.writableRoots,
        readableRoots: osConfinement.readableRoots,
        networkEnabled: osConfinement.networkEnabled,
        envOverrides: { ...osConfinement.envOverrides },
        level: osConfinement.level === 'elevated' ? 'Elevated' : 'Unelevated',
      }
      try {
        // spawnSandboxed currently returns a stub error (not yet implemented).
        // When the vendor unelevated path lands, this will return stdout/stderr via
        // channels managed by the Rust-side Tokio runtime.
        await sandboxAddon.spawnSandboxed(profile, argv, workingDirectory)
        // Unreachable until the vendor implementation lands.
        return { text: '', isError: false, details: { code: 0, truncated: false } }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          text: `[hbar] Sandboxed execution failed: ${message}`,
          isError: true,
          details: { code: 'SANDBOX_BACKEND_UNAVAILABLE', executionStarted: false, truncated: false },
        }
      }
    }

    signal.throwIfAborted()
    const child = Bun.spawn(argv, {
      cwd: workingDirectory,
      env,
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'ignore',
      windowsHide: true,
    })
    let terminating: Promise<void> | undefined
    const terminate = () =>
      (terminating ??= (async () => {
        if (process.platform === 'win32') {
          const killer = Bun.spawn(['taskkill.exe', '/PID', String(child.pid), '/T', '/F'], {
            stdout: 'ignore',
            stderr: 'ignore',
            windowsHide: true,
          })
          await killer.exited
        } else {
          child.kill('SIGTERM')
        }
        if (child.exitCode === null) child.kill()
      })())
    const onAbort = () => {
      void terminate().catch(() => child.kill())
    }
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      onAbort()
    }, timeoutMs)
    let truncated = false
    async function collect(stream: ReadableStream<Uint8Array>, childExited: Promise<number>) {
      const decoder = new TextDecoder()
      const reader = stream.getReader()
      let text = ''
      let cancelTimer: ReturnType<typeof setTimeout> | undefined
      let cancelResolve: (() => void) | undefined
      let finished = false
      let drainCutoff = false
      const cancelAfterExit = childExited.then(
        () =>
          new Promise<void>((resolve) => {
            cancelResolve = resolve
            // A direct shell can exit while a detached descendant still owns the
            // inherited pipe handle. Drain a short grace window, then cancel the
            // reader so tool settlement does not wait for that unknown process.
            if (finished) resolve()
            else
              cancelTimer = setTimeout(() => {
                drainCutoff = true
                void reader.cancel().catch(() => undefined)
                resolve()
              }, 250)
          }),
      )
      try {
        while (true) {
          const next = await Promise.race([
            reader.read(),
            cancelAfterExit.then(() => ({ done: true as const, value: undefined })),
          ])
          if (next.done) break
          text += decoder.decode(next.value, { stream: true })
          if (text.length > 64_000) {
            text = text.slice(-64_000)
            truncated = true
          }
        }
        return { text: text + decoder.decode(), drainCutoff }
      } finally {
        finished = true
        if (cancelTimer) clearTimeout(cancelTimer)
        cancelResolve?.()
        reader.releaseLock()
      }
    }
    const childExited = child.exited
    const stdoutPromise = collect(child.stdout, childExited)
    const stderrPromise = collect(child.stderr, childExited)
    try {
      const [stdoutResult, stderrResult, code] = await Promise.all([stdoutPromise, stderrPromise, childExited])
      const stdout = stdoutResult.text
      const stderr = stderrResult.text
      const drainCutoff = stdoutResult.drainCutoff || stderrResult.drainCutoff
      if (terminating) await terminating
      signal.throwIfAborted()
      if (timedOut)
        return {
          text: `${stdout}${stderr}${drainCutoff ? '\n[tool output drain cutoff]' : ''}\nTool shell timed out after ${timeoutMs} milliseconds; its process was terminated. The Agent may continue.`,
          isError: true,
          details: { code: 'TOOL_TIMEOUT', exitCode: code, timeoutMs, truncated, drainCutoff },
        }
      return {
        text: `${stdout}${stderr}${truncated ? '\n[output truncated to retained tail]' : ''}${drainCutoff ? '\n[tool output drain cutoff]' : ''}`,
        isError: code !== 0,
        details: { code, truncated, drainCutoff },
      }
    } finally {
      clearTimeout(timeout)
      signal.removeEventListener('abort', onAbort)
    }
  }

  dispose(): void {
    this.workspaceQuery.dispose()
  }
}

export function localExecutionPlugin(
  blocked: string[] = [],
  managedWorkspace?: VerifiedManagedWorkspaceAccess,
  mounts?: WorkspaceMountAccess,
) {
  return definePlugin({
    manifest: {
      id: 'execution.local',
      name: 'Local execution',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      description: 'Workspace files and managed local processes',
      scope: 'host',
      required: true,
      provides: { execution: '1.0.0', 'workspace-directories': '1.0.0' },
      permissions: ['fs', 'process'],
    },
    apply(ctx) {
      const execution = new LocalExecution(blocked, managedWorkspace, mounts)
      ctx.effect(() => () => execution.dispose())
      provide(ctx, 'execution', execution)
      provide<WorkspaceDirectoryService>(ctx, 'workspace-directories', {
        resolve: (root, path) => execution.resolveDirectory(root, path),
      })
    },
  })
}

export const executionPlugin = localExecutionPlugin()
export default definePlugin({
  manifest: {
    id: 'tools.workspace',
    name: 'Workspace tools',
    version: '1.0.0',
    apiVersion: '^1.0.0',
    description: 'Read, write, edit, and shell tools',
    scope: 'host',
    requires: { execution: '^1.0.0' },
    permissions: ['fs', 'process'],
  },
  apply(ctx) {
    const execution = ctx.hbar.api.service<ExecutionProvider>('execution')
    const register = ctx.hbar.api.tools.register
    register({
      name: 'read_file',
      presentation: { kind: 'file-read', pathField: 'path' },
      description: execution.workspaceQuery
        ? 'Read a UTF-8 text file or supported image inside the workspace. Use startLine and lineCount together for a bounded text range.'
        : 'Read a UTF-8 text file or supported image (PNG, JPEG, WebP, or GIF) inside the workspace.',
      inputSchema: execution.workspaceQuery ? workspaceReadInputSchema : z.object({ path: z.string().min(1) }),
      effect: 'read',
      workspaceAccess: { kind: 'paths', arguments: [{ field: 'path', access: 'read' }] },
      execute: async (args, c) => {
        const input = workspaceReadInputSchema.parse(args)
        const path = input.path
        if (input.startLine !== undefined && input.lineCount !== undefined) {
          if (!execution.workspaceQuery) throw new HbarError('QUERY_UNAVAILABLE', 'Ranged reads are unavailable')
          const result = await execution.workspaceQuery.readRange(
            c.workspace.path,
            path,
            input.startLine,
            input.lineCount,
            c.signal,
          )
          const bounded = byteBoundedText([result.text])
          return {
            text: bounded.text,
            activity: fileReadActivity(path, result.text),
            details: {
              startLine: result.startLine,
              endLine: result.endLine,
              totalLines: result.totalLines,
              nextLine: result.nextLine,
              cacheHit: result.cacheHit,
              truncated: bounded.truncated,
            },
          }
        }
        const bytes = await execution.readBytes(c.workspace.path, path)
        const mimeType = imageMime(bytes)
        if (mimeType)
          return {
            text: `Read image file ${path} [${mimeType}]`,
            activity: fileReadActivity(path, null),
            content: [
              { type: 'text', text: `Read image file ${path} [${mimeType}]` },
              { type: 'image', data: Buffer.from(bytes).toString('base64'), mimeType },
            ],
          }
        const text = decodeUtf8(bytes)
        return { text, activity: fileReadActivity(path, text) }
      },
    })
    if (execution.workspaceQuery) {
      const query = execution.workspaceQuery
      register({
        name: 'search_text',
        presentation: { kind: 'text-search', patternField: 'pattern', pathField: 'path' },
        description:
          'Search workspace UTF-8 files in stable path/line order. limit (1–1000, default 200) bounds matching lines; from_index (default 0) continues at the returned nextIndex. fully_scan=false stops content matching at the limit without counting the unseen remainder; true scans all eligible files and caches complete indexes for exact counts and later pages. Text is capped at 64 KiB; read_file retrieves shortened lines. Prefer this over shell rg/grep.',
        inputSchema: workspaceSearchToolInputSchema,
        effect: 'read',
        workspaceAccess: { kind: 'paths', arguments: [{ field: 'path', access: 'read' }] },
        execute: async (args, c) => {
          const result = await query.search(c.workspace.path, workspaceSearchInputSchema.parse(args), c.signal)
          const formatted = formatSearchText(result)
          return {
            text: formatted.text,
            details: {
              matchCount: formatted.shownMatches,
              filesChecked: result.filesChecked,
              truncated: formatted.truncated,
              cache: result.cache,
              ...(formatted.pagination ? { pagination: formatted.pagination } : {}),
            },
          }
        },
      })
      register({
        name: 'find_files',
        presentation: { kind: 'file-search', queryField: 'nameQuery', includeField: 'include', pathField: 'path' },
        description:
          'Find workspace files by include and exclude globs in process. Prefer this over shell rg --files or find.',
        inputSchema: workspaceFindToolInputSchema,
        effect: 'read',
        workspaceAccess: { kind: 'paths', arguments: [{ field: 'path', access: 'read' }] },
        execute: async (args, c) => {
          const result = await query.find(c.workspace.path, workspaceFindInputSchema.parse(args), c.signal)
          const bounded = byteBoundedText([result.paths.length ? `${result.paths.join('\n')}\n` : 'No files found.\n'])
          return {
            text: bounded.text,
            details: {
              fileCount: result.paths.length,
              filesChecked: result.filesChecked,
              truncated: result.truncated || bounded.truncated,
            },
          }
        },
      })
      register({
        name: 'list_directory',
        presentation: { kind: 'directory-list', pathField: 'path' },
        description: 'List one workspace directory with stable, bounded pagination without starting a shell process.',
        inputSchema: workspaceListToolInputSchema,
        effect: 'read',
        workspaceAccess: { kind: 'paths', arguments: [{ field: 'path', access: 'read' }] },
        execute: async (args, c) => {
          const input = workspaceListInputSchema.parse(args)
          const entries = (await execution.list(c.workspace.path, input.path)).sort((left, right) =>
            left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
          )
          const filtered = input.after ? entries.filter((entry) => entry.path > input.after!) : entries
          const selected = filtered.slice(0, input.limit)
          const nextCursor = filtered.length > input.limit ? selected.at(-1)?.path : undefined
          const bounded = byteBoundedText(selected.map((entry) => `${entry.path}${entry.directory ? '/' : ''}\n`))
          return {
            text: bounded.text || 'Directory is empty.\n',
            details: {
              entryCount: selected.length,
              nextCursor,
              truncated: nextCursor !== undefined || bounded.truncated,
            },
          }
        },
      })
    }
    register({
      name: 'write_file',
      presentation: { kind: 'file-write', pathField: 'path' },
      description: 'Write a UTF-8 file inside the workspace. Requires user approval.',
      inputSchema: z.object({ path: z.string().min(1), text: z.string() }),
      effect: 'write',
      workspaceAccess: { kind: 'paths', arguments: [{ field: 'path', access: 'write' }] },
      execute: async (args, c) => {
        c.signal.throwIfAborted()
        const details = await execution.write(c.workspace.path, args.path as string, args.text as string)
        return {
          text: `Wrote ${args.path}`,
          details: { path: details.path, revision: details.revision, created: details.created },
          fileChanges:
            details.created === undefined
              ? undefined
              : [
                  {
                    path: details.path.replaceAll('\\', '/'),
                    before: details.created ? null : details.before,
                    after: details.after,
                  },
                ],
          activity: fileWriteActivity(details.path, 'write', details.before, details.after),
        }
      },
    })
    register({
      name: 'edit_file',
      presentation: { kind: 'file-edit', pathField: 'path' },
      description: 'Replace one exact occurrence of text in a workspace file. Requires approval.',
      inputSchema: z.object({ path: z.string().min(1), oldText: z.string().min(1), newText: z.string() }),
      effect: 'write',
      workspaceAccess: { kind: 'paths', arguments: [{ field: 'path', access: 'write' }] },
      execute: async (args, c) => {
        const before = await execution.read(c.workspace.path, args.path as string)
        const oldText = args.oldText as string
        if (before.split(oldText).length !== 2)
          throw new HbarError('EDIT_CONFLICT', 'Expected exactly one matching occurrence')
        c.signal.throwIfAborted()
        const details = await execution.write(
          c.workspace.path,
          args.path as string,
          before.replace(oldText, args.newText as string),
        )
        return {
          text: `Edited ${args.path}`,
          details: { path: details.path, revision: details.revision, created: details.created },
          fileChanges:
            details.created === undefined
              ? undefined
              : [
                  {
                    path: details.path.replaceAll('\\', '/'),
                    before: details.created ? null : details.before,
                    after: details.after,
                  },
                ],
          activity: fileWriteActivity(details.path, 'edit', details.before, details.after),
        }
      },
    })
    register({
      name: 'shell',
      presentation: { kind: 'command', commandField: 'command' },
      description: 'Execute a shell command in the workspace. Requires user approval.',
      inputSchema: z.object({
        command: z.string().min(1).max(16000),
        timeout_ms: z
          .number()
          .int()
          .min(1)
          .max(1_200_000)
          .default(120_000)
          .describe(
            'Execution timeout in milliseconds. Default 120000 (2 minutes), maximum 1200000 (20 minutes). Timeout returns a tool error and the Agent may continue.',
          ),
      }),
      timeoutMs: 1_200_000,
      timeoutArgument: 'timeout_ms',
      effect: 'process',
      workspaceAccess: { kind: 'workspace' },
      commandArgument: 'command',
      execute: (args, c) =>
        execution.exec(c.workspace.path, args.command as string, c.signal, {
          environment: c.environment,
          timeoutMs: c.timeoutMs ?? 120_000,
          osConfinement: c.osConfinement,
        }),
    })
  },
})
