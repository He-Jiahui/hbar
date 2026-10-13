import { posix, win32 } from 'node:path'
import type { z } from 'zod'
import { HbarError, type Device, type Session, type TerminalInfo } from '@hbar/contracts'
import { deviceAccessOf } from '@hbar/contracts/device'
import type { Workspace } from '@hbar/contracts/directory'
import { assertLocalWorkspace } from '@hbar/contracts/local-workspace'
import { workspaceLocationOf as getWorkspaceLocation } from '@hbar/contracts/node-address'
import type { ResolvedSandboxProfile, SandboxSnapshotRef } from '@hbar/contracts/sandbox'
import { sandboxProfileIdSchema } from '@hbar/contracts/sandbox'
import { NODE_TERMINAL_LIMITS, type NodeTerminalScope } from '@hbar/contracts/node-terminal'
import { nodeWorkspaceMethods, type NodeCapabilities, type NodeWorkspaceMethod } from '@hbar/contracts/node'
import { sandboxSnapshotContent } from '@hbar/sandbox'
import type { RuntimeNodeLinkPort } from './runtime-node-link-contract'
import { SystemTerminalManager, type SystemTerminalCallbacks } from './system-terminal'

export interface NodeTerminalSnapshot {
  readonly ref: SandboxSnapshotRef
  readonly profile: ResolvedSandboxProfile
}
interface RemoteTerminal {
  readonly info: TerminalInfo
  readonly scope: NodeTerminalScope
  readonly nodeId: string
  callbacks?: SystemTerminalCallbacks | undefined
  cursor: number
  pollController?: AbortController | undefined
  pollTask?: Promise<void> | undefined
  closeRequested: boolean
}
export interface NodeTerminalRouterOptions {
  readonly local: Pick<
    SystemTerminalManager,
    'open' | 'attach' | 'detach' | 'list' | 'write' | 'resize' | 'close' | 'closeAll'
  >
  readonly node?: Pick<RuntimeNodeLinkPort, 'call'> | undefined
  readonly getWorkspace: (workspaceId: string) => Promise<Workspace>
  readonly getSession: (sessionId: string) => Promise<Session>
  readonly loadSandbox: (sessionId: string) => Promise<NodeTerminalSnapshot>
}

const gapMarker = '\r\n[Remote terminal output gap: some output is no longer available.]\r\n'
const pollPauseMs = 80
const creditBytes = NODE_TERMINAL_LIMITS.outputFrameBytes * 2

function splitTerminalInput(value: string): string[] {
  const parts: string[] = []
  let part = ''
  let bytes = 0
  for (const character of value) {
    const size = Buffer.byteLength(character)
    if (bytes + size > NODE_TERMINAL_LIMITS.inputFrameBytes) {
      parts.push(part)
      part = ''
      bytes = 0
    }
    part += character
    bytes += size
  }
  if (part) parts.push(part)
  return parts
}

/** Bounded, pull-based bridge between stable Host terminal RPC and the named /node protocol. */
export class NodeTerminalRouter {
  private readonly remote = new Map<string, RemoteTerminal>()
  private disposed = false

  constructor(private readonly options: NodeTerminalRouterOptions) {}

  private async call<Method extends NodeWorkspaceMethod>(
    nodeId: string,
    method: Method,
    input: z.input<(typeof nodeWorkspaceMethods)[Method]['input']>,
    signal?: AbortSignal,
  ): Promise<z.output<(typeof nodeWorkspaceMethods)[Method]['output']>> {
    const node = this.options.node
    if (!node) throw new HbarError('NODE_LINK_UNAVAILABLE', 'Remote terminals require the node link')
    const schema = nodeWorkspaceMethods[method]
    // Parsing with the selected method's schema justifies this input narrowing for the generic link port.
    const parsedInput = schema.input.parse(input) as z.input<(typeof nodeWorkspaceMethods)[Method]['input']>
    const result: unknown = await node.call(nodeId, method, parsedInput, signal)
    return schema.output.parse(result) as z.output<(typeof nodeWorkspaceMethods)[Method]['output']>
  }

