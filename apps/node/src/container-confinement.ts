import { access, mkdtemp, mkdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path/posix'
import { tmpdir } from 'node:os'
import { createServer } from 'node:net'
import { HbarError } from '@hbar/contracts'
import type { OsConfinementOptions } from '@hbar/plugin-sdk'
import type { NodeExecutionInternalMount, NodeExecutionWorkspaceMount } from '@hbar/node-core'
import { verifyManagedWorktreeMounts } from './managed-worktree-mount-validation'

export type ContainerEngine = 'docker' | 'podman'
export interface ContainerConfinementConfig {
  /** B-owned engine executable. It is never accepted from an execution request. */
  readonly engine: ContainerEngine
  /** A locally installed immutable image ID (sha256:...), fixed by B configuration. */
  readonly imageId: string
  readonly dataRoot: string
  readonly maxConcurrentJobs?: number
}
export interface ContainerRequest {
  readonly operation:
    | { readonly kind: 'command'; readonly command: string }
    | { readonly kind: 'argv'; readonly argv: readonly [string, ...string[]] }
  readonly cwd: string
  readonly environment: Readonly<Record<string, string>>
  readonly confinement: OsConfinementOptions
  readonly protectedPaths: readonly string[]
  readonly readOnlyPaths?: readonly string[]
  readonly workspaceMounts?: readonly NodeExecutionWorkspaceMount[]
  readonly internalMounts?: readonly NodeExecutionInternalMount[]
}
export interface ContainerLaunchPlan {
  readonly name: string
  readonly argv: readonly [string, ...string[]]
  readonly cleanupRoot: string
  readonly cleanup: () => Promise<void>
}
export interface ContainerCapabilities {
  readonly backend: 'container'
  readonly available: boolean
  readonly filesystem: boolean
  readonly network: boolean
  readonly processTree: boolean
  readonly reason?: string
  readonly engine?: ContainerEngine
  readonly imageId?: string
}

const token = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/
const imageToken = /^sha256:[a-f0-9]{64}$/
const protectedLabel = 'io.hbar.node.owner'

function fail(message: string): never {
  throw new HbarError('SANDBOX_BACKEND_UNAVAILABLE', message)
}
function within(root: string, value: string): boolean {
  const rel = relative(root, value)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}
function canonicalPath(value: string): string {
  if (!isAbsolute(value) || value.includes('\0') || value.split(sep).includes('..'))
    throw new HbarError('NODE_DENIED', 'Container paths must be absolute canonical paths')
  const normalized = resolve(value)
  // docker --mount uses comma-delimited fields; reject values it cannot encode losslessly.
  if (/[,:\r\n]/.test(normalized))
    throw new HbarError('NODE_DENIED', 'Container paths contain unsupported mount syntax')
  return normalized
}
function validateConfig(config: ContainerConfinementConfig): void {
  if (!token.test(config.engine) || !imageToken.test(config.imageId))
    fail('Container execution requires a B-pinned engine and immutable local image ID')
  if (!isAbsolute(config.dataRoot)) fail('Container journal root must be an absolute B-private path')
  if (
    config.maxConcurrentJobs !== undefined &&
    (!Number.isSafeInteger(config.maxConcurrentJobs) || config.maxConcurrentJobs < 1 || config.maxConcurrentJobs > 16)
  )
    fail('Container concurrency must be between 1 and 16')
}
const forbiddenMountRoots = ['/dev', '/etc', '/proc', '/run', '/sys', '/var/run'] as const
const forbiddenSocketPaths = [
  '/run/docker.sock',
  '/run/podman/podman.sock',
  '/var/run/docker.sock',
  '/var/run/podman/podman.sock',
] as const

/** Validate the complete host-to-container path contract before making any mount plan. */
export function validateContainerRequest(input: ContainerRequest): {
  readonly cwd: string
  readonly readableRoots: readonly string[]
  readonly writableRoots: readonly string[]
  readonly protectedPaths: readonly string[]
  readonly readOnlyPaths: readonly string[]
  readonly workspaceMounts: readonly NodeExecutionWorkspaceMount[]
  readonly internalMounts: readonly NodeExecutionInternalMount[]
} {
  const cwd = canonicalPath(input.cwd)
  const physicalReadableRoots = input.confinement.readableRoots.map(canonicalPath)
  const physicalWritableRoots = input.confinement.writableRoots.map(canonicalPath)
  const workspaceMounts = input.workspaceMounts ?? []
  const internalMounts = input.internalMounts ?? []
  const aliases = new Set<string>()
  const rootIds = new Set<string>()
  const physicalRoots = new Set<string>()
  const targets = new Set<string>()
  for (const mount of workspaceMounts) {
    const source = canonicalPath(mount.sourceRoot)
    const target = canonicalPath(mount.target)
    if (
      source !== mount.sourceRoot ||
      target !== `/workspace/${mount.alias}` ||
      !/^[\p{L}\p{N}][\p{L}\p{N}._-]{0,63}$/u.test(mount.alias) ||
      aliases.has(mount.alias.toLocaleLowerCase()) ||
      rootIds.has(mount.rootId) ||
      physicalRoots.has(source) ||
      targets.has(target)
    )
      throw new HbarError('NODE_DENIED', 'Workspace mount identifiers and B-owned paths must be unique and canonical')
    aliases.add(mount.alias.toLocaleLowerCase())
    rootIds.add(mount.rootId)
    physicalRoots.add(source)
    targets.add(target)
    if (!physicalReadableRoots.some((root) => within(root, source)))
      throw new HbarError('NODE_DENIED', 'Workspace mount source is outside its effective readable permission')
    if (mount.access === 'write' && !physicalWritableRoots.some((root) => within(root, source)))
      throw new HbarError('NODE_DENIED', 'Writable workspace mount is outside its effective write permission')
    for (const grant of mount.writePaths ?? []) {
      const sourcePath = canonicalPath(grant.sourcePath)
      const targetPath = canonicalPath(grant.targetPath)
      if (
        sourcePath !== grant.sourcePath ||
        targetPath !== resolve(target, relative(source, sourcePath)) ||
        !within(source, sourcePath) ||
        !within(target, targetPath) ||
        !physicalWritableRoots.some((root) => within(root, sourcePath))
      )
        throw new HbarError('NODE_DENIED', 'Workspace nested write grants must be canonical and B-authorized')
    }
    for (const grant of [...(mount.readOnlyPaths ?? []), ...(mount.protectedPaths ?? [])]) {
      const sourcePath = canonicalPath(grant.sourcePath)
      const targetPath = canonicalPath(grant.targetPath)
      if (
        sourcePath !== grant.sourcePath ||
        targetPath !== resolve(target, relative(source, sourcePath)) ||
        !within(source, sourcePath) ||
        !within(target, targetPath)
      )
        throw new HbarError('NODE_DENIED', 'Workspace overlay grants must map within their canonical B-owned root')
    }
  }
  if (internalMounts.length > 0) {
    const byKind = new Map(internalMounts.map((mount) => [mount.kind, mount]))
    const child = byKind.get('managed-worktree')
    const common = byKind.get('common-git')
    const metadata = byKind.get('worktree-metadata')
    const id = child?.worktreeId
    const parentRootId = child?.parentRootId
    const primaryMount = workspaceMounts.find((mount) => mount.rootId === parentRootId)
    if (
      internalMounts.length !== 3 ||
      !child ||
      !common ||
      !metadata ||
      !id ||
      !parentRootId ||
      !primaryMount ||
      internalMounts.some((mount) => mount.worktreeId !== id || mount.parentRootId !== parentRootId) ||
      child.sourcePath !== child.targetPath ||
      common.sourcePath !== common.targetPath ||
      metadata.sourcePath !== metadata.targetPath ||
      child.access !== primaryMount.access ||
      common.access !== 'read' ||
      metadata.access !== 'read' ||
      child.sourcePath !== resolve(dirname(dirname(child.sourcePath)), '.hbar-worktrees', id) ||
      common.sourcePath !== resolve(dirname(dirname(child.sourcePath)), '.git') ||
      metadata.sourcePath !== resolve(common.sourcePath, 'worktrees', id) ||
      !physicalReadableRoots.some((root) => within(root, child.sourcePath)) ||
      !physicalReadableRoots.some((root) => within(root, common.sourcePath)) ||
      (child.access === 'write' && !physicalWritableRoots.some((root) => within(root, child.sourcePath)))
    )
      throw new HbarError('NODE_DENIED', 'Internal worktree mounts must match B-generated canonical Git provenance')
  }
  const isMountedSource = (path: string) => [...physicalRoots].some((root) => within(path, root) || within(root, path))
  const mapMountedPath = (path: string): string | undefined => {
    const mount = workspaceMounts.find((item) => within(item.sourceRoot, path))
    return mount ? resolve(mount.target, relative(mount.sourceRoot, path)) : undefined
  }
  const readableRoots = [
    ...physicalReadableRoots.filter((root) => !isMountedSource(root)),
    ...workspaceMounts.map((mount) => mount.target),
    ...internalMounts.filter((mount) => mount.access === 'read').map((mount) => mount.targetPath),
  ]
  const writableRoots = [
    ...physicalWritableRoots.filter((root) => !isMountedSource(root)),
    ...workspaceMounts.filter((mount) => mount.access === 'write').map((mount) => mount.target),
    ...workspaceMounts.flatMap((mount) => (mount.writePaths ?? []).map((grant) => grant.targetPath)),
    ...internalMounts
      .filter((mount) => mount.access === 'write' && mount.kind !== 'managed-worktree')
      .map((mount) => mount.targetPath),
  ]
  const protectedPaths = [
    ...input.protectedPaths
      .map(canonicalPath)
      .map((path) => mapMountedPath(path) ?? (isMountedSource(path) ? undefined : path))
      .filter((path): path is string => path !== undefined),
  ]
  const readOnlyPaths = [
    ...(input.readOnlyPaths ?? [])
      .map(canonicalPath)
      .map((path) => mapMountedPath(path) ?? (isMountedSource(path) ? undefined : path))
      .filter((path): path is string => path !== undefined),
  ]
  if (!readableRoots.some((root) => within(root, cwd)))
    throw new HbarError('NODE_DENIED', 'The command working directory is outside the readable roots')
  for (const root of writableRoots)
    if (!readableRoots.some((readable) => within(readable, root)))
      throw new HbarError('NODE_DENIED', 'Writable roots must be contained in readable roots')
  for (const root of [...physicalReadableRoots, ...physicalWritableRoots])
    if (root === '/' || forbiddenMountRoots.some((blocked) => within(blocked, root) || within(root, blocked)))
      throw new HbarError('NODE_DENIED', 'Container roots cannot replace host operating-system or runtime directories')
    else if (forbiddenSocketPaths.some((socket) => within(root, socket)))
      throw new HbarError('NODE_DENIED', 'Container roots cannot expose the host container-engine socket')
  for (const path of protectedPaths)
    if (within(path, cwd) || writableRoots.some((root) => within(path, root)))
      throw new HbarError('NODE_DENIED', 'A protected path cannot contain the working directory or a granted root')
  for (const path of readOnlyPaths) {
    if (!readableRoots.some((root) => within(root, path)))
      throw new HbarError('NODE_DENIED', 'A read-only path must be inside a readable root')
    if (writableRoots.some((root) => within(path, root)))
      throw new HbarError('NODE_DENIED', 'A read-only path cannot contain a writable root')
  }
  return { cwd, readableRoots, writableRoots, protectedPaths, readOnlyPaths, workspaceMounts, internalMounts }
}

async function requireExisting(path: string, label: string): Promise<void> {
  try {
    await access(path, constants.F_OK)
    if ((await realpath(path)) !== path)
      throw new HbarError('SANDBOX_BACKEND_UNAVAILABLE', `${label} contains a symlink and cannot be mounted safely`)
    const info = await stat(path)
    if (!info.isFile() && !info.isDirectory())
      throw new HbarError('SANDBOX_BACKEND_UNAVAILABLE', `${label} must be a regular file or directory`)
  } catch {
    throw new HbarError('SANDBOX_BACKEND_UNAVAILABLE', `${label} must exist before a container bind can be planned`)
  }
}

/** Pure engine argument renderer for fixture tests; the caller must verify masks and bind sources. */
export function renderContainerLaunchArgv(
  config: ContainerConfinementConfig,
  input: ContainerRequest,
  jobId: string,
  masks: Readonly<Record<string, { readonly path: string; readonly kind: 'file' | 'directory' }>>,
): readonly [string, ...string[]] {
  validateConfig(config)
  if (!token.test(jobId)) throw new HbarError('INVALID_INPUT', 'Container job id is invalid')
  const paths = validateContainerRequest(input)
  const userId = config.engine === 'docker' ? 0 : process.getuid?.()
  const groupId = config.engine === 'docker' ? 0 : process.getgid?.()
  if (userId === undefined || groupId === undefined) fail('Container confinement requires a Linux B user identity')
  const args: string[] = [
    config.engine,
    'run',
    '--name',
    `hbar-node-${jobId}`,
    '--label',
    `${protectedLabel}=true`,
    '--label',
    `io.hbar.node.job=${jobId}`,
    '--pull=never',
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--pids-limit=128',
    '--network',
    input.confinement.networkEnabled ? 'bridge' : 'none',
    '--tmpfs',
    `/tmp:rw,noexec,nosuid,nodev,size=64m,uid=${userId},gid=${groupId},mode=700`,
    '--tmpfs',
    `/home/hbar:rw,noexec,nosuid,nodev,size=64m,uid=${userId},gid=${groupId},mode=700`,
    '--workdir',
    paths.cwd,
    ...(config.engine === 'podman' ? ['--userns=keep-id'] : []),
    '--user',
    `${userId}:${groupId}`,
    '--init',
  ]
  for (const root of paths.readableRoots)
    if (!paths.workspaceMounts.some((mount) => within(mount.target, root)))
      args.push('--mount', `type=bind,src=${root},dst=${root},ro`)
  for (const root of paths.writableRoots)
    if (!paths.workspaceMounts.some((mount) => within(mount.target, root)))
      args.push('--mount', `type=bind,src=${root},dst=${root},rw`)
  for (const mount of paths.workspaceMounts)
    args.push(
      '--mount',
      `type=bind,src=${mount.sourceRoot},dst=${mount.target},${mount.access === 'write' ? 'rw' : 'ro'}`,
    )
  for (const mount of paths.workspaceMounts)
    for (const grant of mount.writePaths ?? [])
      args.push('--mount', `type=bind,src=${grant.sourcePath},dst=${grant.targetPath},rw`)
  for (const mount of paths.workspaceMounts)
    for (const grant of mount.readOnlyPaths ?? [])
      args.push('--mount', `type=bind,src=${grant.sourcePath},dst=${grant.targetPath},ro`)
  for (const path of paths.readOnlyPaths) {
    const mount = paths.workspaceMounts.find((item) => within(item.target, path))
    const source = mount ? resolve(mount.sourceRoot, relative(mount.target, path)) : path
    args.push('--mount', `type=bind,src=${source},dst=${path},ro`)
  }
  for (const path of paths.protectedPaths) {
    const mask = masks[path]
    if (!mask) continue
    if (!isAbsolute(mask.path) || /[,\r\n]/.test(mask.path))
      throw new HbarError('SANDBOX_BACKEND_UNAVAILABLE', 'Protected path masks require an absolute private source path')
    args.push('--mount', `type=bind,src=${mask.path},dst=${path},ro`)
  }
  for (const mount of paths.internalMounts) {
    if (mount.kind === 'common-git') continue
    args.push(
      '--mount',
      `type=bind,src=${mount.sourcePath},dst=${mount.targetPath},${mount.access === 'write' ? 'rw' : 'ro'}`,
    )
  }
  args.push('--env', 'HOME=/home/hbar', '--env', 'TMPDIR=/tmp')
  for (const [name, value] of Object.entries(input.environment)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(name) || value.includes('\0'))
      throw new HbarError('NODE_DENIED', 'Invalid container environment entry')
    args.push('--env', `${name}=${value}`)
  }
  args.push(
    config.imageId,
    ...(input.operation.kind === 'argv' ? input.operation.argv : ['/bin/sh', '-c', input.operation.command]),
  )
  return args as [string, ...string[]]
}

