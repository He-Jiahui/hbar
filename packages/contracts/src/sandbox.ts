import { z } from 'zod'

/**
 * Sandbox profiles describe which tool calls a Run may perform without asking.
 * File tools are enforced by the Host. Command rules only admit or refuse a
 * process; they do not confine what an admitted process writes.
 */
export const SANDBOX_PROFILE_SCHEMA_VERSION = 1
export const SANDBOX_MAX_PROFILES = 64
export const SANDBOX_MAX_PATH_GRANTS = 256
export const SANDBOX_MAX_COMMAND_RULES = 128
export const SANDBOX_MAX_TOOL_RULES = 64
export const SANDBOX_MAX_ENVIRONMENT = 64
/** Number of `extends` hops below the selected profile. */
export const SANDBOX_MAX_EXTENDS_DEPTH = 4
const MAX_CHAIN = SANDBOX_MAX_EXTENDS_DEPTH + 1

export const BUILTIN_SANDBOX_PROFILE_IDS = [':read-only', ':workspace-write'] as const
export const DEFAULT_SANDBOX_PROFILE_ID = ':workspace-write'
export const builtinSandboxProfileIdSchema = z.enum(BUILTIN_SANDBOX_PROFILE_IDS)
export const userSandboxProfileIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/)
export const sandboxProfileIdSchema = z.union([builtinSandboxProfileIdSchema, userSandboxProfileIdSchema])

export const sandboxDecisionSchema = z.enum(['allow', 'ask', 'deny'])
/** What happens to a call outside the profile: ask the user, or refuse without asking. */
export const sandboxEscalationSchema = z.enum(['ask', 'deny'])
export const sandboxPathAccessSchema = z.enum(['none', 'read', 'write'])

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

/** Workspace-relative or absolute path; `*`, `?` and `**` are globs, a plain directory covers its subtree. */
export const sandboxPathPatternSchema = z
  .string()
  .min(1)
  .max(1_024)
  .refine((value) => !hasControlCharacter(value), { message: 'Path contains control characters' })
  .refine((value) => !value.split(/[\\/]+/).includes('..'), { message: 'Path must not contain .. segments' })

/** Whitespace-separated words; a final `*` word matches any remaining arguments. */
export const sandboxCommandPatternSchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine((value) => !hasControlCharacter(value), { message: 'Command pattern contains control characters' })

export const sandboxToolNameSchema = z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/)

/** Variables that decide which program a command name runs; overriding them would bypass command rules. */
export const SANDBOX_PROTECTED_ENVIRONMENT = ['PATH', 'PATHEXT'] as const
export const sandboxEnvironmentNameSchema = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]{0,127}$/)
  .refine((name) => !(SANDBOX_PROTECTED_ENVIRONMENT as readonly string[]).includes(name.toUpperCase()), {
    message: 'PATH and PATHEXT cannot be overridden',
  })
export const sandboxEnvironmentValueSchema = z
  .string()
  .max(4_096)
  .refine((value) => !hasControlCharacter(value), { message: 'Value contains control characters' })
function environmentSchema(limit: number) {
  return z.strictObject({
    set: z
      .record(sandboxEnvironmentNameSchema, sandboxEnvironmentValueSchema)
      .refine((set) => Object.keys(set).length <= limit, { message: `At most ${limit} variables` }),
  })
}

export const sandboxPathGrantSchema = z.strictObject({
  path: sandboxPathPatternSchema,
  access: sandboxPathAccessSchema,
})
export const sandboxCommandRuleSchema = z.strictObject({
  pattern: sandboxCommandPatternSchema,
  decision: sandboxDecisionSchema,
})
export const sandboxToolRuleSchema = z.strictObject({
  tool: sandboxToolNameSchema,
  decision: sandboxDecisionSchema,
})

export const sandboxOsConfinementModeSchema = z.enum(['unelevated', 'elevated'])
/**
 * OS-level process confinement settings carried by a profile.
 * `unelevated` uses a restricted token (no UAC); `elevated` uses dedicated sandbox
 * user accounts and Windows Firewall rules for real network isolation.
 */
