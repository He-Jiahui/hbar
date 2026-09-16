import { create } from 'zustand'
import { client, refreshCatalog, useCatalog, useConnection, useWorkbench } from './stores'

interface NavigatorState {
  queries: Readonly<Record<string, string>>
  operations: Readonly<Record<string, { readonly busy: boolean; readonly error?: string }>>
  draft: { readonly id: string; readonly title: string } | null
  setQuery(workspaceId: string, value: string): void
  toggleArchived(): void
  startRename(id: string): void
  changeDraft(title: string): void
  cancelRename(): void
}

export const useSessionNavigation = create<NavigatorState>((set) => ({
  queries: {},
  operations: {},
  draft: null,
  setQuery: (workspaceId, value) => set((state) => ({ queries: { ...state.queries, [workspaceId]: value } })),
  toggleArchived: () => useWorkbench.setState((state) => ({ showArchived: !state.showArchived })),
  startRename: (id) => {
    const session = useCatalog.getState().data?.sessions.find((item) => item.id === id)
    if (session) set({ draft: { id, title: session.title } })
  },
  changeDraft: (title) => set((state) => ({ draft: state.draft ? { ...state.draft, title } : null })),
  cancelRename: () => set({ draft: null }),
}))

/** Captures original target and transport; never selects a late result in another workspace. */
export async function mutateSessionNavigation(
  id: string,
  action: 'fork' | 'archive' | 'rename',
): Promise<string | undefined> {
  const session = useCatalog.getState().data?.sessions.find((item) => item.id === id)
  const state = useSessionNavigation.getState()
  if (!session || state.operations[id]?.busy) return undefined
  const connection = client()
  const workspaceId = useWorkbench.getState().workspaceId
  const activeSession = useWorkbench.getState().activeSession
  const title = state.draft?.id === id ? state.draft.title.trim() : undefined
  if (action === 'rename' && !title) return undefined
  useSessionNavigation.setState((current) => ({ operations: { ...current.operations, [id]: { busy: true } } }))
  const current = () => useConnection.getState().client === connection
  try {
    let childId: string | undefined
    if (action === 'fork') childId = (await connection.call('session.fork', { sessionId: id })).id
    else if (action === 'archive')
      await connection.call('session.archive', { sessionId: id, archived: !session.archived })
    else if (title) await connection.call('session.rename', { sessionId: id, title })
    if (!current()) return undefined
    await refreshCatalog()
    if (!current()) return undefined
    useSessionNavigation.setState((next) => ({
      operations: { ...next.operations, [id]: { busy: false } },
      draft: action === 'rename' && next.draft?.id === id && next.draft.title.trim() === title ? null : next.draft,
    }))
    return useWorkbench.getState().workspaceId === workspaceId &&
      useWorkbench.getState().activeSession === activeSession
      ? childId
      : undefined
  } catch (cause) {
    if (current())
      useSessionNavigation.setState((next) => ({
        operations: {
          ...next.operations,
          [id]: { busy: false, error: cause instanceof Error ? cause.message : String(cause) },
        },
      }))
    return undefined
  } finally {
    if (!current())
      useSessionNavigation.setState((next) => ({ operations: { ...next.operations, [id]: { busy: false } } }))
  }
}
