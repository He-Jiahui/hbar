import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Folder, Sparkles } from 'lucide-react'
import { LumenButton, LumenFrame, LumenInput, LumenText, LumenTextarea } from '@lumen/app-ui'
import { HbarPreSessionChoicePicker, HbarPreSessionLanding, useHbarRuntime, useHbarRuntimeState } from '@hbar/app-react'
import { workspaceDisplayName } from '@hbar/app-runtime'
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
  const draft = preSessionDrafts[draftId]
  const shell = getShellCopy(locale)
  const labels = preSessionCopy(locale)
  const [text, setText] = useState('')
  const [path, setPath] = useState('')
  const [pathError, setPathError] = useState<string | null>(null)
  const [openingPath, setOpeningPath] = useState(false)
  const [models, setModels] = useState<readonly ModelDescriptor[]>([])
  const [modelError, setModelError] = useState<string | null>(null)
  const [workspaceCursor, setWorkspaceCursor] = useState<string | null>(null)
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [reconciling, setReconciling] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)
  const openPromise = useRef<Promise<unknown> | null>(null)
  const writes = useRef<Promise<unknown>>(Promise.resolve())
  const alive = useRef(true)
  const initialized = useRef(false)
  const mountLease = useRef(0)

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
    void runtime.commands
      .execute('model.list', {})
      .then((value) => {
        if (!live) return
        setModels(modelCommands['model.list'].output.parse(value))
        setModelError(null)
      })
      .catch((reason: unknown) => {
        if (!live) return
        setModelError(code(reason))
      })
    return () => {
      live = false
    }
  }, [connected, runtime])

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
  const modelLabels = modelError ? { ...labels.model, empty: labels.error(modelError) } : labels.model
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
      labels={modelLabels}
      items={modelChoices}
      selectedId={draft?.modelId ?? null}
      disabled={!connected || busy || draft?.phase === 'unknown'}
      onMore={() => undefined}
      onChoose={chooseModel}
    />
  )
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
      labels={shell.preSession}
      composer={{
        value: text,
        attachments: [],
        disabled: !connected || !draft,
        submitting: busy,
        uploading: false,
        canSubmit: Boolean(draft?.workspaceId && text.trim() && !busy && draft.phase !== 'unknown'),
        error: openError
          ? labels.error(openError)
          : draft?.phase !== 'unknown' && draft?.error
            ? labels.error(draft.error)
            : undefined,
        context:
          draft?.phase === 'unknown' ? (
            <LumenFrame className="hbar-web-pre-session-recovery">
              <LumenText as="p" role="alert">
                {labels.error(draft.error ?? 'RESULT_UNKNOWN')}
              </LumenText>
              <LumenButton type="button" size="s" disabled={!connected || reconciling} onClick={reconcile}>
                {labels.checking}
              </LumenButton>
            </LumenFrame>
          ) : undefined,
        controls: workspaceControl,
        modelPicker: modelControl,
        editor: ({ inputLabel, placeholder, disabled, onSubmit }) => (
          <LumenTextarea
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
