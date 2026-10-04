import {
  SANDBOX_MAX_COMMAND_RULES,
  SANDBOX_MAX_ENVIRONMENT,
  SANDBOX_MAX_PATH_GRANTS,
  SANDBOX_MAX_TOOL_RULES,
  SANDBOX_PROTECTED_ENVIRONMENT,
  sandboxCommandKey,
  sandboxCommandPatternSchema,
  sandboxEnvironmentNameSchema,
  sandboxEnvironmentValueSchema,
  sandboxPathKey,
  sandboxPathPatternSchema,
  sandboxProfileSaveInputSchema,
  sandboxToolNameSchema,
  userSandboxProfileIdSchema,
  type SandboxDecision,
  type SandboxEscalation,
  type SandboxPathAccess,
  type SandboxProfile,
  type SandboxProfileId,
  type SandboxProfileSaveInput,
} from '@hbar/contracts/sandbox'

/** Editable rows carry a client-only id so edits and removals target the row the user acted on. */
export interface SandboxPathGrantDraft {
  readonly rowId: string
  readonly path: string
  readonly access: SandboxPathAccess
}
export interface SandboxCommandRuleDraft {
  readonly rowId: string
  readonly pattern: string
  readonly decision: SandboxDecision
}
export interface SandboxToolRuleDraft {
  readonly rowId: string
  readonly tool: string
  readonly decision: SandboxDecision
}
export interface SandboxEnvironmentDraft {
  readonly rowId: string
  readonly name: string
  readonly value: string
}

export interface SandboxProfileDraft {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly extends: SandboxProfileId | null
  readonly escalation: SandboxEscalation | null
  readonly fileDefault: SandboxPathAccess | null
  readonly network: boolean | null
  readonly grants: readonly SandboxPathGrantDraft[]
  readonly commands: readonly SandboxCommandRuleDraft[]
  readonly tools: readonly SandboxToolRuleDraft[]
  readonly environment: readonly SandboxEnvironmentDraft[]
}

export type SandboxDraftSection = 'grants' | 'commands' | 'tools' | 'environment'

export type SandboxDraftEdit =
  | { readonly kind: 'text'; readonly field: 'id' | 'name' | 'description'; readonly value: string }
  | { readonly kind: 'extends'; readonly value: SandboxProfileId | null }
  | { readonly kind: 'escalation'; readonly value: SandboxEscalation | null }
  | { readonly kind: 'fileDefault'; readonly value: SandboxPathAccess | null }
  | { readonly kind: 'network'; readonly value: boolean | null }
  | { readonly kind: 'add'; readonly section: SandboxDraftSection }
  | { readonly kind: 'remove'; readonly section: SandboxDraftSection; readonly rowId: string }
  | {
      readonly kind: 'grant'
      readonly rowId: string
      readonly path?: string | undefined
      readonly access?: SandboxPathAccess | undefined
    }
  | {
      readonly kind: 'command'
      readonly rowId: string
      readonly pattern?: string | undefined
      readonly decision?: SandboxDecision | undefined
    }
  | {
      readonly kind: 'tool'
      readonly rowId: string
      readonly tool?: string | undefined
      readonly decision?: SandboxDecision | undefined
    }
  | {
      readonly kind: 'environment'
      readonly rowId: string
      readonly name?: string | undefined
      readonly value?: string | undefined
    }

export type SandboxDraftIssueCode = 'required' | 'invalid' | 'duplicate' | 'protected' | 'self' | 'limit'
export interface SandboxDraftIssue {
  readonly field: 'id' | 'name' | 'description' | 'extends' | SandboxDraftSection
  /** Row the issue belongs to; `null` for profile-level fields and section limits. */
  readonly rowId: string | null
  readonly column: 'path' | 'pattern' | 'tool' | 'name' | 'value' | null
  readonly code: SandboxDraftIssueCode
}

export const SANDBOX_DRAFT_LIMITS: Readonly<Record<SandboxDraftSection, number>> = {
  grants: SANDBOX_MAX_PATH_GRANTS,
  commands: SANDBOX_MAX_COMMAND_RULES,
  tools: SANDBOX_MAX_TOOL_RULES,
  environment: SANDBOX_MAX_ENVIRONMENT,
}

export function emptySandboxDraft(basedOn: SandboxProfileId | null): SandboxProfileDraft {
  return {
    id: '',
    name: '',
    description: '',
    extends: basedOn,
    escalation: null,
    fileDefault: null,
    network: null,
    grants: [],
    commands: [],
    tools: [],
    environment: [],
  }
}

