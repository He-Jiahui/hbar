import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { delimiter, isAbsolute, resolve, sep } from 'node:path'
import { HbarError } from '@hbar/contracts'
import type { NodeFloor } from '@hbar/contracts/node'
import type { NodeExecutionBackend, NodeExecutionBackendOptions } from '@hbar/node-core'
import { ManagedProcess, RuntimeArtifactStore, type RuntimeArtifactPackage } from '@hbar/runtime'
import { createRuntimeProcessTreePort } from '@hbar/runtime-native'
import type { ZodType } from 'zod'
import { nodeRuntimeBuildUnit } from './runtime-build'
import { nodeProcessOutputSchema, nodeArgvOutputSchema, nodeProcessOutputReadResultSchema } from './execution-contract'
import { probeUnixConfinement, type UnixConfinementBackend, type UnixConfinementCapabilities } from './unix-confinement'
import { createContainerNodeBackend, type ContainerCapabilities } from './container-backend'
import { createWindowsExecutionBackend } from './windows-backend'
import { probeContainerConfinement, type ContainerConfinementConfig } from './container-confinement'

type ManagedIsolationBackend = UnixConfinementBackend | 'container' | 'none'

export interface ManagedNodeBackendProbe {
  readonly requested: NodeFloor['backend']
  readonly selected: ManagedIsolationBackend
  readonly available: boolean
  readonly filesystem: boolean
  readonly network: boolean
  readonly processTree: boolean
  readonly reason?: string
}

export class ManagedProbeOutputReader {
  private pendingRead: ReturnType<ReadableStreamDefaultReader<Uint8Array>['read']> | undefined
  private output = ''
  private released = false

  constructor(private readonly reader: ReadableStreamDefaultReader<Uint8Array>) {}

  text(): string {
    return this.output
  }

  private readChunk(): ReturnType<ReadableStreamDefaultReader<Uint8Array>['read']> {
    if (this.pendingRead) return this.pendingRead
    const pendingRead = this.reader.read().finally(() => {
      if (this.pendingRead === pendingRead) this.pendingRead = undefined
    })
    this.pendingRead = pendingRead
    return pendingRead
  }

  async until(marker: string, deadline: number): Promise<boolean> {
    while (!this.output.includes(marker)) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) return false
      const read = this.readChunk().then(
        (value) => ({ kind: 'read' as const, value }),
        () => ({ kind: 'error' as const }),
      )
      const result = await Promise.race([
        read,
        Bun.sleep(Math.min(25, remaining)).then(() => ({ kind: 'wait' as const })),
      ])
      if (result.kind === 'wait') continue
      if (result.kind === 'error' || result.value.done) return false
      this.output += new TextDecoder().decode(result.value.value)
      if (this.output.length > 4_000) return false
    }
    return true
  }

  async cancel(): Promise<void> {
    if (this.released) return
    this.released = true
    try {
      await this.reader.cancel()
    } catch {
      // The stream may already have closed.
    } finally {
      await this.pendingRead?.catch(() => undefined)
      this.reader.releaseLock()
    }
  }
}

function resolveBackend(requested: NodeFloor['backend']): ManagedIsolationBackend {
  if (requested === 'auto') {
    if (process.platform === 'linux') return 'bwrap'
    if (process.platform === 'darwin') return 'seatbelt'
    return 'none'
  }
  return requested === 'bwrap' || requested === 'seatbelt' || requested === 'container' ? requested : 'none'
}

export function resolveContainerConfig(
  dataRoot: string,
  explicit?: ContainerConfinementConfig,
  environment: NodeJS.ProcessEnv = process.env,
): ContainerConfinementConfig | undefined {
  const engine = explicit?.engine ?? environment.HBAR_NODE_CONTAINER_ENGINE
  const imageId = explicit?.imageId ?? environment.HBAR_NODE_CONTAINER_IMAGE
  if (!engine && !imageId) return undefined
  if ((engine !== 'docker' && engine !== 'podman') || !imageId || !/^sha256:[a-f0-9]{64}$/.test(imageId))
    return undefined
  return {
    engine,
    imageId,
    dataRoot: explicit?.dataRoot ?? dataRoot,
    ...(explicit?.maxConcurrentJobs !== undefined ? { maxConcurrentJobs: explicit.maxConcurrentJobs } : {}),
  }
}