  async open(
    device: Device,
    workspaceId: string,
    operationId: string | undefined,
    sessionId: string | undefined,
    cols: number,
    rows: number,
    callbacks: SystemTerminalCallbacks,
  ): Promise<TerminalInfo> {
    if (this.disposed) throw new HbarError('HOST_CLOSING', 'Terminal router is closed')
    const access = deviceAccessOf(device)
    if (access.role !== 'operator') throw new HbarError('FORBIDDEN', 'Observers cannot open terminals')
    if (access.workspaceIds !== null && !access.workspaceIds.includes(workspaceId))
      throw new HbarError('FORBIDDEN', 'This device cannot access that workspace')
    const workspace = await this.options.getWorkspace(workspaceId)
    const location = getWorkspaceLocation(workspace)
    if (location.kind === 'local') {
      assertLocalWorkspace(workspace.path)
      if (sessionId) {
        const session = await this.options.getSession(sessionId)
        if (session.workspaceId !== workspace.id)
          throw new HbarError('WORKSPACE_SCOPE', 'Session belongs to another workspace')
      }
      return this.options.local.open(device.id, workspace.id, workspace.path, cols, rows, callbacks)
    }
    if (!sessionId) throw new HbarError('INVALID_INPUT', 'A session ID is required for a remote terminal')
    const session = await this.options.getSession(sessionId)
    if (session.workspaceId !== workspace.id)
      throw new HbarError('WORKSPACE_SCOPE', 'Session belongs to another workspace')
    const signal = AbortSignal.timeout(30_000)
    const capabilities = (await this.nodeCall(
      workspace,
      location.nodeId,
      'node.capabilities',
      {},
      signal,
    )) as NodeCapabilities
    const root = capabilities.roots.find((candidate) => candidate.rootId === location.rootId)
    if (!root || root.nodePath !== location.nodePath)
      throw new HbarError('NODE_ROOT_CHANGED', 'Remote workspace root no longer matches its binding')
    if (!capabilities.floor.process || !capabilities.floor.terminal)
      throw new HbarError('NODE_DENIED', 'The node floor disables terminal or process access')
    if (capabilities.sandbox.filesystem !== 'enforced')
      throw new HbarError('SANDBOX_BACKEND_UNAVAILABLE', 'The node cannot enforce filesystem confinement for terminals')

    const snapshot = await this.options.loadSandbox(session.id)
    const verified = nodeWorkspaceMethods['terminal.open'].input.parse({
      operationId: operationId ?? crypto.randomUUID(),
      scope: { nodeId: location.nodeId, rootId: location.rootId, sessionId: session.id, ownerDeviceId: device.id },
      sandbox: snapshot.ref,
      cwd: '.',
      cols,
      rows,
    })
    await this.nodeCall(
      workspace,
      location.nodeId,
      'sandbox.put',
      { ref: snapshot.ref, profile: snapshot.profile },
      signal,
    )
    const remoteInfo = (await this.call(location.nodeId, 'terminal.open', verified, signal)) as {
      terminalId: string
      scope: NodeTerminalScope
      cwd: string
      cols: number
      rows: number
      startedAt: string
      backend: 'bwrap' | 'seatbelt'
    }
    const remotePath = capabilities.platform === 'win32' ? win32 : posix
    const info: TerminalInfo = {
      id: remoteInfo.terminalId,
      workspaceId: workspace.id,
      cwd: remotePath.resolve(location.nodePath, remoteInfo.cwd),
      shell: `remote-shell (${remoteInfo.backend})`,
      cols: remoteInfo.cols,
      rows: remoteInfo.rows,
      startedAt: remoteInfo.startedAt,
    }
    const entry: RemoteTerminal = {
      info,
      scope: remoteInfo.scope,
      nodeId: location.nodeId,
      callbacks,
      cursor: 0,
      closeRequested: false,
    }
    this.remote.set(info.id, entry)
    this.startPolling(entry)
    return info
  }

