import { FolderOpen, GitBranch, RefreshCw } from 'lucide-react'
import type { GitInfo, Run, Session, Workspace } from '@hbar/contracts'
import GlassSurface from './react-bits/GlassSurface'
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
}: ChatSessionChromeProps) {
  const sessionTitle = session?.title ?? 'Session'
  const stateLabel = activeRun ? (activeRun.status === 'waiting_approval' ? '等待批准' : '运行中') : '就绪'

  return (
    <>
      <header className="session-header rb-session-header rb-chat-session-chrome" data-testid="session-header">
        <GlassSurface className="session-header-glass" width="100%" height="100%" aria-hidden="true" />
        <div className="session-header-title">
          <span className="session-header-mark" aria-hidden="true">
            h
          </span>
          <h1 title={sessionTitle}>{sessionTitle}</h1>
          <span className="session-runtime">Pi</span>
          {view === 'console' && modelContext && (
            <span className="session-console-context" title="当前模型与思考等级">
              {modelContext} · thinking:{thinkingContext ?? 'off'}
            </span>
          )}
        </div>
        <div className="session-view-tabs" role="tablist" aria-label="会话视图">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'chat'}
            className={view === 'chat' ? 'selected' : ''}
            onClick={() => onViewChange('chat')}
          >
            Chat
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'console'}
            className={view === 'console' ? 'selected' : ''}
            onClick={() => onViewChange('console')}
          >
            控制台
          </button>
        </div>
        <button
          type="button"
          className="session-refresh"
          title="刷新会话"
          aria-label="刷新会话"
          disabled={!sessionId}
          onClick={() => void onRefresh()}
        >
          <RefreshCw size={15} />
        </button>
      </header>
      {showContext && (
        <div className="chat-context rb-chat-context rb-chat-context-bar" aria-label="会话上下文">
          <GlassSurface className="chat-context-glass" width="100%" height="100%" aria-hidden="true" />
          <div className="chat-context-copy">
            <FolderOpen size={13} aria-hidden="true" />
            <span>{workspace?.name ?? 'Workspace'}</span>
            {gitInfo?.branch && (
              <>
                <span className="context-divider context-branch-divider" aria-hidden="true">
                  /
                </span>
                <GitBranch size={13} aria-hidden="true" />
                <span className="chat-context-branch" title="当前 Git 分支">
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
          <span className="session-state" data-session-state={activeRun?.status ?? 'idle'}>
            <i className={activeRun ? 'running' : ''} aria-hidden="true" />
            {stateLabel}
          </span>
        </div>
      )}
    </>
  )
}
