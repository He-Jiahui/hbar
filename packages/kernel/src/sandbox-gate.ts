import { realpath } from 'node:fs/promises'
import { basename, dirname, join, resolve, relative, isAbsolute } from 'node:path'
import { mountedPath, type WorkspaceMount } from '@hbar/local-tools'
import type { ToolDefinition } from '@hbar/plugin-sdk'
import type { ResolvedSandboxProfile } from '@hbar/contracts/sandbox'
import {
  evaluateSandbox,
  normalizeSandboxAbsolutePath,
  type SandboxPathTarget,
  type SandboxReason,
  type SandboxVerdict,
} from './sandbox-policy'

/** Case-insensitive file systems by default; Windows command names are case-insensitive too. */
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

function requestedPaths(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value) && value.length && value.every((item): item is string => typeof item === 'string'))
    return value
  // Omitted optional path arguments default to the workspace root; unknown shapes require root access.
  return ['.']
}

export interface SandboxGateInput {
  readonly tool: ToolDefinition
  readonly args: Readonly<Record<string, unknown>>
  readonly workspace: string
  readonly mount?: WorkspaceMount | undefined
}

/**
 * Evaluate a tool call against a resolved profile. Path arguments are checked
 * lexically and after resolving symlinks; the stricter outcome applies.
 */
export async function evaluateSandboxCall(
  profile: ResolvedSandboxProfile,
  input: SandboxGateInput,
): Promise<SandboxVerdict> {
  const root = await canonical(resolve(input.workspace))
  const declared = input.tool.workspaceAccess
  // A whole-workspace declaration may touch any path, so it needs the access across the whole tree.
  // Process tools are the exception: their command rules decide, because a process is not confined.
  const required: { field: string; access: 'read' | 'write'; requested: string; subtree: boolean }[] =
    declared?.kind === 'paths'
      ? declared.arguments.flatMap(({ field, access }) =>
          requestedPaths(input.args[field]).map((requested) => ({ field, access, requested, subtree: false })),
        )
      : declared?.kind === 'workspace' && input.tool.effect !== 'process'
        ? [{ field: '*', access: input.tool.effect === 'write' ? 'write' : 'read', requested: '.', subtree: true }]
        : []
  const paths: SandboxPathTarget[] = []
  for (const item of required) {
    const target = input.mount && !item.subtree ? mountedPath(input.mount, item.requested) : null
    const lexical = target ? resolve(root, target.folder.alias, target.path) : resolve(root, item.requested)
    const real = await canonical(target ? resolve(target.folder.path, target.path) : lexical)
    paths.push({ field: item.field, access: item.access, absolute: lexical, subtree: item.subtree })
    if (item.subtree && input.mount)
      for (const folder of input.mount.folders)
        paths.push({ field: item.field, access: item.access, absolute: await canonical(folder.path), subtree: true })
    if (normalizeSandboxAbsolutePath(real) !== normalizeSandboxAbsolutePath(lexical)) {
      const mounted = input.mount?.folders
        .map((folder) => ({ folder, part: relative(folder.path, real) }))
        .find(
          (value) =>
            value.part !== '..' &&
            !value.part.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) &&
            !isAbsolute(value.part),
        )
      if (input.mount && !mounted)
        return {
          decision: 'deny',
          escalated: false,
          reason: { kind: 'path', field: item.field, path: real, required: item.access, granted: 'none', grant: null },
        }
      paths.push({
        field: item.field,
        access: item.access,
        absolute: real,
        subtree: item.subtree,
      })
    }
  }
  const mount = input.mount
  const scopedProfile = mount
    ? {
        ...profile,
        filesystem: {
          ...profile.filesystem,
          grants: profile.filesystem.grants.flatMap((grant) => {
            if (isAbsolute(grant.path) || /^[a-z]:/i.test(grant.path)) return [grant]
            if (
              mount.folders.some((folder) => grant.path === folder.alias || grant.path.startsWith(`${folder.alias}/`))
            ) {
              const target = mountedPath(mount, grant.path)
              return [grant, { ...grant, path: resolve(target.folder.path, target.path) }]
            }
            return [
              grant,
              ...mount.folders.flatMap((folder) => [
                ...(grant.path === '.' ? [] : [{ ...grant, path: `${folder.alias}/${grant.path}` }]),
                { ...grant, path: resolve(folder.path, grant.path) },
              ]),
            ]
          }),
        },
      }
    : profile
  const commandValue = input.tool.commandArgument === undefined ? undefined : input.args[input.tool.commandArgument]
  return evaluateSandbox(
    scopedProfile,
    {
      tool: input.tool.name,
      effect: input.tool.effect,
      paths,
      // A declared command argument that is not text cannot be matched and is outside the profile.
      command: input.tool.commandArgument === undefined ? null : typeof commandValue === 'string' ? commandValue : '',
    },
    { workspaceRoot: root, caseInsensitive: SANDBOX_CASE_INSENSITIVE },
  )
}

/** Model-facing explanation; it names the rule so the model can adjust instead of retrying blindly. */
export function describeSandboxReason(reason: SandboxReason): string {
  switch (reason.kind) {
    case 'tool-rule':
      return `tool rule for ${reason.tool}`
    case 'path':
      return `the tool needs ${reason.required} access to ${reason.path} but the profile grants ${reason.granted}${reason.grant === null ? ' by default' : ` via ${reason.grant}`}`
    case 'command':
      return reason.rule === null
        ? `command ${JSON.stringify(reason.segment)} matches no command rule`
        : `command ${JSON.stringify(reason.segment)} matches rule ${JSON.stringify(reason.rule)}`
    case 'command-unsafe':
      return `command uses ${reason.construct}, which is never approved automatically`
    case 'network':
      return 'network access is disabled by the profile'
    case 'undeclared-effect':
      return `the tool declares a ${reason.effect} effect without inspectable arguments`
    case 'read-effect':
      return 'read-only tool'
  }
}