/** Render one foreground container job. All mount sources are B-verified before launch. */
export async function prepareContainerConfinement(
  config: ContainerConfinementConfig,
  input: ContainerRequest,
  jobId: string = crypto.randomUUID(),
): Promise<ContainerLaunchPlan> {
  validateConfig(config)
  if (!token.test(jobId)) throw new HbarError('INVALID_INPUT', 'Container job id is invalid')
  const paths = validateContainerRequest(input)
  const isViewTarget = (path: string) => paths.workspaceMounts.some((mount) => within(mount.target, path))
  for (const root of paths.readableRoots) if (!isViewTarget(root)) await requireExisting(root, 'Readable root')
  for (const root of paths.writableRoots) if (!isViewTarget(root)) await requireExisting(root, 'Writable root')
  await requireWorkspaceMounts(paths.workspaceMounts)
  await requireInternalMounts(paths.internalMounts)
  const sourceForView = (path: string) => {
    const mount = paths.workspaceMounts.find((item) => within(item.target, path))
    return mount ? resolve(mount.sourceRoot, relative(mount.target, path)) : path
  }
  for (const path of paths.readOnlyPaths) await requireExisting(sourceForView(path), 'Read-only path')

  const maskRoot = await mkdtemp(join(config.dataRoot, '.container-mask-'))
  try {
    await mkdir(maskRoot, { recursive: true, mode: 0o700 })
    const masks: Record<string, { path: string; kind: 'file' | 'directory' }> = {}
    for (const path of paths.protectedPaths) {
      if (!paths.readableRoots.some((root) => within(root, path))) continue
      let info
      const sourcePath = sourceForView(path)
      try {
        const actual = await realpath(sourcePath)
        if (actual !== sourcePath)
          throw new HbarError('NODE_ROOT_CHANGED', 'A protected workspace path changed through a symlink')
        info = await stat(actual)
      } catch (error) {
        if (error instanceof Error && 'code' in error && String(error.code) === 'ENOENT') {
          if (paths.writableRoots.some((root) => within(root, path))) {
            const source = join(maskRoot, crypto.randomUUID())
            await mkdir(source, { mode: 0o700 })
            masks[path] = { path: source, kind: 'directory' }
          }
          continue
        }
        throw error
      }
      const source = join(maskRoot, crypto.randomUUID())
      if (info.isDirectory()) {
        await mkdir(source, { mode: 0o700 })
        for (const mount of paths.internalMounts) {
          if (mount.kind !== 'worktree-metadata' || !within(path, mount.targetPath)) continue
          const nested = resolve(source, relative(path, mount.targetPath))
          if (!within(source, nested))
            throw new HbarError('NODE_DENIED', 'Managed Git metadata mount leaves its private protected mask')
          await mkdir(nested, { recursive: true, mode: 0o700 })
        }
        masks[path] = { path: source, kind: 'directory' }
      } else if (info.isFile()) {
        await writeFile(source, '', { mode: 0o600, flag: 'wx' })
        masks[path] = { path: source, kind: 'file' }
      } else throw new HbarError('SANDBOX_BACKEND_UNAVAILABLE', 'Protected paths must be regular files or directories')
    }
    return {
      name: `hbar-node-${jobId}`,
      argv: renderContainerLaunchArgv(config, input, jobId, masks),
      cleanupRoot: maskRoot,
      cleanup: async () => await rm(maskRoot, { recursive: true, force: true }),
    }
  } catch (error) {
    await rm(maskRoot, { recursive: true, force: true })
    throw error
  }
}

