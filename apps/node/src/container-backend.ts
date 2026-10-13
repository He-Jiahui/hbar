import { chmod, lstat, mkdir, open, rename, unlink } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { HbarError } from '@hbar/contracts'
import type { NodeExecutionBackend, NodeExecutionBackendOptions, NodeArgvResult } from '@hbar/node-core'
import { createRuntimeProcessTreePort } from '@hbar/runtime-native'
import type { ToolResult } from '@hbar/plugin-sdk'
import {
  containerExecutablePath,
  prepareContainerConfinement,
  probeContainerConfinement,
  type ContainerCapabilities,
  type ContainerConfinementConfig,
} from './container-confinement'

interface JournalRecord {
  readonly jobId: string
  readonly name: string
  readonly active: boolean
}
interface CliResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
  readonly truncated: boolean
  readonly timedOut: boolean
}
const journalFileName = 'container-jobs.jsonl'
const ownedLabel = 'io.hbar.node.owner'
const maxCapturedBytes = 64_000
const maxJournalBytes = 64 * 1024
const maxJournalRecords = 64
const maxJournalJobs = 48
const validId = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/

function curatedEnvironment(
  allowlist: readonly string[],
  overrides: Readonly<Record<string, string>>,
): Record<string, string> {
  const allowed = new Set(allowlist.map((name) => name.toLowerCase()))
  const result: Record<string, string> = {}
  for (const [name, value] of Object.entries(process.env))
    if (value !== undefined && allowed.has(name.toLowerCase())) result[name] = value
  for (const [name, value] of Object.entries(overrides)) {
    if (/^(?:PATH|PATHEXT|LD_PRELOAD|LD_LIBRARY_PATH|DYLD_.*|BASH_ENV|ENV|NODE_OPTIONS)$/i.test(name))
      throw new HbarError('NODE_DENIED', 'Unsafe snapshot environment variable')
    for (const inherited of Object.keys(result))
      if (inherited.toLowerCase() === name.toLowerCase()) delete result[inherited]
    result[name] = value
  }
  return result
}

function jsonRecord(value: unknown): JournalRecord | undefined {
  if (!value || typeof value !== 'object') return undefined
  const item = value as Record<string, unknown>
  if (typeof item.jobId !== 'string' || !validId.test(item.jobId)) return undefined
  if (item.name !== `hbar-node-${item.jobId}` || typeof item.active !== 'boolean') return undefined
  return { jobId: item.jobId, name: item.name, active: item.active }
}
export async function readContainerJournal(path: string): Promise<Map<string, JournalRecord>> {
  let info
  try {
    info = await lstat(path)
  } catch (error) {
    if (error instanceof Error && 'code' in error && String(error.code) === 'ENOENT') return new Map()
    throw error
  }
  if (!info.isFile() || info.isSymbolicLink() || info.size > maxJournalBytes)
    throw new HbarError('SANDBOX_BACKEND_UNAVAILABLE', 'Container ownership journal is not a bounded regular file')
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  let contents: string
  try {
    const current = await handle.stat()
    if (!current.isFile() || current.size > maxJournalBytes)
      throw new HbarError(
        'SANDBOX_BACKEND_UNAVAILABLE',
        'Container ownership journal changed or exceeded its size limit',
      )
    const bounded = Buffer.alloc(maxJournalBytes + 1)
    let offset = 0
    while (offset < bounded.byteLength) {
      const { bytesRead } = await handle.read(bounded, offset, bounded.byteLength - offset, offset)
      if (bytesRead === 0) break
      offset += bytesRead
    }
    if (offset > maxJournalBytes)
      throw new HbarError(
        'SANDBOX_BACKEND_UNAVAILABLE',
        'Container ownership journal exceeded its size limit while being read',
      )
    contents = bounded.subarray(0, offset).toString('utf8')
  } finally {
    await handle.close()
  }
  const records = new Map<string, JournalRecord>()
  for (const line of contents.split('\n').filter(Boolean)) {
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      throw new HbarError('SANDBOX_BACKEND_UNAVAILABLE', 'Container ownership journal is malformed')
    }
    const record = jsonRecord(parsed)
    if (!record)
      throw new HbarError('SANDBOX_BACKEND_UNAVAILABLE', 'Container ownership journal contains an invalid owner record')
    records.delete(record.jobId)
    records.set(record.jobId, record)
  }
  if (records.size > maxJournalRecords)
    throw new HbarError('SANDBOX_BACKEND_UNAVAILABLE', 'Container ownership journal exceeded its record limit')
  return records
}