async function probeNativeProcessTree(): Promise<string | undefined> {
  let port: ReturnType<typeof createRuntimeProcessTreePort>
  try {
    port = createRuntimeProcessTreePort()
  } catch {
    return 'The native runtime process-tree module is unavailable'
  }
  const nativeModuleUrl = import.meta.resolve('@hbar/runtime-native')
  const helperCode = [
    `(await import(${JSON.stringify(nativeModuleUrl)})).enterRuntimeProcessGroup();`,
    `console.log('hbar-owner-ready');`,
    `await Bun.sleep(500);`,
    `console.log('hbar-after-sleep');`,
    `const child = Bun.spawn([process.execPath, '-e', 'setInterval(()=>{},1000)'], {stdin:'ignore',stdout:'ignore',stderr:'ignore'});`,
    `console.log('hbar-leaf:' + child.pid);`,
    `await new Promise(resolve => setInterval(resolve,1000));`,
  ].join('\n')
  const helper = Bun.spawn([process.execPath, '-e', helperCode], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      HBAR_RUNTIME_PROCESS_GROUP: '1',
    },
    detached: true,
    timeout: 8_000,
    killSignal: 'SIGKILL',
  })
  let tree: Awaited<ReturnType<typeof port.attach>> | undefined
  let leafPid: number | undefined
  const stderrText = new Response(helper.stderr).text()
  const stdout = new ManagedProbeOutputReader(helper.stdout.getReader())
  try {
    if (!(await stdout.until('hbar-owner-ready', Date.now() + 4_000))) {
      helper.kill('SIGKILL')
      await helper.exited.catch(() => undefined)
      return `The process-tree probe owner did not become ready (${(await stderrText).slice(0, 300)})`
    }
    tree = await port.attach(helper.pid, AbortSignal.timeout(4_000))
    if (!(await stdout.until('hbar-leaf:', Date.now() + 4_000))) {
      helper.kill('SIGKILL')
      await helper.exited.catch(() => undefined)
      return `The process-tree probe owner did not start a descendant: ${JSON.stringify(stdout.text())} (${(await stderrText).slice(0, 300)})`
    }
    const match = /hbar-leaf:(\d+)/.exec(stdout.text())
    if (!match) return 'The process-tree probe did not report its descendant PID'
    leafPid = Number(match[1])
    tree.terminate()
    await helper.exited
    await tree.join(4_000)
    tree.close()
    try {
      process.kill(leafPid, 0)
      return 'The native process-tree port did not terminate the probe descendant'
    } catch {
      return undefined
    }
  } catch (error) {
    return error instanceof Error ? error.message.slice(0, 300) : 'The native process-tree probe failed'
  } finally {
    await stdout.cancel()
    if (tree) {
      try {
        tree.terminate()
        await tree.join(4_000)
        tree.close()
      } catch {
        // An unconfirmed tree makes the capability probe fail.
      }
    }
    if (helper.exitCode === null) {
      helper.kill('SIGKILL')
      await helper.exited.catch(() => undefined)
    }
  }
}

/** Performs live backend and native descendant probes for the requested B floor selection. */
export async function probeManagedNodeBackend(
  requested: NodeFloor['backend'],
  containerConfig?: ContainerConfinementConfig,
): Promise<ManagedNodeBackendProbe> {
  let selected = resolveBackend(requested)
  if (selected === 'container') {
    const capabilities: ContainerCapabilities = containerConfig
      ? await probeContainerConfinement(containerConfig)
      : {
          backend: 'container',
          available: false,
          filesystem: false,
          network: false,
          processTree: false,
          reason: 'B has no fixed local container engine and image configuration',
        }
    const available =
      capabilities.available && capabilities.filesystem && capabilities.network && capabilities.processTree
    return {
      requested,
      selected: available ? 'container' : 'none',
      available,
      filesystem: available && capabilities.filesystem,
      network: available && capabilities.network,
      processTree: capabilities.processTree,
      ...(!available
        ? { reason: capabilities.reason ?? 'The container backend did not pass every live capability probe' }
        : {}),
    }
  }
  if (requested === 'auto' && process.platform === 'linux') selected = 'bwrap'
  const processTreeReason = await probeNativeProcessTree()
  const processTree = processTreeReason === undefined
  if (selected === 'none')
    return {
      requested,
      selected,
      available: false,
      filesystem: false,
      network: false,
      processTree,
      reason: processTreeReason ?? 'No supported isolation backend was selected for this platform',
    }
  const capabilities: UnixConfinementCapabilities = await probeUnixConfinement(selected)
  let available = capabilities.available && capabilities.filesystem && capabilities.network && processTree
  if (!available && requested === 'auto' && process.platform === 'linux' && containerConfig) {
    const container: ContainerCapabilities = await probeContainerConfinement(containerConfig)
    available = container.available && container.filesystem && container.network && container.processTree
    if (available)
      return { requested, selected: 'container', available, filesystem: true, network: true, processTree: true }
  }
  return {
    requested,
    selected: available ? selected : 'none',
    available,
    filesystem: available && capabilities.filesystem,
    network: available && capabilities.network,
    processTree,
    ...(!available
      ? { reason: capabilities.reason ?? processTreeReason ?? 'The managed native process tree probe failed' }
      : {}),
  }
}