interface ProbeCommandResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
  readonly timedOut: boolean
}
async function readBounded(stream: ReadableStream<Uint8Array>, maximum = 4_000): Promise<string> {
  const reader = stream.getReader()
  let bytes = Buffer.alloc(0)
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) return bytes.toString('utf8')
      const next = Buffer.concat([bytes, part.value])
      bytes = next.byteLength > maximum ? next.subarray(next.byteLength - maximum) : next
    }
  } finally {
    reader.releaseLock()
  }
}
async function runBounded(argv: readonly [string, ...string[]], timeoutMs = 3_000): Promise<ProbeCommandResult> {
  const child = Bun.spawn([...argv], { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', windowsHide: true })
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    child.kill('SIGKILL')
  }, timeoutMs)
  try {
    const [stdout, stderr, code] = await Promise.all([
      readBounded(child.stdout),
      readBounded(child.stderr),
      child.exited,
    ])
    return { code, stdout, stderr, timedOut }
  } finally {
    clearTimeout(timeout)
  }
}
function probeJobPrefix(engine: string, name: string, jobId: string): string[] {
  return [
    engine,
    'run',
    '--name',
    name,
    '--label',
    `${protectedLabel}=true`,
    '--label',
    `io.hbar.node.job=${jobId}`,
    '--pull=never',
  ]
}
async function probeJobState(engine: string, name: string, jobId: string): Promise<'absent' | 'owned' | 'foreign'> {
  const result = await runBounded([
    engine,
    'inspect',
    '--format',
    `{{.Name}}\t{{index .Config.Labels "${protectedLabel}"}}\t{{index .Config.Labels "io.hbar.node.job"}}`,
    name,
  ])
  if (result.code !== 0) return /no such (object|container)|not found/i.test(result.stderr) ? 'absent' : 'foreign'
  return result.stdout.trim() === `/${name}\ttrue\t${jobId}` ? 'owned' : 'foreign'
}
async function cleanupProbeJob(
  engine: string,
  name: string,
  jobId: string,
  creationKnownAbsent: boolean,
): Promise<boolean> {
  const deadline = Date.now() + 5_000
  let absentCount = 0
  let removalAttempted = false
  while (Date.now() < deadline) {
    const state = await probeJobState(engine, name, jobId)
    if (state === 'foreign') return false
    if (state === 'owned') {
      if (removalAttempted) return false
      removalAttempted = true
      const removed = await runBounded([engine, 'rm', '-f', name], 5_000)
      if (removed.code !== 0) return false
      absentCount = 0
      continue
    }
    if (removalAttempted) return true
    absentCount++
    if (absentCount >= 10) return creationKnownAbsent
    await Bun.sleep(100)
  }
  return false
}
async function runNamedProbe(
  engine: string,
  imageId: string,
  args: readonly string[],
  command: readonly string[],
  timeoutMs = 4_000,
): Promise<ProbeCommandResult> {
  const jobId = crypto.randomUUID()
  const name = `hbar-probe-${jobId}`
  let result: ProbeCommandResult | undefined
  let commandError: unknown
  try {
    result = await runBounded(
      [...probeJobPrefix(engine, name, jobId), ...args, imageId, ...command] as [string, ...string[]],
      timeoutMs,
    )
  } catch (error) {
    commandError = error
  }
  const creationKnownAbsent = result !== undefined && result.code !== 125 && !result.timedOut
  const cleaned = await cleanupProbeJob(engine, name, jobId, creationKnownAbsent)
  if (!cleaned) throw new Error(`Could not confirm cleanup of owned capability probe ${name}`)
  if (commandError !== undefined) throw commandError
  if (!result) throw new Error('Container capability probe returned no result')
  return result
}

