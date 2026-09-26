import { useCallback, useEffect, useRef } from 'react'
import type { HbarRuntimeView } from './runtime'

const AUTO_REFRESH_MS = 30_000
const FOCUS_MIN_MS = 5000
const PROJECT_CONCURRENCY = 2

export interface SessionRosterRefreshSchedulerPorts {
  readonly targets: () => readonly string[]
  readonly canRefresh: () => boolean
  readonly refresh: (workspaceId: string, mode: 'manual' | 'automatic') => Promise<unknown>
  readonly now: () => number
}

/** A bounded scheduler, not a second directory cache. Every queued read keeps its original workspace ID. */
export function createSessionRosterRefreshScheduler(ports: SessionRosterRefreshSchedulerPorts) {
  let disposed = false
  let generation = 0
  let automatic: Promise<void> | null = null
  const startedAt = new Map<string, number>()
  const run = async (mode: 'manual' | 'automatic', workspaceId?: string) => {
    if (disposed || !ports.canRefresh()) return
    const capturedGeneration = generation
    const targets = [...new Set(workspaceId ? [workspaceId] : ports.targets())].slice(0, 200)
    const eligible = targets.filter(
      (id) => mode === 'manual' || ports.now() - (startedAt.get(id) ?? -Infinity) >= FOCUS_MIN_MS,
    )
    let next = 0
    const worker = async () => {
      while (next < eligible.length && !disposed && capturedGeneration === generation && ports.canRefresh()) {
        const id = eligible[next++]
        if (!id || (!workspaceId && !ports.targets().includes(id))) continue
        startedAt.set(id, ports.now())
        try {
          await ports.refresh(id, mode)
        } catch {
          // The workspace's canonical refresh state owns its local error/retry, never a global toast.
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(PROJECT_CONCURRENCY, eligible.length) }, worker))
    const current = new Set(ports.targets())
    for (const id of startedAt.keys()) if (!current.has(id)) startedAt.delete(id)
  }
  return {
    manual: (workspaceId?: string) => run('manual', workspaceId),
    automatic() {
      if (automatic) return automatic
      const promise = run('automatic').finally(() => {
        if (automatic === promise) automatic = null
      })
      automatic = promise
      return promise
    },
    invalidate() {
      generation++
      automatic = null
      startedAt.clear()
    },
    dispose() {
      disposed = true
      generation++
      startedAt.clear()
    },
  }
}

export function useSessionRosterRefresh(
  runtime: HbarRuntimeView,
  expanded: ReadonlySet<string>,
  connected: boolean,
  sidebarOpen: boolean,
) {
  const context = useRef({ expanded, connected, sidebarOpen })
  context.current = { expanded, connected, sidebarOpen }
  const scheduler = useRef<ReturnType<typeof createSessionRosterRefreshScheduler> | null>(null)
  useEffect(() => {
    const active = createSessionRosterRefreshScheduler({
      targets: () =>
        [...context.current.expanded].filter((id) =>
          Object.hasOwn(runtime.state.directory.getSnapshot().workspaces, id),
        ),
      canRefresh: () =>
        context.current.connected && context.current.sidebarOpen && document.visibilityState !== 'hidden',
      refresh: (workspaceId, mode) => runtime.commands.execute('sessionRoster.refresh', { workspaceId, mode }),
      now: () => Date.now(),
    })
    scheduler.current = active
    const refresh = () => {
      void active.automatic()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    const timer = window.setInterval(refresh, AUTO_REFRESH_MS)
    return () => {
      active.dispose()
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
      window.clearInterval(timer)
      if (scheduler.current === active) scheduler.current = null
      void runtime.commands.execute('sessionRoster.invalidate', {}).catch(() => undefined)
    }
  }, [runtime])
  useEffect(() => {
    if (!connected) {
      scheduler.current?.invalidate()
      void runtime.commands.execute('sessionRoster.invalidate', {}).catch(() => undefined)
    } else if (sidebarOpen) {
      void scheduler.current?.automatic()
    }
  }, [connected, expanded, runtime, sidebarOpen])
  return useCallback((workspaceId?: string) => {
    void scheduler.current?.manual(workspaceId)
  }, [])
}
