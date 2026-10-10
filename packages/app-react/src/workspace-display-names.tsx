import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { LumenButton, LumenDialog, LumenFormField, LumenFrame, LumenInput, LumenText } from '@lumen/app-ui'
import type { WorkspaceDisplayNamesState } from '@hbar/app-runtime'
import { captureWorkspaceDisplayNameValidationFocus } from './workspace-display-name-validation-focus'
import './workspace-display-names.css'

export interface WorkspaceDisplayNamesLabels {
  readonly title: string
  readonly close: string
  readonly name: string
  readonly nameHint: string
  readonly path: string
  readonly pathHint: string
  readonly restore: string
  readonly restoreHint: string
  readonly cancel: string
  readonly dismiss: string
  readonly save: string
  readonly reopen: string
  readonly refresh: string
  readonly rebase: string
  readonly reconcile: string
  readonly loading: string
  readonly unavailable: string
  readonly offline: string
  readonly saving: string
  readonly restoring: string
  readonly saved: string
  readonly restored: string
  readonly acknowledged: string
  readonly unknown: string
  readonly waiting: string
  readonly checking: string
  readonly conflict: string
  readonly actionFailure: (code: string) => string
  readonly readFailure: (code: string) => string
  readonly unexpectedFailure: string
  readonly validation: Readonly<Record<'required' | 'tooLong' | 'invalid', string>>
}

export interface WorkspaceDisplayNameTarget {
  readonly workspaceId: string
  readonly revision: number
}

export interface WorkspaceDisplayNameDialogProps {
  /** Opaque lifetime identity; the View never reads business state from this object. */
  readonly owner?: object | undefined
  readonly state: WorkspaceDisplayNamesState
  readonly connected: boolean
  readonly labels: WorkspaceDisplayNamesLabels
  readonly onEdit: (target: WorkspaceDisplayNameTarget & { readonly draft: string }) => void
  readonly onClose: (target: { readonly workspaceId: string }) => void
  readonly onSave: (target: WorkspaceDisplayNameTarget) => Promise<void>
  readonly onReset: (target: WorkspaceDisplayNameTarget) => Promise<void>
  readonly onRebase: (target: WorkspaceDisplayNameTarget) => Promise<void>
  readonly onRefresh: () => Promise<void>
  readonly onReconcile: () => Promise<void>
}

function actionUncertain(state: WorkspaceDisplayNamesState) {
  return state.action.status === 'unknown' || state.action.status === 'reconciling'
}

function actionBusy(state: WorkspaceDisplayNamesState) {
  return state.requestInFlight || state.action.status === 'submitting' || state.action.status === 'reconciling'
}

export function workspaceDisplayNameCanSave(state: WorkspaceDisplayNamesState, connected: boolean): boolean {
  return Boolean(
    connected &&
    state.status === 'ready' &&
    state.editor?.open &&
    state.editor.baseLoaded &&
    !state.editor.validation &&
    !state.editor.conflict &&
    !actionBusy(state) &&
    !actionUncertain(state),
  )
}

/** Native IME confirmation is not an explicit Save keystroke. */
export function workspaceDisplayNameSubmitKey(input: {
  readonly key: string
  readonly composing: boolean
  readonly keyCode: number
  readonly defaultPrevented: boolean
}): boolean {
  return input.key === 'Enter' && !input.composing && input.keyCode !== 229 && !input.defaultPrevented
}

function actionMessage(state: WorkspaceDisplayNamesState, labels: WorkspaceDisplayNamesLabels): string | null {
  const { action } = state
  if (action.status === 'submitting') return action.operation === 'reset' ? labels.restoring : labels.saving
  if (action.status === 'reconciling') return labels.checking
  if (action.status === 'unknown') return state.requestInFlight ? labels.waiting : labels.unknown
  if (action.status === 'failed') return labels.actionFailure(action.error ?? 'EXECUTION_FAILED')
  if (action.status !== 'succeeded' || !action.receipt || !action.request) return null
  const current = state.snapshot?.entries.find((item) => item.workspaceId === action.request?.workspaceId)
  const effectCurrent =
    state.status === 'ready' &&
    state.snapshot &&
    state.snapshot.revision >= action.receipt.revision &&
    (current?.displayName ?? null) === action.request.displayName
  if (!effectCurrent) return labels.acknowledged
  return action.operation === 'reset' ? labels.restored : labels.saved
}

