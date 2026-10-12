import { chmod, mkdir, mkdtemp, readFile, readlink, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path/posix'
import { HbarError } from '@hbar/contracts'
import type { OsConfinementOptions } from '@hbar/plugin-sdk'

export type UnixConfinementBackend = 'bwrap' | 'seatbelt'
export interface UnixConfinementCapabilities {
  readonly backend: UnixConfinementBackend
  readonly available: boolean
  readonly filesystem: boolean
  readonly network: boolean
  readonly processTree: boolean
  readonly reason?: string
}
export interface UnixConfinementRequest {
  readonly backend: UnixConfinementBackend
  readonly command: string
  readonly cwd: string
  readonly environment: Readonly<Record<string, string>>
  readonly confinement: OsConfinementOptions
  readonly protectedPaths: readonly string[]
}
export interface UnixConfinementLaunchPlan {
  readonly argv: readonly [string, ...string[]]
  readonly cwd: string
  readonly env: Readonly<Record<string, string>>
  readonly cleanup: () => Promise<void>
}

const probeTimeoutMs = 5_000
const maxProbeProcessTreeNodes = 64
const systemMounts = ['/usr', '/bin', '/sbin', '/lib', '/lib64', '/etc', '/opt'] as const
const systemReadOnlyMounts = ['/usr', '/bin', '/sbin', '/lib', '/lib64', '/opt'] as const
const safeEtcFiles = [
  '/etc/hosts',
  '/etc/group',
  '/etc/ld.so.cache',
  '/etc/localtime',
  '/etc/nsswitch.conf',
  '/etc/passwd',
  '/etc/resolv.conf',
  '/etc/ssl/cert.pem',
] as const
const safeEtcDirectories = ['/etc/ca-certificates', '/etc/ssl/certs'] as const

function unavailable(backend: UnixConfinementBackend, reason: string): UnixConfinementCapabilities {
  return { backend, available: false, filesystem: false, network: false, processTree: false, reason }
}
async function processDescendants(parentPid: number): Promise<number[]> {
  const found: number[] = []
  const pending = [parentPid]
  while (pending.length) {
    const parent = pending.pop()
    if (parent === undefined) continue
    const raw = await readFile(`/proc/${parent}/task/${parent}/children`, 'utf8')
    for (const item of raw.trim().split(/\s+/).filter(Boolean)) {
      const pid = Number(item)
      if (!Number.isSafeInteger(pid)) continue
      found.push(pid)
      if (found.length > maxProbeProcessTreeNodes) throw new Error('Process tree probe exceeded its bound')
      pending.push(pid)
    }
  }
  return found
}
async function processHasStopped(pid: number): Promise<boolean> {
  try {
    const info = await readFile(`/proc/${pid}/stat`, 'utf8')
    const end = info.lastIndexOf(')')
    return end >= 0 && info.slice(end + 2).split(/\s+/)[0] === 'Z'
  } catch {
    return true
  }
}
async function bwrapProcessTreeWorks(executable: string): Promise<boolean> {
  const owner = Bun.spawn(
    [
      executable,
      '--die-with-parent',
      '--new-session',
      '--unshare-user',
      '--unshare-pid',
      '--unshare-ipc',
      '--unshare-uts',
      '--ro-bind',
      '/',
      '/',
      '--proc',
      '/proc',
      '--dev',
      '/dev',
      '--',
      '/bin/sh',
      '-c',
      'sleep 60 & echo hbar-tree-ready; wait',
    ],
    { stdin: 'ignore', stdout: 'pipe', stderr: 'ignore', timeout: probeTimeoutMs, killSignal: 'SIGKILL' },
  )
  try {
    const reader = owner.stdout.getReader()
    let timeout: ReturnType<typeof setTimeout> | undefined
    const ready = await Promise.race([
      reader.read(),
      new Promise<ReadableStreamReadResult<Uint8Array>>(
        (resolveRead) => (timeout = setTimeout(() => resolveRead({ done: true, value: undefined }), 2_000)),
      ),
    ])
    if (timeout) clearTimeout(timeout)
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
    if (ready.done || !new TextDecoder().decode(ready.value).includes('hbar-tree-ready') || !owner.pid) return false
    const descendants = await processDescendants(owner.pid)
    if (descendants.length === 0) return false
    owner.kill('SIGKILL')
    await owner.exited
    for (let attempt = 0; attempt < 20; attempt++) {
      if (await Promise.all(descendants.map(processHasStopped)).then((results) => results.every(Boolean))) return true
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 50))
    }
    return false
  } catch {
    owner.kill('SIGKILL')
    await owner.exited.catch(() => undefined)
    return false
  }
}
function commandPath(name: string): string | undefined {
  return Bun.which(name) ?? undefined
}
async function runBounded(
  argv: readonly [string, ...string[]],
  cwd?: string,
): Promise<{ exitCode: number; stdout: string }> {
  const child = Bun.spawn([...argv], {
    ...(cwd ? { cwd } : {}),
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'ignore',
    timeout: probeTimeoutMs,
    killSignal: 'SIGKILL',
    windowsHide: true,
  })
  const [stdout, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited])
  return { exitCode, stdout: stdout.slice(0, 2_000) }
}
function assertPosixPath(path: string, name: string): string {
  if (!isAbsolute(path) || path.includes('\0') || path.split('/').includes('..'))
    throw new HbarError('NODE_DENIED', `Confinement ${name} must be an absolute canonical path`)
  return resolve(path)
}
function isWithin(root: string, path: string): boolean {
  const value = relative(root, path)
  return value === '' || (value !== '..' && !value.startsWith(`..${sep}`) && !isAbsolute(value))
}
export function validateUnixConfinementRoots(
  input: Pick<UnixConfinementRequest, 'cwd' | 'confinement' | 'protectedPaths'>,
): {
  readableRoots: string[]
  writableRoots: string[]
  protectedPaths: string[]
  cwd: string
} {
  const cwd = assertPosixPath(input.cwd, 'working directory')
  const readableRoots = input.confinement.readableRoots.map((path) => assertPosixPath(path, 'read root'))
  const writableRoots = input.confinement.writableRoots.map((path) => assertPosixPath(path, 'write root'))
  const protectedPaths = [...new Set(input.protectedPaths.map((path) => assertPosixPath(path, 'protected path')))]
  if (!readableRoots.some((root) => isWithin(root, cwd)))
    throw new HbarError('NODE_DENIED', 'The command working directory is outside the readable roots')
  for (const root of writableRoots)
    if (!readableRoots.some((readable) => isWithin(readable, root)))
      throw new HbarError('NODE_DENIED', 'Writable roots must be contained in readable roots')
  for (const protectedPath of protectedPaths)
    if (
      isWithin(protectedPath, cwd) ||
      readableRoots.some((root) => isWithin(protectedPath, root)) ||
      writableRoots.some((root) => isWithin(protectedPath, root))
    )
      throw new HbarError('NODE_DENIED', 'Protected paths cannot contain a readable or writable root')
  for (const root of [...readableRoots, ...writableRoots])
    if (systemMounts.some((system) => isWithin(system, root) || isWithin(root, system)))
      throw new HbarError('NODE_DENIED', 'A shared root cannot replace an operating system directory')
  return { readableRoots, writableRoots, protectedPaths, cwd }
}