/** Only B-owned allowed values and B's program lookup are inherited. */
export function nodeProcessEnvironment(
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

async function resolveBExecutable(
  workspace: string,
  argv: readonly [string, ...string[]],
): Promise<readonly [string, ...string[]]> {
  const executable = argv[0]
  if (isAbsolute(executable)) return argv
  if (executable.includes(sep) || (process.platform === 'win32' && executable.includes('/')))
    return [resolve(workspace, executable), ...argv.slice(1)]
  const searchPath = process.env.PATH ?? ''
  const extensions =
    process.platform === 'win32' ? (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean) : ['']
  for (const directory of searchPath.split(delimiter).filter(Boolean))
    for (const extension of extensions) {
      const candidate = resolve(directory, process.platform === 'win32' ? `${executable}${extension}` : executable)
      try {
        await access(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK)
        return [candidate, ...argv.slice(1)]
      } catch {
        // Continue searching the B node's configured program path.
      }
    }
  throw new HbarError('NODE_PROGRAM_NOT_FOUND', 'The requested executable is not available on the B node')
}

export async function createManagedNodeBackend(options: {
  dataRoot: string
  sourceRoot?: string
  command?: readonly [string, ...string[]]
  packaged?: RuntimeArtifactPackage
  backend?: NodeFloor['backend']
  container?: ContainerConfinementConfig
}): Promise<NodeExecutionBackend> {
  const requested = options.backend ?? 'auto'
  if (process.platform === 'win32' && (requested === 'auto' || requested === 'windows-restricted'))
    return createWindowsExecutionBackend({ dataRoot: options.dataRoot })
  const containerConfig = resolveContainerConfig(options.dataRoot, options.container)
  const probe = await probeManagedNodeBackend(requested, containerConfig)
  if (probe.selected === 'container' && containerConfig) return await createContainerNodeBackend(containerConfig)
  let processTree: ReturnType<typeof createRuntimeProcessTreePort> | undefined
  if (probe.processTree) processTree = createRuntimeProcessTreePort()
  const registry = new RuntimeArtifactStore(
    resolve(options.dataRoot, 'execution-artifacts'),
    options.sourceRoot ?? resolve(import.meta.dir, '../../..'),
  )
  const build = nodeRuntimeBuildUnit()
  const artifact = options.packaged
    ? (await registry.installPackage(options.packaged, options.packaged.id)).artifacts.find(
        (unit) => unit.unitId === build.descriptor.id,
      )
    : await registry.build(build)
  if (!artifact) throw new HbarError('NODE_EXECUTION_UNAVAILABLE', 'Packaged node execution owner is missing')
  const modulePath = await registry.modulePath(artifact.id)
  const owners = new Set<ManagedProcess>()
  let closed = false

  const invoke = async <Result>(
    workspace: string,
    operation: { kind: 'command'; command: string } | { kind: 'argv'; argv: readonly [string, ...string[]] },
    signal: AbortSignal,
    input: NodeExecutionBackendOptions,
    method: 'node.exec' | 'node.execArgv',
    outputSchema: ZodType<Result>,
  ): Promise<Result> => {
    if (closed) throw new HbarError('NODE_OFFLINE', 'Node execution backend is closed')
    if (requested === 'container')
      throw new HbarError(
        'SANDBOX_BACKEND_UNAVAILABLE',
        probe.reason ?? 'The explicitly selected container backend is unavailable',
      )
    if (!probe.processTree || !processTree)
      throw new HbarError('SANDBOX_BACKEND_UNAVAILABLE', 'Native managed process-tree enforcement is unavailable')
    if (input.confinement && !probe.available)
      throw new HbarError(
        'SANDBOX_BACKEND_UNAVAILABLE',
        probe.reason ?? 'The selected isolation backend is unavailable',
      )
    signal.throwIfAborted()
    const resolvedOperation =
      operation.kind === 'argv'
        ? { ...operation, argv: await resolveBExecutable(workspace, operation.argv) }
        : operation
    const owner = new ManagedProcess({
      descriptor: build.descriptor,
      artifactId: artifact.id,
      modulePath,
      generation: 1,
      parent: { unitId: 'node', generation: 1, incarnation: crypto.randomUUID() },
      command: options.command ?? [process.execPath, resolve(import.meta.dir, 'runtime-entry.ts')],
      processTree,
      verifyModule: async () => {
        await registry.get(artifact.id)
      },
      onFault: async () => {
        void owner.dispose().catch(() => undefined)
      },
    })
    owners.add(owner)
    const abort = () => {
      void owner.dispose().catch(() => undefined)
    }
    signal.addEventListener('abort', abort, { once: true })
    try {
      await owner.prepare()
      signal.throwIfAborted()
      await owner.activate()
      const environment = nodeProcessEnvironment(input.environmentAllowlist, input.environment)
      const request = {
        workspace,
        operation: resolvedOperation,
        timeoutMs: input.timeoutMs,
        environment,
        confinement: input.confinement
          ? { ...input.confinement, ...(probe.selected === 'none' ? {} : { backend: probe.selected }) }
          : null,
        protectedPaths: input.protectedPaths,
        readOnlyPaths: input.readOnlyPaths ?? [],
        workspaceMounts: input.workspaceMounts ?? [],
        internalMounts: input.internalMounts ?? [],
      }
      if (!input.onOutput && !input.onOutputReset)
        return await owner.call(method, request, outputSchema, { signal, timeoutMs: input.timeoutMs + 5_000 })
      let settled = false
      const result = owner
        .call(method, request, outputSchema, { signal, timeoutMs: input.timeoutMs + 5_000 })
        .finally(() => {
          settled = true
        })
      const readOutput = async () => {
        let afterSeq = 0
        for (;;) {
          signal.throwIfAborted()
          const page = await owner.call('node.execOutput.read', { afterSeq }, nodeProcessOutputReadResultSchema, {
            signal,
            timeoutMs: 5_000,
          })
          if (page.reset) input.onOutputReset?.()
          for (const frame of page.items) {
            input.onOutput?.(frame.text)
            afterSeq = frame.seq
          }
          // The process may have exited while the bounded IPC ring still has more pages.
          // A settled/inactive response only marks the producer as done; drain until an empty page.
          if (settled && !page.active && page.items.length === 0) return
          if (page.items.length === 0) {
            // Bun 1.4 exposes only the bounded duration overload; observe cancellation
            // immediately before and after this short polling delay.
            signal.throwIfAborted()
            await Bun.sleep(25)
            signal.throwIfAborted()
          }
        }
      }
      const [, value] = await Promise.all([readOutput(), result])
      return value
    } catch (error) {
      if (signal.aborted) throw new HbarError('CANCELLED', 'Node execution cancelled')
      if (
        error instanceof HbarError &&
        [
          'INVALID_INPUT',
          'NODE_DENIED',
          'NODE_EXECUTION_REVOKED',
          'NODE_PROGRAM_NOT_FOUND',
          'SANDBOX_BACKEND_UNAVAILABLE',
        ].includes(error.code)
      )
        throw error
      throw new HbarError('EFFECT_UNKNOWN', 'Node execution owner response was lost; reconcile its receipt', {
        cause: error,
      })
    } finally {
      signal.removeEventListener('abort', abort)
      await owner.dispose()
      owners.delete(owner)
    }
  }

  return {
    name: probe.available ? probe.selected : 'none',
    filesystem: probe.available && probe.filesystem,
    network: probe.available && probe.network,
    processTree: probe.processTree,
    async exec(workspace, command, signal, input) {
      return await invoke(workspace, { kind: 'command', command }, signal, input, 'node.exec', nodeProcessOutputSchema)
    },
    async execArgv(workspace, argv, signal, input) {
      const { timedOut, ...result } = await invoke(
        workspace,
        { kind: 'argv', argv },
        signal,
        input,
        'node.execArgv',
        nodeArgvOutputSchema,
      )
      return { ...result, ...(timedOut === true ? { timedOut: true } : {}) }
    },
    async dispose() {
      closed = true
      await Promise.all([...owners].map((owner) => owner.dispose()))
      owners.clear()
    },
  }
}