/** Controlled editor: the runtime owns draft, request, confirmation, and whether a confirmed Save closes it. */
export function WorkspaceDisplayNameDialog(props: WorkspaceDisplayNameDialogProps) {
  const { state, connected, labels } = props
  const editor = state.editor
  const formId = useId()
  const nameId = useId()
  const pathId = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const lifetime = useRef(0)
  const pending = useRef<object | null>(null)
  const validationFocus = useRef<ReturnType<typeof captureWorkspaceDisplayNameValidationFocus> | null>(null)
  const composing = useRef(false)
  const [working, setWorking] = useState(false)
  const [localFailure, setLocalFailure] = useState(false)
  useLayoutEffect(() => {
    lifetime.current += 1
    pending.current = null
    validationFocus.current?.cancel()
    validationFocus.current = null
    composing.current = false
    setWorking(false)
    setLocalFailure(false)
    return () => {
      lifetime.current += 1
      pending.current = null
      validationFocus.current?.cancel()
      validationFocus.current = null
    }
  }, [props.owner, editor?.workspaceId, editor?.open])

  useLayoutEffect(() => {
    const lease = validationFocus.current
    if (!lease) return
    const target = editor?.open
      ? {
          owner: props.owner,
          generation: lifetime.current,
          workspaceId: editor.workspaceId,
          revision: editor.revision,
          draft: editor.draft,
        }
      : null
    if (lease.finish(target, Boolean(editor?.validation), !working)) validationFocus.current = null
  }, [editor, props.owner, working])

  const perform = (action: () => Promise<void>) => {
    if (!editor?.open || pending.current) return
    const generation = lifetime.current
    const operation = {}
    const focused = rootRef.current?.ownerDocument.activeElement
    pending.current = operation
    setWorking(true)
    setLocalFailure(false)
    void (async () => {
      try {
        await action()
      } catch {
        // Owner codes are rendered through typed host copy; arbitrary callback payloads never reach the View.
        if (lifetime.current === generation) setLocalFailure(true)
      } finally {
        if (pending.current === operation) pending.current = null
        if (lifetime.current === generation) {
          setWorking(false)
          const root = rootRef.current
          const active = root?.ownerDocument.activeElement
          // Restore can remove its own button. Do not override a later deliberate focus move.
          if (root && focused && !focused.isConnected && active === root.ownerDocument.body) nameRef.current?.focus()
        }
      }
    })()
  }
  if (!editor) return null
  const target = { workspaceId: editor.workspaceId, revision: editor.revision }
  const uncertain = actionUncertain(state)
  const busy = working || actionBusy(state)
  const locked = busy || uncertain
  const canWrite = connected && state.status === 'ready' && editor.baseLoaded && !locked && !editor.conflict
  const canSave = !working && workspaceDisplayNameCanSave(state, connected)
  const related = state.action.request?.workspaceId === editor.workspaceId
  const message = related ? actionMessage(state, labels) : null
  const failure = related && state.action.status === 'failed'
  const readFailure = state.status === 'error' ? labels.readFailure(state.error ?? 'EXECUTION_FAILED') : null
  const save = () => {
    if (!canSave || composing.current || pending.current) return
    const input = nameRef.current
    if (input) {
      validationFocus.current?.cancel()
      validationFocus.current = captureWorkspaceDisplayNameValidationFocus(input, {
        owner: props.owner,
        generation: lifetime.current,
        ...target,
        draft: editor.draft,
      })
    }
    perform(() => props.onSave(target))
  }
  const submitKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    const submit = workspaceDisplayNameSubmitKey({
      key: event.key,
      composing: composing.current || event.nativeEvent.isComposing,
      keyCode: event.keyCode,
      defaultPrevented: event.defaultPrevented,
    })
    event.preventDefault()
    event.stopPropagation()
    if (submit) save()
  }
  return (
    <LumenFrame ref={rootRef} data-testid="workspace-display-name-dialog">
      <LumenDialog
        appearance="panel"
        size="small"
        open={editor.open}
        title={labels.title}
        closeLabel={labels.close}
        className="hbar-workspace-display-name-dialog"
        initialFocus={nameRef}
        onClose={() => props.onClose({ workspaceId: editor.workspaceId })}
        footer={
          <LumenFrame className="hbar-workspace-display-name-actions">
            <LumenButton
              type="button"
              variant="outlined"
              onClick={() => props.onClose({ workspaceId: editor.workspaceId })}
            >
              {busy || uncertain ? labels.dismiss : labels.cancel}
            </LumenButton>
            <LumenButton type="submit" form={formId} disabled={!canSave}>
              {labels.save}
            </LumenButton>
          </LumenFrame>
        }
      >
        <LumenFrame
          as="form"
          id={formId}
          noValidate
          className="hbar-workspace-display-name-form"
          aria-busy={busy || undefined}
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
        >
          <LumenFormField
            controlId={nameId}
            label={labels.name}
            required
            hint={labels.nameHint}
            error={editor.validation ? labels.validation[editor.validation] : undefined}
          >
            <LumenInput
              ref={nameRef}
              id={nameId}
              data-testid="workspace-display-name-input"
              variant="boxed"
              value={editor.draft}
              maxLength={4000}
              readOnly={locked}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                if (!locked) {
                  setLocalFailure(false)
                  props.onEdit({ ...target, draft: event.currentTarget.value })
                }
              }}
              onCompositionStart={() => {
                composing.current = true
              }}
              onCompositionEnd={() => {
                composing.current = false
              }}
              onKeyDown={submitKey}
            />
          </LumenFormField>
          <LumenFormField controlId={pathId} label={labels.path} hint={labels.pathHint}>
            <LumenInput
              id={pathId}
              value={editor.path}
              readOnly
              aria-readonly="true"
              variant="boxed"
              className="hbar-workspace-display-name-path"
            />
          </LumenFormField>
          {editor.expectedDisplayName !== null && (
            <LumenFrame className="hbar-workspace-display-name-restore">
              <LumenFrame>
                <LumenText as="p">{editor.canonicalName}</LumenText>
                <LumenText as="p" tone="muted">
                  {labels.restoreHint}
                </LumenText>
              </LumenFrame>
              <LumenButton
                type="button"
                variant="outlined"
                disabled={!canWrite}
                onClick={() => perform(() => props.onReset(target))}
              >
                {labels.restore}
              </LumenButton>
            </LumenFrame>
          )}
          {message && (
            <LumenText as="p" role={uncertain || failure ? 'alert' : 'status'}>
              {message}
            </LumenText>
          )}
          {localFailure && !message && !readFailure && (
            <LumenText as="p" role="alert">
              {labels.unexpectedFailure}
            </LumenText>
          )}
          {!connected && (
            <LumenText as="p" role="status">
              {labels.offline}
            </LumenText>
          )}
          {connected && state.status === 'unavailable' && (
            <LumenText as="p" role="status">
              {labels.unavailable}
            </LumenText>
          )}
          {state.status === 'loading' && !uncertain && (
            <LumenText as="p" role="status">
              {labels.loading}
            </LumenText>
          )}
          {editor.baseLoaded && editor.conflict && !uncertain && (
            <LumenFrame className="hbar-workspace-display-name-recovery">
              <LumenText as="p" role="alert">
                {labels.conflict}
              </LumenText>
              <LumenButton
                type="button"
                variant="outlined"
                disabled={!connected || busy}
                onClick={() => perform(() => props.onRebase(target))}
              >
                {labels.rebase}
              </LumenButton>
            </LumenFrame>
          )}
          {readFailure && (
            <LumenText as="p" role="alert">
              {readFailure}
            </LumenText>
          )}
          {uncertain ? (
            <LumenButton
              type="button"
              variant="outlined"
              disabled={!connected || busy}
              onClick={() => perform(props.onReconcile)}
            >
              {labels.reconcile}
            </LumenButton>
          ) : readFailure && !editor.conflict ? (
            <LumenButton
              type="button"
              variant="outlined"
              disabled={!connected || busy}
              onClick={() => perform(props.onRefresh)}
            >
              {labels.refresh}
            </LumenButton>
          ) : null}
        </LumenFrame>
      </LumenDialog>
    </LumenFrame>
  )
}