/** Runs a bounded live probe. A binary being installed is not sufficient evidence of enforcement. */
export async function probeUnixConfinement(backend: UnixConfinementBackend): Promise<UnixConfinementCapabilities> {
  if (backend === 'bwrap' && process.platform !== 'linux')
    return unavailable(backend, 'bwrap is only supported on Linux')
  if (backend === 'seatbelt' && process.platform !== 'darwin')
    return unavailable(backend, 'Seatbelt is only supported on macOS')
  const executable = commandPath(backend === 'bwrap' ? 'bwrap' : 'sandbox-exec')
  if (!executable)
    return unavailable(backend, `${backend === 'bwrap' ? 'bubblewrap' : 'sandbox-exec'} is not installed`)
  try {
    if (backend === 'bwrap') {
      const probeRoot = await mkdtemp('/var/tmp/hbar-bwrap-probe-')
      try {
        const protectedDir = join(probeRoot, 'protected')
        await mkdir(protectedDir)
        const protectedWrite = join(protectedDir, 'should-not-write')
        const protectedMkdir = join(protectedDir, 'should-not-mkdir')
        const privateTmpWrite = `/tmp/hbar-probe-${crypto.randomUUID()}`
        const hostNetworkNamespace = await readlink('/proc/self/ns/net')
        const hostPidNamespace = await readlink('/proc/self/ns/pid')
        const probe = await runBounded([
          executable,
          '--die-with-parent',
          '--new-session',
          '--unshare-user',
          '--unshare-pid',
          '--unshare-ipc',
          '--unshare-uts',
          '--unshare-net',
          '--ro-bind',
          '/',
          '/',
          '--tmpfs',
          '/tmp',
          '--tmpfs',
          protectedDir,
          '--remount-ro',
          protectedDir,
          '--proc',
          '/proc',
          '--dev',
          '/dev',
          '--',
          '/bin/sh',
          '-c',
          'touch "$1" && ! touch "$2" && ! mkdir "$3" && test "$(readlink /proc/self/ns/net)" != "$4" && test "$(readlink /proc/self/ns/pid)" != "$5"',
          'hbar-bwrap-probe',
          privateTmpWrite,
          protectedWrite,
          protectedMkdir,
          hostNetworkNamespace,
          hostPidNamespace,
        ])
        if (probe.exitCode !== 0)
          return unavailable(backend, `bubblewrap enforcement probe failed (exit ${probe.exitCode})`)
        if ((await Bun.file(protectedWrite).exists()) || (await Bun.file(protectedMkdir).exists()))
          return unavailable(backend, 'bubblewrap allowed a write through a protected read-only mount')
        if (!(await bwrapProcessTreeWorks(executable)))
          return unavailable(backend, 'bubblewrap did not terminate its process tree after its owner was killed')
        return { backend, available: true, filesystem: true, network: true, processTree: true }
      } finally {
        await rm(probeRoot, { recursive: true, force: true })
      }
    }
    const probeRoot = await mkdtemp(join(tmpdir(), 'hbar-seatbelt-probe-'))
    const profile = join(probeRoot, 'probe.sb')
    const writable = join(probeRoot, 'writable')
    const protectedFile = join(probeRoot, 'protected')
    const outsideWrite = join(dirname(probeRoot), `hbar-seatbelt-deny-${crypto.randomUUID()}`)
    try {
      await Bun.write(writable, '')
      await Bun.write(protectedFile, 'must stay private')
      const source = seatbeltProfile({
        readableRoots: [probeRoot, '/usr', '/bin', '/sbin', '/System', dirname(process.execPath)],
        writableRoots: [probeRoot],
        protectedPaths: [protectedFile],
        networkEnabled: false,
        tempRoot: probeRoot,
      })
      await writeFile(profile, source, { mode: 0o600 })
      const script = `touch ${shellQuote(writable)} && ! touch ${shellQuote(outsideWrite)} && ! cat ${shellQuote(protectedFile)} >/dev/null`
      const result = await runBounded([executable, '-f', profile, '/bin/sh', '-c', script])
      if (result.exitCode !== 0)
        return unavailable(backend, `Seatbelt filesystem enforcement probe failed (exit ${result.exitCode})`)
      if (await Bun.file(outsideWrite).exists())
        return unavailable(backend, 'Seatbelt allowed a write outside its writable roots')
      const server = createServer((socket) => socket.end())
      await new Promise<void>((resolveListen, rejectListen) => {
        server.once('error', rejectListen)
        server.listen(0, '127.0.0.1', resolveListen)
      })
      try {
        const address = server.address()
        if (!address || typeof address === 'string')
          return unavailable(backend, 'Seatbelt network probe could not bind loopback')
        const networkScript =
          `const net=require('node:net');const s=net.connect(${address.port},'127.0.0.1');` +
          `s.once('connect',()=>{console.log('CONNECTED');process.exit(0)});` +
          `s.once('error',e=>{console.log('BLOCKED:'+e.code);process.exit(0)});` +
          `setTimeout(()=>process.exit(2),1000)`
        const networkProbe = await runBounded([executable, '-f', profile, process.execPath, '-e', networkScript])
        if (networkProbe.exitCode !== 0 || !networkProbe.stdout.includes('BLOCKED:'))
          return unavailable(backend, 'Seatbelt did not prove that it blocks an unauthorized network connection')
        if (networkProbe.stdout.includes('CONNECTED'))
          return unavailable(backend, 'Seatbelt allowed a loopback connection while network access was disabled')
      } finally {
        await new Promise<void>((resolveClose) => server.close(() => resolveClose()))
      }
      // The managed owner must independently prove tree cleanup before Seatbelt can advertise it.
      return { backend, available: true, filesystem: true, network: true, processTree: false }
    } finally {
      await rm(outsideWrite, { force: true })
      await rm(probeRoot, { recursive: true, force: true })
    }
  } catch (error) {
    return unavailable(backend, error instanceof Error ? error.message.slice(0, 300) : 'Confinement probe failed')
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}
function sbplQuote(value: string): string {
  if (value.includes('\0')) throw new HbarError('NODE_DENIED', 'Confinement path contains a NUL character')
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n')}"`
}
function seatbeltProfile(input: {
  readableRoots: readonly string[]
  writableRoots: readonly string[]
  protectedPaths: readonly string[]
  networkEnabled: boolean
  tempRoot: string
}): string {
  const unique = (values: readonly string[]) => [...new Set(values)]
  const rules = [
    '(version 1)',
    '(deny default)',
    '(allow process-fork)',
    '(allow process-exec)',
    '(allow signal (target self))',
    '(allow sysctl-read)',
    '(allow file-read-metadata (subpath "/"))',
    ...unique([...input.readableRoots, ...input.writableRoots, input.tempRoot]).map(
      (path) => `(allow file-read* (subpath ${sbplQuote(path)}))`,
    ),
    ...unique([...input.writableRoots, input.tempRoot]).map(
      (path) => `(allow file-write* (subpath ${sbplQuote(path)}))`,
    ),
    ...unique(input.protectedPaths).map((path) => `(deny file-read* (subpath ${sbplQuote(path)}))`),
    ...unique(input.protectedPaths).map((path) => `(deny file-write* (subpath ${sbplQuote(path)}))`),
    ...(input.networkEnabled ? ['(allow network*)'] : []),
  ]
  return `${rules.join('\n')}\n`
}

function addDir(args: string[], known: Set<string>, path: string): void {
  const root = parse(path).root
  let current = root
  for (const part of path.slice(root.length).split(sep).filter(Boolean)) {
    current = join(current, part)
    if (known.has(current)) continue
    args.push('--dir', current)
    known.add(current)
  }
}
async function addProtectedMount(
  args: string[],
  knownDirs: Set<string>,
  path: string,
  writableRoots: readonly string[],
): Promise<void> {
  addDir(args, knownDirs, dirname(path))
  try {
    const info = await stat(path)
    if (info.isDirectory()) args.push('--tmpfs', path, '--remount-ro', path)
    else args.push('--ro-bind', '/dev/null', path)
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || String(error.code) !== 'ENOENT') throw error
    if (writableRoots.some((root) => isWithin(root, path)))
      throw new HbarError(
        'SANDBOX_BACKEND_UNAVAILABLE',
        'A protected path is missing under a writable root; refusing to create its mount point in the workspace',
      )
    // Missing paths outside write roots are absent from the private root and need no mount.
  }
}

