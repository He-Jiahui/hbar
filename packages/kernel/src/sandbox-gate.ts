import { realpath } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
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
    const lexical = resolve(root, item.requested)
    const real = await canonical(lexical)
    paths.push({ field: item.field, access: item.access, absolute: lexical, subtree: item.subtree })
    if (normalizeSandboxAbsolutePath(real) !== normalizeSandboxAbsolutePath(lexical))
      paths.push({ field: item.field, access: item.access, absolute: real, subtree: item.subtree })
  }
  const commandValue = input.tool.commandArgument === undefined ? undefined : input.args[input.tool.commandArgument]
  return evaluateSandbox(
    profile,
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
