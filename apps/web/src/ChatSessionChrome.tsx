import { FolderOpen, GitBranch, RefreshCw } from 'lucide-react'
import type { GitInfo, Run, Session, Workspace } from '@hbar/contracts'
import GlassSurface from './react-bits/GlassSurface'
import { ReferenceContextRail, SegmentedControl, referenceAttributes, type ReferenceContextItem } from './react-bits'
import { useLocale } from './locale'
import './ChatSessionChrome.css'

export interface ChatSessionChromeProps {
  sessionId: string
  session: Session | undefined
  workspace: Workspace | undefined
  gitInfo?: GitInfo | null
  modelContext?: string
  thinkingContext?: string
  activeRun: Run | undefined
  view: 'chat' | 'console'
  onViewChange(view: 'chat' | 'console'): void
  onRefresh(): void | Promise<void>
  showContext?: boolean
  referenceContext?: readonly ReferenceContextItem[]
}

export default function ChatSessionChrome({
  sessionId,
  session,
  workspace,
  gitInfo,
  modelContext,
  thinkingContext,
  activeRun,
  view,
  onViewChange,
  onRefresh,
  showContext = true,
  referenceContext = [],
}: ChatSessionChromeProps) {
  const { t } = useLocale()
  const sessionTitle = session?.title ?? t('session')
  const stateLabel = activeRun ? (activeRun.status === 'waiting_approval' ? t('waitingApproval') : t('running')) : t('ready')

  return (
    <>
      <header
        {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-4', 'session-chat')}
        className="session-header rb-session-header rb-chat-session-chrome"
        data-testid="session-header"
      >
        <GlassSurface className="session-header-glass" width="100%" height="100%" aria-hidden="true" />
        <div className="session-header-title">
          <span className="session-header-mark" aria-hidden="true">
            h
          </span>
          <h1 title={sessionTitle}>{sessionTitle}</h1>
          <span className="session-runtime">Pi</span>
          {view === 'console' && modelContext && (
            <span className="session-console-context" title={t('currentModelThinking')}>
              {modelContext} · thinking:{thinkingContext ?? 'off'}
            </span>
          )}
        </div>
        <SegmentedControl
          className="session-view-tabs"
          ariaLabel={t('sessionView')}
          value={view}
          options={[
            { value: 'chat', label: 'Chat' },
            { value: 'console', label: t('console') },
          ]}
          onChange={onViewChange}
        />
        <button
          type="button"
          className="session-refresh"
          title={t('refreshSession')}
          aria-label={t('refreshSession')}
          disabled={!sessionId}
          onClick={() => void onRefresh()}
        >
          <RefreshCw size={15} />
        </button>
      </header>
      {showContext && (
        <div
          {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-7', 'session-chat')}
          className="chat-context rb-chat-context rb-chat-context-bar"
          aria-label={t('sessionContext')}
        >
          <GlassSurface className="chat-context-glass" width="100%" height="100%" aria-hidden="true" />
          <div className="chat-context-copy">
            <FolderOpen size={13} aria-hidden="true" />
            <span>{workspace?.name ?? t('workspace')}</span>
            {gitInfo?.branch && (
              <>
                <span className="context-divider context-branch-divider" aria-hidden="true">
                  /
                </span>
                <GitBranch size={13} aria-hidden="true" />
                <span className="chat-context-branch" title={t('currentGitBranch')}>
                  {gitInfo.branch}
                </span>
              </>
            )}
            <span className="context-divider" aria-hidden="true">
              /
            </span>
            <span className="chat-context-session" title={sessionTitle}>
              {sessionTitle}
            </span>
          </div>
          <ReferenceContextRail
            className="chat-reference-context"
            reference="https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-7"
            adapter="session-chat"
            items={referenceContext}
          />
          <span className="session-state" data-session-state={activeRun?.status ?? 'idle'}>
            <i className={activeRun ? 'running' : ''} aria-hidden="true" />
            {stateLabel}
          </span>
        </div>
      )}
    </>
  )
}