async function prepareBwrap(input: UnixConfinementRequest): Promise<UnixConfinementLaunchPlan> {
  const probe = await probeUnixConfinement('bwrap')
  if (!probe.available) throw new HbarError('SANDBOX_BACKEND_UNAVAILABLE', probe.reason ?? 'bubblewrap is unavailable')
  const executable = commandPath('bwrap')
  if (!executable) throw new HbarError('SANDBOX_BACKEND_UNAVAILABLE', 'bubblewrap disappeared after its probe')
  const { readableRoots, writableRoots, protectedPaths, cwd } = validateUnixConfinementRoots(input)
  const args = [
    '--die-with-parent',
    '--new-session',
    '--unshare-user',
    '--unshare-pid',
    '--unshare-ipc',
    '--unshare-uts',
    ...(!input.confinement.networkEnabled ? ['--unshare-net'] : []),
    '--tmpfs',
    '/',
  ]
  const knownDirs = new Set<string>(['/'])
  for (const path of ['/tmp', '/run', '/home', '/root', ...systemMounts]) addDir(args, knownDirs, path)
  for (const path of systemReadOnlyMounts) {
    try {
      await stat(path)
      args.push('--ro-bind', path, path)
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || String(error.code) !== 'ENOENT') throw error
    }
  }
  for (const path of safeEtcDirectories) {
    try {
      await stat(path)
      addDir(args, knownDirs, dirname(path))
      args.push('--ro-bind', path, path)
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || String(error.code) !== 'ENOENT') throw error
    }
  }
  for (const path of safeEtcFiles) {
    try {
      if (!(await stat(path)).isFile()) continue
      addDir(args, knownDirs, dirname(path))
      args.push('--ro-bind', path, path)
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || String(error.code) !== 'ENOENT') throw error
    }
  }
  args.push('--dev', '/dev', '--proc', '/proc', '--tmpfs', '/tmp')
  for (const root of readableRoots) {
    addDir(args, knownDirs, dirname(root))
    args.push('--ro-bind', root, root)
  }
  for (const root of writableRoots) {
    addDir(args, knownDirs, dirname(root))
    args.push('--bind', root, root)
  }
  for (const path of protectedPaths) await addProtectedMount(args, knownDirs, path, writableRoots)
  args.push('--chdir', cwd, '--clearenv')
  for (const [name, value] of Object.entries(input.environment)) args.push('--setenv', name, value)
  args.push('--setenv', 'TMPDIR', '/tmp', '--', '/bin/sh', '-c', input.command)
  return {
    argv: [executable, ...args],
    cwd: '/',
    env: {},
    cleanup: async () => undefined,
  }
}

