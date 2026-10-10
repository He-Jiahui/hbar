import { StrictMode, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { createAppRuntime, type ComposerModelState, type QueuedUserRunsState } from '@hbar/app-runtime'
import { LumenButton, LumenFrame, LumenProvider, LumenText } from '@lumen/app-ui'
import { HbarRuntimeProvider } from '../../packages/app-react/src/runtime'
import { HbarPromptComposer } from '../../packages/app-react/src/prompt-composer'
import { HbarComposerFeedback, HbarComposerFeedbackProvider } from '../../packages/app-react/src/composer-feedback'
import { HbarComposerPermissionPicker } from '../../packages/app-react/src/composer-permission-picker'
import { HbarComposerModelPicker } from '../../packages/app-react/src/composer-model-picker'
import { HbarComposerMentionEditor } from '../../packages/app-react/src/composer-mention-editor'
import { HbarComposerBackgroundAgentFeedback } from '../../packages/app-react/src/composer-background-agents'
import { HbarComposerAttachmentTransfers } from '../../packages/app-react/src/composer-attachments'
import { HbarComposerWorkspaceContexts } from '../../packages/app-react/src/composer-workspace-contexts'
import { HbarQueuedUserRuns } from '../../packages/app-react/src/queued-user-runs'
import { getShellCopy, type ShellLocale } from '../../apps/web/src/shell-copy'
import { createWebLumenAppearance, DEFAULT_WEB_APPEARANCE_DIMENSIONS } from '../../apps/web/src/appearance'
import '@lumen/app-ui/styles.css'
import '../../packages/app-react/src/lumen-session-workspace.css'
import './composer-stability-browser.css'

interface FixtureInput {
  readonly phase: 'ready' | 'loading' | 'error' | 'unknown' | 'offline' | 'settled'
  readonly locale: ShellLocale
  readonly theme: 'light' | 'dark'
  readonly sessionId: string
  readonly long?: boolean
  readonly notices?: number
  readonly attachments?: number
  readonly queued?: number
}
declare global {
  interface Window {
    composerStability: { render(input: FixtureInput): void; actions(): readonly string[] }
  }
}
const container = document.getElementById('root')
if (!container) throw new Error('Composer stability fixture root missing')
const root = createRoot(container)
const actions: string[] = []
const runtime = createAppRuntime({
  instanceId: 'composer-stability',
  hostId: 'fixture',
  directory: { execute: async () => ({ items: [], nextCursor: null }) },
})
window.addEventListener('pagehide', () => runtime.dispose())
function Fixture({ input }: { readonly input: FixtureInput }) {
  const [text, setText] = useState('')
  const labels = getShellCopy(input.locale).session
  const connected = input.phase !== 'offline'
  const failure = input.phase === 'error' || input.phase === 'unknown'
  const message = input.long ? '临时提示需要保留原文和重试操作，不得改变输入区域尺寸。'.repeat(25) : 'DISCONNECTED'
  const recover = () => {
    actions.push(`retry:${input.sessionId}`)
  }
  const view = useMemo(() => {
    const model: ComposerModelState = {
      ...runtime.view.state.composerModel.getSnapshot(),
      sessionId: input.sessionId,
      status: input.phase === 'loading' ? 'loading' : input.phase === 'error' ? 'error' : 'ready',
      error: failure ? 'DISCONNECTED' : null,
    }
    return {
      ...runtime.view,
      state: { ...runtime.view.state, composerModel: { getSnapshot: () => model, subscribe: () => () => {} } },
    }
  }, [input.sessionId, input.phase, failure])
  const queue: QueuedUserRunsState = {
    sessionId: input.sessionId,
    status: input.phase === 'loading' ? 'loading' : failure ? 'error' : 'ready',
    error: failure ? 'DISCONNECTED' : null,
    totalQueued: input.queued ?? 0,
    pageIndex: 0,
    cursor: null,
    nextCursor: null,
    previousCursors: [],
    editing: null,
    removal: null,
    items: Array.from({ length: input.queued ?? 0 }, (_, index) => ({
      operationId: `queued-${index}`,
      revision: 0,
      textPreview: `已保存的排队消息 ${index + 1}`,
      attachmentCount: 0,
      truncated: false,
      createdAt: 1,
    })),
  }
  return (
    <LumenProvider appearance={createWebLumenAppearance(input.theme, DEFAULT_WEB_APPEARANCE_DIMENSIONS, false)}>
      <HbarRuntimeProvider view={view}>
        <LumenFrame as="main" className="composer-stability-fixture">
          <HbarComposerFeedbackProvider key={input.sessionId} labels={labels.composerFeedback}>
            <LumenFrame className="hbar-app-react-session-footer">
              <HbarPromptComposer
                value={text}
                onChange={setText}
                labels={labels.prompt}
                editor={({ inputLabel, placeholder, disabled }) => (
                  <HbarComposerMentionEditor
                    key={input.sessionId}
                    sessionId={input.sessionId}
                    workspaceId="fixture-workspace"
                    revision={0}
                    text={text}
                    mentions={[]}
                    disabled={disabled}
                    connected={connected}
                    inputLabel={inputLabel}
                    placeholder={placeholder}
                    labels={labels.mentions}
                    slashLabels={labels.slash}
                    sendBehavior="modifierEnter"
                    files={{ execute: async () => ({ items: [], nextCursor: null }) }}
                    onContent={async (next) => setText(next)}
                    onSubmit={() => actions.push(`send:${input.sessionId}`)}
                  />
                )}
                boundary="none"
                submitting={input.phase === 'loading'}
                uploading={false}
                canSubmit={connected}
                canStop={false}
                error={failure ? message : undefined}
                attachments={[]}
                onRemoveAttachment={() => {}}
                onSubmit={() => actions.push(`send:${input.sessionId}`)}
                onStop={() => {}}
                attachmentContent={
                  <HbarComposerWorkspaceContexts
                    contexts={[]}
                    attachments={[]}
                    labels={labels.workspaceContexts}
                    removeAttachmentLabel={(attachment) =>
                      labels.prompt.removeAttachment({
                        id: attachment.artifact.id,
                        name: attachment.artifact.name,
                        kind: attachment.kind,
                      })
                    }
                    removeDisabled={false}
                    error={failure ? message : undefined}
                    onRemove={() => {}}
                    onRemoveAttachment={() => {}}
                  />
                }
                context={
                  <>
                    <HbarComposerBackgroundAgentFeedback
                      kind={
                        input.phase === 'ready'
                          ? null
                          : input.phase === 'error' || input.phase === 'offline'
                            ? 'read-error'
                            : input.phase === 'loading'
                              ? 'checking'
                              : input.phase
                      }
                      error={message}
                      disabled={!connected}
                      labels={labels.backgroundAgents}
                      onReconcile={recover}
                      onRetry={recover}
                      onRefresh={recover}
                    />
                    <HbarQueuedUserRuns
                      state={queue}
                      sessionId={input.sessionId}
                      connected={connected}
                      activeRunId={null}
                      labels={labels.queuedUserRuns}
                      onRefresh={recover}
                      onPrevious={() => {}}
                      onNext={() => {}}
                      onStartEdit={() => {}}
                      onEditText={() => {}}
                      onSaveEdit={() => {}}
                      onRetryEdit={recover}
                      onGuide={() => {}}
                      onRetryGuide={recover}
                      onDismissGuide={() => {}}
                      onCancelEdit={() => {}}
                      onRemove={() => {}}
                      onRetryRemoval={recover}
                      onDismissRemoval={() => {}}
                    />
                    <HbarComposerAttachmentTransfers
                      transfers={Array.from({ length: input.attachments ?? 0 }, (_, index) => ({
                        id: `transfer-${index}`,
                        name: `持久附件 ${index}.txt`,
                        kind: 'file' as const,
                        status: failure ? ('unknown' as const) : ('uploading' as const),
                        ownerRevision: 0,
                        originalOperationId: null,
                        mime: 'text/plain',
                        size: 12,
                        upload: null,
                        confirmed: null,
                        error: failure ? message : null,
                      }))}
                      labels={labels.attachments}
                      connected={connected}
                      onRemove={() => {}}
                      onReconcile={recover}
                      onAccept={recover}
                    />
                    {Array.from({ length: input.notices ?? 0 }, (_, index) => (
                      <HbarComposerFeedback key={index} tone="danger">
                        <LumenText as="p" role="alert">
                          {message}
                        </LumenText>
                        <LumenButton type="button" onClick={recover}>
                          {labels.queuedUserRuns.retry}
                        </LumenButton>
                      </HbarComposerFeedback>
                    ))}
                  </>
                }
                controls={
                  <LumenFrame className="hbar-session-composer-controls">
                    <HbarComposerPermissionPicker
                      sessionId={input.sessionId}
                      sessionLabel={input.sessionId}
                      connected={connected}
                      disabled={false}
                      labels={labels.permissionPicker}
                      entry={{
                        sessionId: input.sessionId,
                        revision: 0,
                        choice: 'ask',
                        status: failure ? 'failed' : input.phase === 'loading' ? 'loading' : 'idle',
                        locked: false,
                        error: failure ? 'DISCONNECTED' : null,
                      }}
                      hostDefault={{ status: 'ready', mode: 'ask', error: null }}
                      defaultAvailable
                      onRefresh={async () => recover()}
                      onSelect={async () => {}}
                    />
                  </LumenFrame>
                }
                modelPicker={
                  <LumenFrame className="hbar-session-composer-options">
                    <HbarComposerModelPicker
                      sessionId={input.sessionId}
                      connected={connected}
                      disabled={false}
                      canSelect={false}
                      labels={labels.modelPicker}
                    />
                  </LumenFrame>
                }
              />
            </LumenFrame>
          </HbarComposerFeedbackProvider>
        </LumenFrame>
      </HbarRuntimeProvider>
    </LumenProvider>
  )
}
window.composerStability = {
  render(input) {
    flushSync(() =>
      root.render(
        <StrictMode>
          <Fixture input={input} />
        </StrictMode>,
      ),
    )
  },
  actions: () => actions,
}
window.composerStability.render({ phase: 'ready', locale: 'zh-CN', theme: 'dark', sessionId: 'A' })