export const sandboxOsConfinementSchema = z.strictObject({
  enabled: z.boolean(),
  mode: sandboxOsConfinementModeSchema,
})

/** Stable identity for duplicate detection and `extends` overrides; matching itself is done by the Host. */
export function sandboxPathKey(path: string): string {
  const slashes = path.replaceAll('\\', '/').replace(/\/{2,}/g, '/')
  const trimmed = slashes.length > 1 ? slashes.replace(/\/+$/, '') : slashes
  const relative = trimmed.replace(/^(?:\.\/)+/, '')
  return relative === '.' ? '' : relative
}
export function sandboxCommandKey(pattern: string): string {
  return pattern.trim().split(/\s+/).join(' ')
}

const profileFields = {
  name: z.string().trim().min(1).max(160),
  description: z.string().max(2_000),
  /** Parent profile whose rules this profile overrides. */
  extends: sandboxProfileIdSchema.nullable(),
  /** `null` inherits; the root default is `ask`. */
  escalation: sandboxEscalationSchema.nullable(),
  filesystem: z.strictObject({
    /** Access for paths no grant covers. `null` inherits; the root default is `read`. */
    default: sandboxPathAccessSchema.nullable(),
    grants: z.array(sandboxPathGrantSchema).max(SANDBOX_MAX_PATH_GRANTS),
  }),
  commands: z.strictObject({ rules: z.array(sandboxCommandRuleSchema).max(SANDBOX_MAX_COMMAND_RULES) }),
  /** Network-effect tools. `null` inherits; the root default is disabled. */
  network: z.strictObject({ enabled: z.boolean().nullable() }),
  tools: z.strictObject({ rules: z.array(sandboxToolRuleSchema).max(SANDBOX_MAX_TOOL_RULES) }),
  /**
   * Variables set for commands a sandboxed Run starts, like Codex `shell_environment_policy.set`.
   * Optional so profiles stored before this field still load.
   */
  environment: environmentSchema(SANDBOX_MAX_ENVIRONMENT).optional(),
  /**
   * OS-level process confinement. When set, commands admitted by this profile are launched inside a
   * restricted Windows token (`unelevated`) or a dedicated sandbox user account (`elevated`).
   * Optional so profiles stored before this field still load.
   */
  osConfinement: sandboxOsConfinementSchema.optional(),
}

function uniqueRules(
  value: {
    readonly filesystem: { readonly grants: readonly { readonly path: string }[] }
    readonly commands: { readonly rules: readonly { readonly pattern: string }[] }
    readonly tools: { readonly rules: readonly { readonly tool: string }[] }
    readonly environment?: { readonly set: Readonly<Record<string, string>> } | undefined
  },
  context: z.RefinementCtx,
) {
  const check = (items: readonly string[], path: (string | number)[], message: string) => {
    const seen = new Set<string>()
    for (const [index, item] of items.entries()) {
      if (seen.has(item)) context.addIssue({ code: 'custom', path: [...path, index], message })
      seen.add(item)
    }
  }
  check(
    value.filesystem.grants.map((grant) => sandboxPathKey(grant.path)),
    ['filesystem', 'grants'],
    'Path grants must be unique',
  )
  check(
    value.commands.rules.map((rule) => sandboxCommandKey(rule.pattern)),
    ['commands', 'rules'],
    'Command patterns must be unique',
  )
  check(
    value.tools.rules.map((rule) => rule.tool),
    ['tools', 'rules'],
    'Tool rules must be unique',
  )
  // Windows treats variable names case-insensitively.
  check(
    Object.keys(value.environment?.set ?? {}).map((name) => name.toUpperCase()),
    ['environment', 'set'],
    'Variable names must be unique regardless of case',
  )
}

export const sandboxProfileBodySchema = z.strictObject(profileFields).superRefine(uniqueRules)