async function prepareSeatbelt(input: UnixConfinementRequest): Promise<UnixConfinementLaunchPlan> {
  const probe = await probeUnixConfinement('seatbelt')
  if (!probe.available) throw new HbarError('SANDBOX_BACKEND_UNAVAILABLE', probe.reason ?? 'Seatbelt is unavailable')
  const executable = commandPath('sandbox-exec')
  if (!executable) throw new HbarError('SANDBOX_BACKEND_UNAVAILABLE', 'sandbox-exec disappeared after its probe')
  const { readableRoots, writableRoots, protectedPaths, cwd } = validateUnixConfinementRoots(input)
  const privateRoot = await mkdtemp(join(tmpdir(), 'hbar-exec-'))
  const tempRoot = join(privateRoot, 'tmp')
  try {
    const profile = join(privateRoot, 'sandbox.sb')
    await chmod(privateRoot, 0o700)
    await mkdir(tempRoot, { mode: 0o700 })
    await writeFile(
      profile,
      seatbeltProfile({
        readableRoots: [...readableRoots, '/usr', '/bin', '/sbin', '/System'],
        writableRoots,
        protectedPaths,
        networkEnabled: input.confinement.networkEnabled,
        tempRoot,
      }),
      { mode: 0o600 },
    )
    const env = { ...input.environment, TMPDIR: tempRoot }
    return {
      argv: [executable, '-f', profile, '/bin/sh', '-c', input.command],
      cwd,
      env,
      cleanup: async () => await rm(privateRoot, { recursive: true, force: true }),
    }
  } catch (error) {
    await rm(privateRoot, { recursive: true, force: true })
    throw error
  }
}

/** Prepare an OS launch only after a successful, bounded live capability probe. */
export async function prepareUnixConfinement(input: UnixConfinementRequest): Promise<UnixConfinementLaunchPlan> {
  if (!input.command.trim()) throw new HbarError('INVALID_INPUT', 'A command is required')
  return input.backend === 'bwrap' ? await prepareBwrap(input) : await prepareSeatbelt(input)
}

/** Testable SBPL renderer; callers still must use a successful live probe before launch. */
export const renderSeatbeltProfile = seatbeltProfile
