import { SchemaError, validValue } from './schema'
import type { CompiledField, CompiledForm, FieldValue } from './schema'
import type { FieldItemValue } from './schema'

export interface FieldIssue {
  readonly field: string
  readonly code: 'required' | 'invalid'
}
export type SubmitOutcome = 'succeeded' | 'failed' | 'unknown'
export interface FormState {
  readonly formId: string
  readonly version: number
  readonly baseline: Readonly<Record<string, FieldValue>>
  readonly draft: Readonly<Record<string, FieldValue>>
  readonly raw: Readonly<Record<string, string>>
  readonly dirty: readonly string[]
  readonly issues: readonly FieldIssue[]
  readonly status: 'idle' | 'submitting' | SubmitOutcome
  readonly revision: number
  readonly pendingRevision: number | null
  readonly errorCode: string | null
}

export interface Submission {
  readonly revision: number
  readonly input: Readonly<Record<string, FieldValue>>
}

function itemValueArray(value: unknown): value is readonly FieldItemValue[] {
  return (
    Array.isArray(value) &&
    value.every((item: unknown) => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean')
  )
}

function fieldByName(form: CompiledForm, name: string): CompiledField {
  const field = form.fields.find((item) => item.name === name)
  if (!field) throw new SchemaError('FIELD_NOT_FOUND', `Unknown form field: ${name}`)
  return field
}

function freezeState(state: FormState): FormState {
  const freezeValues = (values: Readonly<Record<string, FieldValue>>): Readonly<Record<string, FieldValue>> =>
    Object.freeze(
      Object.fromEntries(
        Object.entries(values).map(([name, value]) => [
          name,
          itemValueArray(value) ? Object.freeze([...value]) : value,
        ]),
      ),
    )
  return Object.freeze({
    ...state,
    baseline: freezeValues(state.baseline),
    draft: freezeValues(state.draft),
    raw: Object.freeze({ ...state.raw }),
    dirty: Object.freeze([...state.dirty]),
    issues: Object.freeze(state.issues.map((issue) => Object.freeze({ ...issue }))),
  })
}

function sameValue(left: FieldValue | undefined, right: FieldValue | undefined): boolean {
  if (!itemValueArray(left) || !itemValueArray(right)) return left === right
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function issuesFor(
  form: CompiledForm,
  draft: Readonly<Record<string, FieldValue>>,
  raw: Readonly<Record<string, string>>,
): FieldIssue[] {
  const issues: FieldIssue[] = []
  for (const field of form.fields) {
    if (Object.hasOwn(raw, field.name)) {
      issues.push({ field: field.name, code: 'invalid' })
    } else if (!Object.hasOwn(draft, field.name)) {
      if (field.required) issues.push({ field: field.name, code: 'required' })
    } else if (!validValue(field, draft[field.name])) {
      issues.push({ field: field.name, code: 'invalid' })
    }
  }
  return issues
}

function updated(form: CompiledForm, previous: FormState, patch: Partial<FormState>): FormState {
  const state = { ...previous, ...patch }
  return freezeState({
    ...state,
    dirty: form.fields
      .filter((field) => {
        const name = field.name
        return (
          Object.hasOwn(state.draft, name) !== Object.hasOwn(state.baseline, name) ||
          !sameValue(state.draft[name], state.baseline[name]) ||
          Object.hasOwn(state.raw, name)
        )
      })
      .map((field) => field.name),
    issues: issuesFor(form, state.draft, state.raw),
  })
}

export function createForm(form: CompiledForm, input: Readonly<Record<string, unknown>>): FormState {
  for (const name of Object.keys(input)) fieldByName(form, name)
  const baseline: Record<string, FieldValue> = {}
  for (const field of form.fields) {
    const value = Object.hasOwn(input, field.name) ? input[field.name] : field.defaultValue
    if (value === undefined) continue
    if (!validValue(field, value)) throw new SchemaError('INVALID_INPUT', `Invalid initial value: ${field.name}`)
    baseline[field.name] = value
  }
  return updated(
    form,
    {
      formId: form.id,
      version: form.version,
      baseline,
      draft: baseline,
      raw: {},
      dirty: [],
      issues: [],
      status: 'idle',
      revision: 0,
      pendingRevision: null,
      errorCode: null,
    },
    {},
  )
}

function checkForm(form: CompiledForm, state: FormState): void {
  if (state.formId !== form.id || state.version !== form.version)
    throw new SchemaError('FORM_MISMATCH', 'Form state belongs to another schema revision')
}

export function setField(form: CompiledForm, state: FormState, name: string, value: FieldValue): FormState {
  checkForm(form, state)
  if (typeof value === 'string' && value.length > 8192)
    throw new SchemaError('INPUT_TOO_LARGE', 'Field input exceeds 8192 characters')
  if (itemValueArray(value) && JSON.stringify(value).length > 8192)
    throw new SchemaError('INPUT_TOO_LARGE', 'Field input exceeds 8192 characters')
  const field = fieldByName(form, name)
  if (field.readOnly) throw new SchemaError('FIELD_READ_ONLY', `Cannot edit target field: ${name}`)
  const draft = { ...state.draft },
    raw = { ...state.raw }
  let parsed: unknown = itemValueArray(value) ? Object.freeze([...value]) : value
  if (!field.multiple && value !== null && field.type !== 'string' && field.type !== 'boolean') {
    parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim() !== '' && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)
          ? Number(value)
          : undefined
  }
  if (parsed !== undefined && validValue(field, parsed)) {
    draft[name] = parsed
    delete raw[name]
  } else {
    raw[name] = String(value ?? '')
  }
  return updated(form, state, {
    draft,
    raw,
    revision: state.revision + 1,
    status: state.status === 'submitting' || state.status === 'unknown' ? state.status : 'idle',
    errorCode: state.status === 'unknown' ? state.errorCode : null,
  })
}

export function resetField(form: CompiledForm, state: FormState, name: string): FormState {
  checkForm(form, state)
  const field = fieldByName(form, name)
  if (field.readOnly) throw new SchemaError('FIELD_READ_ONLY', `Cannot reset target field: ${name}`)
  const draft = { ...state.draft },
    raw = { ...state.raw }
  if (Object.hasOwn(state.baseline, name)) draft[name] = state.baseline[name]!
  else delete draft[name]
  delete raw[name]
  return updated(form, state, {
    draft,
    raw,
    revision: state.revision + 1,
    status: state.status === 'submitting' || state.status === 'unknown' ? state.status : 'idle',
    errorCode: state.status === 'unknown' ? state.errorCode : null,
  })
}

export function validateForm(form: CompiledForm, state: FormState): readonly FieldIssue[] {
  checkForm(form, state)
  return Object.freeze(issuesFor(form, state.draft, state.raw))
}

export function beginSubmit(form: CompiledForm, state: FormState): { state: FormState; submission: Submission } {
  checkForm(form, state)
  if (state.status === 'submitting' || state.status === 'unknown')
    throw new SchemaError('SUBMISSION_PENDING', 'Reconcile the previous submission before retrying')
  if (state.issues.length) throw new SchemaError('INVALID_INPUT', 'Resolve field issues before submitting')
  const input = Object.freeze({ ...state.draft })
  return {
    state: updated(form, state, { status: 'submitting', pendingRevision: state.revision, errorCode: null }),
    submission: Object.freeze({ revision: state.revision, input }),
  }
}

export function settleSubmit(
  form: CompiledForm,
  state: FormState,
  submission: Submission,
  outcome: SubmitOutcome,
  errorCode: string | null = null,
): FormState {
  checkForm(form, state)
  if (state.pendingRevision !== submission.revision || (state.status !== 'submitting' && state.status !== 'unknown'))
    return state
  if (outcome === 'succeeded') {
    // Confirm exactly what was sent; concurrent edits remain in draft and dirty.
    return updated(form, state, {
      baseline: submission.input,
      status: 'succeeded',
      pendingRevision: null,
      errorCode: null,
    })
  }
  return updated(form, state, {
    status: outcome,
    pendingRevision: outcome === 'unknown' ? submission.revision : null,
    errorCode,
  })
}

/** Apply a confirmed server baseline without discarding edits made after submission. */
export function rebaseForm(form: CompiledForm, state: FormState, input: Readonly<Record<string, unknown>>): FormState {
  checkForm(form, state)
  const baseline = createForm(form, input).baseline
  const draft = { ...state.draft }
  for (const field of form.fields) {
    if (!field.readOnly && state.dirty.includes(field.name)) continue
    if (Object.hasOwn(baseline, field.name)) draft[field.name] = baseline[field.name]!
    else delete draft[field.name]
  }
  return updated(form, state, { baseline, draft })
}