export const sandboxProfileSchema = z
  .strictObject({
    id: sandboxProfileIdSchema,
    builtin: z.boolean(),
    ...profileFields,
    revision: z.number().int().nonnegative(),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  })
  .superRefine(uniqueRules)

/** `expectedRevision: null` creates the profile; a number updates that exact revision. */
export const sandboxProfileSaveInputSchema = z
  .strictObject({
    id: userSandboxProfileIdSchema,
    expectedRevision: z.number().int().nonnegative().nullable(),
    ...profileFields,
  })
  .superRefine((value, context) => {
    uniqueRules(value, context)
    if (value.extends === value.id)
      context.addIssue({ code: 'custom', path: ['extends'], message: 'A profile cannot extend itself' })
  })
export const sandboxProfileDeleteInputSchema = z.strictObject({
  id: userSandboxProfileIdSchema,
  expectedRevision: z.number().int().nonnegative(),
})

/** Fully merged rules a Run was admitted with. Immutable and content addressed. */
export const resolvedSandboxProfileSchema = z.strictObject({
  version: z.literal(SANDBOX_PROFILE_SCHEMA_VERSION),
  profileId: sandboxProfileIdSchema,
  /** Selected profile first, then each ancestor, with the revision that was merged. */
  chain: z
    .array(z.strictObject({ id: sandboxProfileIdSchema, revision: z.number().int().nonnegative() }))
    .min(1)
    .max(MAX_CHAIN),
  escalation: sandboxEscalationSchema,
  filesystem: z.strictObject({
    default: sandboxPathAccessSchema,
    grants: z.array(sandboxPathGrantSchema).max(SANDBOX_MAX_PATH_GRANTS * MAX_CHAIN),
  }),
  commands: z.strictObject({ rules: z.array(sandboxCommandRuleSchema).max(SANDBOX_MAX_COMMAND_RULES * MAX_CHAIN) }),
  network: z.strictObject({ enabled: z.boolean() }),
  tools: z.strictObject({ rules: z.array(sandboxToolRuleSchema).max(SANDBOX_MAX_TOOL_RULES * MAX_CHAIN) }),
  /** Defaults for snapshots created before environment overrides existed. */
  environment: environmentSchema(SANDBOX_MAX_ENVIRONMENT * MAX_CHAIN).default({ set: {} }),
  /** OS-level process confinement from the most-specific profile in the chain that sets it. */
  osConfinement: sandboxOsConfinementSchema.optional(),
})

/** Host-created reference carried by a Run; the digest names an immutable resolved profile. */
export const sandboxSnapshotRefSchema = z.strictObject({
  profileId: sandboxProfileIdSchema,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
})

export type BuiltinSandboxProfileId = z.infer<typeof builtinSandboxProfileIdSchema>
export type SandboxProfileId = z.infer<typeof sandboxProfileIdSchema>
export type SandboxDecision = z.infer<typeof sandboxDecisionSchema>
export type SandboxEscalation = z.infer<typeof sandboxEscalationSchema>
export type SandboxPathAccess = z.infer<typeof sandboxPathAccessSchema>
export type SandboxPathGrant = z.infer<typeof sandboxPathGrantSchema>
export type SandboxCommandRule = z.infer<typeof sandboxCommandRuleSchema>
export type SandboxToolRule = z.infer<typeof sandboxToolRuleSchema>
export type SandboxOsConfinementMode = z.infer<typeof sandboxOsConfinementModeSchema>
export type SandboxOsConfinement = z.infer<typeof sandboxOsConfinementSchema>
export type SandboxProfileBody = z.infer<typeof sandboxProfileBodySchema>
export type SandboxProfile = z.infer<typeof sandboxProfileSchema>
export type ResolvedSandboxProfile = z.infer<typeof resolvedSandboxProfileSchema>
export type SandboxProfileSaveInput = z.infer<typeof sandboxProfileSaveInputSchema>
export type SandboxProfileDeleteInput = z.infer<typeof sandboxProfileDeleteInputSchema>
export type SandboxSnapshotRef = z.infer<typeof sandboxSnapshotRefSchema>