export function sandboxDraftFromProfile(profile: SandboxProfile, rowId: () => string): SandboxProfileDraft {
  return {
    id: profile.id,
    name: profile.name,
    description: profile.description,
    extends: profile.extends,
    escalation: profile.escalation,
    fileDefault: profile.filesystem.default,
    network: profile.network.enabled,
    grants: profile.filesystem.grants.map((grant) => ({ rowId: rowId(), ...grant })),
    commands: profile.commands.rules.map((rule) => ({ rowId: rowId(), ...rule })),
    tools: profile.tools.rules.map((rule) => ({ rowId: rowId(), ...rule })),
    environment: Object.entries(profile.environment?.set ?? {}).map(([name, value]) => ({
      rowId: rowId(),
      name,
      value,
    })),
  }
}

export function sandboxDraftToSaveInput(
  draft: SandboxProfileDraft,
  expectedRevision: number | null,
): SandboxProfileSaveInput {
  return {
    id: draft.id.trim(),
    expectedRevision,
    name: draft.name.trim(),
    description: draft.description,
    extends: draft.extends,
    escalation: draft.escalation,
    filesystem: {
      default: draft.fileDefault,
      grants: draft.grants.map(({ path, access }) => ({ path, access })),
    },
    commands: { rules: draft.commands.map(({ pattern, decision }) => ({ pattern: pattern.trim(), decision })) },
    network: { enabled: draft.network },
    tools: { rules: draft.tools.map(({ tool, decision }) => ({ tool: tool.trim(), decision })) },
    ...(draft.environment.length
      ? { environment: { set: Object.fromEntries(draft.environment.map(({ name, value }) => [name.trim(), value])) } }
      : {}),
  }
}

/** Compare drafts by content; row ids are presentation identity only. */
export function sameSandboxDraft(left: SandboxProfileDraft, right: SandboxProfileDraft): boolean {
  return JSON.stringify(sandboxDraftToSaveInput(left, null)) === JSON.stringify(sandboxDraftToSaveInput(right, null))
}

function editRows<Row extends { readonly rowId: string }>(
  rows: readonly Row[],
  rowId: string,
  patch: (row: Row) => Row,
): readonly Row[] {
  return rows.map((row) => (row.rowId === rowId ? patch(row) : row))
}

function defined<Value>(value: Value | undefined, fallback: Value): Value {
  return value === undefined ? fallback : value
}

/** Apply one edit; adding past a section limit is ignored so the limit issue stays visible instead. */
export function applySandboxDraftEdit(
  draft: SandboxProfileDraft,
  edit: SandboxDraftEdit,
  rowId: () => string,
): SandboxProfileDraft {
  switch (edit.kind) {
    case 'text':
      return { ...draft, [edit.field]: edit.value }
    case 'extends':
      return { ...draft, extends: edit.value }
    case 'escalation':
      return { ...draft, escalation: edit.value }
    case 'fileDefault':
      return { ...draft, fileDefault: edit.value }
    case 'network':
      return { ...draft, network: edit.value }
    case 'add': {
      if (draft[edit.section].length >= SANDBOX_DRAFT_LIMITS[edit.section]) return draft
      const id = rowId()
      if (edit.section === 'grants')
        return { ...draft, grants: [...draft.grants, { rowId: id, path: '', access: 'write' }] }
      if (edit.section === 'commands')
        return { ...draft, commands: [...draft.commands, { rowId: id, pattern: '', decision: 'allow' }] }
      if (edit.section === 'tools')
        return { ...draft, tools: [...draft.tools, { rowId: id, tool: '', decision: 'allow' }] }
      return { ...draft, environment: [...draft.environment, { rowId: id, name: '', value: '' }] }
    }
    case 'remove':
      if (edit.section === 'grants') return { ...draft, grants: draft.grants.filter((row) => row.rowId !== edit.rowId) }
      if (edit.section === 'commands')
        return { ...draft, commands: draft.commands.filter((row) => row.rowId !== edit.rowId) }
      if (edit.section === 'tools') return { ...draft, tools: draft.tools.filter((row) => row.rowId !== edit.rowId) }
      return { ...draft, environment: draft.environment.filter((row) => row.rowId !== edit.rowId) }
    case 'grant':
      return {
        ...draft,
        grants: editRows(draft.grants, edit.rowId, (row) => ({
          ...row,
          path: defined(edit.path, row.path),
          access: defined(edit.access, row.access),
        })),
      }
    case 'command':
      return {
        ...draft,
        commands: editRows(draft.commands, edit.rowId, (row) => ({
          ...row,
          pattern: defined(edit.pattern, row.pattern),
          decision: defined(edit.decision, row.decision),
        })),
      }
    case 'tool':
      return {
        ...draft,
        tools: editRows(draft.tools, edit.rowId, (row) => ({
          ...row,
          tool: defined(edit.tool, row.tool),
          decision: defined(edit.decision, row.decision),
        })),
      }
    case 'environment':
      return {
        ...draft,
        environment: editRows(draft.environment, edit.rowId, (row) => ({
          ...row,
          name: defined(edit.name, row.name),
          value: defined(edit.value, row.value),
        })),
      }
  }
}