async function compactJournal(path: string, records: ReadonlyMap<string, JournalRecord>): Promise<void> {
  const latest = [...records.values()]
  if (latest.length > maxJournalRecords)
    throw new HbarError('SANDBOX_BACKEND_UNAVAILABLE', 'Container journal record limit reached')
  const contents = latest.map((record) => JSON.stringify(record)).join('\n') + (latest.length ? '\n' : '')
  if (Buffer.byteLength(contents) > maxJournalBytes)
    throw new HbarError('SANDBOX_BACKEND_UNAVAILABLE', 'Container journal byte limit reached')
  const temporary = `${path}.${crypto.randomUUID()}.tmp`
  const handle = await open(
    temporary,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
    0o600,
  )
  let committed = false
  try {
    try {
      await handle.writeFile(contents, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporary, path)
    committed = true
    if (process.platform === 'linux') {
      const directory = await open(dirname(path), constants.O_RDONLY)
      try {
        await directory.sync()
      } finally {
        await directory.close()
      }
    }
  } finally {
    if (!committed) await unlink(temporary).catch(() => undefined)
  }
}

async function appendJournal(path: string, records: Map<string, JournalRecord>, record: JournalRecord): Promise<void> {
  records.delete(record.jobId)
  records.set(record.jobId, record)
  while (records.size > maxJournalJobs) {
    const inactive = [...records].find(([, value]) => !value.active)
    if (!inactive) throw new HbarError('NODE_BUSY', 'Too many active container jobs for the bounded recovery journal')
    records.delete(inactive[0])
  }
  await compactJournal(path, records)
}
export function createJournalWriter(
  path: string,
  records: Map<string, JournalRecord>,
): (record: JournalRecord) => Promise<void> {
  let tail = Promise.resolve()
  return (record) => {
    const write = tail.then(async () => await appendJournal(path, records, record))
    tail = write.then(
      () => undefined,
      () => undefined,
    )
    return write
  }
}
export interface ContainerReaperPort {
  readonly stopOwner: () => Promise<void>
  readonly inspect: () => Promise<'absent' | 'owned' | 'foreign'>
  readonly remove: () => Promise<void>
  readonly delay?: (milliseconds: number) => Promise<void>
  /** True only after a normal owner result proves no asynchronous create request remains in flight. */
  readonly creationKnownAbsent?: boolean
}
/** Absence is conclusive only after a closed creation lifecycle or an observed and removed owned container. */
export async function reapContainerAfterOwner(port: ContainerReaperPort, timeoutMs = 5_000): Promise<void> {
  await port.stopOwner()
  const delay = port.delay ?? Bun.sleep
  const deadline = Date.now() + timeoutMs
  let absentCount = 0
  let removalAttempted = false
  let wasOwned = false
  while (Date.now() < deadline) {
    const state = await port.inspect()
    if (state === 'foreign') throw new Error('The container no longer has its exact B ownership labels')
    if (state === 'owned') {
      if (removalAttempted) throw new Error('The engine did not remove the owned container')
      wasOwned = true
      removalAttempted = true
      await port.remove()
      absentCount = 0
      continue
    }
    if (wasOwned) return
    absentCount++
    if (absentCount >= 10) {
      if (port.creationKnownAbsent) return
      throw new Error('Container absence is unconfirmed because its engine creation request may still settle')
    }
    await delay(100)
  }
  throw new Error('The engine did not confirm container absence before the cleanup deadline')
}
async function runCli(argv: readonly [string, ...string[]], timeoutMs: number): Promise<CliResult> {
  const child = Bun.spawn([...argv], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
    windowsHide: true,
  })
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    child.kill('SIGKILL')
  }, timeoutMs)
  const capture = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader()
    let bytes = Buffer.alloc(0)
    let truncated = false
    try {
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        bytes = Buffer.concat([bytes, chunk.value])
        if (bytes.byteLength > maxCapturedBytes) {
          bytes = bytes.subarray(bytes.byteLength - maxCapturedBytes)
          truncated = true
        }
      }
    } finally {
      reader.releaseLock()
    }
    return { text: bytes.toString('utf8'), truncated }
  }
  try {
    const [stdout, stderr, code] = await Promise.all([capture(child.stdout), capture(child.stderr), child.exited])
    return { code, stdout: stdout.text, stderr: stderr.text, truncated: stdout.truncated || stderr.truncated, timedOut }
  } finally {
    clearTimeout(timeout)
  }
}

