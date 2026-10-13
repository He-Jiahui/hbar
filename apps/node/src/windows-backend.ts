import { access, constants, mkdir } from 'node:fs/promises'
import { delimiter, isAbsolute, join, resolve, sep } from 'node:path'
import type { NodeExecutionBackend, NodeExecutionBackendOptions, NodeArgvResult } from '@hbar/node-core'
import type { ToolResult } from '@hbar/plugin-sdk'
import { HbarError } from '@hbar/contracts'
import { NODE_LIMITS } from '@hbar/contracts/node'
import { loadSandboxNative, type SandboxNativePort } from '@hbar/local-tools/sandbox-native'

export interface WindowsBackendProbe {
  readonly available: boolean
  readonly filesystem: boolean
  readonly network: boolean
  readonly processTree: boolean
  readonly reason?: string
}

export interface WindowsBackendOptions {
  /** B-owned persistent data root. Never derive this from request data. */
  readonly dataRoot: string
  /** B process environment captured by the host at backend construction. */
  readonly bEnvironment?: Readonly<Record<string, string | undefined>>
  readonly native?: SandboxNativePort
}

const unavailable = (reason: string): never => {
  throw new HbarError('SANDBOX_BACKEND_UNAVAILABLE', reason)
}
const cleanupBudgetMs = 10_000
const unknownEffect = (message: string, cause?: unknown): HbarError =>
  new HbarError('EFFECT_UNKNOWN', message, cause instanceof Error ? { cause } : undefined)

export async function terminateAndAwaitRelease(
  native: SandboxNativePort,
  handleId: string,
  budgetMs = cleanupBudgetMs,
): Promise<void> {
  const deadline = Date.now() + budgetMs
  let terminationError: unknown
  try {
    native.terminateSandboxed(handleId)
  } catch (error) {
    terminationError = error
  }
  while (Date.now() < deadline) {
    try {
      if (native.pollSandboxed(handleId).exitCode !== undefined) return
    } catch (error) {
      throw unknownEffect('Windows process release could not be confirmed; durable lease recovery is required', error)
    }
    await Bun.sleep(20)
  }
  throw unknownEffect(
    'Windows process did not release within the cleanup budget; durable lease recovery is required',
    terminationError,
  )
}

export function validateWindowsArgv(argv: readonly [string, ...string[]]): void {
  if (
    argv.length > 128 ||
    argv.some((argument) => argument.includes('\0') || argument.length > NODE_LIMITS.commandCharacters) ||
    argv.reduce((total, argument) => total + Buffer.byteLength(argument, 'utf8'), 0) > 65_536
  )
    throw new HbarError('INVALID_INPUT', 'Windows argv exceeds the bounded literal argument contract')
}

const safeWindowsDefaults = [
  'PATH',
  'PATHEXT',
  'SYSTEMROOT',
  'WINDIR',
  'COMSPEC',
  'TEMP',
  'TMP',
  'SYSTEMDRIVE',
] as const

export function buildWindowsChildEnvironment(
  options: NodeExecutionBackendOptions,
  bEnvironment: Readonly<Record<string, string | undefined>> = process.env,
): { base: Record<string, string>; overrides: Record<string, string> } {
  const allowed = new Set(options.environmentAllowlist.map((name) => name.toUpperCase()))
  const bValues = new Map(
    Object.entries(bEnvironment)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([name, value]) => [name.toUpperCase(), value]),
  )
  const base: Record<string, string> = {}
  for (const name of allowed) {
    const value = bValues.get(name)
    if (value !== undefined && !/^(?:LD_PRELOAD|LD_LIBRARY_PATH|DYLD_.*|BASH_ENV|ENV|NODE_OPTIONS)$/i.test(name))
      base[name] = value
  }
  for (const name of safeWindowsDefaults) {
    const value = bValues.get(name)
    if (value !== undefined) base[name] = value
  }
  const overrides: Record<string, string> = {}
  for (const [name, value] of Object.entries(options.environment)) {
    if (/^(?:PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|NODE_OPTIONS|BASH_ENV|ENV)$/i.test(name))
      throw new HbarError('NODE_DENIED', 'Unsafe snapshot environment variable')
    if (!allowed.has(name.toUpperCase())) continue
    overrides[name.toUpperCase()] = value
  }
  return { base, overrides }
}

