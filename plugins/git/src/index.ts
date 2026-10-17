import { lstat, mkdir, readdir, realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { z } from 'zod'
import { assertLocalWorkspace } from '@hbar/contracts/local-workspace'
import {
  gitCommands,
  gitRunContextSchema,
  gitRunOperationSchema,
  type GitRunContext,
  type GitRunOperation,
  type GitRunResult,
} from '@hbar/contracts/commands/git'
import type { WorkspaceDirectoryService } from '@hbar/plugin-sdk/workspace-directories'
import {
  HbarError,
  gitBranchInfoSchema,
  gitCommitInfoSchema,
  gitCommitProvenanceSchema,
  gitDiffSchema,
  gitInfoSchema,
  gitStatusSchema,
  gitWorktreeInfoSchema,
} from '@hbar/contracts'
import type {
  GitBranchInfo,
  GitCommitInfo,
  GitCommitProvenance,
  GitCommitSource,
  GitDiff,
  GitInfo,
  GitStatsCount,
  GitStatsReport,
  GitStatus,
  GitWorktreeInfo,
} from '@hbar/contracts'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type {
  GitBranchOperation,
  GitCommitOptions,
  GitDiffOptions,
  GitLaunchBranchCreateInput,
  GitLaunchBranchCreateResult,
  GitLaunchBranchHead,
  GitLaunchBranchReference,
  GitLaunchBranchSnapshot,
  GitService,
  GitStatsOptions,
  GitWorktreeOperation,
  ToolDefinition,
} from '@hbar/plugin-sdk'

const MAX_PATH = 4_000
const MAX_OUTPUT = 512_000
const MAX_LOG = 100
const MAX_WORKTREES = 100
const MAX_LAUNCH_BRANCH_REFS = 5_000
const MAX_UNTRACKED_FILES = 1_000
const MAX_STATS_COMMITS = 20_000
const MAX_STATS_OUTPUT = 16 * 1024 * 1024
const PROVENANCE_NOTES_REF = 'refs/notes/hbar-provenance'
const PROVENANCE_PREFIX = 'hbar-provenance-v1:'

function samePath(left: string, right: string) {
  return resolve(left).replaceAll('\\', '/').toLocaleLowerCase() === resolve(right).replaceAll('\\', '/').toLocaleLowerCase()
}

export const gitConfigSchema = z.object({
  timeoutMs: z.number().int().positive().max(120_000).default(30_000),
  maxOutputBytes: z.number().int().positive().max(MAX_OUTPUT).default(MAX_OUTPUT),
  maxLogEntries: z.number().int().positive().max(MAX_LOG).default(20),
  maxStatsCommits: z.number().int().positive().max(MAX_STATS_COMMITS).default(5_000),
  maxStatsOutputBytes: z.number().int().positive().max(MAX_STATS_OUTPUT).default(8 * 1024 * 1024),
  worktreeRoot: z.string().min(1).max(MAX_PATH).optional(),
})
export type GitConfig = z.infer<typeof gitConfigSchema>

export interface GitCommandResult {
  stdout: string
  stderr: string
  code: number
  truncated: boolean
  timedOut?: boolean
}

export interface GitRunner {
  run(cwd: string, args: string[], signal: AbortSignal, limits: { timeoutMs: number; maxOutputBytes: number }): Promise<GitCommandResult>
}

function environment(): Record<string, string> {
  const allowed = new Set([
    'PATH',
    'PATHEXT',
    'SYSTEMROOT',
    'WINDIR',
    'COMSPEC',
    'TEMP',
    'TMP',
    'HOME',
    'USERPROFILE',
    'GIT_CONFIG_GLOBAL',
    'GIT_CONFIG_NOSYSTEM',
    'LANG',
    'LC_ALL',
  ])
  const result: Record<string, string> = {
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_EDITOR: 'true',
    GIT_PAGER: 'cat',
    GIT_SEQUENCE_EDITOR: 'true',
    GIT_TERMINAL_PROMPT: '0',
    LANG: 'C',
    LC_ALL: 'C',
  }
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined && allowed.has(key.toUpperCase())) result[key] = value
  result.LANG = 'C'
  result.LC_ALL = 'C'
  return result
}

async function collect(stream: ReadableStream<Uint8Array>, limit: number, state: { truncated: boolean }) {
  const decoder = new TextDecoder()
  let text = ''
  for await (const chunk of stream) {
    text += decoder.decode(chunk, { stream: true })
    if (text.length > limit) {
      text = text.slice(0, limit)
      state.truncated = true
    }
  }
  return text + decoder.decode()
}

export class ProcessGitRunner implements GitRunner {
  async run(cwd: string, args: string[], signal: AbortSignal, limits: { timeoutMs: number; maxOutputBytes: number }) {
    signal.throwIfAborted()
    assertLocalWorkspace(cwd)
    const child = Bun.spawn(['git', ...args], {
      cwd,
      env: environment(),
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'ignore',
      windowsHide: true,
    })
    const state = { truncated: false }
    let timedOut = false
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
    const onAbort = () => void terminate().catch(() => {})
    signal.addEventListener('abort', onAbort, { once: true })
    const timeout = setTimeout(() => {
      timedOut = true
      onAbort()
    }, limits.timeoutMs)
    try {
      const perStream = Math.max(1, Math.floor(limits.maxOutputBytes / 2))
      const [stdout, stderr, code] = await Promise.all([
        collect(child.stdout, perStream, state),
        collect(child.stderr, perStream, state),
        child.exited,
      ])
      if (terminating) await terminating
      signal.throwIfAborted()
      return { stdout, stderr, code, truncated: state.truncated, timedOut }
    } finally {
      clearTimeout(timeout)
      signal.removeEventListener('abort', onAbort)
    }
  }
}

function safeRemote(value: string): string {
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    return url.toString()
  } catch {
    return value.replace(/(https?:\/\/)([^/@\s]+)@/i, '$1')
  }
}

function inside(root: string, candidate: string) {
  const relation = relative(root, candidate)
  return relation === '' || (!relation.startsWith('..') && !isAbsolute(relation))
}

function branchName(value: string) {
  if (
    !value ||
    value.length > 1_000 ||
    value.startsWith('-') ||
    value.includes('..') ||
    value.includes('@{') ||
    /\s/.test(value) ||
    value.includes('\0')
  )
    throw new HbarError('GIT_INVALID_BRANCH', 'Invalid branch name')
  return value
}

function pathSpec(value: string) {
  if (!value || value.length > MAX_PATH || value.includes('\u0000') || isAbsolute(value))
    throw new HbarError('GIT_INVALID_PATH', 'Git paths must be non-empty relative workspace paths')
  const normalized = value.replaceAll('\\', '/')
  const parts = normalized.split('/')
  if (parts.some((part) => part === '..')) throw new HbarError('GIT_INVALID_PATH', 'Git paths cannot escape the workspace')
  return normalized
}

function parseStatus(output: string, cwd: string): GitStatus {
  const tokens = output.split('\0')
  const header = tokens.shift() ?? ''
  let branch: string | null = null
  let upstream: string | null = null
  let ahead = 0
  let behind = 0
  if (header.startsWith('## ')) {
    const value = header.slice(3)
    const separator = value.indexOf('...')
    const left = separator < 0 ? value : value.slice(0, separator)
    const tracking = separator < 0 ? undefined : value.slice(separator + 3)
    branch = left === 'HEAD (no branch)' || left === 'No commits yet on' ? null : left || null
    if (tracking) {
      const match = tracking.match(/^([^\s[]+)(?:\s+\[(.*?)\])?$/)
      upstream = match?.[1] ?? null
      const details = match?.[2] ?? ''
      const aheadMatch = details.match(/ahead (\d+)/)
      const behindMatch = details.match(/behind (\d+)/)
      ahead = aheadMatch ? Number(aheadMatch[1]) : 0
      behind = behindMatch ? Number(behindMatch[1]) : 0
    }
    const unborn = value.match(/^No commits yet on (.+)$/)
    if (unborn) branch = unborn[1] ?? null
  }
  const entries: GitStatus['entries'] = []
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (!token || token.length < 3) continue
    const originalPath = token[0] === 'R' || token[0] === 'C' || token[1] === 'R' || token[1] === 'C' ? tokens[++index] : undefined
    const item = {
      index: token[0] ?? ' ',
      worktree: token[1] ?? ' ',
      path: token.slice(3),
      ...(originalPath ? { originalPath } : {}),
    }
    if (item.path) entries.push(item)
  }
  return gitStatusSchema.parse({
    cwd,
    root: cwd,
    branch,
    head: null,
    upstream,
    ahead,
    behind,
    dirty: entries.length > 0,
    entries,
    originUrl: null,
  })
}