async function inspectOwned(engine: string, job: JournalRecord): Promise<'absent' | 'owned' | 'foreign'> {
  const result = await runCli(
    [
      engine,
      'inspect',
      '--format',
      `{{.Name}}\t{{index .Config.Labels "${ownedLabel}"}}\t{{index .Config.Labels "io.hbar.node.job"}}`,
      job.name,
    ],
    2_000,
  )
  if (result.code !== 0) {
    if (/no such (object|container)|not found/i.test(result.stderr)) return 'absent'
    throw new Error(`Could not verify ownership of container ${job.name}`)
  }
  return result.stdout.trim() === `/${job.name}\ttrue\t${job.jobId}` ||
    result.stdout.trim() === `${job.name}\ttrue\t${job.jobId}`
    ? 'owned'
    : 'foreign'
}

/** A container execution backend owns a private durable journal and joins engine cleanup before settling calls. */
export async function createContainerNodeBackend(config: ContainerConfinementConfig): Promise<NodeExecutionBackend> {
  const capabilities = await probeContainerConfinement(config)
  if (!capabilities.available)
    throw new HbarError('SANDBOX_BACKEND_UNAVAILABLE', capabilities.reason ?? 'Container confinement is unavailable')
  if (!isAbsolute(config.dataRoot))
    throw new HbarError('SANDBOX_BACKEND_UNAVAILABLE', 'Container data root must be absolute')
  const engine = containerExecutablePath(config.engine)
  if (!engine)
    throw new HbarError('SANDBOX_BACKEND_UNAVAILABLE', 'Container engine disappeared after capability probing')
  const root = join(config.dataRoot, 'container-execution')
  await mkdir(root, { recursive: true, mode: 0o700 })
  await chmod(root, 0o700)
  const journal = join(root, journalFileName)
  const latest = await readContainerJournal(journal)
  const writeJournal = createJournalWriter(journal, latest)
  for (const record of latest.values()) {
    if (!record.active) continue
    try {
      await reapContainerAfterOwner({
        stopOwner: async () => undefined,
        inspect: async () => await inspectOwned(engine, record),
        creationKnownAbsent: true,
        remove: async () => {
          const removed = await runCli([engine, 'rm', '-f', record.name], 5_000)
          if (removed.code !== 0) throw new Error('Could not reap the journaled container')
        },
      })
    } catch (error) {
      throw new HbarError(
        'SANDBOX_BACKEND_UNAVAILABLE',
        error instanceof Error ? error.message : 'Could not recover a journaled container',
      )
    }
    await writeJournal({ ...record, active: false })
  }

  const processTree = createRuntimeProcessTreePort()
  const owners = new Set<Bun.Subprocess>()
  const limit = config.maxConcurrentJobs ?? 2
  let closed = false
  const active = new Set<string>()
  const runningCalls = new Set<Promise<NodeArgvResult>>()
  let backendFailure: unknown
  const execute = async (
    workspace: string,
    operation:
      | { readonly kind: 'command'; readonly command: string }
      | { readonly kind: 'argv'; readonly argv: readonly [string, ...string[]] },
    signal: AbortSignal,
    options: NodeExecutionBackendOptions,
  ): Promise<NodeArgvResult> => {
    if (closed) throw new HbarError('NODE_OFFLINE', 'Container execution backend is closed')
    if (backendFailure !== undefined)
      throw new HbarError(
        'SANDBOX_BACKEND_UNAVAILABLE',
        'A previous container could not be conclusively reaped; execution is disabled until B restarts',
        { cause: backendFailure },
      )
    if (active.size >= limit) throw new HbarError('NODE_BUSY', 'Container execution concurrency limit is full')
    if (!options.confinement)
      throw new HbarError('SANDBOX_BACKEND_UNAVAILABLE', 'Container execution requires an explicit confinement floor')
    signal.throwIfAborted()
    const environment = curatedEnvironment(options.environmentAllowlist, options.environment)
    const jobId = crypto.randomUUID()
    active.add(jobId)
    let plan: Awaited<ReturnType<typeof prepareContainerConfinement>>
    try {
      plan = await prepareContainerConfinement(
        config,
        {
          operation,
          cwd: workspace,
          environment,
          confinement: options.confinement,
          protectedPaths: options.protectedPaths,
          ...(options.readOnlyPaths !== undefined ? { readOnlyPaths: options.readOnlyPaths } : {}),
        },
        jobId,
      )
    } catch (error) {
      active.delete(jobId)
      throw error
    }
    try {
      signal.throwIfAborted()
    } catch (error) {
      active.delete(jobId)
      await plan.cleanup()
      throw error
    }
    const journalRecord = { jobId, name: plan.name, active: true }
    try {
      await writeJournal(journalRecord)
    } catch (error) {
      active.delete(jobId)
      await plan.cleanup()
      throw error
    }
    let child: Bun.Subprocess<'ignore', 'pipe', 'pipe'> | undefined
    let tree: Awaited<ReturnType<typeof processTree.attach>> | undefined
    let treeAttach: Promise<Awaited<ReturnType<typeof processTree.attach>>> | undefined
    let timedOut = false
    let cliLifecycleConfirmed = false
    let cleanupTask: Promise<void> | undefined
    let reaped = false
    const removeAndJoin = () =>
      (cleanupTask ??= (async () => {
        if (child?.exitCode === null) child.kill('SIGKILL')
        await child?.exited.catch(() => 0)
        if (treeAttach) tree = await treeAttach.catch(() => undefined)
        if (tree) {
          tree.terminate()
          await tree.join(Math.max(5_000, Math.min(options.timeoutMs, 30_000)))
          tree.close()
          tree = undefined
        }
        await reapContainerAfterOwner(
          {
            stopOwner: async () => undefined,
            inspect: async () => await inspectOwned(engine, journalRecord),
            creationKnownAbsent: !child || (cliLifecycleConfirmed && !signal.aborted && !timedOut),
            remove: async () => {
              const removed = await runCli([engine, 'rm', '-f', plan.name], 8_000)
              if (removed.code !== 0) throw new Error('The engine did not confirm force removal of the job container')
            },
          },
          8_000,
        )
        await writeJournal({ ...journalRecord, active: false })
        reaped = true
      })())
    const abort = () => {
      void removeAndJoin().catch(() => undefined)
    }
    const timeout = setTimeout(() => {
      timedOut = true
      abort()
    }, options.timeoutMs)
    signal.addEventListener('abort', abort, { once: true })
    let result: NodeArgvResult | undefined
    let executionError: unknown
    try {
      signal.throwIfAborted()
      child = Bun.spawn([...plan.argv], {
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        detached: process.platform !== 'win32',
        windowsHide: true,
      })
      owners.add(child)
      treeAttach = processTree.attach(child.pid, signal)
      tree = await treeAttach
      if (signal.aborted) abort()
      const output = await runCapture(child, options.timeoutMs + 8_000, options.onOutput)
      if (timedOut) result = { ...output, exitCode: 124, timedOut: true }
      else {
        cliLifecycleConfirmed = output.exitCode !== 125
        signal.throwIfAborted()
        result = output
      }
    } catch (error) {
      executionError = signal.aborted
        ? new HbarError('CANCELLED', 'Container execution cancelled')
        : new HbarError('EFFECT_UNKNOWN', 'Container execution stopped without a settled receipt', { cause: error })
    }
    clearTimeout(timeout)
    signal.removeEventListener('abort', abort)
    let cleanupError: unknown
    try {
      await removeAndJoin()
    } catch (error) {
      backendFailure = error
      cleanupError = error
    }
    if (child) owners.delete(child)
    active.delete(jobId)
    if (reaped) await plan.cleanup()
    if (cleanupError !== undefined)
      throw new HbarError(
        'EFFECT_UNKNOWN',
        'Container ownership could not be conclusively released; its journal record remains active',
        { cause: cleanupError },
      )
    if (executionError !== undefined) throw executionError
    if (!result) throw new HbarError('EFFECT_UNKNOWN', 'Container execution completed without a result')
    return result
  }

  const invoke = async (
    workspace: string,
    operation:
      | { readonly kind: 'command'; readonly command: string }
      | { readonly kind: 'argv'; readonly argv: readonly [string, ...string[]] },
    signal: AbortSignal,
    options: NodeExecutionBackendOptions,
  ): Promise<NodeArgvResult> => {
    const task = execute(workspace, operation, signal, options)
    runningCalls.add(task)
    try {
      return await task
    } finally {
      runningCalls.delete(task)
    }
  }
  return {
    name: 'container',
    filesystem: capabilities.filesystem,
    network: capabilities.network,
    processTree: capabilities.processTree,
    async exec(workspace, command, signal, options): Promise<ToolResult> {
      const result = await invoke(workspace, { kind: 'command', command }, signal, options)
      return {
        text: [result.stdout, result.stderr].filter(Boolean).join('\n'),
        isError: result.exitCode !== 0,
        details: result,
      }
    },
    async execArgv(workspace, argv, signal, options) {
      return await invoke(workspace, { kind: 'argv', argv }, signal, options)
    },
    async dispose() {
      closed = true
      for (const child of owners) child.kill('SIGKILL')
      await Promise.all(
        [...runningCalls].map((task) =>
          task.then(
            () => undefined,
            () => undefined,
          ),
        ),
      )
    },
  }
}

