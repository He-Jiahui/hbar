import { useEffect, useRef, useState } from 'react'
import { FolderOpen, Target, X } from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenInput, LumenContentText } from '@lumen/app-ui'
import {
  HbarComposerAddMenu,
  HbarComposerAttachmentTransfers,
  HbarSessionImageLayer,
  HbarPreSessionDraftImageAttachments,
  HbarPreSessionApprovalPicker,
  HbarPreSessionChoicePicker,
  HbarPreSessionLanding,
  HbarPreSessionSlashEditor,
  HbarPreSessionThinkingPicker,
  HbarPreSessionLocationPicker,
  HbarPreSessionLaunchStatus,
  addComposerAttachments,
  firstSendIsLocked,
  localGoalSlash,
  localSlashCommand,
  composerAgentSlashLabels,
  useHbarRuntime,
  useHbarRuntimeState,
  type HbarSessionAttachmentSelection,
  type HbarSessionImagesOptions,
  type PreSessionLocalSlashCommand,
} from '@hbar/app-react'
import {
  workspaceDisplayName,
  preSessionModelSelection,
  type ComposerPermissionChoice,
  type ComposerPlanMode,
} from '@hbar/app-runtime'
import { workspacePageSchema } from '@hbar/contracts/directory'
import type { ThinkingLevel } from '@hbar/contracts'
import type { SessionLaunchSelection } from '@hbar/contracts/commands/session-launch-target'
import { getShellCopy, type ShellLocale } from './shell-copy'
import { preSessionCopy } from './pre-session-copy'
import { preSessionLaunchCopy } from './pre-session-launch-copy'
import { composerAttachmentCopy } from './composer-attachment-copy'
import './PreSessionLanding.css'

