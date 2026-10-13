import { createRequire } from 'node:module'

/** Public, runtime-validated port for the Windows sandbox N-API module. */
export interface SandboxNativeProfile {
  readonly workspaceRoot: string
  readonly writableRoots: readonly string[]
  readonly readableRoots: readonly string[]
  readonly protectedPaths: readonly string[]
  readonly readOnlyPaths: readonly string[]
  readonly networkEnabled: boolean
  readonly envOverrides: Readonly<Record<string, string>>
  readonly environment: Readonly<Record<string, string>>
  readonly environmentAllowlist: readonly string[]
  readonly level: 'Unelevated'
}

export interface SandboxNativeProbe {
  readonly available: boolean
  readonly filesystem: boolean
  readonly network: boolean
  readonly processTree: boolean
  readonly reason?: string
}

export interface SandboxNativeHandle {
  readonly pid: number
  readonly handleId: string
}
export interface SandboxNativePoll {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode?: number
}

export interface SandboxNativePort {
  isAvailable(): boolean
  probeConfinement(): SandboxNativeProbe
  spawnSandboxed(
    profile: SandboxNativeProfile,
    argv: readonly string[],
    cwd: string,
    journalDirectory: string,
  ): Promise<SandboxNativeHandle>
  pollSandboxed(handleId: string): SandboxNativePoll
  terminateSandboxed(handleId: string): void
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
type RawSpawn = (
  profile: SandboxNativeProfile,
  argv: readonly string[],
  cwd: string,
  journalDirectory: string,
) => unknown
type RawPoll = (handleId: string) => unknown
type RawTerminate = (handleId: string) => unknown

/** Validates the N-API ABI before exposing it to host code. */
export function validateSandboxNative(value: unknown): SandboxNativePort {
  if (
    !record(value) ||
    typeof value.isAvailable !== 'function' ||
    typeof value.probeConfinement !== 'function' ||
    typeof value.spawnSandboxed !== 'function' ||
    typeof value.pollSandboxed !== 'function' ||
    typeof value.terminateSandboxed !== 'function'
  ) {
    throw new TypeError('The Windows sandbox module does not implement the supported N-API ABI')
  }
  // N-API functions are unknown at import time. Function shape is checked above;
  // these signatures intentionally return unknown for field validation below.
  const rawIsAvailable = value.isAvailable as () => unknown
  const rawProbe = value.probeConfinement as () => unknown
  const rawSpawn = value.spawnSandboxed as RawSpawn
  const rawPoll = value.pollSandboxed as RawPoll
  const rawTerminate = value.terminateSandboxed as RawTerminate
  return {
    isAvailable() {
      const result: unknown = rawIsAvailable.call(value)
      if (typeof result !== 'boolean') throw new TypeError('Invalid sandbox isAvailable result')
      return result
    },
    probeConfinement() {
      const result: unknown = rawProbe.call(value)
      if (
        !record(result) ||
        typeof result.available !== 'boolean' ||
        typeof result.filesystem !== 'boolean' ||
        typeof result.network !== 'boolean' ||
        typeof result.processTree !== 'boolean' ||
        (result.reason !== undefined && typeof result.reason !== 'string')
      )
        throw new TypeError('Invalid sandbox probe result')
      return {
        available: result.available,
        filesystem: result.filesystem,
        network: result.network,
        processTree: result.processTree,
        ...(typeof result.reason === 'string' ? { reason: result.reason } : {}),
      }
    },
    async spawnSandboxed(profile, argv, cwd, journalDirectory) {
      const result: unknown = await rawSpawn.call(value, profile, argv, cwd, journalDirectory)
      if (
        !record(result) ||
        typeof result.pid !== 'number' ||
        !Number.isSafeInteger(result.pid) ||
        result.pid < 1 ||
        typeof result.handleId !== 'string' ||
        result.handleId.length === 0
      )
        throw new TypeError('Invalid sandbox spawn handle')
      return { pid: result.pid, handleId: result.handleId }
    },
    pollSandboxed(handleId) {
      const result: unknown = rawPoll.call(value, handleId)
      if (
        !record(result) ||
        typeof result.stdout !== 'string' ||
        typeof result.stderr !== 'string' ||
        (result.exitCode !== undefined && !Number.isInteger(result.exitCode))
      )
        throw new TypeError('Invalid sandbox poll result')
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        ...(typeof result.exitCode === 'number' ? { exitCode: result.exitCode } : {}),
      }
    },
    terminateSandboxed(handleId) {
      rawTerminate.call(value, handleId)
    },
  }
}

export function loadSandboxNative(modulePath = '../sandbox/hbar_sandbox_win.node'): SandboxNativePort {
  return validateSandboxNative(createRequire(import.meta.url)(modulePath) as unknown)
}
