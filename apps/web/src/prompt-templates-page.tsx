import { useEffect, useMemo, useRef, useState } from 'react'
import { createWorkspaceSessionTargets } from './workspace-session-targets'
import { CommandError } from '@hbar/commands'
import {
  LumenButton,
  LumenDialog,
  LumenFormField,
  LumenFrame,
  LumenInput,
  LumenPopupSelect,
  LumenContentText,
} from '@lumen/app-ui'
import { PromptTemplateEditor, useHbarRuntimeState, type HbarRuntimeView } from '@hbar/app-react'
import { preSessionDraftStateSchema } from '@hbar/contracts/commands/pre-session-draft'
import {
  promptTemplateSaveInputSchema,
  type PromptTemplate,
  type PromptTemplateSaveInput,
  type PromptTemplateVariable,
} from '@hbar/contracts/commands/prompt-templates'
import type { ShellLocale } from './shell-copy'
import { promptTemplateCopy, type PromptTemplateCopy } from './prompt-template-copy'
import './prompt-templates-page.css'

export interface PromptTemplatesPageProps {
  readonly runtime: HbarRuntimeView
  readonly workspaceId: string
  readonly sessionId?: string
  readonly locale: ShellLocale
  readonly labels?: PromptTemplateCopy
}
type Target = { readonly kind: 'session' | 'pre-session'; readonly id: string }

export function validatePromptTemplateDraft(draft: PromptTemplateSaveInput, copy: PromptTemplateCopy): string | null {
  const result = promptTemplateSaveInputSchema.safeParse(draft)
  if (result.success) return null
  const issue = result.error.issues[0]
  if (issue?.path[0] === 'name') return copy.validationName
  if (issue?.path[0] === 'description') return copy.validationDescription
  if (issue?.path[0] === 'body') return issue.code === 'custom' ? copy.validationPlaceholder : copy.validationBody
  if (issue?.path[0] === 'variables')
    return issue.path.length === 1 ? copy.validationVariables : copy.validationVariable
  return copy.validationVariable
}

export function PromptTemplatesPage(props: PromptTemplatesPageProps) {
  const api = props.runtime.state.promptTemplates
  return api ? <AvailablePromptTemplatesPage key={props.workspaceId} {...props} api={api} /> : null
}