export function WebPreSessionLanding({
  draftId,
  locale,
  connected,
  sendBehavior,
  modelMenuPresentation = 'web',
  prepareAttachment,
  images,
}: {
  readonly draftId: string
  readonly locale: ShellLocale
  readonly connected: boolean
  readonly sendBehavior: 'enter' | 'modifierEnter' | null
  readonly modelMenuPresentation?: 'native' | 'web'
  readonly prepareAttachment?: ((file: File) => Promise<HbarSessionAttachmentSelection>) | undefined
  readonly images?: HbarSessionImagesOptions | undefined
}) {
  const runtime = useHbarRuntime()
  const directory = useHbarRuntimeState(runtime.state.directory)
  const displayNames = useHbarRuntimeState(runtime.state.workspaceDisplayNameSnapshot)
  const preSessionDrafts = useHbarRuntimeState(runtime.state.preSessionDrafts)
  const launchBranches = useHbarRuntimeState(runtime.state.preSessionLaunchBranches)
  const launchBranchCreation = useHbarRuntimeState(runtime.state.preSessionLaunchBranchCreation)
  const composerPermission = useHbarRuntimeState(runtime.state.composerPermission)
  const composerPlanMode = useHbarRuntimeState(runtime.state.composerPlanMode)
  const modelCatalog = useHbarRuntimeState(runtime.state.preSessionModelCatalog)
  const agentComposer = useHbarRuntimeState(runtime.state.agentComposer)
  const draft = preSessionDrafts[draftId]
  const modelSelection = preSessionModelSelection(modelCatalog, draft)
  const shell = getShellCopy(locale)
  const labels = preSessionCopy(locale)
  const launchLabels = preSessionLaunchCopy(locale)
  const attachmentLabels = composerAttachmentCopy((chinese, english) => (locale === 'zh-CN' ? chinese : english))
  const [text, setText] = useState('')
  const [path, setPath] = useState('')
  const [pathError, setPathError] = useState<string | null>(null)
  const [openingPath, setOpeningPath] = useState(false)
  const [defaultModelError, setDefaultModelError] = useState<string | null>(null)
  const models = modelCatalog.models
  const modelError = defaultModelError ?? modelCatalog.error
  const modelsLoading = modelCatalog.status === 'idle' || modelCatalog.status === 'loading'
  const [modelRefresh, setModelRefresh] = useState(0)
  const [openingProviders, setOpeningProviders] = useState(false)
  const [providerRouteError, setProviderRouteError] = useState<string | null>(null)
  const [slashRouteError, setSlashRouteError] = useState<string | null>(null)
  const [slashOpenRequest, setSlashOpenRequest] = useState(0)
  const [modelOpenRequest, setModelOpenRequest] = useState(0)
  const [workspaceCursor, setWorkspaceCursor] = useState<string | null>(null)
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)
  const [goalError, setGoalError] = useState<string | null>(null)
  const [attachmentActionError, setAttachmentActionError] = useState<string | null>(null)
  const [locationOpen, setLocationOpen] = useState(false)
  const [branchSearch, setBranchSearch] = useState('')
  const [locationRefresh, setLocationRefresh] = useState(0)
  const openPromise = useRef<Promise<unknown> | null>(null)
  const writes = useRef<Promise<unknown>>(Promise.resolve())
  const alive = useRef(true)
  const initialized = useRef(false)
  const mountLease = useRef(0)
  const editor = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!connected) return
    void runtime.commands.execute('agentComposer.refreshProfiles', {}).catch(() => {
      // The shared catalog retains a failure; Send can retry with nearby draft feedback.
    })
  }, [connected, runtime.commands])

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
        const firstSend = runtime.state.preSessionDrafts.getSnapshot()[draftId]
        if (firstSend?.sessionId && firstSend.phase !== 'accepted') return
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
    return runtime.preSessionModelCatalog.retain()
  }, [connected, runtime])

  useEffect(() => {
    if (!connected || !composerPermission.available || composerPermission.hostDefault.status !== 'idle') return
    void runtime.commands.execute('composerPermission.refresh', {}).catch(() => undefined)
  }, [connected, composerPermission.available, composerPermission.hostDefault.status, runtime])

  const defaultModelWorkspaceId = draft?.workspaceId
  const resolveDefaultModel = Boolean(draft && !draft.modelId && !draft.sessionId && draft.phase === 'idle')
  useEffect(() => {
    if (!connected || !resolveDefaultModel) return
    const current = runtime.state.preSessionDrafts.getSnapshot()[draftId]
    if (!current) return
    const controller = new AbortController()
    void runtime.commands
      .execute(
        'preSessionDraft.resolveDefaultModel',
        { draftId, expectedRevision: current.revision },
        { signal: controller.signal },
      )
      .catch((reason: unknown) => {
        if (controller.signal.aborted || code(reason) === 'VERSION_CONFLICT') return
        setDefaultModelError(code(reason))
      })
    return () => controller.abort()
  }, [connected, defaultModelWorkspaceId, draftId, modelRefresh, resolveDefaultModel, runtime])

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

  useEffect(() => {
    if (!connected || !locationOpen || !draft?.workspaceId) return
    const workspaceId = draft.workspaceId
    const timeout = setTimeout(
      () => {
        void runtime.commands
          .execute('preSessionLaunchBranches.load', { workspaceId, search: branchSearch })
          .catch(() => undefined)
      },
      branchSearch ? 150 : 0,
    )
    return () => clearTimeout(timeout)
  }, [branchSearch, connected, draft?.workspaceId, locationOpen, locationRefresh, runtime])

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
    setSlashRouteError(null)
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

  const chooseLaunchSelection = (selection: SessionLaunchSelection) =>
    queue(async () => {
      const current = runtime.state.preSessionDrafts.getSnapshot()[draftId]
      if (!current) throw new Error('Draft is unavailable')
      await runtime.commands.execute('preSessionDraft.setLaunchSelection', {
        draftId,
        selection,
        expectedRevision: current.revision,
      })
    })

  const chooseThinkingLevel = async (thinkingLevel: ThinkingLevel, expectedModelId: string) => {
    await queue(async () => {
      const current = runtime.state.preSessionDrafts.getSnapshot()[draftId]
      if (!current) throw new Error('Draft is unavailable')
      await runtime.commands.execute('preSessionDraft.setThinkingLevel', {
        draftId,
        thinkingLevel,
        expectedModelId,
        expectedRevision: current.revision,
      })
    })
  }

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

  const chooseGoalIntent = (intent: 'default' | 'goal', nextText?: string) => {
    setGoalError(null)
    void queue(async () => {
      const current = runtime.state.preSessionDrafts.getSnapshot()[draftId]
      if (!current) throw new Error('Draft is unavailable')
      await runtime.commands.execute('preSessionDraft.setEntryMode', {
        draftId,
        mode: intent,
        expectedRevision: current.revision,
        ...(nextText !== undefined ? { text: nextText } : {}),
      })
    })
      .then(() => {
        if (alive.current) {
          if (nextText !== undefined) setText(nextText)
          editor.current?.focus()
        }
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
    setDefaultModelError(null)
    runtime.preSessionModelCatalog.refresh()
    setModelRefresh((current) => current + 1)
  }

  const openSettings = (section: 'providers' | null, closePicker?: () => void) => {
    if (!connected || openingProviders) return
    const presentation = runtime.state.presentation.getSnapshot()
    const navigation = runtime.state.navigation.getSnapshot()
    if (presentation.page.kind !== 'session' || navigation.sessionId !== null) return
    closePicker?.()
    if (section === 'providers') setProviderRouteError(null)
    else setSlashRouteError(null)
    setOpeningProviders(true)
    void queue(async () => {
      if (
        runtime.state.presentation.getSnapshot() !== presentation ||
        runtime.state.navigation.getSnapshot() !== navigation
      ) {
        if (alive.current) {
          if (section === 'providers') setProviderRouteError('STALE_TARGET')
          else setSlashRouteError('STALE_TARGET')
        }
        return
      }
      await runtime.commands.execute('app.openSettings', {
        scope: 'global',
        ...(section ? { section } : {}),
      })
    })
      .catch((reason: unknown) => {
        if (alive.current) {
          if (section === 'providers') setProviderRouteError(code(reason))
          else setSlashRouteError(code(reason))
        }
      })
      .finally(() => {
        if (alive.current) setOpeningProviders(false)
      })
  }
  const openProviderSettings = (closePicker?: () => void) => openSettings('providers', closePicker)

  const executeLocalSlash = (command: PreSessionLocalSlashCommand) => {
    if (
      !connected ||
      !draft ||
      openingProviders ||
      submitting ||
      ['preparing', 'creating', 'configuring', 'submitting', 'unknown'].includes(draft.phase)
    )
      return
    if (draft.attachments.length > 0 || draft.attachmentTransfers.length > 0) {
      setSlashRouteError('ATTACHMENTS')
      return
    }
    if (localSlashCommand(text, ['model', 'settings', 'goal']) !== command) return
    if (command === 'goal') {
      const action = localGoalSlash(text)
      if (text.trim() === '/goal') chooseGoalIntent('goal', '')
      else if (action?.action === 'set') chooseGoalIntent('goal', action.objective)
      else if (action?.action === 'clear') chooseGoalIntent('default', '')
      else setGoalError('GOAL_REQUIRED')
      return
    }
    writeText('')
    if (command === 'model') setModelOpenRequest((request) => request + 1)
    else openSettings(null)
  }

  const submit = () => {
    if (!draft || !connected || submitting) return
    const localCommand = localSlashCommand(text, ['model', 'settings', 'goal'])
    if (localCommand === 'model' || localCommand === 'settings' || localCommand === 'goal') {
      executeLocalSlash(localCommand)
      return
    }
    if (
      localSlashCommand(
        text,
        shell.session.slash.commands.map((item) => item.id),
      )
    )
      return
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

  const busy = submitting || firstSendIsLocked(draft)
  const agentPreflightFailed =
    draft?.phase === 'failed' && !draft.sessionId && Boolean(draft.error?.startsWith('AGENT_'))
  const attachmentTransfers = draft?.attachmentTransfers ?? []
  const attachmentIntakeEnabled = Boolean(
    connected &&
    draft &&
    prepareAttachment &&
    !busy &&
    draft.phase !== 'unknown' &&
    !attachmentTransfers.some((item) => item.status === 'unknown' || item.status === 'reconciling') &&
    draft.attachments.length + attachmentTransfers.length < 12,
  )
  const addAttachments = (files: readonly File[]) => {
    if (!draft || !prepareAttachment || !attachmentIntakeEnabled) return
    void addComposerAttachments(runtime, { draftId, revision: draft.revision }, files, prepareAttachment, {
      // Only reservation joins the text-write queue; file preparation and upload stay independent.
      reserve: (operation) => queue(operation),
      currentRevision: () => runtime.state.preSessionDrafts.getSnapshot()[draftId]?.revision ?? draft.revision,
    }).catch(() => undefined)
  }
  const runAttachmentCommand = (operation: () => Promise<unknown>) => {
    setAttachmentActionError(null)
    void operation().catch((reason: unknown) => setAttachmentActionError(code(reason)))
  }
  const localSlash = localSlashCommand(text, ['model', 'settings', 'goal'])
  const unsupportedSlash =
    !localSlash &&
    localSlashCommand(
      text,
      shell.session.slash.commands.map((item) => item.id),
    )
  const slashLabels = composerAgentSlashLabels(
    {
      ...shell.session.slash,
      commands: shell.session.slash.commands
        .filter((item) => item.id === 'model' || item.id === 'settings' || item.id === 'goal' || item.id === 'agent')
        .map((item) => ({
          ...item,
          description:
            item.id === 'model'
              ? labels.slashModelDescription
              : item.id === 'goal'
                ? labels.slashGoalDescription
                : item.id === 'settings'
                  ? labels.slashSettingsDescription
                  : item.description,
        })),
    },
    agentComposer.profileCatalog,
  )
  const workspaceChoices = Object.values(directory.workspaces).map((workspace) => ({
    id: workspace.id,
    label: workspaceDisplayName(workspace, displayNames),
    detail: workspace.path,
  }))
  const modelChoices = models.map((model) => ({
    id: model.id,
    label: model.modelName,
    detail: shell.session.modelPicker.capability(model),
    searchText: model.modelId,
    group: { id: model.providerId, label: model.providerName },
  }))
  const modelLabels = modelError ? { ...labels.model, empty: labels.modelReadFailed } : labels.model
  const workspaceControl = (
    <HbarPreSessionLocationPicker
      labels={launchLabels.location}
      directories={workspaceChoices}
      workspaceId={draft?.workspaceId ?? null}
      selection={draft?.launchSelection ?? { mode: 'shared-current' }}
      page={launchBranches.workspaceId === draft?.workspaceId ? launchBranches.page : null}
      draftRevision={draft?.revision ?? null}
      branchCreation={launchBranchCreation.entries[draftId] ?? null}
      branchCreationAvailable={connected}
      error={launchBranches.workspaceId === draft?.workspaceId ? launchBranches.error : null}
      disabled={!connected || busy || draft?.phase === 'unknown'}
      loading={
        loadingWorkspaces || (launchBranches.workspaceId === draft?.workspaceId && launchBranches.status === 'loading')
      }
      hasMoreDirectories={workspaceCursor !== null}
      onMoreDirectories={loadMoreWorkspaces}
      onWorkspace={chooseWorkspace}
      onSelection={chooseLaunchSelection}
      onOpen={() => {
        setLocationOpen(true)
        setBranchSearch('')
        setLocationRefresh((current) => current + 1)
      }}
      onClose={() => setLocationOpen(false)}
      onSearch={setBranchSearch}
      onMoreBranches={() => {
        if (draft?.workspaceId && launchBranches.page?.nextCursor)
          void runtime.commands
            .execute('preSessionLaunchBranches.load', {
              workspaceId: draft.workspaceId,
              search: branchSearch,
              cursor: launchBranches.page.nextCursor,
            })
            .catch(() => undefined)
      }}
      onCaptureBranchBase={(expectedRevision) =>
        runtime.commands.execute('preSessionLaunchBranchCreation.capture', { draftId, expectedRevision })
      }
      onCreateBranch={(name, expectedRevision) =>
        runtime.commands.execute('preSessionLaunchBranchCreation.create', { draftId, expectedRevision, name })
      }
      onReconcileBranch={(expectedRevision) =>
        runtime.commands.execute('preSessionLaunchBranchCreation.reconcile', { draftId, expectedRevision })
      }
      onAdoptBranch={(expectedRevision) =>
        runtime.commands.execute('preSessionLaunchBranchCreation.adopt', { draftId, expectedRevision })
      }
      onCancelBranchCreate={() => runtime.commands.execute('preSessionLaunchBranchCreation.cancel', { draftId })}
      directoryExtra={(closePicker) => (
        <LumenFrame className="hbar-web-pre-session-path">
          <LumenFrame as="label" htmlFor="hbar-pre-session-path">
            {labels.path}
          </LumenFrame>
          <LumenFrame className="hbar-workspace-folder-entry-row">
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
              variant="outlined"
              indicator="none"
              disabled={!connected || busy || openingPath}
              onClick={() => {
                closePicker()
                const targetPath =
                  path.trim() || (draft?.workspaceId ? directory.workspaces[draft.workspaceId]?.path : undefined)
                void runtime.commands
                  .execute('workspaceFolders.open', {
                    ...(targetPath ? { path: targetPath } : {}),
                    draftId,
                    browse: true,
                    draftRevision: runtime.state.preSessionDrafts.getSnapshot()[draftId]?.revision ?? 0,
                  })
                  .catch((reason: unknown) => {
                    if (alive.current) setPathError(code(reason))
                  })
              }}
            >
              <LumenIcon icon={FolderOpen} tier="sm" />
              {shell.shell.workspaceFolders.browse}
            </LumenButton>
          </LumenFrame>
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
            <LumenContentText context="feedback.paragraph" role="alert">
              {labels.error(pathError)}
            </LumenContentText>
          )}
        </LumenFrame>
      )}
    />
  )
  const modelControl = (
    <HbarPreSessionChoicePicker
      placement="composer"
      menuPresentation={modelMenuPresentation}
      openRequest={modelOpenRequest}
      labels={modelLabels}
      items={modelChoices}
      selectedId={draft?.modelId ?? null}
      unavailableLabel={
        modelSelection.unavailable === 'model' ? shell.session.modelPicker.unavailableTrigger : undefined
      }
      disabled={!connected || busy || draft?.phase === 'unknown'}
      loading={modelsLoading}
      extra={(closePicker) =>
        modelsLoading ? (
          <LumenContentText context="feedback.paragraph" role="status">
            {labels.checkingModels}
          </LumenContentText>
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
  const selectedModel = modelSelection.model
  const modelControls = (
    <LumenFrame className="hbar-web-pre-session-model-controls">
      {modelControl}
      <HbarPreSessionThinkingPicker
        model={selectedModel}
        level={draft?.thinkingLevel ?? null}
        labels={shell.session.modelPicker}
        disabled={!connected || !draft || busy || draft.phase === 'unknown'}
        onChoose={chooseThinkingLevel}
      />
    </LumenFrame>
  )
  const approvalControl = (
    <HbarPreSessionApprovalPicker
      choice={draft?.approvalChoice ?? 'inherit'}
      planMode={draft?.planMode ?? 'default'}
      planAvailable={composerPlanMode.available}
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
        labels={{ ...shell.session.addMenu, slashUnavailable: labels.slashUnavailable }}
        canAddFiles={attachmentIntakeEnabled}
        onFiles={prepareAttachment ? addAttachments : undefined}
        canOpenSlash={connected && Boolean(draft) && !busy && draft?.phase !== 'unknown'}
        onOpenSlash={() => setSlashOpenRequest((request) => request + 1)}
        goalAction={{
          label: shell.session.intent.goalMenu,
          disabled: !connected || !draft || busy || draft.phase === 'unknown' || draft.intent === 'goal',
          ...(draft?.intent === 'goal' ? { disabledHint: labels.goalAlreadyPrepared } : {}),
          onChoose: () => chooseGoalIntent('goal'),
        }}
      />
    </LumenFrame>
  )
  const preparedGoalObjective = draft?.intent === 'goal' && text.trim() ? text : ''
  const preparedGoalTitle = preparedGoalObjective || shell.session.intent.goalPreparedHint
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
        title={preparedGoalTitle}
        disabled={!connected || busy || draft.phase === 'unknown'}
        onClick={() => chooseGoalIntent('default')}
      >
        <LumenIcon icon={Target} tier="sm" />
        <LumenContentText context="control.label">{shell.session.intent.goalPrepared}</LumenContentText>
        <LumenIcon icon={X} tier="sm" />
      </LumenButton>
    ) : null
  const modelGuidance =
    !modelsLoading && (modelError || models.length === 0 || providerRouteError || modelSelection.unavailable) ? (
      <LumenFrame className="hbar-web-pre-session-model-guidance">
        <LumenContentText
          context="feedback.paragraph"
          role={modelError || providerRouteError || modelSelection.unavailable ? 'alert' : undefined}
        >
          {providerRouteError
            ? labels.modelActionFailed
            : modelError
              ? labels.modelReadFailed
              : modelSelection.unavailable === 'model'
                ? labels.selectedModelUnavailable
                : modelSelection.unavailable === 'thinking'
                  ? labels.selectedThinkingUnavailable
                  : labels.model.empty}
        </LumenContentText>
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
  return (
    <HbarSessionImageLayer options={images} preSessionDraftId={draftId}>
      <HbarPreSessionLanding
        attachmentDrop={{ enabled: attachmentIntakeEnabled, label: attachmentLabels.drop, onAdd: addAttachments }}
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
          attachments: (draft?.attachments ?? []).map((attachment) => ({
            id: attachment.artifact.id,
            kind: attachment.kind,
            name: attachment.artifact.name,
          })),
          attachmentContent:
            images && draft?.attachments.length ? (
              <HbarPreSessionDraftImageAttachments
                draft={draft}
                removeLabel={shell.preSession.prompt.removeAttachment}
                removeDisabled={!connected || busy || draft.phase === 'unknown'}
                onRemove={(artifactId, kind) =>
                  runAttachmentCommand(() =>
                    runtime.commands.execute('preSessionDraft.removeAttachment', {
                      draftId,
                      kind,
                      artifactId,
                      expectedRevision: runtime.state.preSessionDrafts.getSnapshot()[draftId]?.revision ?? 0,
                    }),
                  )
                }
              />
            ) : undefined,
          disabled: !connected || !draft,
          submitting: busy,
          uploading: (draft?.uploading ?? 0) > 0,
          canSubmit:
            Boolean(
              !busy &&
              attachmentTransfers.length === 0 &&
              draft?.phase !== 'unknown' &&
              (localSlash
                ? draft?.attachments.length === 0 && (draft?.intent !== 'goal' || Boolean(text.trim()))
                : draft?.workspaceId &&
                  !modelsLoading &&
                  !modelError &&
                  !modelSelection.unavailable &&
                  models.length > 0 &&
                  (text.trim() || (draft?.intent !== 'goal' && Boolean(draft?.attachments.length)))),
            ) && !unsupportedSlash,
          error: attachmentActionError
            ? attachmentLabels.error(attachmentActionError)
            : draft?.uploadError && !attachmentTransfers.some((item) => item.error === draft.uploadError)
              ? attachmentLabels.error(draft.uploadError)
              : slashRouteError
                ? slashRouteError === 'ATTACHMENTS'
                  ? shell.session.slash.error('ATTACHMENTS')
                  : labels.slashActionFailed
                : goalError
                  ? labels.goalError(goalError)
                  : openError
                    ? labels.error(openError)
                    : draft?.phase !== 'unknown' && draft?.error
                      ? labels.error(draft.error)
                      : undefined,
          context:
            preparedGoal ||
            modelGuidance ||
            unsupportedSlash ||
            attachmentTransfers.length > 0 ||
            (draft && draft.phase !== 'idle') ? (
              <>
                <HbarComposerAttachmentTransfers
                  transfers={attachmentTransfers}
                  labels={attachmentLabels}
                  connected={connected}
                  onRemove={(item) =>
                    runAttachmentCommand(() =>
                      runtime.commands.execute('preSessionDraft.removeAttachmentTransfer', {
                        draftId,
                        reservationId: item.id,
                        ownerRevision: item.ownerRevision,
                      }),
                    )
                  }
                  onReconcile={(item) =>
                    runAttachmentCommand(() =>
                      runtime.commands.execute('preSessionDraft.reconcileAttachment', {
                        draftId,
                        reservationId: item.id,
                        ownerRevision: item.ownerRevision,
                      }),
                    )
                  }
                  onAccept={(item) =>
                    runAttachmentCommand(() =>
                      runtime.commands.execute('preSessionDraft.acceptReadyAttachment', {
                        draftId,
                        reservationId: item.id,
                        ownerRevision: item.ownerRevision,
                        expectedRevision: runtime.state.preSessionDrafts.getSnapshot()[draftId]?.revision ?? 0,
                      }),
                    )
                  }
                />
                {draft && !agentPreflightFailed && (
                  <HbarPreSessionLaunchStatus draft={draft} labels={launchLabels.status} connected={connected} />
                )}
                {preparedGoal}
                {modelGuidance}
                {unsupportedSlash && (
                  <LumenContentText context="feedback.paragraph" role="status">
                    {labels.slashRequiresSession}
                  </LumenContentText>
                )}
              </>
            ) : undefined,
          controls: (
            <LumenFrame className="hbar-web-pre-session-controls">
              {goalControl}
              {approvalControl}
              {workspaceControl}
            </LumenFrame>
          ),
          modelPicker: modelControls,
          editor: ({ inputLabel, placeholder, disabled, onSubmit }) => (
            <HbarPreSessionSlashEditor
              editorRef={editor}
              value={text}
              inputLabel={inputLabel}
              placeholder={placeholder}
              disabled={disabled || busy || draft?.phase === 'unknown'}
              sendBehavior={sendBehavior}
              labels={slashLabels}
              slashOpenRequest={slashOpenRequest}
              onChange={writeText}
              onSubmit={onSubmit}
              onLocalCommand={executeLocalSlash}
            />
          ),
          onChange: writeText,
          onRemoveAttachment: (artifactId, kind) =>
            runAttachmentCommand(() =>
              runtime.commands.execute('preSessionDraft.removeAttachment', {
                draftId,
                kind,
                artifactId,
                expectedRevision: runtime.state.preSessionDrafts.getSnapshot()[draftId]?.revision ?? 0,
              }),
            ),
          onSubmit: submit,
        }}
      />
    </HbarSessionImageLayer>
  )
}

function code(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}
