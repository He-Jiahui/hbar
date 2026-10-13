import type { NodeCapabilities } from '@hbar/contracts/node'
import type { OsConfinementOptions, ToolResult } from '@hbar/plugin-sdk'

export interface NodeExecutionBackendOptions {
  readonly timeoutMs: number
  readonly environment: Readonly<Record<string, string>>
  readonly confinement: OsConfinementOptions | null
  readonly protectedPaths: readonly string[]
  readonly readOnlyPaths?: readonly string[]
  /** B-verified static floor roots mounted under a private Linux/container alias view. */
  readonly workspaceMounts?: readonly NodeExecutionWorkspaceMount[]
  /** B-provenance mounts for the exact child checkout and its Git metadata only. */
  readonly internalMounts?: readonly NodeExecutionInternalMount[]
  readonly environmentAllowlist: readonly string[]
  /** Local B-only process output callback; never serialized over the node link. */
  readonly onOutput?: ((text: string) => void) | undefined
  readonly onOutputReset?: (() => void) | undefined
}

export interface NodeArgvResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
  readonly truncated: boolean
  readonly timedOut?: boolean
}

/** A B-owned process adapter. Each call must await physical process-tree release. */
export interface NodeExecutionBackend {
  readonly name: NodeCapabilities['sandbox']['backends'][number]
  readonly filesystem: boolean
  readonly network: boolean
  readonly processTree: boolean
  exec(
    workspace: string,
    command: string,
    signal: AbortSignal,
    options: NodeExecutionBackendOptions,
  ): Promise<ToolResult>
  execArgv?(
    workspace: string,
    argv: readonly [string, ...string[]],
    signal: AbortSignal,
    options: NodeExecutionBackendOptions,
  ): Promise<NodeArgvResult>
  dispose?(): Promise<void>
}

export interface NodeExecutionWorkspaceMount {
  readonly rootId: string
  readonly sourceRoot: string
  readonly alias: string
  readonly target: string
  readonly access: 'read' | 'write'
  readonly writePaths?: readonly { readonly sourcePath: string; readonly targetPath: string }[]
  readonly readOnlyPaths?: readonly { readonly sourcePath: string; readonly targetPath: string }[]
  readonly protectedPaths?: readonly { readonly sourcePath: string; readonly targetPath: string }[]
}

export interface NodeExecutionInternalMount {
  readonly kind: 'managed-worktree' | 'common-git' | 'worktree-metadata'
  readonly worktreeId: string
  readonly parentRootId: string
  readonly sourcePath: string
  readonly targetPath: string
  readonly access: 'read' | 'write'
}