function rowIssues<Row extends { readonly rowId: string }>(
  section: SandboxDraftSection,
  column: NonNullable<SandboxDraftIssue['column']>,
  rows: readonly Row[],
  value: (row: Row) => string,
  key: (value: string) => string,
  valid: (value: string) => boolean,
  protectedValue: (value: string) => boolean = () => false,
): SandboxDraftIssue[] {
  const issues: SandboxDraftIssue[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const text = value(row)
    const code: SandboxDraftIssueCode | null = !text.trim()
      ? 'required'
      : protectedValue(text)
        ? 'protected'
        : !valid(text)
          ? 'invalid'
          : seen.has(key(text))
            ? 'duplicate'
            : null
    if (code) issues.push({ field: section, rowId: row.rowId, column, code })
    if (text.trim()) seen.add(key(text))
  }
  if (rows.length > SANDBOX_DRAFT_LIMITS[section])
    issues.push({ field: section, rowId: null, column: null, code: 'limit' })
  return issues
}

/** Field-level issues for display next to the control; empty when the save input is valid. */
export function validateSandboxDraft(draft: SandboxProfileDraft): readonly SandboxDraftIssue[] {
  const issues: SandboxDraftIssue[] = []
  const id = draft.id.trim()
  if (!id) issues.push({ field: 'id', rowId: null, column: null, code: 'required' })
  else if (!userSandboxProfileIdSchema.safeParse(id).success)
    issues.push({ field: 'id', rowId: null, column: null, code: 'invalid' })
  if (!draft.name.trim()) issues.push({ field: 'name', rowId: null, column: null, code: 'required' })
  else if (draft.name.trim().length > 160) issues.push({ field: 'name', rowId: null, column: null, code: 'invalid' })
  if (draft.description.length > 2_000)
    issues.push({ field: 'description', rowId: null, column: null, code: 'invalid' })
  if (draft.extends !== null && draft.extends === id)
    issues.push({ field: 'extends', rowId: null, column: null, code: 'self' })
  issues.push(
    ...rowIssues(
      'grants',
      'path',
      draft.grants,
      (row) => row.path,
      sandboxPathKey,
      (value) => sandboxPathPatternSchema.safeParse(value).success,
    ),
    ...rowIssues(
      'commands',
      'pattern',
      draft.commands,
      (row) => row.pattern,
      sandboxCommandKey,
      (value) => sandboxCommandPatternSchema.safeParse(value).success,
    ),
    ...rowIssues(
      'tools',
      'tool',
      draft.tools,
      (row) => row.tool,
      (value) => value.trim(),
      (value) => sandboxToolNameSchema.safeParse(value.trim()).success,
    ),
    ...rowIssues(
      'environment',
      'name',
      draft.environment,
      (row) => row.name,
      (value) => value.trim().toUpperCase(),
      (value) => sandboxEnvironmentNameSchema.safeParse(value.trim()).success,
      (value) => (SANDBOX_PROTECTED_ENVIRONMENT as readonly string[]).includes(value.trim().toUpperCase()),
    ),
  )
  for (const row of draft.environment)
    if (!sandboxEnvironmentValueSchema.safeParse(row.value).success)
      issues.push({ field: 'environment', rowId: row.rowId, column: 'value', code: 'invalid' })
  // The contract schema is authoritative; anything it rejects that is not mapped above is reported on the id.
  if (!issues.length && !sandboxProfileSaveInputSchema.safeParse(sandboxDraftToSaveInput(draft, null)).success)
    issues.push({ field: 'id', rowId: null, column: null, code: 'invalid' })
  return issues
}
