import { useCallback, useEffect } from 'react'
import {
  HbarAppUiButton,
  HbarAppUiFileDocument,
  HbarAppUiSurface,
  HbarAppUiWorkspaceFiles,
  type HbarAppUiWorkspaceFileLabels,
} from 'hbar-app-ui'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import './file-workspace.css'

export interface HbarFileWorkspaceLabels extends HbarAppUiWorkspaceFileLabels {
  readonly close: string
  readonly loadMore: string
  readonly save: string
  readonly saving: string
  readonly saved: string
  readonly reconcile: string
  readonly dirty: string
  readonly error: (code: string) => string
}

export function HbarFileWorkspace({
  labels,
  connected,
  instanceId: requestedInstanceId,
}: {
  readonly labels: HbarFileWorkspaceLabels
  readonly connected: boolean
  readonly instanceId?: string
}) {
  const runtime = useHbarRuntime()
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const files = useHbarRuntimeState(runtime.state.files)
  const instanceId = requestedInstanceId ?? presentation.toolInstanceId
  const panel = instanceId ? surfaces.panels[instanceId] : undefined
  const entry = instanceId ? files.entries[instanceId] : undefined
  const invoke = useCallback(
    (name: string, input: unknown) =>
      void (runtime.commands.execute as (command: string, value: unknown) => Promise<unknown>)(name, input).catch(
        () => {},
      ),
    [runtime.commands],
  )
  useEffect(() => {
    if (instanceId && panel?.panelId === 'files' && panel.workspaceId && entry?.workspaceId !== panel.workspaceId)
      invoke('fileWorkspace.refresh', { instanceId })
  }, [entry?.workspaceId, instanceId, invoke, panel?.panelId, panel?.workspaceId])
  if (!instanceId || panel?.panelId !== 'files') return null
  const parent = (path: string) => {
    const normalized = path.replaceAll('\\', '/').replace(/\/+$/, '')
    const index = normalized.lastIndexOf('/')
    return index <= 0 ? '.' : normalized.slice(0, index)
  }
  const document = entry?.document
  const busy = document?.status === 'submitting'
  const unknown = document?.status === 'unknown'
  const dirty = Boolean(document && document.draft !== document.baseline)
  return (
    <HbarAppUiSurface className="hbar-app-react-file-workspace">
      <header>
        <div>
          <h1>{labels.title}</h1>
          {entry && <p>{entry.path}</p>}
        </div>
        <HbarAppUiButton onClick={() => invoke('app.closePanel', { instanceId })}>{labels.close}</HbarAppUiButton>
      </header>
      <div className="hbar-app-react-file-layout">
        <div className="hbar-app-react-file-browser">
          <HbarAppUiWorkspaceFiles
            items={(entry?.items ?? []).map((item) => ({ id: item.path, name: item.name, directory: item.directory }))}
            path={entry?.path ?? '.'}
            loading={!entry || entry.status === 'loading'}
            error={entry?.error ? labels.error(entry.error) : undefined}
            labels={labels}
            onOpen={(path) => {
              const item = entry?.items.find((candidate) => candidate.path === path)
              if (item) invoke('fileWorkspace.openEntry', { instanceId, path, directory: item.directory })
            }}
            onParent={() =>
              invoke('fileWorkspace.openEntry', { instanceId, path: parent(entry?.path ?? '.'), directory: true })
            }
            onRefresh={() => invoke('fileWorkspace.refresh', { instanceId })}
          />
          {entry?.nextCursor && (
            <HbarAppUiButton
              disabled={entry.status === 'loading'}
              onClick={() => invoke('fileWorkspace.loadMore', { instanceId })}
            >
              {labels.loadMore}
            </HbarAppUiButton>
          )}
        </div>
        {document ? (
          <HbarAppUiFileDocument
            path={document.path}
            labels={labels}
            loading={document.status === 'loading'}
            error={document.error && document.status !== 'unknown' ? labels.error(document.error) : undefined}
            onRetry={() => invoke('fileWorkspace.openEntry', { instanceId, path: document.path, directory: false })}
          >
            <textarea
              aria-label={document.path}
              value={document.draft}
              disabled={!connected || unknown}
              onChange={(event) => invoke('fileWorkspace.setText', { instanceId, text: event.currentTarget.value })}
            />
            <footer>
              <span role="status">{dirty ? labels.dirty : document.status === 'succeeded' ? labels.saved : null}</span>
              {unknown ? (
                <HbarAppUiButton
                  disabled={!connected}
                  onClick={() => invoke('fileWorkspace.reconcile', { instanceId })}
                >
                  {labels.reconcile}
                </HbarAppUiButton>
              ) : (
                <HbarAppUiButton
                  disabled={!connected || !dirty || busy}
                  tone="accent"
                  onClick={() => invoke('fileWorkspace.save', { instanceId })}
                >
                  {busy ? labels.saving : labels.save}
                </HbarAppUiButton>
              )}
            </footer>
          </HbarAppUiFileDocument>
        ) : (
          <p className="hbar-app-react-file-empty">{labels.empty}</p>
        )}
      </div>
    </HbarAppUiSurface>
  )
}