/** A live engine is insufficient: rootless mode, pinned image and kernel-enforced probes must all pass. */
export async function probeContainerConfinement(config: ContainerConfinementConfig): Promise<ContainerCapabilities> {
  try {
    validateConfig(config)
    if (process.platform !== 'linux')
      return {
        backend: 'container',
        available: false,
        filesystem: false,
        network: false,
        processTree: false,
        reason: 'Container confinement is supported only on Linux B nodes',
      }
    if (process.getuid?.() === undefined || process.getuid?.() === 0)
      return {
        backend: 'container',
        available: false,
        filesystem: false,
        network: false,
        processTree: false,
        reason: 'The B node must run as a non-root user for rootless container isolation',
      }
    const engine = Bun.which(config.engine)
    if (!engine)
      return {
        backend: 'container',
        available: false,
        filesystem: false,
        network: false,
        processTree: false,
        reason: `${config.engine} is not installed`,
      }
    const info =
      config.engine === 'podman'
        ? await runBounded([engine, 'info', '--format', '{{.Host.Security.Rootless}}'])
        : await runBounded([engine, 'info', '--format', '{{json .SecurityOptions}}'])
    const isRootless = config.engine === 'podman' ? info.stdout.trim() === 'true' : /rootless/i.test(info.stdout)
    if (info.code !== 0 || !isRootless)
      return {
        backend: 'container',
        available: false,
        filesystem: false,
        network: false,
        processTree: false,
        reason: 'The configured engine did not prove rootless operation',
      }
    const image = await runBounded([engine, 'image', 'inspect', '--format', '{{.Id}}', config.imageId])
    if (image.code !== 0 || image.stdout.trim() !== config.imageId)
      return {
        backend: 'container',
        available: false,
        filesystem: false,
        network: false,
        processTree: false,
        reason: 'The configured immutable image is not already present locally',
      }
    // Establish a positive TCP baseline, then prove the same host service is unreachable with network=none.
    const server = createServer((socket) => socket.end('hbar-container-network-probe'))
    await new Promise<void>((resolveListen, reject) => {
      server.once('error', reject)
      server.listen(0, '0.0.0.0', resolveListen)
    })
    const address = server.address()
    if (!address || typeof address === 'string') {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()))
      return {
        backend: 'container',
        available: false,
        filesystem: false,
        network: false,
        processTree: false,
        reason: 'Could not create a bounded host socket for the network probe',
      }
    }
    const socketScript =
      'const net=require("node:net");const s=net.createConnection({host:"hbar-probe-host",port:Number(process.argv[1])});const expected=process.argv[2];let done=false;const finish=(ok)=>{if(done)return;done=true;s.destroy();process.exit(ok?0:1)};s.once("connect",()=>finish(expected==="connected"));s.once("error",()=>finish(expected==="blocked"));setTimeout(()=>finish(false),2000)'
    try {
      const networkOn = await runNamedProbe(
        engine,
        config.imageId,
        [
          '--network',
          'bridge',
          '--add-host',
          'hbar-probe-host:host-gateway',
          '--read-only',
          '--tmpfs',
          '/tmp:rw,size=1m',
        ],
        ['node', '-e', socketScript, String(address.port), 'connected'],
        5_000,
      )
      const networkOff = await runNamedProbe(
        engine,
        config.imageId,
        [
          '--network',
          'none',
          '--add-host',
          'hbar-probe-host:host-gateway',
          '--read-only',
          '--tmpfs',
          '/tmp:rw,size=1m',
        ],
        ['node', '-e', socketScript, String(address.port), 'blocked'],
        5_000,
      )
      if (networkOn.code !== 0 || networkOff.code !== 0)
        return {
          backend: 'container',
          available: false,
          filesystem: false,
          network: false,
          processTree: false,
          reason: 'The engine failed positive TCP reachability or network=none socket denial',
        }
    } finally {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()))
    }

    const probeRoot = await mkdtemp(join(tmpdir(), 'hbar-container-probe-'))
    try {
      const writable = join(probeRoot, 'write')
      const protectedRoot = join(probeRoot, 'protected')
      await mkdir(writable)
      await mkdir(protectedRoot)
      const filesystem = await runNamedProbe(
        engine,
        config.imageId,
        [
          '--read-only',
          '--network',
          'none',
          '--cap-drop=ALL',
          '--security-opt=no-new-privileges',
          '--mount',
          `type=bind,src=${writable},dst=/hbar-write,rw`,
          '--mount',
          `type=bind,src=${protectedRoot},dst=/hbar-protected,ro`,
        ],
        ['/bin/sh', '-c', 'touch /hbar-write/ok && ! touch /hbar-protected/denied && ! touch /etc/hbar-root-denied'],
      )
      if (
        filesystem.code !== 0 ||
        !(await Bun.file(join(writable, 'ok')).exists()) ||
        (await Bun.file(join(protectedRoot, 'denied')).exists())
      )
        return {
          backend: 'container',
          available: false,
          filesystem: false,
          network: false,
          processTree: false,
          reason: 'The engine failed mounted filesystem enforcement probes',
        }
      const processTreeProbe = await runNamedProbe(
        engine,
        config.imageId,
        ['--detach', '--network', 'none', '--pids-limit=32'],
        ['/bin/sh', '-c', 'sleep 60 & wait'],
      )
      if (processTreeProbe.code !== 0 || !processTreeProbe.stdout.trim())
        return {
          backend: 'container',
          available: false,
          filesystem: false,
          network: false,
          processTree: false,
          reason: 'The engine could not prove cleanup of a container process tree',
        }
      return {
        backend: 'container',
        available: true,
        filesystem: true,
        network: true,
        processTree: true,
        engine: config.engine,
        imageId: config.imageId,
      }
    } finally {
      await rm(probeRoot, { recursive: true, force: true })
    }
  } catch (error) {
    return {
      backend: 'container',
      available: false,
      filesystem: false,
      network: false,
      processTree: false,
      reason: error instanceof Error ? error.message.slice(0, 300) : 'Container confinement probe failed',
    }
  }
}

export function containerExecutablePath(engine: ContainerEngine): string | undefined {
  return Bun.which(engine) ?? undefined
}

async function requireWorkspaceMounts(mounts: readonly NodeExecutionWorkspaceMount[]): Promise<void> {
  for (const mount of mounts) await requireExisting(mount.sourceRoot, 'Workspace mount source')
  for (const mount of mounts) {
    for (const grant of [...(mount.writePaths ?? []), ...(mount.readOnlyPaths ?? [])])
      await requireExisting(grant.sourcePath, 'Workspace overlay source')
  }
}

async function requireInternalMounts(mounts: readonly NodeExecutionInternalMount[]): Promise<void> {
  for (const mount of mounts) await requireExisting(mount.sourcePath, 'Managed worktree mount source')
  await verifyManagedWorktreeMounts(mounts)
}