async function runCapture(
  child: Bun.Subprocess<'ignore', 'pipe', 'pipe'>,
  timeoutMs: number,
  onOutput?: (text: string) => void,
): Promise<NodeArgvResult> {
  let stdout = Buffer.alloc(0)
  let stderr = Buffer.alloc(0)
  let truncated = false
  const collect = async (stream: ReadableStream<Uint8Array>, target: 'stdout' | 'stderr') => {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    try {
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        const text = decoder.decode(chunk.value, { stream: true })
        if (text) {
          try {
            onOutput?.(text)
          } catch {
            /* Keep draining after an output observer failure. */
          }
        }
        const bytes = target === 'stdout' ? stdout : stderr
        const next = Buffer.concat([bytes, chunk.value])
        if (next.byteLength > 32_000) truncated = true
        const kept = next.byteLength > 32_000 ? next.subarray(next.byteLength - 32_000) : next
        if (target === 'stdout') stdout = kept
        else stderr = kept
      }
    } finally {
      const remainder = decoder.decode()
      if (remainder) {
        try {
          onOutput?.(remainder)
        } catch {
          /* The final result is independent of transient output. */
        }
      }
      reader.releaseLock()
    }
  }
  const timeout = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
  try {
    const [, , exitCode] = await Promise.all([
      collect(child.stdout, 'stdout'),
      collect(child.stderr, 'stderr'),
      child.exited,
    ])
    return { stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8'), exitCode, truncated }
  } finally {
    clearTimeout(timeout)
  }
}

export type { ContainerCapabilities }
