import { CommandError, describeCommand, type CommandRegistry } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { budgetCommands, budgetReceiptSchema, setBudgetInputSchema } from '@hbar/contracts/commands/budget'
import { budgetEditorCommands } from '@hbar/contracts/commands/budget-editor'
import {
  beginSubmit,
  compileForm,
  createComponentRegistry,
  createForm,
  resetField,
  setField,
  settleSubmit,
  rebaseForm,
  SchemaError,
} from '@hbar/schema-core'
import type { FormState, Submission } from '@hbar/schema-core'
import { createState } from './state'
import type { BudgetCommandPort, BudgetFormState, BudgetFormsState } from './types'

const components = createComponentRegistry()
components.register('TextField', ['string'])
components.register('NumberField', ['integer', 'number'])
const schema = compileForm(
  describeCommand(budgetCommands['session.setBudget']).inputSchema,
  {
    id: 'session.setBudget@1',
    version: 1,
    fields: {
      sessionId: { labelKey: 'i18n:commands.session.setBudget.session', component: 'TextField', readOnly: true },
      tokens: { labelKey: 'i18n:commands.session.setBudget.tokens', component: 'NumberField' },
      expectedRevision: {
        labelKey: 'i18n:commands.session.setBudget.revision',
        component: 'NumberField',
        readOnly: true,
      },
    },
  },
  components,
)

function summary(entry: BudgetFormState) {
  return {
    formId: entry.formId,
    sessionId: entry.sessionId,
    revision: entry.form.revision,
    status: entry.form.status,
    dirty: [...entry.form.dirty],
    issues: [...entry.form.issues],
  }
}

function commandError(error: unknown): CommandError {
  if (error instanceof CommandError) return error
  if (error instanceof SchemaError || error instanceof HbarError) return new CommandError(error.code, error.message)
  return new CommandError('EXECUTION_FAILED', 'Budget form action failed')
}

function initialForm(sessionId: string, limit: number | undefined, revision: number | null): FormState {
  return createForm(schema, {
    sessionId,
    ...(limit !== undefined ? { tokens: limit } : {}),
    expectedRevision: revision,
  })
}

function afterReceipt(entry: BudgetFormState, submission: Submission, receipt: unknown): BudgetFormState {
  const committed = budgetReceiptSchema.parse(receipt)
  if (committed.budget.sessionId !== entry.sessionId || committed.idempotencyKey !== entry.pendingKey)
    throw new CommandError('INVALID_OUTPUT', 'Receipt does not belong to the submitted form')
  const submitted = settleSubmit(schema, entry.form, submission, 'succeeded')
  const form = rebaseForm(schema, submitted, {
    sessionId: entry.sessionId,
    tokens: committed.budget.limit,
    expectedRevision: committed.revision,
  })
  return { ...entry, form, receipt: committed, pendingKey: null }
}