export async function resolveWindowsProgram(
  workspace: string,
  argv: readonly [string, ...string[]],
  environment: Readonly<Record<string, string>>,
): Promise<readonly [string, ...string[]]> {
  validateWindowsArgv(argv)
  const requested = argv[0]
  const candidates: string[] = []
  if (isAbsolute(requested)) candidates.push(requested)
  else if (requested.includes(sep) || requested.includes('/')) candidates.push(resolve(workspace, requested))
  else {
    const extensions = requested.includes('.') ? [''] : (environment.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';')
    for (const directory of (environment.PATH ?? '').split(delimiter).filter(Boolean))
      for (const extension of extensions) candidates.push(resolve(directory, `${requested}${extension}`))
  }
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.F_OK)
      return [candidate, ...argv.slice(1)]
    } catch {
      /* continue through B's curated program path */
    }
  }
  throw new HbarError('NODE_PROGRAM_NOT_FOUND', 'The requested program is not available on the B node')
}
function boundedText(value: string, maxBytes: number): { text: string; truncated: boolean } {
  const bytes = Buffer.from(value)
  if (bytes.length <= maxBytes) return { text: value, truncated: false }
  let start = bytes.length - maxBytes
  while (start < bytes.length && ((bytes[start] ?? 0) & 0xc0) === 0x80) start++
  return { text: bytes.subarray(start).toString('utf8'), truncated: true }
}

export function probeWindowsBackend(native: SandboxNativePort): WindowsBackendProbe {
  if (process.platform !== 'win32')
    return { available: false, filesystem: false, network: false, processTree: false, reason: 'Windows-only backend' }
  try {
    const result = native.probeConfinement()
    const available =
      native.isAvailable() && result.available && result.filesystem && result.network && result.processTree
    return {
      available,
      filesystem: result.filesystem,
      network: result.network,
      processTree: result.processTree,
      ...(!available
        ? {
            reason:
              result.reason ?? 'Required AppContainer filesystem, network, and Job Object probes did not all pass',
          }
        : {}),
    }
  } catch (error) {
    return {
      available: false,
      filesystem: false,
      network: false,
      processTree: false,
      reason: error instanceof Error ? error.message : 'Native probe failed',
    }
  }
}

