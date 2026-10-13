import { describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildWindowsChildEnvironment,
  createWindowsExecutionBackend,
  probeWindowsBackend,
  resolveWindowsProgram,
  terminateAndAwaitRelease,
  validateWindowsArgv,
} from './windows-backend'
import { createManagedNodeBackend } from './managed-backend'
import { loadSandboxNative, validateSandboxNative, type SandboxNativePort } from '@hbar/local-tools/sandbox-native'

const backendOptions = {
  timeoutMs: 1_000,
  environment: { BASE_ONLY: 'snapshot-base', SNAPSHOT_KEY: 'snapshot' },
  environmentAllowlist: ['PATH', 'SYSTEMROOT', 'BASE_ONLY', 'SNAPSHOT_KEY'],
  confinement: {
    level: 'unelevated' as const,
    writableRoots: [],
    readableRoots: [],
    networkEnabled: false,
    envOverrides: { SNAPSHOT_KEY: 'snapshot', EXTRA: 'drop-me' },
  },
  protectedPaths: [],
  readOnlyPaths: [],
}

describe('Windows sandbox backend', () => {
  test('rejects malformed N-API values at the ABI boundary', async () => {
    expect(() => validateSandboxNative({ isAvailable: 1 })).toThrow(/ABI/)
    const native = validateSandboxNative({
      isAvailable: () => true,
      probeConfinement: () => ({ available: true, filesystem: true, network: true, processTree: true }),
      spawnSandboxed: async () => ({ pid: '12', handleId: 'bad' }),
      pollSandboxed: () => ({ stdout: '', stderr: '' }),
      terminateSandboxed: () => undefined,
    })
    expect(() => native.probeConfinement()).not.toThrow()
    await expect(
      native.spawnSandboxed(
        {
          workspaceRoot: 'C:\\',
          writableRoots: [],
          readableRoots: [],
          protectedPaths: [],
          readOnlyPaths: [],
          networkEnabled: false,
          envOverrides: {},
          environment: {},
          environmentAllowlist: [],
          level: 'Unelevated',
        },
        ['x'],
        'C:\\',
        'C:\\j',
      ),
    ).rejects.toThrow(/spawn handle/)
    const badProbe = validateSandboxNative({
      isAvailable: () => true,
      probeConfinement: () => ({ available: 'yes' }),
      spawnSandboxed: async () => ({}),
      pollSandboxed: () => ({}),
      terminateSandboxed: () => undefined,
    })
    expect(() => badProbe.probeConfinement()).toThrow(/probe result/)
    const badPoll = validateSandboxNative({
      isAvailable: () => true,
      probeConfinement: () => ({ available: true, filesystem: true, network: true, processTree: true }),
      spawnSandboxed: async () => ({}),
      pollSandboxed: () => ({ stdout: 1, stderr: '' }),
      terminateSandboxed: () => undefined,
    })
    expect(() => badPoll.pollSandboxed('x')).toThrow(/poll result/)
  })

  test('intersects B base environment and snapshot set with the floor allowlist', () => {
    expect(
      buildWindowsChildEnvironment(backendOptions, {
        PATH: 'B-path',
        SYSTEMROOT: 'B-root',
        BASE_ONLY: 'base',
        EXTRA: 'outside-floor',
        PATHEXT: '.EXE',
      }),
    ).toEqual({
      base: { PATH: 'B-path', SYSTEMROOT: 'B-root', BASE_ONLY: 'base', PATHEXT: '.EXE' },
      overrides: { BASE_ONLY: 'snapshot-base', SNAPSHOT_KEY: 'snapshot' },
    })
    expect(() =>
      buildWindowsChildEnvironment({
        ...backendOptions,
        environment: { NODE_OPTIONS: '--require=unsafe' },
      }),
    ).toThrow(/Unsafe snapshot environment/)
    expect(() =>
      buildWindowsChildEnvironment({ ...backendOptions, environment: { PATH: 'A-override' } }, { PATH: 'B-path' }),
    ).toThrow(/Unsafe snapshot environment/)
  })

  test('factory uses its captured B PATH for executable lookup, never snapshot PATH', async () => {
    if (process.platform !== 'win32') return
    const directory = await mkdtemp(join(tmpdir(), 'hbar-factory-b-path-'))
    const dataRoot = await mkdtemp(join(tmpdir(), 'hbar-factory-journal-'))
    try {
      const executable = join(directory, 'factory-tool.EXE')
      await writeFile(executable, 'fixture executable')
      let startedArgv: readonly string[] | undefined
      let startedProfile: Parameters<NonNullable<SandboxNativePort['spawnSandboxed']>>[0] | undefined
      const native: SandboxNativePort = {
        isAvailable: () => true,
        probeConfinement: () => ({ available: true, filesystem: true, network: true, processTree: true }),
        async spawnSandboxed(profile, argv) {
          startedProfile = profile
          startedArgv = argv
          return { pid: 1, handleId: 'factory-fixture' }
        },
        pollSandboxed: () => ({ stdout: '', stderr: '', exitCode: 0 }),
        terminateSandboxed: () => undefined,
      }
      const backend = await createWindowsExecutionBackend({
        dataRoot,
        native,
        bEnvironment: { PATH: directory, PATHEXT: '.EXE', SYSTEMROOT: 'C:\\Windows' },
      })
      const options = {
        timeoutMs: 1_000,
        environment: { A_ONLY: 'snapshot-value' },
        environmentAllowlist: ['PATH', 'PATHEXT', 'SYSTEMROOT', 'A_ONLY'],
        confinement: {
          level: 'unelevated' as const,
          writableRoots: [directory],
          readableRoots: [directory],
          networkEnabled: false,
          envOverrides: {},
        },
        protectedPaths: [],
        readOnlyPaths: [],
      }
      await backend.execArgv?.(directory, ['factory-tool', 'literal argument'], new AbortController().signal, options)
      expect(startedArgv).toEqual([executable, 'literal argument'])
      expect(startedProfile?.environment.PATH).toBe(directory)
      expect(startedProfile?.environment.SYSTEMROOT).toBe('C:\\Windows')
    } finally {
      await rm(directory, { recursive: true, force: true })
      await rm(dataRoot, { recursive: true, force: true })
    }
  })

  test('resolves program names only against the supplied B path and preserves literal arguments', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hbar-b-program-'))
    try {
      const executable = join(directory, 'literal-tool.EXE')
      await writeFile(executable, 'private fixture')
      const result = await resolveWindowsProgram(directory, ['literal-tool', 'two words', 'a"b'], {
        PATH: directory,
        PATHEXT: '.EXE',
      })
      expect(result).toEqual([executable, 'two words', 'a"b'])
      await expect(
        resolveWindowsProgram(directory, ['missing-tool'], { PATH: join(directory, 'elsewhere'), PATHEXT: '.EXE' }),
      ).rejects.toMatchObject({ code: 'NODE_PROGRAM_NOT_FOUND' })
      expect(() => validateWindowsArgv(['tool', 'bad\0arg'])).toThrow(/literal argument/)
      expect(() => validateWindowsArgv(['tool', 'x'.repeat(16_001)])).toThrow(/literal argument/)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test('bounds release waiting and reports an unknown effect if native never reaches terminal poll', async () => {
    const native = {
      isAvailable: () => true,
      probeConfinement: () => ({ available: true, filesystem: true, network: true, processTree: true }),
      spawnSandboxed: async () => ({ pid: 2, handleId: 'never' }),
      pollSandboxed: () => ({ stdout: '', stderr: '' }),
      terminateSandboxed: () => undefined,
    }
    await expect(terminateAndAwaitRelease(native, 'never', 30)).rejects.toMatchObject({ code: 'EFFECT_UNKNOWN' })
  })

  test('reports the real native probe without promoting unavailable capabilities', async () => {
    if (process.platform !== 'win32' || !process.env.HBAR_SANDBOX_TEST_MODULE) return
    const native = loadSandboxNative(process.env.HBAR_SANDBOX_TEST_MODULE)
    const result = probeWindowsBackend(native)
    expect(result.filesystem).toBe(true)
    expect(result.processTree).toBe(true)
    expect(result.available).toBe(native.isAvailable() && result.filesystem && result.network && result.processTree)

    const dataRoot = await mkdtemp(join(tmpdir(), 'hbar-windows-backend-'))
    try {
      const backend = await createWindowsExecutionBackend({ dataRoot, native })
      expect(backend.filesystem).toBe(true)
      expect(backend.network).toBe(result.network)
      expect(backend.processTree).toBe(true)
      await expect(
        backend.execArgv?.(process.cwd(), ['cmd.exe', '/c', 'exit 0'], new AbortController().signal, {
          timeoutMs: 1_000,
          environment: {},
          confinement: null,
          protectedPaths: [],
          environmentAllowlist: [],
        }),
      ).rejects.toMatchObject({ code: 'SANDBOX_BACKEND_UNAVAILABLE' })
    } finally {
      await rm(dataRoot, { recursive: true, force: true })
    }
  }, 15_000)

  test.skipIf(process.platform !== 'win32')(
    'managed factory selects the Windows adapter and refuses unresolved permissions',
    async () => {
      const dataRoot = await mkdtemp(join(tmpdir(), 'hbar-windows-factory-'))
      try {
        const backend = await createManagedNodeBackend({ dataRoot, backend: 'auto' })
        expect(backend.name).toBe('windows-restricted')
        await expect(
          backend.exec(dataRoot, 'Write-Output factory-proof', new AbortController().signal, {
            timeoutMs: 1_000,
            environment: {},
            confinement: null,
            protectedPaths: [],
            environmentAllowlist: [],
          }),
        ).rejects.toMatchObject({ code: 'SANDBOX_BACKEND_UNAVAILABLE' })
        await backend.dispose?.()
      } finally {
        await rm(dataRoot, { recursive: true, force: true })
      }
    },
    20_000,
  )
})
