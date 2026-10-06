import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { LumenButton, LumenContentText, LumenDialog, LumenFrame, LumenProvider } from '@lumen/app-ui'
import type { SessionGitContextState } from '@hbar/app-runtime'
import { HbarPromptComposer } from '../../packages/app-react/src/prompt-composer'
import { HbarSessionProjectContext } from '../../packages/app-react/src/session-project-context'
import { HbarComposerPermissionPicker } from '../../packages/app-react/src/composer-permission-picker'
import { HbarPreSessionChoicePicker } from '../../packages/app-react/src/pre-session-choice-picker'
import { createWebLumenAppearance, DEFAULT_WEB_APPEARANCE_DIMENSIONS } from '../../apps/web/src/appearance'
import { sessionContextCopy } from '../../apps/web/src/session-context-copy'
import { getShellCopy, type ShellLocale } from '../../apps/web/src/shell-copy'
import { SingleLineGallery } from './single-line-gallery'
import { SingleLineDataGallery } from './single-line-data-gallery'
import '@lumen/app-ui/styles.css'
import '../../packages/app-react/src/lumen-session-workspace.css'
import './single-line-controls-browser.css'

export interface SingleLineFixtureInput {
  readonly locale: ShellLocale
  readonly theme: 'light' | 'dark'
  readonly branch: string | null
  readonly workspaceName: string
  readonly status: SessionGitContextState['status']
  readonly connected?: boolean
  readonly long?: boolean
  readonly textSize?: 'm' | 'l'
  readonly gallery?: boolean
  readonly dataGallery?: boolean
  readonly count?: number
  readonly choiceDetail?: string
  readonly readingDialog?: boolean
}

declare global {
  interface Window {
    singleLineFixture: { render(input: SingleLineFixtureInput): void; actions(): readonly string[] }
  }
}

const actions: string[] = []
const container = document.getElementById('root')
if (!container) throw new Error('Single-line fixture root missing')
const root = createRoot(container)

function Fixture({ input }: { readonly input: SingleLineFixtureInput }) {
  const copy = getShellCopy(input.locale).session
  const labels = sessionContextCopy(input.locale)
  const long =
    input.locale === 'zh-CN' ? '完整的中文操作名称'.repeat(16) : 'Complete translated control caption '.repeat(16)
  const model = input.long ? long : 'GPT-6-Luna'
  const context: SessionGitContextState = {
    sessionId: 'session',
    workspaceId: 'workspace',
    status: input.status,
    branch: input.branch,
    error: input.status === 'error' ? 'GIT_TIMEOUT' : null,
  }
  const project = (
    <HbarSessionProjectContext
      sessionId="session"
      workspaceId="workspace"
      workspaceName={input.workspaceName}
      connected={input.connected ?? true}
      context={context}
      labels={labels}
      onRetry={() => actions.push('retry')}
    />
  )
  return (
    <LumenProvider
      appearance={createWebLumenAppearance(
        input.theme,
        {
          ...DEFAULT_WEB_APPEARANCE_DIMENSIONS,
          textSize: input.textSize ?? 'm',
        },
        false,
      )}
    >
      <LumenFrame as="main" className="single-line-fixture">
        <LumenFrame className="hbar-app-react-session-footer" data-git-context-status={input.status}>
          <HbarPromptComposer
            value=""
            labels={copy.prompt}
            boundary="none"
            attachments={[]}
            submitting={false}
            uploading={false}
            canSubmit
            canStop
            runningActions={{
              ...copy.runningActions,
              submit: 'queue',
              queueLabel: input.long ? long : copy.runningActions.queueLabel,
            }}
            onChange={() => undefined}
            onRemoveAttachment={() => undefined}
            onSubmit={() => actions.push('submit')}
            onStop={() => actions.push('stop')}
            controls={
              <LumenFrame className="hbar-session-composer-controls">
                <HbarComposerPermissionPicker
                  sessionId="session"
                  sessionLabel={input.workspaceName}
                  entry={{
                    sessionId: 'session',
                    choice: 'ask',
                    revision: 1,
                    status: 'idle',
                    locked: false,
                    error: null,
                  }}
                  hostDefault={{ status: 'ready', mode: 'ask', error: null }}
                  defaultAvailable
                  connected
                  disabled={false}
                  labels={copy.permissionPicker}
                  onRefresh={async () => undefined}
                  onSelect={async ({ sessionId, choice, confirmAllow }) => {
                    actions.push(`permission:${sessionId}:${choice}:${String(confirmAllow)}`)
                  }}
                />
                <LumenFrame className="hbar-session-project-context-toolbar">{project}</LumenFrame>
              </LumenFrame>
            }
            modelPicker={
              <LumenFrame className="hbar-session-composer-options">
                <LumenButton size="s" variant="text">
                  {copy.usage.title}
                </LumenButton>
                <HbarPreSessionChoicePicker
                  placement="composer"
                  selectedId="model"
                  items={[{ id: 'model', label: model, ...(input.choiceDetail ? { detail: input.choiceDetail } : {}) }]}
                  labels={{
                    title: model,
                    trigger: (selected) => selected ?? model,
                    search: model,
                    clearSearch: model,
                    empty: model,
                    noMatches: model,
                    more: () => model,
                    close: model,
                    error: () => model,
                  }}
                  onChoose={(id) => {
                    actions.push(id)
                  }}
                />
              </LumenFrame>
            }
          />
          <LumenFrame className="hbar-session-project-context-below">{project}</LumenFrame>
        </LumenFrame>
        {input.gallery && (
          <SingleLineGallery
            caption={input.long ? long : model}
            count={input.count ?? 7}
            onAction={(id) => actions.push(id)}
          />
        )}
        {input.dataGallery && (
          <SingleLineDataGallery
            caption={input.long ? long : model}
            locale={input.locale}
            count={input.count ?? 1}
            onAction={(id) => actions.push(id)}
          />
        )}
        <LumenDialog
          open={input.readingDialog ?? false}
          title={input.workspaceName}
          closeLabel={copy.permissionPicker.close}
          onClose={() => actions.push('dialog:close')}
          footer={
            <LumenButton onClick={() => actions.push('dialog:cancel')}>{copy.permissionPicker.cancel}</LumenButton>
          }
        >
          <LumenContentText context="dialog.body" data-fixture-reading-body>
            {copy.permissionPicker.confirmBody(input.workspaceName)}
          </LumenContentText>
        </LumenDialog>
      </LumenFrame>
    </LumenProvider>
  )
}

window.singleLineFixture = {
  render(input) {
    document.documentElement.lang = input.locale
    flushSync(() => root.render(<Fixture input={input} />))
  },
  actions: () => [...actions],
}
window.singleLineFixture.render({
  locale: 'zh-CN',
  theme: 'dark',
  status: 'ready',
  workspaceName: 'hbar',
  branch: 'master',
})