export function createBudgetForms(
  local: CommandRegistry,
  port: BudgetCommandPort | undefined,
  onSubscriberError: (error: unknown) => void,
  isDisposed: () => boolean,
) {
  const state = createState<BudgetFormsState>({}, onSubscriberError)
  const pending = new Map<string, Submission>()
  const opening = new Map<string, { cancelled: boolean }>()
  function entry(formId: string): BudgetFormState {
    const current = state.reader.getSnapshot()[formId]
    if (!current) throw new CommandError('FORM_NOT_FOUND', 'Budget form is closed or unavailable')
    return current
  }
  function replace(formId: string, current: BudgetFormState, next: BudgetFormState): void {
    if (isDisposed() || state.reader.getSnapshot()[formId] !== current) return
    state.replace({ ...state.reader.getSnapshot(), [formId]: next })
  }
  local.register(budgetEditorCommands['app.openCommandForm'], async ({ commandId, sessionId, formId }, context) => {
    if (!port) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Budget command port is unavailable')
    const existing = state.reader.getSnapshot()[formId]
    if (existing) {
      if (existing.sessionId !== sessionId || existing.commandId !== commandId)
        throw new CommandError('FORM_CONFLICT', 'Form ID is bound to another target')
      return summary(existing)
    }
    if (Object.keys(state.reader.getSnapshot()).length + opening.size >= 32)
      throw new CommandError('BUSY', 'Too many budget forms are open')
    if (opening.has(formId)) throw new CommandError('BUSY', 'Form is already opening')
    const intent = { cancelled: false }
    opening.set(formId, intent)
    const onAbort = () => {
      intent.cancelled = true
    }
    context.signal.addEventListener('abort', onAbort, { once: true })
    let budget
    try {
      budget = await port.execute('session.getBudget', { sessionId })
    } catch (error) {
      throw commandError(error)
    } finally {
      context.signal.removeEventListener('abort', onAbort)
      if (opening.get(formId) === intent) opening.delete(formId)
    }
    if (intent.cancelled) throw new CommandError('CANCELLED', 'Form was closed while opening')
    if (isDisposed()) throw new CommandError('DISPOSED', 'Runtime was disposed')
    const now = state.reader.getSnapshot()[formId]
    if (now) {
      if (now.sessionId !== sessionId) throw new CommandError('FORM_CONFLICT', 'Form ID is bound to another target')
      return summary(now)
    }
    const created: BudgetFormState = {
      formId,
      commandId,
      sessionId,
      form: initialForm(sessionId, budget?.limit, budget?.revision ?? null),
      receipt: null,
      pendingKey: null,
    }
    state.replace({ ...state.reader.getSnapshot(), [formId]: created })
    return summary(created)
  })
  local.register(budgetEditorCommands['app.closeCommandForm'], ({ formId }) => {
    const current = state.reader.getSnapshot()
    const intent = opening.get(formId)
    if (intent) {
      intent.cancelled = true
      opening.delete(formId)
    }
    if (!current[formId]) return { closed: Boolean(intent) }
    pending.delete(formId)
    const next = { ...current }
    delete next[formId]
    state.replace(next)
    return { closed: true }
  })
  local.register(budgetEditorCommands['form.setField'], ({ formId, field, value }) => {
    const current = entry(formId)
    try {
      const next = { ...current, form: setField(schema, current.form, field, value) }
      replace(formId, current, next)
      return summary(next)
    } catch (error) {
      throw commandError(error)
    }
  })
  local.register(budgetEditorCommands['form.resetField'], ({ formId, field }) => {
    const current = entry(formId)
    try {
      const next = { ...current, form: resetField(schema, current.form, field) }
      replace(formId, current, next)
      return summary(next)
    } catch (error) {
      throw commandError(error)
    }
  })
  local.register(budgetEditorCommands['form.submit'], async ({ formId }, context) => {
    if (!port) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Budget command port is unavailable')
    const current = entry(formId)
    let submission: Submission
    let submitting: BudgetFormState
    try {
      const begun = beginSubmit(schema, current.form)
      submission = begun.submission
      submitting = { ...current, form: begun.state, pendingKey: crypto.randomUUID(), receipt: null }
      replace(formId, current, submitting)
      pending.set(formId, submission)
    } catch (error) {
      throw commandError(error)
    }
    const input = setBudgetInputSchema.parse(submission.input)
    const onAbort = () => {
      const latest = state.reader.getSnapshot()[formId]
      if (latest?.pendingKey !== submitting.pendingKey) return
      replace(formId, latest, {
        ...latest,
        form: settleSubmit(schema, latest.form, submission, 'unknown', 'RESULT_UNKNOWN'),
      })
    }
    context.signal.addEventListener('abort', onAbort, { once: true })
    try {
      const receipt = await port.execute('session.setBudget', input, { idempotencyKey: submitting.pendingKey! })
      const latest = state.reader.getSnapshot()[formId]
      if (latest && latest.pendingKey === submitting.pendingKey) {
        const next = afterReceipt(latest, submission, receipt)
        replace(formId, latest, next)
        pending.delete(formId)
      }
      return receipt
    } catch (error) {
      const mapped = commandError(error)
      const latest = state.reader.getSnapshot()[formId]
      if (latest && latest.pendingKey === submitting.pendingKey) {
        const uncertain = ['RESULT_UNKNOWN', 'DISCONNECTED', 'TIMEOUT', 'TIMED_OUT', 'INVALID_OUTPUT'].includes(
          mapped.code,
        )
        replace(formId, latest, {
          ...latest,
          form: settleSubmit(schema, latest.form, submission, uncertain ? 'unknown' : 'failed', mapped.code),
          pendingKey: uncertain ? latest.pendingKey : null,
        })
        if (!uncertain) pending.delete(formId)
      }
      throw mapped
    } finally {
      context.signal.removeEventListener('abort', onAbort)
    }
  })
  local.register(budgetEditorCommands['form.reconcile'], async ({ formId }) => {
    if (!port) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Budget command port is unavailable')
    const current = entry(formId)
    const submission = pending.get(formId)
    if (!current.pendingKey || !submission || current.form.status !== 'unknown')
      throw new CommandError('INVALID_INPUT', 'Form has no unknown submission to reconcile')
    let receipt
    try {
      receipt = await port.getReceipt(current.sessionId, current.pendingKey)
    } catch (error) {
      throw commandError(error)
    }
    if (receipt) {
      const latest = state.reader.getSnapshot()[formId]
      if (latest?.pendingKey === current.pendingKey) {
        try {
          replace(formId, latest, afterReceipt(latest, submission, receipt))
          pending.delete(formId)
        } catch (error) {
          throw commandError(error)
        }
      }
    }
    return receipt
  })
  return {
    reader: state.reader,
    dispose: () => {
      for (const intent of opening.values()) intent.cancelled = true
      opening.clear()
      pending.clear()
      state.dispose()
    },
  }
}
