import { realpath } from 'node:fs/promises'
import { basename, dirname, join, resolve, relative, isAbsolute } from 'node:path'
import { mountedPath, type WorkspaceMount } from '@hbar/local-tools/workspace-mounts'
import type { ResolvedSandboxProfile } from '@hbar/contracts/sandbox'
import {
  evaluateSandboxCall as evaluate,
  type SandboxToolDeclaration,
  type SandboxVerdict,
  type SandboxPathPort,
} from '@hbar/sandbox'
export { describeSandboxReason } from '@hbar/sandbox'

export const SANDBOX_CASE_INSENSITIVE = process.platform === 'win32' || process.platform === 'darwin'
/** The real path, or the real path of the nearest existing ancestor joined with the missing remainder. */
async function canonical(path: string): Promise<string> {
  const missing: string[] = []
  let current = path
  for (;;) {
    try {
      return join(await realpath(current), ...missing.reverse())
    } catch (error) {
      const parent = dirname(current)
      if (parent === current || !(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') return path
      missing.push(basename(current))
      current = parent
    }
  }
}

export const LOCAL_SANDBOX_PATHS: SandboxPathPort = {
  canonical,
  resolve,
  relative,
  isAbsolute,
  separator: process.platform === 'win32' ? '\\' : '/',
  caseInsensitive: SANDBOX_CASE_INSENSITIVE,
}
export interface SandboxGateInput {
  readonly tool: SandboxToolDeclaration
  readonly args: Readonly<Record<string, unknown>>
  readonly workspace: string
  readonly mount?: WorkspaceMount | undefined
  readonly paths?: SandboxPathPort | undefined
}
/** Kernel adapter: filesystem and mounted-folder ownership stay outside the shared evaluator. */
export function evaluateSandboxCall(profile: ResolvedSandboxProfile, input: SandboxGateInput): Promise<SandboxVerdict> {
  const mount = input.mount
  return evaluate(
    profile,
    {
      tool: input.tool,
      args: input.args,
      workspace: input.workspace,
      ...(mount
        ? { mount: { folders: mount.folders, resolve: (requested: string) => mountedPath(mount, requested) } }
        : {}),
    },
    input.paths ?? LOCAL_SANDBOX_PATHS,
  )
}
