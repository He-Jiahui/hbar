import { useEffect, useRef } from 'react'
import { Folder, GitBranch, RotateCw } from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenContentText } from '@lumen/app-ui'
import type { SessionGitContextState } from '@hbar/app-runtime'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import './session-project-context.css'

const REFRESH_INTERVAL_MS = 60_000

export interface HbarSessionProjectContextLabels {
  readonly project: (name: string) => string
  readonly branch: (name: string) => string
  /** Visual caption preserves the complete Git branch name. */
  readonly branchCaption: (name: string) => string
  readonly loading: string
  readonly unavailable: (code: string) => string
  readonly disconnected: string
  readonly retry: string
}

export function HbarSessionProjectContext({
  workspaceName,
  workspacePath,
  sessionId,
  workspaceId,
  connected,
  context,
  labels,
  onRetry,
}: {
  readonly workspaceName: string
  readonly workspacePath?: string | undefined
  readonly sessionId: string
  readonly workspaceId: string
  readonly connected: boolean
  readonly context: SessionGitContextState
  readonly labels: HbarSessionProjectContextLabels
  readonly onRetry: () => void
}) {
  const belongsHere = context.sessionId === sessionId && context.workspaceId === workspaceId
  const branch = connected && belongsHere && context.status === 'ready' ? context.branch : null
  const error = connected && belongsHere && context.status === 'error' ? context.error : null
  const loading = connected && belongsHere && context.status === 'loading'
  const errorLabel = error ? labels.unavailable(error) : null
  return (
    <LumenFrame className="hbar-session-project-context" role="group" aria-label={labels.project(workspaceName)}>
      <LumenIcon icon={Folder} tier="sm" />
      <LumenContentText
        context="control.label"
        className="hbar-session-project-context-name"
        title={workspacePath ?? workspaceName}
      >
        {workspaceName}
      </LumenContentText>
      {branch && (
        <LumenFrame
          className="hbar-session-project-context-branch"
          title={labels.branch(branch)}
          aria-label={labels.branch(branch)}
        >
          <LumenIcon icon={GitBranch} tier="sm" />
          <LumenContentText context="control.label">
            <bdi>{labels.branchCaption(branch)}</bdi>
          </LumenContentText>
        </LumenFrame>
      )}
      {!connected && (
        <LumenContentText context="control.status" tone="subtle">
          {labels.disconnected}
        </LumenContentText>
      )}
      {loading && (
        <LumenContentText context="control.status" tone="subtle" role="status">
          {labels.loading}
        </LumenContentText>
      )}
      {error && (
        <LumenFrame className="hbar-session-project-context-error" role="status">
          <LumenContentText
            context="control.status"
            tone="danger"
            aria-label={errorLabel ?? undefined}
            title={errorLabel ?? undefined}
          >
            {errorLabel}
          </LumenContentText>
          <LumenButton size="s" variant="text" onClick={onRetry}>
            <LumenIcon icon={RotateCw} tier="sm" />
            {labels.retry}
          </LumenButton>
        </LumenFrame>
      )}
    </LumenFrame>
  )
}

/** One lifecycle for both responsive presentations; the runtime owns all Git facts. */
export function useHbarSessionProjectContext({
  sessionId,
  workspaceId,
  connected,
  terminalRunId,
  enabled,
}: {
  readonly sessionId: string | null
  readonly workspaceId: string
  readonly connected: boolean
  readonly terminalRunId: string | null
  readonly enabled: boolean
}) {
  const runtime = useHbarRuntime()
  const context = useHbarRuntimeState(runtime.state.sessionGitContext)
  const activity = useRef<{ readonly target: string; readonly terminalRunId: string | null } | null>(null)

  useEffect(() => {
    if (!enabled || !sessionId) return
    const target = { sessionId, workspaceId }
    if (!connected) {
      void runtime.commands.execute('sessionGitContext.invalidate', target).catch(() => undefined)
      return
    }
    const controller = new AbortController()
    let disposed = false
    let timer: number | null = null
    const refresh = async () => {
      if (disposed || document.hidden) return
      await runtime.commands
        .execute('sessionGitContext.refresh', target, { signal: controller.signal })
        .catch(() => undefined)
    }
    const onFocus = () => void refresh()
    const onVisible = () => {
      if (!document.hidden) void refresh()
    }
    const tick = async () => {
      await refresh()
      if (!disposed) timer = window.setTimeout(() => void tick(), REFRESH_INTERVAL_MS)
    }
    void tick()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      disposed = true
      controller.abort()
      if (timer !== null) window.clearTimeout(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [connected, enabled, runtime.commands, sessionId, workspaceId])

  useEffect(() => {
    if (!enabled || !sessionId) return
    const target = `${sessionId}:${workspaceId}`
    const previous = activity.current
    activity.current = { target, terminalRunId }
    if (
      !connected ||
      !previous ||
      previous.target !== target ||
      !terminalRunId ||
      previous.terminalRunId === terminalRunId ||
      document.hidden
    )
      return
    void runtime.commands.execute('sessionGitContext.refresh', { sessionId, workspaceId }).catch(() => undefined)
  }, [connected, enabled, terminalRunId, runtime.commands, sessionId, workspaceId])

  return {
    context,
    onRetry: () => {
      if (sessionId && enabled && connected)
        void runtime.commands.execute('sessionGitContext.refresh', { sessionId, workspaceId }).catch(() => undefined)
    },
  }
}
