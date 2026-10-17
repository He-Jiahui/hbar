import type { ResolvedSandboxProfile } from '@hbar/contracts/sandbox'
import { toolArgumentValue, type ToolPathArgument } from '@hbar/contracts/tool-arguments'
import {
  evaluateSandbox,
  normalizeSandboxAbsolutePath,
  type SandboxPathTarget,
  type SandboxReason,
  type SandboxVerdict,
} from './policy'

/** Paths are resolved by the machine that owns the workspace, using that machine's path dialect. */
export interface SandboxPathPort {
  readonly canonical: (path: string) => Promise<string>
  readonly resolve: (...paths: string[]) => string
  readonly relative: (from: string, to: string) => string
  readonly isAbsolute: (path: string) => boolean
  readonly separator: '/' | '\\'
  readonly caseInsensitive: boolean
}
export interface SandboxToolDeclaration {
  readonly name: string
  readonly effect: 'read' | 'write' | 'process' | 'network'
  readonly commandArgument?: string
  readonly workspaceAccess?:
    | { kind: 'none' }
    | { kind: 'workspace' }
    | {
        kind: 'paths'
        arguments: readonly ToolPathArgument[]
      }
}
export interface SandboxGateMount {
  readonly folders: readonly { readonly alias: string; readonly path: string }[]
  readonly resolve: (requested: string) => { folder: { readonly alias: string; readonly path: string }; path: string }
}

function requestedPaths(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value) && value.length && value.every((item): item is string => typeof item === 'string'))
    return value
  // Omitted optional path arguments default to the workspace root; unknown shapes require root access.
  return ['.']
}

export interface SandboxGateInput {
  readonly tool: SandboxToolDeclaration
  readonly args: Readonly<Record<string, unknown>>
  readonly workspace: string
  readonly mount?: SandboxGateMount | undefined
}

/**
 * Evaluate a tool call against a resolved profile. Path arguments are checked
 * lexically and after resolving symlinks; the stricter outcome applies.
 */
export async function evaluateSandboxCall(
  profile: ResolvedSandboxProfile,
  input: SandboxGateInput,
  port: SandboxPathPort,
): Promise<SandboxVerdict> {
  const { canonical, resolve, relative, isAbsolute, separator, caseInsensitive } = port
  const root = await canonical(resolve(input.workspace))
  const declared = input.tool.workspaceAccess
  // A whole-workspace declaration may touch any path, so it needs the access across the whole tree.
  // Process tools are the exception: their command rules decide, because a process is not confined.
  const required: { field: string; access: 'read' | 'write'; requested: string; subtree: boolean }[] =
    declared?.kind === 'paths'
      ? declared.arguments.flatMap((argument) =>
          requestedPaths(toolArgumentValue(input.args, argument)).map((requested) => ({
            field: argument.field,
            access: argument.access,
            requested,
            subtree: false,
          })),
        )
      : declared?.kind === 'workspace' && input.tool.effect !== 'process'
        ? [{ field: '*', access: input.tool.effect === 'write' ? 'write' : 'read', requested: '.', subtree: true }]
        : []
  const paths: SandboxPathTarget[] = []
  for (const item of required) {
    const target = input.mount && !item.subtree ? input.mount.resolve(item.requested) : null
    const lexical = target ? resolve(root, target.folder.alias, target.path) : resolve(root, item.requested)
    const real = await canonical(target ? resolve(target.folder.path, target.path) : lexical)
    paths.push({ field: item.field, access: item.access, absolute: lexical, subtree: item.subtree })
    if (item.subtree && input.mount)
      for (const folder of input.mount.folders)
        paths.push({ field: item.field, access: item.access, absolute: await canonical(folder.path), subtree: true })
    if (normalizeSandboxAbsolutePath(real) !== normalizeSandboxAbsolutePath(lexical)) {
      const mounted = input.mount?.folders
        .map((folder) => ({ folder, part: relative(folder.path, real) }))
        .find((value) => value.part !== '..' && !value.part.startsWith(`..${separator}`) && !isAbsolute(value.part))
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
              const target = mount.resolve(grant.path)
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
  const call = {
    tool: input.tool.name,
    effect: input.tool.effect,
    paths,
    // A declared command argument that is not text cannot be matched and is outside the profile.
    command: input.tool.commandArgument === undefined ? null : typeof commandValue === 'string' ? commandValue : '',
  }
  const preferred = evaluateSandbox(scopedProfile, call, { workspaceRoot: root, caseInsensitive })
  const alternate = evaluateSandbox(scopedProfile, call, { workspaceRoot: root, caseInsensitive: !caseInsensitive })
  // A single tree can mix case modes. An alias must neither widen an allow nor bypass a restriction.
  const strength = { allow: 0, ask: 1, deny: 2 }
  return strength[alternate.decision] > strength[preferred.decision] ? alternate : preferred
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