  private nodeCall<Method extends NodeWorkspaceMethod>(
    workspace: Workspace,
    nodeId: string,
    method: Method,
    input: z.input<(typeof nodeWorkspaceMethods)[Method]['input']>,
    signal: AbortSignal,
  ) {
    const location = getWorkspaceLocation(workspace)
    if (location.kind !== 'node' || location.nodeId !== nodeId)
      throw new HbarError('WORKSPACE_SCOPE', 'Node call does not match the selected workspace')
    return this.call(nodeId, method, input, signal)
  }

  attach(deviceId: string, callbacks: SystemTerminalCallbacks): TerminalInfo[] {
    if (this.disposed) return []
    const local = this.options.local.attach(deviceId, callbacks)
    const remote: TerminalInfo[] = []
    for (const entry of this.remote.values()) {
      if (entry.scope.ownerDeviceId !== deviceId) continue
      entry.callbacks = callbacks
      remote.push(entry.info)
      this.startPolling(entry)
    }
    return [...local, ...remote]
  }

  detach(deviceId: string, callbacks: SystemTerminalCallbacks): void {
    this.options.local.detach(deviceId, callbacks)
    for (const entry of this.remote.values()) {
      if (entry.scope.ownerDeviceId !== deviceId || entry.callbacks !== callbacks) continue
      entry.callbacks = undefined
      entry.pollController?.abort(new HbarError('CANCELLED', 'Terminal client detached'))
    }
  }

  list(deviceId: string): TerminalInfo[] {
    return [
      ...this.options.local.list(deviceId),
      ...[...this.remote.values()]
        .filter((entry) => entry.scope.ownerDeviceId === deviceId && !entry.closeRequested)
        .map((entry) => entry.info),
    ]
  }

  write(deviceId: string, terminalId: string, data: string): void | Promise<void> {
    const entry = this.remote.get(terminalId)
    if (!entry) return this.options.local.write(deviceId, terminalId, data)
    this.assertOwner(entry, deviceId)
    return splitTerminalInput(data).reduce(
      (previous, part) =>
        previous.then(async () => {
          await this.call(entry.nodeId, 'terminal.input', { terminalId, scope: entry.scope, data: part })
        }),
      Promise.resolve(),
    )
  }

  resize(deviceId: string, terminalId: string, cols: number, rows: number): void | Promise<void> {
    const entry = this.remote.get(terminalId)
    if (!entry) return this.options.local.resize(deviceId, terminalId, cols, rows)
    this.assertOwner(entry, deviceId)
    entry.info.cols = cols
    entry.info.rows = rows
    return this.call(entry.nodeId, 'terminal.resize', { terminalId, scope: entry.scope, cols, rows }).then(
      () => undefined,
    )
  }

  close(deviceId: string, terminalId: string): boolean | Promise<boolean> {
    const entry = this.remote.get(terminalId)
    if (!entry) return this.options.local.close(deviceId, terminalId)
    this.assertOwner(entry, deviceId)
    if (entry.closeRequested) return true
    entry.closeRequested = true
    entry.pollController?.abort(new HbarError('CANCELLED', 'Terminal is closing'))
    return this.call(entry.nodeId, 'terminal.close', { terminalId, scope: entry.scope }).then((result) => {
      if (!(result as { closed: boolean }).closed)
        throw new HbarError('NODE_TERMINAL_CLOSED', 'Remote terminal was not closed')
      this.startPolling(entry)
      return true
    })
  }

  closeAll(ids?: Iterable<string>): void {
    const targets = ids ? [...ids] : [...this.remote.keys()]
    this.options.local.closeAll(ids)
    for (const id of targets) {
      const entry = this.remote.get(id)
      if (!entry) continue
      void Promise.resolve(this.close(entry.scope.ownerDeviceId, id)).catch(() =>
        console.error('[hbar] remote terminal close failed'),
      )
    }
  }

  private assertOwner(entry: RemoteTerminal, ownerDeviceId: string): void {
    if (entry.scope.ownerDeviceId !== ownerDeviceId)
      throw new HbarError('NODE_TERMINAL_SCOPE', 'Terminal is unavailable for this owner')
  }