function externalProvenance(): GitCommitProvenance {
  return { source: 'external', recordedAt: null, sessionId: null, runId: null, operationId: null }
}

function parseProvenance(note: string): GitCommitProvenance {
  if (!note) return externalProvenance()
  if (!note.startsWith(PROVENANCE_PREFIX))
    throw new HbarError('GIT_PROVENANCE_INVALID', 'Git commit has an unrecognized hbar provenance note')
  try {
    const parsed = gitCommitProvenanceSchema.parse(JSON.parse(note.slice(PROVENANCE_PREFIX.length)))
    if (parsed.source === 'external' || parsed.recordedAt === null)
      throw new HbarError('GIT_PROVENANCE_INVALID', 'Recorded Git provenance must identify an hbar commit source')
    return parsed
  } catch (error) {
    if (error instanceof HbarError) throw error
    throw new HbarError('GIT_PROVENANCE_INVALID', 'Git commit has an invalid hbar provenance note')
  }
}

function parseLog(output: string): GitCommitInfo[] {
  const commits: GitCommitInfo[] = []
  for (const record of output.split('\x1e')) {
    if (!record) continue
    const [sha, shortSha, author, authoredAt, committedAt, subject, note = ''] = record.split('\0')
    if (!sha || !shortSha) continue
    commits.push(
      gitCommitInfoSchema.parse({
        sha,
        shortSha,
        author: author ?? '',
        authoredAt: authoredAt ?? '',
        committedAt: committedAt ?? '',
        subject: subject ?? '',
        provenance: parseProvenance(note.trim()),
      }),
    )
  }
  return commits
}

interface IndexedGitCommit {
  readonly sha: string
  readonly committedAt: number
  readonly provenance: GitCommitProvenance
  readonly filesChanged: number
  readonly additions: number
  readonly deletions: number
  readonly renames: number
  readonly binaryFiles: number
}

interface GitStatsIndex {
  readonly repoId: string
  readonly head: string
  readonly commits: readonly IndexedGitCommit[]
  readonly complete: boolean
}

interface GitStatsIndexResult {
  readonly index: GitStatsIndex
  readonly mode: 'full' | 'incremental' | 'hit' | 'reindexed'
}

function readNullField(record: string, cursor: { offset: number }): string {
  const end = record.indexOf('\0', cursor.offset)
  if (end < 0) throw new HbarError('GIT_STATS_INVALID', 'Git statistics stream ended inside a commit header')
  const value = record.slice(cursor.offset, end)
  cursor.offset = end + 1
  return value
}

function parseStatsLog(output: string, signal?: AbortSignal): IndexedGitCommit[] {
  const commits: IndexedGitCommit[] = []
  for (const [recordIndex, record] of output.split('\x1e').entries()) {
    if (!record) continue
    if (recordIndex % 100 === 0) signal?.throwIfAborted()
    const cursor = { offset: 0 }
    const sha = readNullField(record, cursor)
    readNullField(record, cursor) // Parent IDs are emitted to make the first-parent policy auditable.
    const committedSeconds = Number(readNullField(record, cursor))
    const note = readNullField(record, cursor).trim()
    if (!/^[0-9a-f]{40}$/i.test(sha) || !Number.isSafeInteger(committedSeconds) || committedSeconds < 0)
      throw new HbarError('GIT_STATS_INVALID', 'Git statistics stream contains an invalid commit header')
    let filesChanged = 0
    let additions = 0
    let deletions = 0
    let renames = 0
    let binaryFiles = 0
    const entries = record.slice(cursor.offset).replace(/^(?:\r?\n)+/, '').split('\0')
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]?.replace(/^(?:\r?\n)+/, '') ?? ''
      if (!entry) continue
      const match = entry.match(/^(-|\d+)\t(-|\d+)\t(.*)$/s)
      if (!match) throw new HbarError('GIT_STATS_INVALID', 'Git statistics stream contains an invalid numstat row')
      const [, added = '-', deleted = '-', path = ''] = match
      filesChanged++
      if (added === '-' || deleted === '-') binaryFiles++
      else {
        additions += Number(added)
        deletions += Number(deleted)
      }
      if (!path) {
        const originalPath = entries[++index]
        const renamedPath = entries[++index]
        if (!originalPath || !renamedPath)
          throw new HbarError('GIT_STATS_INVALID', 'Git rename row is missing its original or destination path')
        renames++
      }
    }
    commits.push({
      sha,
      committedAt: committedSeconds * 1_000,
      provenance: parseProvenance(note),
      filesChanged,
      additions,
      deletions,
      renames,
      binaryFiles,
    })
  }
  return commits
}

function emptyStatsCount(): GitStatsCount {
  return {
    commits: 0,
    autoCommits: 0,
    manualCommits: 0,
    externalCommits: 0,
    filesChanged: 0,
    additions: 0,
    deletions: 0,
    renames: 0,
    binaryFiles: 0,
  }
}

function addCommit(target: GitStatsCount, commit: IndexedGitCommit) {
  target.commits++
  if (commit.provenance.source === 'auto') target.autoCommits++
  else if (commit.provenance.source === 'manual') target.manualCommits++
  else target.externalCommits++
  target.filesChanged += commit.filesChanged
  target.additions += commit.additions
  target.deletions += commit.deletions
  target.renames += commit.renames
  target.binaryFiles += commit.binaryFiles
}

