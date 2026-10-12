import type { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { assertLocalWorkspace } from '@hbar/contracts/local-workspace'
import {
  nodeCallAuthoritySchema,
  nodeExecStartSchema,
  isNodeWorkspacePath,
  nodeWorkspaceMethods,
  parseNodeWorkspaceLocator,
  workspaceLocationOf,
  type NodeWorkspaceLocation,
  type NodeWorkspaceMethod,
  type NodeCallAuthority,
} from '@hbar/contracts/node'
import type { ResolvedSandboxProfile, SandboxSnapshotRef } from '@hbar/contracts/sandbox'
import type { ToolFileChange } from '@hbar/contracts/run-file-changes'
import type { ExecOptions, ExecutionProvider, ToolResult, WorkspaceQueryProvider } from '@hbar/plugin-sdk'
import { SANDBOX_EVALUATOR_FINGERPRINT, canonicalSandboxJSON, verifySandboxSnapshot } from '@hbar/sandbox'
import {
  nodeTargetBinding,
  nodeOperationKey,
  type NodeExecutionPort,
  type NodeExecutionScope,
  type NodeExecutionTarget,
} from './execution-port'
import { nodeExecutionRelativePath } from './execution-paths'
import { decodeNodeFileText, readNodeFile, writeNodeFile, restoreNodeFiles } from './execution-transfers'
import { executeNodeCommand } from './execution-process'

interface Captured {
  readonly location: NodeWorkspaceLocation
  readonly authority: NodeCallAuthority | undefined
  readonly signal: AbortSignal
}
type Metadata = Pick<NodeExecutionTarget, 'location' | 'platform' | 'signal'>
export interface ExecutionRouterOptions {
  readonly local: ExecutionProvider
  readonly node: NodeExecutionPort
  /** Supplied by A's admitted invocation, never reconstructed from tool arguments. */
  current(): NodeExecutionScope | undefined
  loadSnapshot(ref: SandboxSnapshotRef, signal: AbortSignal): Promise<ResolvedSandboxProfile>
  readonly localEnabled?: boolean
}
/** ExecutionProvider replacement; node locators never reach a local provider. */
export class ExecutionRouter implements ExecutionProvider {
  readonly workspaceQuery: WorkspaceQueryProvider
  private readonly stopped = new AbortController()
  private readonly running = new Set<Promise<ToolResult>>()
  private closing: Promise<void> | undefined
  constructor(private readonly options: ExecutionRouterOptions) {
    this.workspaceQuery = {
      search: async (workspace, input, signal) => {
        signal = this.operationSignal(signal)
        const target = await this.admitted(workspace, signal)
        if (!target) return this.localQuery().search(workspace, input, signal)
        return this.rpc(
          target.location.nodeId,
          'query.search',
          {
            ...nodeTargetBinding(target),
            authority: target.authority,
            query: { ...input, path: nodeExecutionRelativePath(target, input.path) },
          },
          target.signal,
        )
      },
      find: async (workspace, input, signal) => {
        signal = this.operationSignal(signal)
        const target = await this.admitted(workspace, signal)
        if (!target) return this.localQuery().find(workspace, input, signal)
        return this.rpc(
          target.location.nodeId,
          'query.find',
          {
            ...nodeTargetBinding(target),
            authority: target.authority,
            query: { ...input, path: nodeExecutionRelativePath(target, input.path) },
          },
          target.signal,
        )
      },
      readRange: async (workspace, path, startLine, lineCount, signal) => {
        signal = this.operationSignal(signal)
        const target = await this.admitted(workspace, signal)
        if (!target) return this.localQuery().readRange(workspace, path, startLine, lineCount, signal)
        return this.rpc(
          target.location.nodeId,
          'query.readRange',
          {
            ...nodeTargetBinding(target),
            authority: target.authority,
            path: nodeExecutionRelativePath(target, path),
            startLine,
            lineCount,
          },
          target.signal,
        )
      },
      invalidate: async (workspace, path) => {
        const capture = this.capture(workspace)
        if (!capture) return this.localQuery().invalidate(workspace, path)
        const target = await this.metadata(capture)
        await this.rpc(
          target.location.nodeId,
          'query.invalidate',
          {
            ...nodeTargetBinding(target),
            path: nodeExecutionRelativePath(target, path),
          },
          target.signal,
        )
      },
      dispose: () => this.options.local.workspaceQuery?.dispose(),
    }
  }
  private localQuery(): WorkspaceQueryProvider {
    if (!this.options.local.workspaceQuery)
      throw new HbarError('QUERY_UNAVAILABLE', 'Local workspace query is unavailable')
    return this.options.local.workspaceQuery
  }
  private operationSignal(signal?: AbortSignal): AbortSignal {
    const scope = this.options.current()
    return AbortSignal.any([this.stopped.signal, ...(scope ? [scope.signal] : []), ...(signal ? [signal] : [])])
  }
  private capture(workspace: string, signal?: AbortSignal): Captured | null {
    if (this.stopped.signal.aborted) throw new HbarError('EXECUTION_CLOSED', 'Workspace execution router is closed')
    const scope = this.options.current()
    scope?.signal.throwIfAborted()
    signal?.throwIfAborted()
    if (scope && scope.workspace.path !== workspace)
      throw new HbarError('WORKSPACE_SCOPE', 'Workspace access does not match the Host invocation')
    const address = parseNodeWorkspaceLocator(workspace)
    if (!address) {
      assertLocalWorkspace(workspace)
      if (this.options.localEnabled === false)
        throw new HbarError(
          'LOCAL_EXECUTION_DISABLED',
          'Local workspace execution is disabled on this conversation node',
        )
      return null
    }
    if (!scope) throw new HbarError('RUNTIME_EXECUTION_REQUIRED', 'Node access requires a Host-owned workspace scope')
    const location = workspaceLocationOf(structuredClone(scope.workspace))
    if (location.kind !== 'node')
      throw new HbarError('WORKSPACE_SCOPE', 'Node location is missing from the workspace scope')
    return {
      location,
      authority: scope.authority ? nodeCallAuthoritySchema.parse(structuredClone(scope.authority)) : undefined,
      signal: AbortSignal.any([this.stopped.signal, scope.signal, ...(signal ? [signal] : [])]),
    }
  }
  private async rpc<Method extends NodeWorkspaceMethod>(
    nodeId: string,
    method: Method,
    input: z.input<(typeof nodeWorkspaceMethods)[Method]['input']>,
    signal: AbortSignal,
  ): Promise<z.output<(typeof nodeWorkspaceMethods)[Method]['output']>> {
    const entry = nodeWorkspaceMethods[method]
    entry.input.parse(input)
    const result: unknown = await this.options.node.call(nodeId, method, input, signal)
    // The selected node method's schema validates this associated generic output.
    return entry.output.parse(result) as z.output<(typeof nodeWorkspaceMethods)[Method]['output']>
  }
  private async metadata(capture: Captured): Promise<Metadata> {
    capture.signal.throwIfAborted()
    const capability = await this.rpc(capture.location.nodeId, 'node.capabilities', {}, capture.signal)
    if (capability.nodeId !== capture.location.nodeId || capability.evaluator !== SANDBOX_EVALUATOR_FINGERPRINT)
      throw new HbarError('NODE_EVALUATOR_MISMATCH', 'Workspace node identity or sandbox evaluator is incompatible')
    const root = capability.roots.find((root) => root.rootId === capture.location.rootId)
    if (!root || root.nodePath !== capture.location.nodePath)
      throw new HbarError('NODE_ROOT_CHANGED', 'The node shared root no longer matches the workspace binding')
    capture.signal.throwIfAborted()
    return { location: capture.location, platform: capability.platform, signal: capture.signal }
  }
  private async admitted(workspace: string, signal?: AbortSignal): Promise<NodeExecutionTarget | null> {
    const capture = this.capture(workspace, signal)
    if (!capture) return null
    if (!capture.authority)
      throw new HbarError('RUNTIME_EXECUTION_REQUIRED', 'Node tool access requires completed Host admission')
    const target = { ...(await this.metadata(capture)), authority: capture.authority }
    if (target.authority.sandbox) {
      const profile = verifySandboxSnapshot(
        target.authority.sandbox,
        await this.options.loadSnapshot(target.authority.sandbox, target.signal),
      )
      await this.rpc(target.location.nodeId, 'sandbox.put', { ref: target.authority.sandbox, profile }, target.signal)
    }
    return target
  }
  async canonicalize(workspace: string, paths: readonly string[], signal: AbortSignal) {
    const capture = this.capture(workspace, signal)
    if (!capture) {
      if (!this.options.local.canonicalize)
        throw new HbarError('WORKSPACE_CANONICALIZATION_UNAVAILABLE', 'Local owner-path metadata is unavailable')
      return this.options.local.canonicalize(workspace, paths, signal)
    }
    const target = await this.metadata(capture)
    const result = await this.rpc(
      target.location.nodeId,
      'fs.canonicalize',
      {
        ...nodeTargetBinding(target),
        paths: paths.map((path) => nodeExecutionRelativePath(target, path)),
      },
      target.signal,
    )
    if (
      result.root !== target.location.nodePath ||
      result.paths.length !== paths.length ||
      result.dialect !== (target.platform === 'win32' ? 'win32' : 'posix')
    )
      throw new HbarError('NODE_ROOT_CHANGED', 'Node canonicalization does not match its bound root and path dialect')
    return result
  }
  async list(workspace: string, path: string) {
    const signal = this.operationSignal(),
      target = await this.admitted(workspace, signal)
    signal.throwIfAborted()
    if (!target) return this.options.local.list(workspace, path)
    return this.rpc(
      target.location.nodeId,
      'fs.list',
      {
        ...nodeTargetBinding(target),
        authority: target.authority,
        path: nodeExecutionRelativePath(target, path),
      },
      target.signal,
    )
  }
  async readBytes(workspace: string, path: string): Promise<Uint8Array> {
    const signal = this.operationSignal(),
      target = await this.admitted(workspace, signal)
    signal.throwIfAborted()
    if (!target) return this.options.local.readBytes(workspace, path)
    return (await readNodeFile(this.options.node, target, nodeExecutionRelativePath(target, path))).bytes
  }
  async read(workspace: string, path: string): Promise<string> {
    const signal = this.operationSignal(),
      target = await this.admitted(workspace, signal)
    signal.throwIfAborted()
    if (!target) return this.options.local.read(workspace, path)
    return decodeNodeFileText(
      (await readNodeFile(this.options.node, target, nodeExecutionRelativePath(target, path))).bytes,
    )
  }
  async write(workspace: string, path: string, text: string, options?: { expectedRevision?: string }) {
    const signal = this.operationSignal(),
      target = await this.admitted(workspace, signal)
    signal.throwIfAborted()
    if (!target) return this.options.local.write(workspace, path, text, options)
    return writeNodeFile(
      this.options.node,
      target,
      nodeExecutionRelativePath(target, path),
      text,
      options?.expectedRevision,
    )
  }
  async restoreFiles(workspace: string, changes: readonly ToolFileChange[], signal: AbortSignal): Promise<void> {
    signal = this.operationSignal(signal)
    const target = await this.admitted(workspace, signal)
    if (!target) {
      if (!this.options.local.restoreFiles)
        throw new HbarError('FILE_UNDO_UNSUPPORTED', 'Local execution has no restore provider')
      return this.options.local.restoreFiles(workspace, changes, signal)
    }
    await restoreNodeFiles(
      this.options.node,
      target,
      changes.map((change) => ({ ...change, path: nodeExecutionRelativePath(target, change.path) })),
    )
  }
  exec(workspace: string, command: string, signal: AbortSignal, options?: ExecOptions): Promise<ToolResult> {
    const task = this.execute(workspace, command, signal, options)
    this.running.add(task)
    void task.then(
      () => this.running.delete(task),
      () => this.running.delete(task),
    )
    return task
  }
  private async execute(
    workspace: string,
    command: string,
    signal: AbortSignal,
    options?: ExecOptions,
  ): Promise<ToolResult> {
    signal = this.operationSignal(signal)
    try {
      const target = await this.admitted(workspace, signal)
      if (!target) return this.options.local.exec(workspace, command, signal, options)
      if (
        options?.nodeAuthority &&
        canonicalSandboxJSON(nodeCallAuthoritySchema.parse(options.nodeAuthority)) !==
          canonicalSandboxJSON(target.authority)
      )
        throw new HbarError('WORKSPACE_SCOPE', 'Shell options disagree with the Host-owned routing authority')
      if (options?.osConfinement) {
        const ref = target.authority.sandbox
        const profile = ref ? verifySandboxSnapshot(ref, await this.options.loadSnapshot(ref, target.signal)) : null
        if (!profile?.osConfinement?.enabled)
          throw new HbarError(
            'SANDBOX_AUTHORITY_MISMATCH',
            'Node OS confinement requirements must be pinned in the admitted sandbox snapshot',
          )
      }
      const input = nodeExecStartSchema.parse({
        ...nodeTargetBinding(target),
        ...target.authority,
        operationId: nodeOperationKey(target.authority),
        cwd: '.',
        command,
        timeoutMs: options?.timeoutMs ?? 120_000,
      })
      // Environment and OS grants are rebuilt by B from its local floor and the verified snapshot.
      return executeNodeCommand(this.options.node, target, input.command, input.timeoutMs)
    } catch (error) {
      if (!isNodeWorkspacePath(workspace)) throw error
      return {
        text: error instanceof HbarError ? error.message : 'The node tool input or Host routing scope is invalid.',
        isError: true,
        details: {
          code: error instanceof HbarError ? error.code : signal.aborted ? 'CANCELLED' : 'INVALID_INPUT',
          executionStarted: false,
        },
      }
    }
  }
  dispose(): Promise<void> {
    return (this.closing ??= this.close())
  }
  private async close(): Promise<void> {
    this.stopped.abort(new HbarError('EXECUTION_CLOSED', 'Workspace execution router is closing'))
    await Promise.allSettled([...this.running])
    await this.options.local.dispose?.()
  }
}