  private startPolling(entry: RemoteTerminal): void {
    if (this.disposed || !entry.callbacks || entry.pollTask) return
    const controller = new AbortController()
    entry.pollController = controller
    entry.pollTask = this.poll(entry, controller.signal).finally(() => {
      entry.pollController = undefined
      entry.pollTask = undefined
      if (entry.callbacks && !this.disposed && this.remote.has(entry.info.id)) this.startPolling(entry)
    })
  }

  private async poll(entry: RemoteTerminal, signal: AbortSignal): Promise<void> {
    let backoff = pollPauseMs
    while (!signal.aborted && entry.callbacks && this.remote.get(entry.info.id) === entry) {
      try {
        const batch = (await this.call(
          entry.nodeId,
          'terminal.output',
          {
            terminalId: entry.info.id,
            scope: entry.scope,
            afterSeq: entry.cursor,
            creditBytes,
          },
          signal,
        )) as {
          afterSeq: number
          nextSeq: number
          reset: boolean
          closed: boolean
          frames: Array<{ seq: number; data: string }>
        }
        const callbacks = entry.callbacks
        if (!callbacks) return
        if (batch.reset) {
          const resetCursor = batch.frames[0] ? batch.frames[0].seq - 1 : batch.nextSeq
          const accepted = callbacks.onOutput(entry.info.id, gapMarker, { seq: resetCursor, reset: true })
          if (accepted === 0) {
            await Bun.sleep(pollPauseMs)
            continue
          }
          entry.cursor = resetCursor
        }
        let blocked = false
        for (const frame of batch.frames) {
          const sent = callbacks.onOutput(entry.info.id, frame.data, { seq: frame.seq })
          if (sent === 0) {
            blocked = true
            break
          }
          entry.cursor = frame.seq
        }
        if (batch.closed && batch.frames.length === 0 && !blocked) {
          callbacks.onExit(entry.info.id, null, null)
          this.remote.delete(entry.info.id)
          return
        }
        backoff = pollPauseMs
        if (blocked || batch.frames.length === 0) await Bun.sleep(pollPauseMs)
      } catch (error) {
        if (signal.aborted) return
        if (error instanceof HbarError && ['NODE_TERMINAL_SCOPE', 'NODE_TERMINAL_CLOSED'].includes(error.code)) {
          entry.callbacks?.onExit(entry.info.id, null, error.code)
          this.remote.delete(entry.info.id)
          return
        }
        await Bun.sleep(backoff)
        backoff = Math.min(backoff * 2, 5_000)
      }
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    for (const entry of this.remote.values()) entry.pollController?.abort(new HbarError('CANCELLED', 'Host is closing'))
    await Promise.allSettled([...this.remote.values()].map((entry) => entry.pollTask))
    const closes = [...this.remote.values()].map(async (entry) => {
      try {
        await this.call(
          entry.nodeId,
          'terminal.close',
          { terminalId: entry.info.id, scope: entry.scope },
          AbortSignal.timeout(10_000),
        )
      } catch {
        /* B's own link-loss policy remains responsible for terminating its process tree. */
      }
    })
    await Promise.allSettled(closes)
  }
}

/** Builds the immutable session sandbox snapshot used for a manual terminal. */
export function sessionTerminalSandboxProvider(input: {
  readonly getProfileId: (sessionId: string) => Promise<string>
  readonly getProfile: (id: string) => Promise<{ resolved: ResolvedSandboxProfile | null } | null>
}): (sessionId: string) => Promise<NodeTerminalSnapshot> {
  return async (sessionId) => {
    const profileId = sandboxProfileIdSchema.parse(await input.getProfileId(sessionId))
    const detail = await input.getProfile(profileId)
    if (!detail?.resolved) throw new HbarError('SANDBOX_SNAPSHOT_NOT_FOUND', 'Session sandbox profile is unavailable')
    const profile = detail.resolved
    const content = sandboxSnapshotContent(profile)
    return { ref: { profileId: profile.profileId, digest: content.digest }, profile }
  }
}