function parseWorktrees(output: string): GitWorktreeInfo[] {
  const result: GitWorktreeInfo[] = []
  let current: Partial<GitWorktreeInfo> = {}
  const flush = () => {
    if (!current.path) return
    result.push(
      gitWorktreeInfoSchema.parse({
        path: current.path,
        head: current.head ?? null,
        branch: current.branch ?? null,
        bare: current.bare ?? false,
        locked: current.locked ?? false,
        prunable: current.prunable ?? false,
      }),
    )
    current = {}
  }
  for (const line of output.split(/\r?\n/)) {
    if (!line) {
      flush()
      continue
    }
    const split = line.indexOf(' ')
    const key = split < 0 ? line : line.slice(0, split)
    const value = split < 0 ? '' : line.slice(split + 1)
    if (key === 'worktree') current.path = value
    else if (key === 'HEAD') current.head = value || null
    else if (key === 'branch') current.branch = value.replace(/^refs\/heads\//, '') || null
    else if (key === 'bare') current.bare = true
    else if (key === 'locked') current.locked = true
    else if (key === 'prunable') current.prunable = true
  }
  flush()
  return result.slice(0, MAX_WORKTREES)
}

function isGitObjectId(value: string): boolean {
  return /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(value)
}

function sameWorktreePath(left: string, right: string): boolean {
  const resolvedLeft = resolve(left)
  const resolvedRight = resolve(right)
  return process.platform === 'win32'
    ? resolvedLeft.toLowerCase() === resolvedRight.toLowerCase()
    : resolvedLeft === resolvedRight
}

function stripOneTrailingLineEnding(value: string): string {
  return value.endsWith('\n') ? value.slice(0, -1) : value
}

async function hasGitMetadataInParents(path: string): Promise<boolean> {
  let current = resolve(path)
  while (true) {
    try {
      await lstat(join(current, '.git'))
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const parent = dirname(current)
    if (parent === current) return false
    current = parent
  }
}

function parseLaunchBranchRefs(output: string, currentRef: string | null, truncated: boolean) {
  const branches: GitLaunchBranchReference[] = []
  let incomplete = false
  const lines = output.split(/\r?\n/)
  if (truncated && !output.endsWith('\n')) lines.pop()
  for (const line of lines) {
    if (!line) continue
    const fields = line.split('\0')
    if (fields.length !== 2) {
      incomplete = true
      continue
    }
    const [name, oid] = fields
    if (!name || !oid || !isGitObjectId(oid)) {
      incomplete = true
      continue
    }
    const ref = `refs/heads/${name}`
    if (name.length > 1_000) {
      incomplete = true
      continue
    }
    branches.push({ name, ref, oid, current: ref === currentRef, worktree: 'unknown' })
  }
  return { branches, incomplete }
}

function parseLaunchWorktreeBranches(output: string, currentRoot: string) {
  const branches = new Map<string, 'current' | 'elsewhere' | 'conflict'>()
  let currentPath: string | null = null
  let branchRef: string | null = null
  let currentWorktreeFound = false
  const flush = () => {
    if (currentPath && sameWorktreePath(currentPath, currentRoot)) currentWorktreeFound = true
    if (branchRef && currentPath) {
      const location = sameWorktreePath(currentPath, currentRoot) ? 'current' : 'elsewhere'
      const previous = branches.get(branchRef)
      branches.set(branchRef, previous && previous !== location ? 'conflict' : location)
    }
    currentPath = null
    branchRef = null
  }
  for (const token of output.split('\0')) {
    if (!token) {
      flush()
      continue
    }
    const separator = token.indexOf(' ')
    const key = separator < 0 ? token : token.slice(0, separator)
    const value = separator < 0 ? '' : token.slice(separator + 1)
    if (key === 'worktree') currentPath = value
    else if (key === 'branch') branchRef = value.startsWith('refs/heads/') ? value : null
  }
  if (output.endsWith('\0')) flush()
  return { branches, currentWorktreeFound }
}

export class GitRuntime implements GitService {
  private readonly rootPromise: Promise<string>
  private readonly worktreeRootPromise: Promise<string>
  constructor(
    root: string,
    private readonly config: GitConfig,
    private readonly runner: GitRunner = new ProcessGitRunner(),
    private readonly allowExternalCwd = false,
    private readonly onChanged?: (cwd: string) => void | Promise<void>,
    private readonly statsIndexes = new Map<string, GitStatsIndex>(),
  ) {
    assertLocalWorkspace(root)
    if (config.worktreeRoot) assertLocalWorkspace(config.worktreeRoot)
    this.rootPromise = realpath(root)
    this.worktreeRootPromise = config.worktreeRoot
      ? this.resolveWithinRoot(config.worktreeRoot)
      : this.rootPromise.then((value) => resolve(value, '.hbar-worktrees'))
  }

  scoped(root: string) {
    return new GitRuntime(root, this.config, this.runner, false, this.onChanged, this.statsIndexes)
  }

  async forRun(raw: GitRunOperation, context: GitRunContext, signal?: AbortSignal): Promise<GitRunResult> {
    const operation = gitRunOperationSchema.parse(raw)
    const source = gitRunContextSchema.parse(context)
    if (operation.input.cwd !== undefined)
      throw new HbarError('COMMAND_SOURCE_WORKSPACE_MISMATCH', 'Run-scoped Git cannot override its execution workspace')
    const worktree = operation.method === 'worktree' ? gitCommands['git.worktree'].input.parse(operation.input) : null
    let worktreeRoot: string | undefined
    if (worktree && worktree.operation !== 'list' && this.config.worktreeRoot) {
      worktreeRoot = await this.worktreeRootPromise
      if (!inside(await realpath(source.workspacePath), worktreeRoot))
        throw new HbarError(
          'COMMAND_SOURCE_WORKTREE_ROOT_DENIED',
          'Run-scoped worktrees must remain inside the admitted workspace',
        )
    }
    const scoped = new GitRuntime(
      source.workspacePath,
      { ...this.config, worktreeRoot },
      this.runner,
      false,
      this.onChanged,
      this.statsIndexes,
    )
    switch (operation.method) {
      case 'info':
        gitCommands['git.info'].input.parse(operation.input)
        return scoped.info(undefined, signal)
      case 'status':
        gitCommands['git.status'].input.parse(operation.input)
        return scoped.status(undefined, signal)
      case 'diff': {
        const input = gitCommands['git.diff'].input.parse(operation.input)
        return scoped.diff(undefined, input, signal)
      }
      case 'log': {
        const input = gitCommands['git.log'].input.parse(operation.input)
        return scoped.log(undefined, input.limit, signal)
      }
      case 'stats': {
        const input = gitCommands['git.stats'].input.parse(operation.input)
        return scoped.stats(undefined, input, signal)
      }
      case 'commit': {
        const input = gitCommands['git.commit'].input.parse(operation.input)
        if (
          (input.sessionId !== undefined && input.sessionId !== source.sessionId) ||
          (input.runId !== undefined && input.runId !== source.runId)
        )
          throw new HbarError('COMMAND_SOURCE_MISMATCH', 'Run-scoped commit attribution belongs to its captured source')
        return scoped.commit(
          undefined,
          {
            ...input,
            provenance: {
              source: 'auto',
              sessionId: source.sessionId,
              runId: source.runId,
              operationId: source.callId,
            },
          },
          signal,
        )
      }
      case 'branch': {
        const input = gitCommands['git.branch'].input.parse(operation.input)
        if (input.operation === 'list') return scoped.branch(undefined, { operation: 'list' }, signal)
        if (!input.name) throw new HbarError('GIT_BRANCH_NAME', 'Branch mutation requires a name')
        return scoped.branch(undefined, { operation: input.operation, name: input.name, force: input.force }, signal)
      }
      case 'worktree': {
        const input = gitCommands['git.worktree'].input.parse(operation.input)
        if (input.operation === 'list') return scoped.worktree(undefined, { operation: 'list' }, signal)
        if (!input.path) throw new HbarError('GIT_WORKTREE_PATH', 'Worktree mutation requires a path')
        if (input.operation === 'add')
          return scoped.worktree(
            undefined,
            {
              operation: 'add',
              path: input.path,
              branch: input.branch,
              createBranch: input.createBranch,
            },
            signal,
          )
        return scoped.worktree(undefined, { operation: 'remove', path: input.path, force: input.force }, signal)
      }
      case 'diffToRemote':
        gitCommands['git.diffToRemote'].input.parse(operation.input)
        return scoped.diffToRemote(undefined, signal)
    }
  }

  private async notifyChanged(cwd: string) {
    if (!this.onChanged) return
    try {
      await this.onChanged(cwd)
    } catch (error) {
      // Notifications are observational; a disconnected client must not turn
      // a successful Git mutation into a failed command.
      console.error('Git change notification failed:', error)
    }
  }

  private async resolveWithinRoot(requested?: string) {
    if (requested !== undefined) assertLocalWorkspace(requested)
    const root = await this.rootPromise
    const candidate = resolve(root, requested ?? '.')
    if (!inside(root, candidate)) {
      if (!this.allowExternalCwd || !requested || !isAbsolute(requested))
        throw new HbarError('PATH_DENIED', 'Git path is outside the workspace')
      try {
        return await realpath(candidate)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return candidate
        throw error
      }
    }
    try {
      const actual = await realpath(candidate)
      if (!inside(root, actual)) throw new HbarError('PATH_DENIED', 'Git path resolves outside the workspace')
      return actual
    } catch (error) {
      if (error instanceof HbarError) throw error
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return candidate
      throw error
    }
  }

  private async run(cwd: string, args: string[], signal = new AbortController().signal) {
    const result = await this.runner.run(cwd, args, signal, {
      timeoutMs: this.config.timeoutMs,
      maxOutputBytes: this.config.maxOutputBytes,
    })
    if (result.timedOut) throw new HbarError('GIT_TIMEOUT', `Git command exceeded ${this.config.timeoutMs}ms`)
    if (result.code !== 0)
      throw new HbarError('GIT_COMMAND_FAILED', result.stderr.trim() || result.stdout.trim() || `git exited with ${result.code}`)
    return result
  }

  private async tryRun(cwd: string, args: string[], signal?: AbortSignal) {
    try {
      return await this.run(cwd, args, signal)
    } catch (error) {
      if (error instanceof HbarError && error.code === 'GIT_COMMAND_FAILED') return null
      throw error
    }
  }

  private async runStatsLog(cwd: string, revision: string, signal?: AbortSignal) {
    const result = await this.runner.run(
      cwd,
      [
        'log',
        '--first-parent',
        '--diff-merges=first-parent',
        '--root',
        '--find-renames',
        '--numstat',
        '-z',
        `--max-count=${this.config.maxStatsCommits + 1}`,
        `--show-notes=${PROVENANCE_NOTES_REF}`,
        '--pretty=format:%x1e%H%x00%P%x00%ct%x00%N%x00',
        revision,
      ],
      signal ?? new AbortController().signal,
      { timeoutMs: this.config.timeoutMs, maxOutputBytes: this.config.maxStatsOutputBytes },
    )
    if (result.timedOut) throw new HbarError('GIT_TIMEOUT', `Git command exceeded ${this.config.timeoutMs}ms`)
    if (result.code !== 0)
      throw new HbarError(
        'GIT_COMMAND_FAILED',
        result.stderr.trim() || result.stdout.trim() || `git exited with ${result.code}`,
      )
    const parsed = parseStatsLog(result.stdout, signal)
    return {
      commits: parsed.slice(0, this.config.maxStatsCommits),
      complete: !result.truncated && parsed.length <= this.config.maxStatsCommits,
    }
  }

  private async statsRepository(cwd: string, signal?: AbortSignal) {
    const status = await this.status(cwd, signal)
    if (!status.root || !status.head) return { repoId: status.root ?? cwd, head: null }
    const common = await this.run(status.root, ['rev-parse', '--git-common-dir'], signal)
    return {
      repoId: resolve(status.root, common.stdout.trim()),
      head: status.head,
    }
  }

  private async refreshStatsIndex(
    cwd: string,
    repoId: string,
    head: string,
    signal?: AbortSignal,
  ): Promise<GitStatsIndexResult> {
    const cached = this.statsIndexes.get(repoId)
    if (cached?.head === head) return { index: cached, mode: 'hit' }
    if (cached) {
      const descendant = await this.tryRun(cwd, ['merge-base', '--is-ancestor', cached.head, head], signal)
      if (descendant) {
        const scanned = await this.runStatsLog(cwd, `${cached.head}..${head}`, signal)
        const seen = new Set<string>()
        const commits = [...scanned.commits, ...cached.commits]
          .filter((commit) => (seen.has(commit.sha) ? false : (seen.add(commit.sha), true)))
          .slice(0, this.config.maxStatsCommits)
        const index: GitStatsIndex = {
          repoId,
          head,
          commits,
          complete:
            scanned.complete &&
            cached.complete &&
            scanned.commits.length + cached.commits.length <= this.config.maxStatsCommits,
        }
        this.statsIndexes.set(repoId, index)
        return { index, mode: 'incremental' }
      }
    }
    const scanned = await this.runStatsLog(cwd, head, signal)
    const index: GitStatsIndex = { repoId, head, commits: scanned.commits, complete: scanned.complete }
    this.statsIndexes.set(repoId, index)
    return { index, mode: cached ? 'reindexed' : 'full' }
  }

  private async remoteBase(cwd: string, status: GitStatus, signal?: AbortSignal) {
    let reference = status.upstream
    if (!reference && status.branch) {
      const refs = await this.tryRun(cwd, ['for-each-ref', '--format=%(refname:short)%00', 'refs/remotes'], signal)
      const candidates = (refs?.stdout ?? '').split('\0').filter((value) => value && value !== 'HEAD')
      reference = candidates.find((value) => {
        const slash = value.indexOf('/')
        return slash >= 0 && value.slice(slash + 1) === status.branch
      }) ?? candidates[0] ?? null
    }
    if (!reference) return null
    const resolved = await this.tryRun(cwd, ['rev-parse', '--verify', reference], signal)
    const sha = resolved?.stdout.trim()
    return sha ? { reference, sha } : null
  }

  private async untrackedDiff(cwd: string, paths: string[], signal?: AbortSignal) {
    const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null'
    const chunks: string[] = []
    let size = 0
    for (const path of paths.slice(0, MAX_UNTRACKED_FILES)) {
      const result = await this.runner.run(
        cwd,
        ['diff', '--no-ext-diff', '--no-index', '--', nullDevice, path],
        signal ?? new AbortController().signal,
        { timeoutMs: this.config.timeoutMs, maxOutputBytes: this.config.maxOutputBytes },
      )
      if (result.timedOut) throw new HbarError('GIT_TIMEOUT', `Git command exceeded ${this.config.timeoutMs}ms`)
      // `git diff --no-index` returns 1 when the files differ, which is the
      // expected result for every untracked file.
      if (result.code !== 0 && result.code !== 1)
        throw new HbarError('GIT_COMMAND_FAILED', result.stderr.trim() || result.stdout.trim() || `git exited with ${result.code}`)
      if (!result.stdout) continue
      const remaining = this.config.maxOutputBytes - size
      if (remaining <= 0) break
      chunks.push(result.stdout.slice(0, remaining))
      size += Math.min(result.stdout.length, remaining)
      if (result.stdout.length > remaining) break
    }
    return { diff: chunks.join(''), truncated: paths.length > MAX_UNTRACKED_FILES || size >= this.config.maxOutputBytes }
  }

  async status(cwd?: string, signal?: AbortSignal): Promise<GitStatus> {
    const path = await this.resolveWithinRoot(cwd)
    const status = await this.tryRun(path, ['status', '--porcelain=v1', '-z', '--branch'], signal)
    if (!status)
      return gitStatusSchema.parse({ cwd: path, root: null, branch: null, head: null, upstream: null, ahead: 0, behind: 0, dirty: false, entries: [], originUrl: null })
    if (status.truncated) throw new HbarError('GIT_OUTPUT_LIMIT', 'Git status output exceeded its configured limit')
    const parsed = parseStatus(status.stdout, path)
    const rootResult = await this.tryRun(path, ['rev-parse', '--show-toplevel'], signal)
    const headResult = await this.tryRun(path, ['rev-parse', 'HEAD'], signal)
    const remoteResult = await this.tryRun(path, ['remote', 'get-url', 'origin'], signal)
    const rootPath = rootResult?.stdout.trim() ? resolve(rootResult.stdout.trim()) : path
    return gitStatusSchema.parse({
      ...parsed,
      root: rootPath,
      head: headResult?.stdout.trim() || null,
      originUrl: remoteResult?.stdout.trim() ? safeRemote(remoteResult.stdout.trim()) : null,
    })
  }

  async diff(cwd?: string, options: GitDiffOptions = {}, signal?: AbortSignal): Promise<GitDiff> {
    const path = await this.resolveWithinRoot(cwd)
    const scoped = options.scope === 'execution-root'
    const args = [
      ...(scoped ? ['--literal-pathspecs'] : []),
      'diff',
      '--no-ext-diff',
      ...(scoped ? ['--relative', '--no-renames', '--no-textconv'] : []),
      ...(options.cached ? ['--cached'] : []),
    ]
    const paths = (options.paths ?? []).map(pathSpec)
    if (paths.length) args.push('--', ...paths)
    const result = await this.run(path, args, signal)
    return gitDiffSchema.parse({ cwd: path, diff: result.stdout, cached: Boolean(options.cached), truncated: result.truncated })
  }

  async log(cwd?: string, limit = this.config.maxLogEntries, signal?: AbortSignal): Promise<GitCommitInfo[]> {
    const path = await this.resolveWithinRoot(cwd)
    const bounded = Math.min(MAX_LOG, Math.max(1, Math.trunc(limit)))
    const result = await this.tryRun(
      path,
      [
        'log',
        '-n',
        String(bounded),
        '--date=iso-strict',
        `--show-notes=${PROVENANCE_NOTES_REF}`,
        '--pretty=format:%x1e%H%x00%h%x00%an%x00%aI%x00%cI%x00%s%x00%N',
      ],
      signal,
    )
    return result ? parseLog(result.stdout) : []
  }

  async stats(cwd: string | undefined, options: GitStatsOptions, signal?: AbortSignal): Promise<GitStatsReport> {
    const path = await this.resolveWithinRoot(cwd)
    const to = options.to ?? Date.now()
    const from = options.from ?? to - options.bucketMs * options.maxBuckets
    if (
      !Number.isSafeInteger(from) ||
      !Number.isSafeInteger(to) ||
      from < 0 ||
      to <= from ||
      !Number.isSafeInteger(options.bucketMs) ||
      options.bucketMs < 60_000
    )
      throw new HbarError('GIT_STATS_RANGE', 'Git statistics require a valid positive time range and bucket width')
    const bucketCount = Math.ceil((to - from) / options.bucketMs)
    if (bucketCount < 1 || bucketCount > options.maxBuckets || bucketCount > 1_000)
      throw new HbarError('GIT_STATS_RANGE', 'Git statistics time range exceeds the requested bucket capacity')
    const sources = [...new Set(options.sources)]
    if (!sources.length || sources.some((source) => !['auto', 'manual', 'external'].includes(source)))
      throw new HbarError('GIT_STATS_SOURCE', 'Git statistics require at least one recognized commit source')
    const repository = await this.statsRepository(path, signal)
    const points = Array.from({ length: bucketCount }, (_, index) => ({
      ...emptyStatsCount(),
      start: from + index * options.bucketMs,
      end: Math.min(to, from + (index + 1) * options.bucketMs),
    }))
    if (!repository.head)
      return {
        accountingVersion: 'git-stats-v1',
        repoId: repository.repoId,
        head: null,
        observedAt: Date.now(),
        from,
        to,
        bucketMs: options.bucketMs,
        sources,
        timeBasis: 'committer',
        timezone: 'UTC',
        historyPolicy: 'first-parent',
        renamePolicy: 'separate',
        binaryLineChanges: { value: 0, availability: 'available', reason: null },
        totals: emptyStatsCount(),
        points,
        scannedCommits: 0,
        indexMode: 'empty',
        indexComplete: true,
        gap: false,
      }
    const refreshed = await this.refreshStatsIndex(path, repository.repoId, repository.head, signal)
    const selectedSources = new Set<GitCommitSource>(sources)
    const totals = emptyStatsCount()
    for (const [index, commit] of refreshed.index.commits.entries()) {
      if (index % 100 === 0) signal?.throwIfAborted()
      if (
        commit.committedAt < from ||
        commit.committedAt >= to ||
        !selectedSources.has(commit.provenance.source)
      )
        continue
      const point = points[Math.floor((commit.committedAt - from) / options.bucketMs)]
      if (!point) continue
      addCommit(point, commit)
      addCommit(totals, commit)
    }
    const oldest = refreshed.index.commits.at(-1)?.committedAt
    const gap = !refreshed.index.complete && (oldest === undefined || from <= oldest)
    return {
      accountingVersion: 'git-stats-v1',
      repoId: refreshed.index.repoId,
      head: refreshed.index.head,
      observedAt: Date.now(),
      from,
      to,
      bucketMs: options.bucketMs,
      sources,
      timeBasis: 'committer',
      timezone: 'UTC',
      historyPolicy: 'first-parent',
      renamePolicy: 'separate',
      binaryLineChanges:
        totals.binaryFiles > 0
          ? { value: null, availability: 'unavailable', reason: 'BINARY_CONTENT' }
          : { value: 0, availability: 'available', reason: null },
      totals,
      points,
      scannedCommits: refreshed.index.commits.length,
      indexMode: refreshed.mode,
      indexComplete: refreshed.index.complete,
      gap,
    }
  }

  async commit(cwd: string | undefined, options: GitCommitOptions, signal?: AbortSignal): Promise<GitCommitInfo> {
    const path = await this.resolveWithinRoot(cwd)
    const message = options.message.trim()
    if (!message || message.length > 4_000) throw new HbarError('GIT_INVALID_MESSAGE', 'Commit message must be 1-4000 characters')
    const paths = (options.paths ?? []).map(pathSpec)
    if (options.stage && paths.length) await this.run(path, ['add', '--', ...paths], signal)
    const args = ['commit', '-m', message]
    if (paths.length) args.push('--', ...paths)
    await this.run(path, args, signal)
    const head = (await this.run(path, ['rev-parse', 'HEAD'], signal)).stdout.trim()
    const provenance = gitCommitProvenanceSchema.parse({
      source: options.provenance.source,
      recordedAt: Date.now(),
      sessionId: options.provenance.sessionId ?? null,
      runId: options.provenance.runId ?? null,
      operationId: options.provenance.operationId ?? null,
    })
    await this.run(
      path,
      ['notes', `--ref=${PROVENANCE_NOTES_REF}`, 'add', '-f', '-m', `${PROVENANCE_PREFIX}${JSON.stringify(provenance)}`, head],
      signal,
    )
    const commits = await this.log(path, 1, signal)
    const result = gitCommitInfoSchema.parse(
      commits[0] ?? {
        sha: head,
        shortSha: head.slice(0, 7),
        author: '',
        authoredAt: '',
        committedAt: '',
        subject: message.split(/\r?\n/, 1)[0],
        provenance,
      },
    )
    await this.notifyChanged(path)
    return result
  }

  async stage(cwd: string | undefined, paths: string[], signal?: AbortSignal) {
    const path = await this.resolveWithinRoot(cwd)
    const normalized = paths.map(pathSpec)
    if (!normalized.length) throw new HbarError('GIT_INVALID_PATH', 'At least one path is required')
    await this.run(path, ['add', '--', ...normalized], signal)
    await this.notifyChanged(path)
    return { paths: normalized }
  }

  async unstage(cwd: string | undefined, paths: string[], signal?: AbortSignal) {
    const path = await this.resolveWithinRoot(cwd)
    const normalized = paths.map(pathSpec)
    if (!normalized.length) throw new HbarError('GIT_INVALID_PATH', 'At least one path is required')
    await this.run(path, ['restore', '--staged', '--', ...normalized], signal)
    await this.notifyChanged(path)
    return { paths: normalized }
  }

  async branch(cwd: string | undefined, operation: GitBranchOperation = {}, signal?: AbortSignal): Promise<GitBranchInfo[] | GitBranchInfo> {
    const path = await this.resolveWithinRoot(cwd)
    if (!operation.operation || operation.operation === 'list') {
      const result = await this.tryRun(path, ['for-each-ref', '--format=%(refname:short)%00%(HEAD)%00%(upstream:short)%00%(upstream:track)%00', 'refs/heads'], signal)
      const current = (await this.tryRun(path, ['branch', '--show-current'], signal))?.stdout.trim() ?? ''
      const entries: GitBranchInfo[] = []
      const fields = (result?.stdout ?? '').split('\0')
      for (let offset = 0; offset + 3 < fields.length; offset += 4) {
        const [name, marker, upstream, track] = fields.slice(offset, offset + 4)
        if (!name) continue
        const ahead = Number(track?.match(/ahead (\d+)/)?.[1] ?? 0)
        const behind = Number(track?.match(/behind (\d+)/)?.[1] ?? 0)
        entries.push(gitBranchInfoSchema.parse({ name, current: marker === '*' || marker === '* ' || name === current, remote: upstream?.split('/')[0] ?? null, upstream: upstream || null, ahead, behind }))
      }
      return entries
    }
    if (!('name' in operation)) throw new HbarError('GIT_INVALID_BRANCH', 'name is required for branch mutations')
    const name = branchName(operation.name)
    if (operation.operation === 'create') await this.run(path, ['switch', '-c', name], signal)
    else if (operation.operation === 'switch') await this.run(path, ['switch', name], signal)
    else await this.run(path, ['branch', operation.force ? '-D' : '-d', name], signal)
    await this.notifyChanged(path)
    const listed = await this.branch(path, {}, signal)
    if (Array.isArray(listed)) return listed.find((item) => item.name === name) ?? listed[0] ?? gitBranchInfoSchema.parse({ name, current: false, remote: null, upstream: null, ahead: 0, behind: 0 })
    return listed
  }

  async createLaunchBranch(
    cwd: string | undefined,
    input: GitLaunchBranchCreateInput,
    signal?: AbortSignal,
  ): Promise<GitLaunchBranchCreateResult> {
    const path = await this.resolveWithinRoot(cwd)
    const name = branchName(input.name.trim())
    const ref = `refs/heads/${name}`
    const basePrefix = 'refs/heads/'
    if (!input.baseRef.startsWith(basePrefix) || input.baseRef.length <= basePrefix.length)
      throw new HbarError('GIT_BRANCH_BASE_NOT_FOUND', 'Launch branch base must be a local branch ref')
    branchName(input.baseRef.slice(basePrefix.length))
    if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(input.expectedBaseOid))
      throw new HbarError('GIT_BRANCH_BASE_CHANGED', 'Launch branch base OID is invalid')

    const validName = await this.tryRun(path, ['check-ref-format', ref], signal)
    if (!validName) throw new HbarError('GIT_INVALID_BRANCH', 'Invalid Git branch name')
    const validBase = await this.tryRun(path, ['check-ref-format', input.baseRef], signal)
    if (!validBase) throw new HbarError('GIT_BRANCH_BASE_NOT_FOUND', 'Launch branch base ref is invalid')
    const existing = await this.tryRun(path, ['show-ref', '--verify', '--quiet', ref], signal)
    if (existing) throw new HbarError('GIT_BRANCH_EXISTS', 'Launch branch already exists')

    const base = await this.tryRun(
      path,
      ['rev-parse', '--verify', '--quiet', '--end-of-options', `${input.baseRef}^{commit}`],
      signal,
    )
    if (!base) throw new HbarError('GIT_BRANCH_BASE_NOT_FOUND', 'Launch branch base ref does not resolve to a commit')
    const baseOid = base.stdout.trim()
    if (baseOid.toLowerCase() !== input.expectedBaseOid.toLowerCase())
      throw new HbarError('GIT_BRANCH_BASE_CHANGED', 'Launch branch base moved after it was selected')

    try {
      await this.run(path, ['branch', '--', name, input.expectedBaseOid], signal)
    } catch (error) {
      if (error instanceof HbarError && error.code === 'GIT_COMMAND_FAILED') {
        const createdDuringRequest = await this.tryRun(path, ['show-ref', '--verify', '--quiet', ref], signal)
        if (createdDuringRequest) throw new HbarError('GIT_BRANCH_EXISTS', 'Launch branch already exists')
      }
      throw error
    }

    const created = await this.tryRun(
      path,
      ['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`],
      signal,
    )
    const oid = created?.stdout.trim() ?? ''
    if (!created || oid.toLowerCase() !== baseOid.toLowerCase())
      throw new HbarError('GIT_BRANCH_RESULT_UNKNOWN', 'Created launch branch could not be verified')

    await this.notifyChanged(path)
    return { ref, oid }
  }

  async worktree(cwd: string | undefined, operation: GitWorktreeOperation = {}, signal?: AbortSignal): Promise<GitWorktreeInfo[] | GitWorktreeInfo> {
    const path = await this.resolveWithinRoot(cwd)
    if (!operation.operation || operation.operation === 'list') {
      const result = await this.tryRun(path, ['worktree', 'list', '--porcelain'], signal)
      return result ? parseWorktrees(result.stdout) : []
    }
    if (!('path' in operation)) throw new HbarError('GIT_WORKTREE_PATH', 'path is required for worktree mutations')
    const configuredRoot = await this.worktreeRootPromise
    const requestedPath = operation.path
    if (!requestedPath || requestedPath.length > MAX_PATH || requestedPath.includes('\u0000'))
      throw new HbarError('GIT_WORKTREE_PATH', `Worktree path must be 1-${MAX_PATH} characters without NUL bytes`)
    const externalAbsolute = isAbsolute(requestedPath)
    const root = externalAbsolute ? resolve(dirname(requestedPath)) : configuredRoot
    if (!externalAbsolute) await mkdir(root, { recursive: true })
    let target = externalAbsolute ? resolve(requestedPath) : resolve(root, requestedPath)
    if ((!externalAbsolute && !inside(root, target)) || samePath(target, await this.rootPromise) || (!externalAbsolute && samePath(target, root)))
      throw new HbarError('GIT_WORKTREE_PATH', externalAbsolute ? 'Worktree path is invalid' : 'Worktree path must be inside the configured worktree root')
    if (externalAbsolute) {
      try {
        const requestedParent = resolve(dirname(target))
        const parent = await realpath(requestedParent)
        if (!samePath(parent, requestedParent)) throw new HbarError('GIT_WORKTREE_PATH', 'Worktree parent cannot be a symbolic link')
        target = resolve(parent, basename(target))
      } catch (error) {
        if (error instanceof HbarError) throw error
        throw new HbarError('GIT_WORKTREE_PATH', 'Worktree parent directory must exist')
      }
    }
    if (operation.operation === 'add') {
      try {
        const existing = await lstat(target)
        if (existing.isSymbolicLink()) throw new HbarError('GIT_WORKTREE_PATH', 'Worktree target cannot be a symbolic link')
        if (!existing.isDirectory()) throw new HbarError('GIT_WORKTREE_PATH', 'Worktree target must be a directory')
        if ((await readdir(target)).length > 0)
          throw new HbarError('GIT_WORKTREE_PATH', 'Worktree target directory must be empty')
      } catch (error) {
        if (error instanceof HbarError) throw error
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          throw new HbarError('GIT_WORKTREE_PATH', 'Worktree target cannot be inspected')
      }
      const branch = operation.branch ? branchName(operation.branch) : undefined
      const startPoint = operation.startPoint ? branchName(operation.startPoint) : undefined
      const args = ['worktree', 'add']
      if (operation.createBranch) {
        if (!branch) throw new HbarError('GIT_WORKTREE_BRANCH', 'A branch is required when createBranch is true')
        args.push('-b', branch)
      }
      args.push(
        target,
        ...(operation.createBranch ? (startPoint ? [startPoint] : []) : branch ? [branch] : []),
      )
      await this.run(path, args, signal)
      await this.notifyChanged(path)
      const entries = (await this.worktree(path, {}, signal)) as GitWorktreeInfo[]
      return entries.find((item) => resolve(item.path) === target) ?? entries[entries.length - 1]!
    }
    await this.run(path, ['worktree', 'remove', ...(operation.operation === 'remove' && operation.force ? ['--force'] : []), target], signal)
    await this.notifyChanged(path)
    return { path: target, head: null, branch: null, bare: false, locked: false, prunable: false }
  }

  async launchBranchSnapshot(cwd?: string, signal?: AbortSignal): Promise<GitLaunchBranchSnapshot> {
    const path = await this.resolveWithinRoot(cwd)
    const rootResult = await this.runner.run(
      path,
      ['rev-parse', '--show-toplevel'],
      signal ?? new AbortController().signal,
      { timeoutMs: this.config.timeoutMs, maxOutputBytes: this.config.maxOutputBytes },
    )
    if (rootResult.timedOut) throw new HbarError('GIT_TIMEOUT', `Git command exceeded ${this.config.timeoutMs}ms`)
    if (rootResult.code !== 0) {
      const message = `${rootResult.stderr}\n${rootResult.stdout}`
      if (!/not a git repository/i.test(message))
        throw new HbarError('GIT_REPOSITORY_UNAVAILABLE', 'Git could not inspect the registered workspace repository')
      if (await hasGitMetadataInParents(path))
        throw new HbarError('GIT_REPOSITORY_UNAVAILABLE', 'Git repository metadata exists but Git could not read it')
      return { repository: { kind: 'not-repository' }, branches: [], incomplete: false }
    }
    if (rootResult.truncated)
      throw new HbarError('GIT_OUTPUT_LIMIT', 'Git repository root output exceeded its configured limit')

    const rootOutput = stripOneTrailingLineEnding(rootResult.stdout)
    if (!rootOutput) throw new HbarError('GIT_REPOSITORY_UNAVAILABLE', 'Git returned an empty repository root')
    const repositoryRoot = await realpath(resolve(rootOutput))
    const canonicalWorkspace = await realpath(path)
    if (!inside(repositoryRoot, canonicalWorkspace))
      throw new HbarError('GIT_REPOSITORY_SCOPE', 'Git repository root is outside the registered workspace scope')
    const [symbolicResult, headResult, refsResult, worktreesResult] = await Promise.all([
      this.tryRun(path, ['symbolic-ref', '--quiet', 'HEAD'], signal),
      this.tryRun(path, ['rev-parse', '--verify', '--quiet', '--end-of-options', 'HEAD^{commit}'], signal),
      this.run(
        path,
        [
          'for-each-ref',
          `--count=${MAX_LAUNCH_BRANCH_REFS + 1}`,
          '--sort=refname',
          '--format=%(refname:strip=2)%00%(objectname)',
          'refs/heads',
        ],
        signal,
      ),
      this.tryRun(path, ['worktree', 'list', '--porcelain', '-z'], signal),
    ])

    const symbolicRef = symbolicResult?.stdout.trim() || null
    const headValue = headResult?.stdout.trim() || null
    const headOid = headValue && isGitObjectId(headValue) ? headValue : null
    const refsSnapshot = parseLaunchBranchRefs(refsResult.stdout, symbolicRef, refsResult.truncated)
    const refsOverCap = refsSnapshot.branches.length > MAX_LAUNCH_BRANCH_REFS
    const branches = refsSnapshot.branches.slice(0, MAX_LAUNCH_BRANCH_REFS)

    let head: GitLaunchBranchHead
    if (symbolicRef) {
      if (symbolicRef.startsWith('refs/heads/')) {
        const name = symbolicRef.slice('refs/heads/'.length)
        if (!name || name.length > 1_000)
          throw new HbarError('GIT_HEAD_UNRESOLVED', 'Git returned an invalid symbolic branch ref')
        if (headOid) head = { kind: 'branch', ref: symbolicRef, name, oid: headOid }
        else if (!refsSnapshot.branches.some((branch) => branch.ref === symbolicRef)) {
          const existingRef = await this.tryRun(path, ['show-ref', '--verify', '--quiet', symbolicRef], signal)
          if (existingRef) head = { kind: 'symbolic', ref: symbolicRef, oid: null }
          else head = { kind: 'unborn', ref: symbolicRef, name }
        } else head = { kind: 'symbolic', ref: symbolicRef, oid: null }
      } else head = { kind: 'symbolic', ref: symbolicRef, oid: headOid }
    } else if (headOid) head = { kind: 'detached', oid: headOid }
    else throw new HbarError('GIT_HEAD_UNRESOLVED', 'Git could not resolve the current repository HEAD')

    const worktreeComplete = Boolean(worktreesResult && !worktreesResult.truncated)
    const worktreeState = worktreesResult
      ? parseLaunchWorktreeBranches(worktreesResult.stdout, repositoryRoot)
      : { branches: new Map<string, 'current' | 'elsewhere' | 'conflict'>(), currentWorktreeFound: false }
    const projectedBranches = branches.map((branch) => {
      const location = worktreeState.branches.get(branch.ref)
      let worktree: GitLaunchBranchReference['worktree']
      if (head.kind === 'branch' && branch.ref === head.ref) worktree = 'current'
      else if (location === 'elsewhere') worktree = 'elsewhere'
      else if (location === 'current' || location === 'conflict') worktree = 'unknown'
      else if (worktreeComplete && worktreeState.currentWorktreeFound) worktree = 'available'
      else worktree = 'unknown'
      return { ...branch, worktree }
    })

    return {
      repository: {
        kind: 'repository',
        workspaceScope:
          relative(repositoryRoot, canonicalWorkspace) === '' ? 'repository-root' : 'repository-subdirectory',
        head,
      },
      branches: projectedBranches,
      incomplete: refsSnapshot.incomplete || refsOverCap || refsResult.truncated,
    }
  }

  async diffToRemote(cwd?: string, signal?: AbortSignal, paths: string[] = []) {
    const path = await this.resolveWithinRoot(cwd)
    const status = await this.status(path, signal)
    const base = await this.remoteBase(path, status, signal)
    if (!base) return null
    const requestedPaths = paths.map(pathSpec)
    const trackedArgs = ['diff', '--no-ext-diff', base.reference]
    if (requestedPaths.length) trackedArgs.push('--', ...requestedPaths)
    const tracked = await this.run(path, trackedArgs, signal)
    const untracked = await this.tryRun(path, ['ls-files', '--others', '--exclude-standard', '-z'], signal)
    const untrackedPaths = (untracked?.stdout ?? '')
      .split('\0')
      .filter(Boolean)
      .filter((candidate) => !requestedPaths.length || requestedPaths.some((selected) => candidate === selected || candidate.startsWith(`${selected}/`)))
    const extra = await this.untrackedDiff(path, untrackedPaths, signal)
    const diff = `${tracked.stdout}${extra.diff}`
    const truncated = tracked.truncated || extra.truncated || diff.length > this.config.maxOutputBytes
    return {
      sha: base.sha,
      diff: diff.slice(0, this.config.maxOutputBytes),
      truncated,
    }
  }

  async info(cwd?: string, signal?: AbortSignal): Promise<GitInfo> {
    const status = await this.status(cwd, signal)
    return gitInfoSchema.parse({ sha: status.head, branch: status.branch, originUrl: status.originUrl })
  }
}

const cwdSchema = z.object({ cwd: z.string().min(1).max(MAX_PATH).optional() })
const remoteDiffArgs = cwdSchema.extend({ paths: z.array(z.string().min(1).max(MAX_PATH)).max(100).default([]) })
const diffArgs = cwdSchema.extend({ cached: z.boolean().default(false), paths: z.array(z.string().min(1).max(MAX_PATH)).max(100).default([]) })
const logArgs = cwdSchema.extend({ limit: z.number().int().min(1).max(MAX_LOG).default(20) })
const statsArgs = cwdSchema.extend({
  from: z.number().int().nonnegative().optional(),
  to: z.number().int().positive().optional(),
  bucketMs: z.number().int().min(60_000).max(2_592_000_000).default(86_400_000),
  maxBuckets: z.number().int().min(1).max(1_000).default(120),
  sources: z.array(z.enum(['auto', 'manual', 'external'])).min(1).max(3).default(['auto', 'manual', 'external']),
})
const commitArgs = cwdSchema.extend({ message: z.string().trim().min(1).max(4_000), paths: z.array(z.string().min(1).max(MAX_PATH)).max(100).default([]), stage: z.boolean().default(false) })
const branchArgs = cwdSchema.extend({ operation: z.enum(['list', 'create', 'switch', 'delete']).default('list'), name: z.string().trim().min(1).max(1_000).optional(), force: z.boolean().default(false) })
const worktreeArgs = cwdSchema.extend({ operation: z.enum(['list', 'add', 'remove']).default('list'), path: z.string().min(1).max(MAX_PATH).optional(), branch: z.string().trim().min(1).max(1_000).optional(), createBranch: z.boolean().default(false), force: z.boolean().default(false) })

function toolResult(value: unknown) {
  return { text: JSON.stringify(value), details: value }
}

function scopedTool(runtime: GitRuntime, context: { workspace: { path: string } }) {
  return runtime.scoped(context.workspace.path)
}

export function gitTools(runtime: GitRuntime): ToolDefinition[] {
  const tools: ToolDefinition[] = [
    { name: 'git_info', description: 'Read the current Git commit, branch, and sanitized origin metadata.', inputSchema: cwdSchema, effect: 'read', requiresProcess: true, workspaceAccess: { kind: 'workspace' }, execute: async (args, context) => { const parsed = cwdSchema.parse(args); return toolResult(await scopedTool(runtime, context).info(parsed.cwd, context.signal)) } },
    { name: 'git_status', description: 'Inspect the current Git repository status, branch, upstream, and sanitized origin URL.', inputSchema: cwdSchema, effect: 'read', requiresProcess: true, workspaceAccess: { kind: 'workspace' }, execute: async (args, context) => { const parsed = cwdSchema.parse(args); return toolResult(await scopedTool(runtime, context).status(parsed.cwd, context.signal)) } },
    { name: 'git_diff', description: 'Read a bounded Git diff for the workspace. Paths are relative to the workspace.', inputSchema: diffArgs, effect: 'read', requiresProcess: true, workspaceAccess: { kind: 'workspace' }, execute: async (args, context) => { const parsed = diffArgs.parse(args); return toolResult(await scopedTool(runtime, context).diff(parsed.cwd, parsed, context.signal)) } },
    { name: 'git_log', description: 'Read recent Git commits from the workspace.', inputSchema: logArgs, effect: 'read', requiresProcess: true, workspaceAccess: { kind: 'workspace' }, execute: async (args, context) => { const parsed = logArgs.parse(args); return toolResult(await scopedTool(runtime, context).log(parsed.cwd, parsed.limit, context.signal)) } },
    { name: 'git_stats', description: 'Read bounded first-parent Git commit, file, and line statistics grouped by explicit source.', inputSchema: statsArgs, effect: 'read', requiresProcess: true, workspaceAccess: { kind: 'workspace' }, execute: async (args, context) => { const parsed = statsArgs.parse(args); return toolResult(await scopedTool(runtime, context).stats(parsed.cwd, parsed, context.signal)) } },
    { name: 'git_diff_to_remote', description: 'Read the diff from the current HEAD to its configured upstream branch.', inputSchema: remoteDiffArgs, effect: 'read', requiresProcess: true, workspaceAccess: { kind: 'workspace' }, execute: async (args, context) => { const parsed = remoteDiffArgs.parse(args); return toolResult(await scopedTool(runtime, context).diffToRemote(parsed.cwd, context.signal, parsed.paths)) } },
    { name: 'git_commit', description: 'Create a Git commit. This is a write operation and requires approval.', inputSchema: commitArgs, effect: 'write', requiresProcess: true, workspaceAccess: { kind: 'workspace' }, execute: async (args, context) => { const parsed = commitArgs.parse(args); return toolResult(await scopedTool(runtime, context).commit(parsed.cwd, { ...parsed, provenance: { source: 'auto', sessionId: context.session.id, runId: context.run.id, operationId: context.callId } }, context.signal)) } },
    { name: 'git_stage', description: 'Stage bounded workspace paths for the next Git commit. Requires approval.', inputSchema: cwdSchema.extend({ paths: z.array(z.string().min(1).max(MAX_PATH)).min(1).max(100) }), effect: 'write', requiresProcess: true, workspaceAccess: { kind: 'workspace' }, execute: async (args, context) => { const parsed = cwdSchema.extend({ paths: z.array(z.string().min(1).max(MAX_PATH)).min(1).max(100) }).parse(args); return toolResult(await scopedTool(runtime, context).stage(parsed.cwd, parsed.paths, context.signal)) } },
    { name: 'git_unstage', description: 'Remove bounded workspace paths from the Git index. Requires approval.', inputSchema: cwdSchema.extend({ paths: z.array(z.string().min(1).max(MAX_PATH)).min(1).max(100) }), effect: 'write', requiresProcess: true, workspaceAccess: { kind: 'workspace' }, execute: async (args, context) => { const parsed = cwdSchema.extend({ paths: z.array(z.string().min(1).max(MAX_PATH)).min(1).max(100) }).parse(args); return toolResult(await scopedTool(runtime, context).unstage(parsed.cwd, parsed.paths, context.signal)) } },
    { name: 'git_branch', description: 'List or mutate Git branches. Mutations require approval.', inputSchema: branchArgs, effect: 'write', requiresProcess: true, workspaceAccess: { kind: 'workspace' }, execute: async (args, context) => { const parsed = branchArgs.parse(args); if (parsed.operation !== 'list' && !parsed.name) throw new HbarError('GIT_INVALID_BRANCH', 'name is required for branch mutations'); return toolResult(await scopedTool(runtime, context).branch(parsed.cwd, parsed.operation === 'list' ? {} : { operation: parsed.operation, name: parsed.name!, force: parsed.force }, context.signal)) } },
    { name: 'git_worktree', description: 'List, create, or remove bounded Git worktrees. Mutations require approval.', inputSchema: worktreeArgs, effect: 'write', requiresProcess: true, workspaceAccess: { kind: 'workspace' }, execute: async (args, context) => { const parsed = worktreeArgs.parse(args); if (parsed.operation !== 'list' && !parsed.path) throw new HbarError('GIT_WORKTREE_PATH', 'path is required for worktree mutations'); const operation = parsed.operation === 'list' ? {} : parsed.operation === 'add' ? { operation: 'add' as const, path: parsed.path!, branch: parsed.branch, createBranch: parsed.createBranch } : { operation: 'remove' as const, path: parsed.path!, force: parsed.force }; return toolResult(await scopedTool(runtime, context).worktree(parsed.cwd, operation, context.signal)) } },
  ]
  return tools
}

export const gitPlugin = definePlugin({
  manifest: {
    id: 'git.codex',
    packageName: '@hbar/git',
    name: 'Codex Git management',
    version: '1.0.0',
    apiVersion: '^1.0.0',
    description: 'Bounded Git metadata, status, diff, history, commit, branch, and worktree operations',
    scope: 'host',
    required: true,
    provides: { git: '1.0.0' },
    requires: { 'workspace-directories': '^1.0.0' },
    permissions: ['fs', 'process'],
  },
  configSchema: gitConfigSchema,
  async apply(ctx, rawConfig) {
    const config = gitConfigSchema.parse(rawConfig)
    const root = ctx.hbar.api.scope.kind === 'host' ? process.cwd() : process.cwd()
    const runtime = new GitRuntime(root, config, new ProcessGitRunner(), true, (cwd) =>
      ctx.hbar.api.notify({ method: 'git.changed', params: { cwd } }),
    )
    provide<GitService>(ctx, 'git', runtime)
    const directories = ctx.hbar.api.service<WorkspaceDirectoryService>('workspace-directories')
    for (const tool of gitTools(runtime))
      ctx.hbar.api.tools.register({
        ...tool,
        async execute(args, context) {
          const path = await directories.resolve(context.workspace.path, typeof args.cwd === 'string' ? args.cwd : '.')
          context.signal.throwIfAborted()
          return tool.execute({ ...args, cwd: '.' }, { ...context, workspace: { ...context.workspace, path } })
        },
      })
  },
})

export default gitPlugin