export async function createWindowsExecutionBackend(options: WindowsBackendOptions): Promise<NodeExecutionBackend> {
  const dataRoot = resolve(options.dataRoot)
  if (!isAbsolute(options.dataRoot)) throw new TypeError('B dataRoot must be an absolute path')
  const journalDirectory = join(dataRoot, 'sandbox-lease-journal')
  await mkdir(journalDirectory, { recursive: true })
  const bEnvironment = Object.freeze({ ...(options.bEnvironment ?? process.env) })
  let native = options.native
  let loadFailure: string | undefined
  if (!native && process.platform === 'win32') {
    try {
      native = loadSandboxNative()
    } catch (error) {
      loadFailure = error instanceof Error ? error.message : 'Windows sandbox module could not be loaded'
    }
  }
  const capabilities = native
    ? probeWindowsBackend(native)
    : {
        available: false,
        filesystem: false,
        network: false,
        processTree: false,
        reason: loadFailure ?? 'Windows sandbox is unsupported on this platform',
      }
  const active = new Map<string, { released: boolean; cancel?: () => void }>()
  let disabledReason: string | undefined

  async function releaseHandle(handleId: string, entry: { released: boolean }): Promise<void> {
    if (!native) throw unknownEffect('Windows process release cannot be confirmed without its native port')
    await terminateAndAwaitRelease(native, handleId)
    entry.released = true
    active.delete(handleId)
  }

  async function execArgv(
    workspace: string,
    argv: readonly [string, ...string[]],
    signal: AbortSignal,
    opts: NodeExecutionBackendOptions,
  ): Promise<NodeArgvResult> {
    signal.throwIfAborted()
    if (opts.workspaceMounts?.length)
      return unavailable('The Windows backend cannot expose a same-node multi-root workspace view')
    if (!isAbsolute(workspace))
      throw new HbarError('INVALID_INPUT', 'Windows workspace must be an absolute B-owned path')
    if (disabledReason) return unavailable(disabledReason)
    if (!native || !capabilities.available) return unavailable(capabilities.reason ?? 'Native capability probe failed')
    if (!opts.confinement) return unavailable('A resolved confinement profile is required')
    const confinement = opts.confinement
    const environment = buildWindowsChildEnvironment(opts, bEnvironment)
    const resolvedArgv = await resolveWindowsProgram(workspace, argv, environment.base)
    const handle = await native.spawnSandboxed(
      {
        workspaceRoot: workspace,
        writableRoots: [...confinement.writableRoots],
        readableRoots: [...confinement.readableRoots],
        protectedPaths: [...opts.protectedPaths],
        readOnlyPaths: [...(opts.readOnlyPaths ?? [])],
        networkEnabled: confinement.networkEnabled,
        envOverrides: environment.overrides,
        environment: environment.base,
        environmentAllowlist: [...opts.environmentAllowlist],
        level: 'Unelevated',
      },
      resolvedArgv,
      workspace,
      journalDirectory,
    )
    const entry: { released: boolean; cancel?: () => void } = { released: false }
    active.set(handle.handleId, entry)
    let stdout = ''
    let stderr = ''
    let truncated = false
    let timedOut = false
    let exitCode: number | undefined
    let cancelRequested = false
    let terminateError: unknown
    let cleanupDeadline = Number.POSITIVE_INFINITY
    let cleanupAttempted = false
    const cancel = () => {
      if (cancelRequested) return
      cancelRequested = true
      cleanupDeadline = Date.now() + cleanupBudgetMs
      try {
        native.terminateSandboxed(handle.handleId)
      } catch (error) {
        terminateError = error
      }
    }
    entry.cancel = cancel
    signal.addEventListener('abort', cancel, { once: true })
    const timeout = setTimeout(() => {
      timedOut = true
      cancel()
    }, opts.timeoutMs)
    let outcome: { ok: true; value: NodeArgvResult } | { ok: false; error: unknown }
    try {
      while (exitCode === undefined) {
        if (signal.aborted && !cancelRequested) cancel()
        let update
        try {
          update = native.pollSandboxed(handle.handleId)
        } catch (error) {
          disabledReason =
            'Native Windows process state is uncertain; reconcile the durable lease journal before retrying'
          cleanupAttempted = true
          try {
            await releaseHandle(handle.handleId, entry)
          } catch {
            /* preserve the uncertain journal record */
          }
          throw unknownEffect('Windows process result is unknown after a native poll failure', error)
        }
        const out = boundedText(stdout + update.stdout, NODE_LIMITS.outputBytes)
        const err = boundedText(stderr + update.stderr, NODE_LIMITS.outputBytes)
        if (update.stdout) {
          try {
            opts.onOutput?.(update.stdout)
          } catch {
            /* The native process result remains authoritative. */
          }
        }
        if (update.stderr) {
          try {
            opts.onOutput?.(update.stderr)
          } catch {
            /* Continue polling after a transient observer failure. */
          }
        }
        stdout = out.text
        stderr = err.text
        truncated ||= out.truncated || err.truncated
        exitCode = update.exitCode
        if (exitCode !== undefined) {
          entry.released = true
          active.delete(handle.handleId)
        }
        if (cancelRequested && Date.now() >= cleanupDeadline && exitCode === undefined) {
          disabledReason = 'Windows process release is uncertain; reconcile the durable lease journal before retrying'
          throw unknownEffect('Windows process did not terminate within the cleanup budget', terminateError)
        }
        if (exitCode === undefined) await Bun.sleep(10)
      }
      signal.throwIfAborted()
      outcome = { ok: true, value: { stdout, stderr, exitCode, truncated, timedOut } }
    } catch (error) {
      outcome = { ok: false, error }
    } finally {
      clearTimeout(timeout)
      signal.removeEventListener('abort', cancel)
    }
    if (exitCode === undefined && !entry.released && !cleanupAttempted && Date.now() < cleanupDeadline) {
      cancel()
      try {
        await releaseHandle(handle.handleId, entry)
      } catch (error) {
        disabledReason = 'Windows process release is uncertain; reconcile the durable lease journal before retrying'
        throw error
      }
    }
    if (!outcome.ok) throw outcome.error
    return outcome.value
  }

  const backend: NodeExecutionBackend = {
    name: 'windows-restricted',
    filesystem: capabilities.filesystem,
    network: capabilities.network,
    processTree: capabilities.processTree,
    execArgv,
    async exec(workspace, command, signal, opts): Promise<ToolResult> {
      if (opts.workspaceMounts?.length)
        return {
          text: 'The Windows backend cannot expose a same-node multi-root workspace view',
          isError: true,
          details: { code: 'SANDBOX_BACKEND_UNAVAILABLE', exitCode: 126, truncated: false, executionStarted: false },
        }
      if (disabledReason) return unavailable(disabledReason)
      if (!capabilities.available) return unavailable(capabilities.reason ?? 'Native capability probe failed')
      if (!opts.confinement) return unavailable('A resolved confinement profile is required')
      const environment = buildWindowsChildEnvironment(opts, bEnvironment)
      const powershell = await resolveWindowsProgram(workspace, ['powershell.exe'], environment.base)
      const result = await execArgv(
        workspace,
        [powershell[0], '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
        signal,
        opts,
      )
      return {
        text: `${result.stdout}${result.stderr}`,
        isError: result.exitCode !== 0 || result.timedOut === true,
        details: result,
      }
    },
    async dispose() {
      disabledReason = 'Windows sandbox backend has been disposed'
      for (const entry of active.values()) entry.cancel?.()
      const deadline = Date.now() + cleanupBudgetMs
      while (active.size > 0 && Date.now() < deadline) await Bun.sleep(20)
      if (active.size > 0)
        throw unknownEffect(
          'Windows backend disposal could not confirm all Job Object releases; durable lease recovery is required',
        )
    },
  }
  return backend
}
