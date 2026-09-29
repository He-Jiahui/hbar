import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Folder, Sparkles, Target, X } from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenInput, LumenText, LumenTextarea } from '@lumen/app-ui'
import {
  HbarComposerAddMenu,
  HbarPreSessionApprovalPicker,
  HbarPreSessionChoicePicker,
  HbarPreSessionLanding,
  useHbarRuntime,
  useHbarRuntimeState,
} from '@hbar/app-react'
import { workspaceDisplayName, type ComposerPermissionChoice, type ComposerPlanMode } from '@hbar/app-runtime'
import { modelCommands } from '@hbar/contracts/commands/models'
import { workspacePageSchema } from '@hbar/contracts/directory'
import type { ModelDescriptor } from '@hbar/contracts/commands/models'
import { getShellCopy, type ShellLocale } from './shell-copy'
import { preSessionCopy } from './pre-session-copy'
import './PreSessionLanding.css'

export function WebPreSessionLanding({
  draftId,
  locale,
  connected,
  sendBehavior,
}: {
  readonly draftId: string
  readonly locale: ShellLocale
  readonly connected: boolean
  readonly sendBehavior: 'enter' | 'modifierEnter' | null
}) {
  const runtime = useHbarRuntime()
  const directory = useHbarRuntimeState(runtime.state.directory)
  const displayNames = useHbarRuntimeState(runtime.state.workspaceDisplayNameSnapshot)
  const preSessionDrafts = useHbarRuntimeState(runtime.state.preSessionDrafts)
  const composerPermission = useHbarRuntimeState(runtime.state.composerPermission)
  const composerPlanMode = useHbarRuntimeState(runtime.state.composerPlanMode)
  const draft = preSessionDrafts[draftId]
  const shell = getShellCopy(locale)
  const labels = preSessionCopy(locale)
  const [text, setText] = useState('')
  const [path, setPath] = useState('')
  const [pathError, setPathError] = useState<string | null>(null)
  const [openingPath, setOpeningPath] = useState(false)
  const [models, setModels] = useState<readonly ModelDescriptor[]>([])
  const [modelError, setModelError] = useState<string | null>(null)
  const [modelsLoading, setModelsLoading] = useState(true)
  const [modelRefresh, setModelRefresh] = useState(0)
  const [openingProviders, setOpeningProviders] = useState(false)
  const [providerRouteError, setProviderRouteError] = useState<string | null>(null)
  const [workspaceCursor, setWorkspaceCursor] = useState<string | null>(null)
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [reconciling, setReconciling] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)
  const [goalError, setGoalError] = useState<string | null>(null)
  const openPromise = useRef<Promise<unknown> | null>(null)
  const writes = useRef<Promise<unknown>>(Promise.resolve())
  const alive = useRef(true)
  const initialized = useRef(false)
  const mountLease = useRef(0)
  const editor = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const lease = ++mountLease.current
    alive.current = true
    openPromise.current = runtime.commands.execute('preSessionDraft.open', { draftId }).catch((reason: unknown) => {
      if (alive.current) setOpenError(code(reason))
      throw reason
    })
    return () => {
      alive.current = false
      const settledWrites = writes.current
      queueMicrotask(() => {
        // The live generation check intentionally observes the next StrictMode setup.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        if (mountLease.current !== lease) return
        if (runtime.state.presentation.getSnapshot().page.kind === 'settings') return
        void settledWrites
          .catch(() => undefined)
          .then(() => runtime.commands.execute('preSessionDraft.close', { draftId }))
          .catch(() => undefined)
      })
    }
  }, [draftId, runtime])

  useEffect(() => {
    if (!draft || initialized.current) return
    initialized.current = true
    setText(draft.text)
  }, [draft])

  useEffect(() => {
    if (!connected) return
    let live = true
    setModelsLoading(true)
    void runtime.commands
      .execute('model.list', {})
      .then((value) => {
        if (!live) return
        setModels(modelCommands['model.list'].output.parse(value))
        setModelError(null)
      })
      .catch((reason: unknown) => {
        if (!live) return
        setModels([])
        setModelError(code(reason))
      })
      .finally(() => {
        if (live) setModelsLoading(false)
      })
    return () => {
      live = false
    }
  }, [connected, runtime, modelRefresh])

  useEffect(() => {
    if (!connected || !composerPermission.available || composerPermission.hostDefault.status !== 'idle') return
    void runtime.commands.execute('composerPermission.refresh', {}).catch(() => undefined)
  }, [connected, composerPermission.available, composerPermission.hostDefault.status, runtime])

  useEffect(() => {
    if (!connected || !draft?.workspaceId || directory.workspaces[draft.workspaceId]) return
    void runtime.commands.execute('workspace.get', { workspaceId: draft.workspaceId }).catch(() => undefined)
  }, [connected, directory.workspaces, draft?.workspaceId, runtime])

  useEffect(() => {
    if (!connected) return
    let live = true
    void runtime.commands
      .execute('workspace.list', { limit: 100 })
      .then((value) => {
        if (live) setWorkspaceCursor(workspacePageSchema.parse(value).nextCursor)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [connected, runtime])

  function queue<T>(action: () => Promise<T>): Promise<T> {
    const next = writes.current
      .catch(() => undefined)
      .then(async () => {
        await openPromise.current
        return action()
      })
    writes.current = next
    return next
  }

  const writeText = (value: string) => {
    setText(value)
    void queue(async () => {
      const current = runtime.state.preSessionDrafts.getSnapshot()[draftId]
      if (!current) return
      await runtime.commands.execute('preSessionDraft.setText', {
        draftId,
        text: value,
        expectedRevision: current.revision,
      })
    }).catch(() => undefined)
  }

  const chooseWorkspace = (workspaceId: string) =>
    queue(async () => {
      const current = runtime.state.preSessionDrafts.getSnapshot()[draftId]
      if (!current) throw new Error('Draft is unavailable')
      await runtime.commands.execute('preSessionDraft.setWorkspace', {
        draftId,
        workspaceId,
        expectedRevision: current.revision,
      })
    })

  const chooseModel = (modelId: string) =>
    queue(async () => {
      const current = runtime.state.preSessionDrafts.getSnapshot()[draftId]
      if (!current) throw new Error('Draft is unavailable')
      await runtime.commands.execute('preSessionDraft.setModel', {
        draftId,
        modelId,
        expectedRevision: current.revision,
      })
    })

  const chooseApproval = (choice: ComposerPermissionChoice, confirmAllow?: true) =>
    queue(async () => {
      let current = runtime.state.preSessionDrafts.getSnapshot()[draftId]
      if (!current) throw new Error('Draft is unavailable')
      if (current.planMode === 'plan') {
        await runtime.commands.execute('preSessionDraft.setPlanMode', {
          draftId,
          mode: 'default',
          expectedRevision: current.revision,
        })
        current = runtime.state.preSessionDrafts.getSnapshot()[draftId]
        if (!current) throw new Error('Draft is unavailable')
      }
      await runtime.commands.execute('preSessionDraft.setApprovalChoice', {
        draftId,
        choice,
        expectedRevision: current.revision,
        ...(confirmAllow ? { confirmAllow } : {}),
      })
    })

  const choosePlanMode = (mode: ComposerPlanMode) =>
    queue(async () => {
      const current = runtime.state.preSessionDrafts.getSnapshot()[draftId]
      if (!current) throw new Error('Draft is unavailable')
      await runtime.commands.execute('preSessionDraft.setPlanMode', {
        draftId,
        mode,
        expectedRevision: current.revision,
      })
    })

  const chooseGoalIntent = (intent: 'default' | 'goal') => {
    setGoalError(null)
    void queue(async () => {
      const current = runtime.state.preSessionDrafts.getSnapshot()[draftId]
      if (!current) throw new Error('Draft is unavailable')
      await runtime.commands.execute('preSessionDraft.setIntent', {
        draftId,
        intent,
        expectedRevision: current.revision,
      })
    })
      .then(() => {
        if (alive.current) editor.current?.focus()
      })
      .catch((reason: unknown) => {
        if (alive.current) setGoalError(code(reason))
      })
  }

  const loadMoreWorkspaces = () => {
    if (!workspaceCursor || loadingWorkspaces) return
    const cursor = workspaceCursor
    setLoadingWorkspaces(true)
    void runtime.commands
      .execute('workspace.list', { after: cursor, limit: 100 })
      .then((value) => setWorkspaceCursor(workspacePageSchema.parse(value).nextCursor))
      .catch(() => undefined)
      .finally(() => setLoadingWorkspaces(false))
  }

  const openWorkspace = (closePicker: () => void) => {
    if (!connected || !path.trim() || openingPath) return
    const targetPath = path.trim()
    setOpeningPath(true)
    setPathError(null)
    void queue(async () => {
      const workspace = await runtime.commands.execute('workspace.open', { path: targetPath })
      const current = runtime.state.preSessionDrafts.getSnapshot()[draftId]
      if (!current) throw new Error('Draft is unavailable')
      await runtime.commands.execute('preSessionDraft.setWorkspace', {
        draftId,
        workspaceId: workspace.id,
        expectedRevision: current.revision,
      })
      if (alive.current) {
        setPath('')
        closePicker()
      }
    })
      .catch((reason: unknown) => {
        if (alive.current) setPathError(code(reason))
      })
      .finally(() => {
        if (alive.current) setOpeningPath(false)
      })
  }

  const retryModels = () => {
    if (!connected || modelsLoading) return
    setModelError(null)
    setModelsLoading(true)
    setModelRefresh((current) => current + 1)
  }

  const openProviderSettings = (closePicker?: () => void) => {
    if (!connected || openingProviders) return
    const presentation = runtime.state.presentation.getSnapshot()
    const navigation = runtime.state.navigation.getSnapshot()
    if (presentation.page.kind !== 'session' || navigation.sessionId !== null) return
    closePicker?.()
    setProviderRouteError(null)
    setOpeningProviders(true)
    void queue(async () => {
      if (
        runtime.state.presentation.getSnapshot() !== presentation ||
        runtime.state.navigation.getSnapshot() !== navigation
      ) {
        if (alive.current) setProviderRouteError('STALE_TARGET')
        return
      }
      await runtime.commands.execute('app.openSettings', { scope: 'global', section: 'providers' })
    })
      .catch((reason: unknown) => {
        if (alive.current) setProviderRouteError(code(reason))
      })
      .finally(() => {
        if (alive.current) setOpeningProviders(false)
      })
  }

  const submit = () => {
    if (!draft || !connected || submitting) return
    setSubmitting(true)
    void queue(async () => {
      const current = runtime.state.preSessionDrafts.getSnapshot()[draftId]
      if (!current) return
      await runtime.commands.execute('preSessionDraft.submit', { draftId, expectedRevision: current.revision })
    })
      .catch(() => undefined)
      .finally(() => {
        if (alive.current) setSubmitting(false)
      })
  }

  const reconcile = () => {
    if (reconciling) return
    setReconciling(true)
    void runtime.commands
      .execute('preSessionDraft.reconcile', { draftId })
      .catch(() => undefined)
      .finally(() => {
        if (alive.current) setReconciling(false)
      })
  }

  const busy =
    submitting || reconciling || ['preparing', 'creating', 'configuring', 'submitting'].includes(draft?.phase ?? '')
  const workspaceChoices = Object.values(directory.workspaces).map((workspace) => ({
    id: workspace.id,
    label: workspaceDisplayName(workspace, displayNames),
    detail: workspace.path,
  }))
  const modelChoices = models.map((model) => ({
    id: model.id,
    label: labels.modelName(model.providerName, model.modelName),
    detail: shell.session.modelPicker.capability(model),
  }))
  const modelLabels = modelError ? { ...labels.model, empty: labels.modelReadFailed } : labels.model
  const workspaceControl = (
    <HbarPreSessionChoicePicker
      icon={Folder}
      labels={labels.workspace}
      items={workspaceChoices}
      selectedId={draft?.workspaceId ?? null}
      disabled={!connected || busy || draft?.phase === 'unknown'}
      loading={loadingWorkspaces}
      hasMore={workspaceCursor !== null}
      onMore={loadMoreWorkspaces}
      onChoose={chooseWorkspace}
      extra={(closePicker) => (
        <LumenFrame className="hbar-web-pre-session-path">
          <label htmlFor="hbar-pre-session-path">{labels.path}</label>
          <LumenInput
            id="hbar-pre-session-path"
            variant="boxed"
            value={path}
            placeholder={labels.pathHint}
            disabled={!connected || busy || openingPath}
            onChange={(event) => setPath(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
              event.preventDefault()
              event.stopPropagation()
              openWorkspace(closePicker)
            }}
          />
          <LumenButton
            type="button"
            size="s"
            indicator="none"
            disabled={!connected || busy || openingPath || !path.trim()}
            onClick={() => openWorkspace(closePicker)}
          >
            {openingPath ? labels.openingWorkspace : labels.addWorkspace}
          </LumenButton>
          {pathError && (
            <LumenText as="p" role="alert">
              {labels.error(pathError)}
            </LumenText>
          )}
        </LumenFrame>
      )}
    />
  )
  const modelControl = (
    <HbarPreSessionChoicePicker
      icon={Sparkles}
      placement="composer"
      labels={modelLabels}
      items={modelChoices}
      selectedId={draft?.modelId ?? null}
      disabled={!connected || busy || draft?.phase === 'unknown'}
      loading={modelsLoading}
      extra={(closePicker) =>
        modelsLoading ? (
          <LumenText as="p" role="status">
            {labels.checkingModels}
          </LumenText>
        ) : modelError ? (
          <LumenFrame className="hbar-web-pre-session-model-actions">
            <LumenButton type="button" size="s" disabled={!connected} onClick={retryModels}>
              {labels.retryModels}
            </LumenButton>
          </LumenFrame>
        ) : models.length === 0 ? (
          <LumenFrame className="hbar-web-pre-session-model-actions">
            <LumenButton
              type="button"
              size="s"
              disabled={!connected || openingProviders}
              onClick={() => openProviderSettings(closePicker)}
            >
              {labels.configureProviders}
            </LumenButton>
          </LumenFrame>
        ) : null
      }
      onMore={() => undefined}
      onChoose={chooseModel}
    />
  )
  const approvalControl = (
    <HbarPreSessionApprovalPicker
      choice={draft?.approvalChoice ?? 'inherit'}
      planMode={draft?.planMode ?? 'default'}
      planAvailable={composerPlanMode.available}
      {...(draft?.intent === 'goal' ? { planBlockedReason: labels.planGoalConflict } : {})}
      hostDefault={composerPermission.hostDefault.status === 'ready' ? composerPermission.hostDefault.mode : null}
      sessionLabel={shell.preSession.hero.title}
      labels={shell.session.permissionPicker}
      disabled={!connected || !draft || busy || draft.phase === 'unknown'}
      onChoose={chooseApproval}
      onPlanMode={choosePlanMode}
    />
  )
  const goalControl = (
    <LumenFrame className="hbar-web-pre-session-goal-controls">
      <HbarComposerAddMenu
        labels={shell.session.addMenu}
        canAddFiles={false}
        canOpenSlash={false}
        showSlash={false}
        onOpenSlash={() => undefined}
        goalAction={{
          label: shell.session.intent.goalMenu,
          disabled:
            !connected ||
            !draft ||
            busy ||
            draft.phase === 'unknown' ||
            draft.intent === 'goal' ||
            draft.planMode === 'plan',
          ...(draft?.planMode === 'plan'
            ? { disabledHint: labels.goalPlanConflict }
            : draft?.intent === 'goal'
              ? { disabledHint: labels.goalAlreadyPrepared }
              : {}),
          onChoose: () => chooseGoalIntent('goal'),
        }}
      />
    </LumenFrame>
  )
  const preparedGoal =
    draft?.intent === 'goal' ? (
      <LumenButton
        type="button"
        size="s"
        variant="text"
        indicator="none"
        className="hbar-web-pre-session-goal-chip"
        aria-label={shell.session.intent.cancelGoal}
        aria-pressed="true"
        title={shell.session.intent.goalPreparedHint}
        disabled={!connected || busy || draft.phase === 'unknown'}
        onClick={() => chooseGoalIntent('default')}
      >
        <LumenIcon icon={Target} tier="sm" />
        <LumenText as="span">{shell.session.intent.goalPrepared}</LumenText>
        <LumenIcon icon={X} tier="sm" />
      </LumenButton>
    ) : null
  const modelGuidance =
    !modelsLoading && (modelError || models.length === 0 || providerRouteError) ? (
      <LumenFrame className="hbar-web-pre-session-model-guidance">
        <LumenText as="p" role={modelError || providerRouteError ? 'alert' : undefined}>
          {providerRouteError ? labels.modelActionFailed : modelError ? labels.modelReadFailed : labels.model.empty}
        </LumenText>
        {modelError ? (
          <LumenButton type="button" size="s" disabled={!connected} onClick={retryModels}>
            {labels.retryModels}
          </LumenButton>
        ) : models.length === 0 ? (
          <LumenButton
            type="button"
            size="s"
            disabled={!connected || openingProviders}
            onClick={() => openProviderSettings()}
          >
            {labels.configureProviders}
          </LumenButton>
        ) : null}
      </LumenFrame>
    ) : null
  const editorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>, onSubmit: () => void) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.shiftKey) return
    if (sendBehavior === null) return
    const modifier = event.ctrlKey || event.metaKey
    if ((sendBehavior === 'enter' && !modifier) || (sendBehavior === 'modifierEnter' && modifier)) {
      event.preventDefault()
      onSubmit()
    }
  }
  return (
    <HbarPreSessionLanding
      labels={
        draft?.intent === 'goal'
          ? {
              ...shell.preSession,
              prompt: { ...shell.preSession.prompt, placeholder: shell.session.intent.goalPlaceholder },
            }
          : draft?.planMode === 'plan'
            ? {
                ...shell.preSession,
                prompt: { ...shell.preSession.prompt, placeholder: shell.session.intent.planPlaceholder },
              }
            : shell.preSession
      }
      composer={{
        value: text,
        attachments: [],
        disabled: !connected || !draft,
        submitting: busy,
        uploading: false,
        canSubmit: Boolean(
          draft?.workspaceId &&
          text.trim() &&
          !busy &&
          draft.phase !== 'unknown' &&
          !modelsLoading &&
          !modelError &&
          models.length > 0,
        ),
        error: goalError
          ? labels.goalError(goalError)
          : openError
            ? labels.error(openError)
            : draft?.phase !== 'unknown' && draft?.error
              ? labels.error(draft.error)
              : undefined,
        context:
          preparedGoal || modelGuidance || draft?.phase === 'unknown' ? (
            <>
              {preparedGoal}
              {modelGuidance}
              {draft?.phase === 'unknown' && (
                <LumenFrame className="hbar-web-pre-session-recovery">
                  <LumenText as="p" role="alert">
                    {labels.error(draft.error ?? 'RESULT_UNKNOWN')}
                  </LumenText>
                  <LumenButton type="button" size="s" disabled={!connected || reconciling} onClick={reconcile}>
                    {labels.checking}
                  </LumenButton>
                </LumenFrame>
              )}
            </>
          ) : undefined,
        controls: (
          <LumenFrame className="hbar-web-pre-session-controls">
            {goalControl}
            {workspaceControl}
            {approvalControl}
          </LumenFrame>
        ),
        modelPicker: modelControl,
        editor: ({ inputLabel, placeholder, disabled, onSubmit }) => (
          <LumenTextarea
            ref={editor}
            variant="plain"
            aria-label={inputLabel}
            placeholder={placeholder}
            rows={3}
            disabled={disabled}
            value={text}
            onChange={(event) => writeText(event.currentTarget.value)}
            onKeyDown={(event) => editorKeyDown(event, onSubmit)}
          />
        ),
        onChange: writeText,
        onRemoveAttachment: () => undefined,
        onSubmit: submit,
      }}
    />
  )
}

function code(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}