function AvailablePromptTemplatesPage({
  runtime,
  workspaceId,
  sessionId,
  locale,
  labels,
  api,
}: PromptTemplatesPageProps & {
  readonly api: NonNullable<HbarRuntimeView['state']['promptTemplates']>
}) {
  const state = useHbarRuntimeState(api.reader)
  const drafts = useHbarRuntimeState(runtime.state.drafts)
  const preDrafts = useHbarRuntimeState(runtime.state.preSessionDrafts)
  const directory = useHbarRuntimeState(runtime.state.directory)
  const sessionTargets = useMemo(
    () =>
      createWorkspaceSessionTargets({
        list: (input, signal) => runtime.commands.execute('session.list', input, { signal }),
      }),
    [runtime],
  )
  const targetCatalog = useHbarRuntimeState(sessionTargets.reader)
  useEffect(() => {
    void sessionTargets.refresh(workspaceId).catch(() => undefined)
  }, [sessionTargets, workspaceId])
  useEffect(() => sessionTargets.retain(), [sessionTargets])
  const copy = useMemo(() => labels ?? promptTemplateCopy(locale), [labels, locale])
  const [target, setTarget] = useState<Target | null>(sessionId ? { kind: 'session', id: sessionId } : null)
  const [mode, setMode] = useState<'append' | 'replace'>('append')
  const [values, setValues] = useState<Readonly<Record<string, string>>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PromptTemplate | null>(null)
  const [replaceConfirmation, setReplaceConfirmation] = useState(false)
  const [applying, setApplying] = useState(false)
  const owner = useRef({ mounted: true, applying: false })
  useEffect(() => {
    const lifetime = owner.current
    lifetime.mounted = true
    void api.list(workspaceId, null).catch(() => undefined)
    return () => {
      lifetime.mounted = false
    }
  }, [api, workspaceId])
  const matchingWorkspace = state.workspaceId === workspaceId
  const draft = matchingWorkspace ? state.draft : null
  const selected = matchingWorkspace ? state.selected : null
  const items = matchingWorkspace ? (state.page?.items ?? []) : []
  const busy = applying || state.mutation === 'submitting' || state.mutation === 'unknown'
  const sessions =
    targetCatalog.workspaceId === workspaceId
      ? targetCatalog.sessionIds.flatMap((id) => {
          const session = directory.sessions[id]
          return session && session.workspaceId === workspaceId && !session.archived ? [session] : []
        })
      : []
  const preEntries = Object.values(preDrafts).filter(
    (entry) => entry.workspaceId === workspaceId && entry.sessionId === null,
  )
  const targetAvailable =
    target?.kind === 'session'
      ? sessions.some((session) => session.id === target.id)
      : target?.kind === 'pre-session' && preEntries.some((entry) => entry.draftId === target.id)
  const targetDraft = target?.kind === 'session' ? drafts[target.id] : target ? preDrafts[target.id] : undefined
  const validation = draft ? validatePromptTemplateDraft(draft, copy) : null
  const report = (failure: unknown) => {
    if (owner.current.mounted) setError(failure instanceof Error ? failure.message : String(failure))
  }
  const updateDraft = (
    patch: Partial<Pick<PromptTemplateSaveInput, 'name' | 'description' | 'body' | 'variables'>>,
  ) => {
    api.updateDraft(patch)
    setError(null)
    setMessage(null)
  }
  const updateVariable = (index: number, patch: Partial<PromptTemplateVariable>) => {
    if (draft)
      updateDraft({
        variables: draft.variables.map((variable, position) =>
          position === index ? { ...variable, ...patch } : variable,
        ),
      })
  }
  const save = async () => {
    if (!draft || busy) return
    const issue = validatePromptTemplateDraft(draft, copy)
    if (issue) {
      setError(issue)
      return
    }
    setError(null)
    try {
      await api.save()
      if (owner.current.mounted) setMessage(copy.saved)
    } catch (failure) {
      report(failure)
    }
  }
  const select = (template: PromptTemplate) => {
    api.select(template)
    setValues(Object.fromEntries(template.variables.map((variable) => [variable.id, variable.defaultValue ?? ''])))
    setMessage(null)
    setError(null)
  }
  const apply = async () => {
    if (!selected || !target || !targetAvailable || busy || owner.current.applying) return
    if (mode === 'replace' && targetDraft?.text && !replaceConfirmation) {
      setReplaceConfirmation(true)
      return
    }
    const captured = { ...target, text: targetDraft?.text ?? '', revision: targetDraft?.revision ?? 0 }
    owner.current.applying = true
    setApplying(true)
    setError(null)
    try {
      await api.apply(
        selected,
        values,
        {
          kind: captured.kind,
          id: captured.id,
          readText: async () => ({ text: captured.text, revision: captured.revision }),
          applyText: async ({ text, expectedText, expectedRevision }) => {
            const currentDirectory = runtime.state.directory.getSnapshot()
            const current =
              captured.kind === 'session'
                ? runtime.state.drafts.getSnapshot()[captured.id]
                : runtime.state.preSessionDrafts.getSnapshot()[captured.id]
            const session = captured.kind === 'session' ? currentDirectory.sessions[captured.id] : undefined
            if (
              (captured.kind === 'session' && (!session || session.archived || session.workspaceId !== workspaceId)) ||
              (captured.kind === 'pre-session' &&
                (!current || !('workspaceId' in current) || current.workspaceId !== workspaceId)) ||
              (current?.text ?? '') !== expectedText ||
              (current?.revision ?? 0) !== expectedRevision
            )
              throw new CommandError('CONFLICT', copy.targetUnavailable)
            await runtime.commands.execute(captured.kind === 'session' ? 'draft.setText' : 'preSessionDraft.setText', {
              ...(captured.kind === 'session' ? { sessionId: captured.id } : { draftId: captured.id }),
              text,
              expectedRevision,
            })
          },
        },
        mode,
      )
      if (owner.current.mounted) {
        setMessage(copy.applied)
        setReplaceConfirmation(false)
      }
    } catch (failure) {
      report(failure)
    } finally {
      owner.current.applying = false
      if (owner.current.mounted) setApplying(false)
    }
  }
  const createPreDraft = async () => {
    try {
      const created = preSessionDraftStateSchema.parse(
        await runtime.commands.execute('preSessionDraft.open', { workspaceId }),
      )
      if (owner.current.mounted) {
        setTarget({ kind: 'pre-session', id: created.draftId })
        setReplaceConfirmation(false)
      }
    } catch (failure) {
      report(failure)
    }
  }
  return (
    <LumenFrame className="hbar-prompt-templates-page">
      <LumenFrame as="header">
        <LumenFrame>
          <LumenContentText context="workspace.title">{copy.title}</LumenContentText>
          <LumenContentText context="workspace.context">{copy.detail}</LumenContentText>
        </LumenFrame>
        <LumenFrame className="hbar-prompt-actions" role="group" aria-label={copy.title} tabIndex={0}>
          <LumenButton
            disabled={busy}
            onClick={() => {
              api.createDraft(workspaceId)
              setError(null)
              setMessage(null)
            }}
          >
            {copy.create}
          </LumenButton>
        </LumenFrame>
      </LumenFrame>
      {state.status === 'loading' ? (
        <LumenContentText context="feedback.paragraph" role="status">
          {copy.loading}
        </LumenContentText>
      ) : null}
      {targetCatalog.status === 'error' ? (
        <LumenFrame role="alert">
          <LumenContentText context="feedback.paragraph" tone="danger">
            {copy.sessionsFailed}
          </LumenContentText>
          <LumenFrame className="hbar-prompt-actions" role="group" aria-label={copy.sessionsFailed} tabIndex={0}>
            <LumenButton onClick={() => void sessionTargets.refresh(workspaceId).catch(report)}>
              {copy.retry}
            </LumenButton>
          </LumenFrame>
        </LumenFrame>
      ) : null}
      {targetCatalog.capacityReached ? (
        <LumenContentText context="feedback.paragraph">{copy.sessionCapacity}</LumenContentText>
      ) : null}
      {state.status === 'error' && state.mutation !== 'failed' ? (
        <LumenFrame className="hbar-prompt-feedback" role="alert">
          <LumenContentText context="feedback.paragraph" tone="danger">
            {state.error ?? copy.loadError}
          </LumenContentText>
          <LumenFrame className="hbar-prompt-actions" role="group" aria-label={copy.loadError} tabIndex={0}>
            <LumenButton onClick={() => void api.list(workspaceId, null).catch(report)}>{copy.retry}</LumenButton>
          </LumenFrame>
        </LumenFrame>
      ) : null}
      <LumenFrame as="section" className="hbar-prompt-template-list" aria-label={copy.listTitle}>
        <LumenContentText context="section.title" level={2}>
          {copy.listTitle}
        </LumenContentText>
        {items.map((template) => (
          <LumenFrame as="article" key={template.id}>
            <LumenFrame>
              <LumenButton
                variant="text"
                className="hbar-prompt-template-select"
                disabled={busy}
                aria-pressed={selected?.id === template.id}
                onClick={() => select(template)}
              >
                <LumenContentText context="collection.title">{template.name}</LumenContentText>
              </LumenButton>
              <LumenContentText context="collection.detail">{template.description}</LumenContentText>
            </LumenFrame>
            <LumenFrame className="hbar-prompt-actions" role="group" aria-label={template.name} tabIndex={0}>
              <LumenButton
                disabled={busy}
                onClick={() => {
                  api.edit(template)
                  setError(null)
                  setMessage(null)
                }}
              >
                {copy.edit}
              </LumenButton>
              <LumenButton disabled={busy} onClick={() => setDeleteTarget(template)}>
                {copy.remove}
              </LumenButton>
            </LumenFrame>
          </LumenFrame>
        ))}
        {items.length === 0 && state.status === 'idle' ? (
          <LumenContentText context="empty.description">{copy.empty}</LumenContentText>
        ) : null}
      </LumenFrame>
      <LumenFrame as="nav" className="hbar-prompt-pagination" aria-label={copy.listTitle} tabIndex={0}>
        <LumenButton
          disabled={busy || state.status === 'loading' || !state.page?.nextCursor}
          onClick={() => {
            if (state.page?.nextCursor) void api.list(workspaceId, state.page.nextCursor).catch(report)
          }}
        >
          {copy.next}
        </LumenButton>
        <LumenButton
          disabled={busy || state.status === 'loading'}
          onClick={() => void api.list(workspaceId, null).catch(report)}
        >
          {copy.first}
        </LumenButton>
      </LumenFrame>
      {draft ? (
        <>
          <PromptTemplateEditor
            name={draft.name}
            body={draft.body}
            variables={draft.variables.map((variable) => ({
              ...variable,
              present: [...draft.body.matchAll(/{{\s*([A-Za-z][A-Za-z0-9_-]*)\s*}}/g)].some(
                (match) => match[1] === variable.id,
              ),
            }))}
            labels={copy.editor}
            validation={error ?? validation}
            disabled={busy}
            canSave={!busy && !validation}
            onNameChange={(name) => updateDraft({ name })}
            onBodyChange={(body) => updateDraft({ body })}
            onSave={() => void save()}
            onCancel={() => {
              api.cancel()
              setError(null)
            }}
          />
          <LumenFormField label={copy.description} controlId="prompt-template-description" layout="rows">
            <LumenInput
              value={draft.description}
              disabled={busy}
              maxLength={2000}
              onChange={(event) => updateDraft({ description: event.currentTarget.value })}
            />
          </LumenFormField>
          <LumenFrame as="section" className="hbar-prompt-variables">
            <LumenContentText context="section.title" level={3}>
              {copy.variables}
            </LumenContentText>
            {draft.variables.map((variable, index) => (
              <LumenFrame className="hbar-prompt-variable" key={index}>
                <LumenFrame className="hbar-prompt-variable-fields">
                  <LumenInput
                    aria-label={copy.variableId}
                    disabled={busy}
                    value={variable.id}
                    maxLength={80}
                    onChange={(event) => updateVariable(index, { id: event.currentTarget.value })}
                  />
                  <LumenInput
                    aria-label={copy.variableLabel}
                    disabled={busy}
                    value={variable.label}
                    maxLength={160}
                    onChange={(event) => updateVariable(index, { label: event.currentTarget.value })}
                  />
                  <LumenPopupSelect
                    id={`prompt-template-variable-required-${index}`}
                    aria-label={copy.variableRequired}
                    disabled={busy}
                    value={variable.required ? 'required' : 'optional'}
                    options={[
                      { id: 'optional', label: copy.optional },
                      { id: 'required', label: copy.required },
                    ]}
                    onValueChange={(value) => updateVariable(index, { required: value === 'required' })}
                  />
                  <LumenInput
                    aria-label={copy.variableDefault}
                    disabled={busy}
                    value={variable.defaultValue ?? ''}
                    maxLength={20_000}
                    onChange={(event) => updateVariable(index, { defaultValue: event.currentTarget.value })}
                  />
                </LumenFrame>
                <LumenFrame
                  className="hbar-prompt-variable-actions"
                  role="group"
                  aria-label={copy.variables}
                  tabIndex={0}
                >
                  <LumenButton
                    disabled={busy}
                    onClick={() =>
                      updateDraft({ variables: draft.variables.filter((_entry, position) => position !== index) })
                    }
                  >
                    {copy.removeVariable}
                  </LumenButton>
                </LumenFrame>
              </LumenFrame>
            ))}
            <LumenFrame className="hbar-prompt-actions" role="group" aria-label={copy.variables} tabIndex={0}>
              <LumenButton
                disabled={busy || draft.variables.length >= 32}
                onClick={() => updateDraft({ variables: [...draft.variables, { id: '', label: '', required: false }] })}
              >
                {copy.addVariable}
              </LumenButton>
            </LumenFrame>
          </LumenFrame>
        </>
      ) : null}
      {selected && !draft ? (
        <LumenFrame as="section" className="hbar-prompt-apply">
          <LumenContentText context="section.title" level={2}>
            {copy.applyTitle}
          </LumenContentText>
          <LumenPopupSelect
            id="prompt-template-target"
            aria-label={copy.target}
            disabled={busy}
            value={target ? `${target.kind}:${target.id}` : null}
            placeholder={copy.chooseTarget}
            selectedLabel={target ? target.id : undefined}
            options={[
              { id: '', label: copy.chooseTarget },
              ...sessions.map((session) => ({ id: `session:${session.id}`, label: session.title })),
              ...preEntries.map((entry, index) => ({
                id: `pre-session:${entry.draftId}`,
                label: copy.preTarget(index + 1),
              })),
            ]}
            onValueChange={(value) => {
              const separator = value.indexOf(':')
              const kind = value.slice(0, separator)
              const id = value.slice(separator + 1)
              setTarget((kind === 'session' || kind === 'pre-session') && id ? { kind, id } : null)
              setReplaceConfirmation(false)
            }}
          />
          <LumenFrame className="hbar-prompt-actions" role="group" aria-label={copy.target} tabIndex={0}>
            <LumenButton disabled={busy} onClick={() => void createPreDraft()}>
              {copy.createPreDraft}
            </LumenButton>
          </LumenFrame>
          <LumenPopupSelect
            id="prompt-template-mode"
            aria-label={copy.mode}
            disabled={busy}
            value={mode}
            options={[
              { id: 'append', label: copy.append },
              { id: 'replace', label: copy.replace },
            ]}
            onValueChange={(value) => {
              setMode(value === 'replace' ? 'replace' : 'append')
              setReplaceConfirmation(false)
            }}
          />
          {selected.variables.map((variable) => (
            <LumenInput
              key={variable.id}
              aria-label={variable.label}
              required={variable.required}
              disabled={busy}
              value={values[variable.id] ?? variable.defaultValue ?? ''}
              onChange={(event) => {
                const value = event.currentTarget.value
                setValues((current) => ({ ...current, [variable.id]: value }))
              }}
            />
          ))}
          {replaceConfirmation ? (
            <LumenContentText context="feedback.paragraph" tone="warning" role="alert">
              {copy.confirmReplace}
            </LumenContentText>
          ) : null}
          <LumenFrame className="hbar-prompt-actions" role="group" aria-label={copy.applyTitle} tabIndex={0}>
            <LumenButton disabled={busy || !targetAvailable} loading={applying} onClick={() => void apply()}>
              {replaceConfirmation ? copy.confirmReplace : copy.apply}
            </LumenButton>
          </LumenFrame>
        </LumenFrame>
      ) : null}
      {state.mutation === 'unknown' ? (
        <LumenFrame className="hbar-prompt-feedback" role="alert">
          <LumenContentText context="feedback.paragraph" tone="warning">
            {copy.unknown}
          </LumenContentText>
          <LumenContentText context="feedback.paragraph" tone="muted">
            {copy.pendingWorkspace(
              directory.workspaces[state.pendingWorkspaceId ?? workspaceId]?.name ?? copy.otherWorkspace,
            )}
          </LumenContentText>
          <LumenFrame className="hbar-prompt-actions" role="group" aria-label={copy.unknown} tabIndex={0}>
            <LumenButton onClick={() => void api.reconcile().catch(report)}>{copy.reconcile}</LumenButton>
          </LumenFrame>
        </LumenFrame>
      ) : null}
      {message ? (
        <LumenContentText context="feedback.paragraph" className="hbar-prompt-message" role="status">
          {message}
        </LumenContentText>
      ) : null}
      {error || state.mutation === 'failed' ? (
        <LumenContentText context="feedback.paragraph" role="alert" tone="danger">
          {error ?? state.error}
        </LumenContentText>
      ) : null}
      <LumenDialog
        open={deleteTarget !== null}
        size="small"
        title={copy.confirmDelete(deleteTarget?.name ?? '')}
        closeLabel={copy.editor.cancel}
        onClose={() => setDeleteTarget(null)}
        footer={
          <>
            <LumenButton disabled={busy} onClick={() => setDeleteTarget(null)}>
              {copy.editor.cancel}
            </LumenButton>
            <LumenButton
              disabled={busy || !deleteTarget}
              tone="danger"
              onClick={() => {
                const original = deleteTarget
                if (original)
                  void api
                    .remove(original)
                    .then(() => {
                      if (owner.current.mounted) {
                        setDeleteTarget(null)
                        setMessage(copy.deleted)
                      }
                    })
                    .catch(report)
              }}
            >
              {copy.remove}
            </LumenButton>
          </>
        }
      >
        <LumenContentText context="dialog.body">{deleteTarget?.description}</LumenContentText>
      </LumenDialog>
    </LumenFrame>
  )
}