export interface WorkspaceDisplayNameFeedbackProps {
  readonly state: WorkspaceDisplayNamesState
  readonly connected: boolean
  readonly labels: WorkspaceDisplayNamesLabels
  readonly onOpen: (target: { readonly workspaceId: string }) => void
  readonly onRefresh: () => Promise<void>
  readonly onReconcile: () => Promise<void>
}

/** The original operation remains inspectable even if its row is filtered out or its editor was closed. */
export function WorkspaceDisplayNameFeedback({
  state,
  connected,
  labels,
  onOpen,
  onRefresh,
  onReconcile,
}: WorkspaceDisplayNameFeedbackProps) {
  const [localFailure, setLocalFailure] = useState(false)
  const [working, setWorking] = useState(false)
  const pending = useRef(false)
  const lifetime = useRef(0)
  useLayoutEffect(() => {
    lifetime.current += 1
    pending.current = false
    setLocalFailure(false)
    setWorking(false)
    return () => {
      lifetime.current += 1
    }
  }, [state.action.key])
  const run = (action: () => Promise<void>) => {
    if (pending.current) return
    pending.current = true
    setLocalFailure(false)
    setWorking(true)
    const generation = lifetime.current
    void (async () => {
      try {
        await action()
      } catch {
        if (lifetime.current === generation) setLocalFailure(true)
      } finally {
        if (lifetime.current === generation) {
          pending.current = false
          setWorking(false)
        }
      }
    })()
  }
  if (!connected || state.editor?.open) return null
  const uncertain = actionUncertain(state)
  const busy = working || actionBusy(state)
  const message = actionMessage(state, labels)
  const readFailure = state.status === 'error' ? labels.readFailure(state.error ?? 'EXECUTION_FAILED') : null
  if (!message && !readFailure && !localFailure) return null
  const workspaceId = state.action.request?.workspaceId ?? state.editor?.workspaceId
  return (
    <LumenFrame
      className="hbar-workspace-display-name-feedback"
      data-testid="workspace-display-name-feedback"
      aria-busy={busy || undefined}
    >
      {message && (
        <LumenText as="p" role={uncertain || state.action.status === 'failed' ? 'alert' : 'status'}>
          {message}
        </LumenText>
      )}
      {readFailure && (
        <LumenText as="p" role="alert">
          {readFailure}
        </LumenText>
      )}
      {localFailure && !message && !readFailure && (
        <LumenText as="p" role="alert">
          {labels.unexpectedFailure}
        </LumenText>
      )}
      {!connected && (
        <LumenText as="p" role="status">
          {labels.offline}
        </LumenText>
      )}
      <LumenFrame className="hbar-workspace-display-name-recovery">
        {workspaceId && (uncertain || state.action.status === 'failed' || state.action.status === 'submitting') && (
          <LumenButton type="button" variant="text" onClick={() => onOpen({ workspaceId })}>
            {labels.reopen}
          </LumenButton>
        )}
        {uncertain ? (
          <LumenButton type="button" variant="text" disabled={!connected || busy} onClick={() => run(onReconcile)}>
            {labels.reconcile}
          </LumenButton>
        ) : readFailure ? (
          <LumenButton type="button" variant="text" disabled={!connected || busy} onClick={() => run(onRefresh)}>
            {labels.refresh}
          </LumenButton>
        ) : null}
      </LumenFrame>
    </LumenFrame>
  )
}
