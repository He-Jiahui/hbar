import { HbarAppUiSessionNavigator } from 'hbar-app-ui'
import { useCatalog, useWorkbench } from './stores'
import { useLocale } from './locale'
import { getSessionNavigatorCopy } from './app-ui-locale'
import { mutateSessionNavigation, useSessionNavigation } from './session-navigation'

export default function Sessions({ onSelect, onNew }: { onSelect(id: string): void; onNew(): void }) {
  const { locale } = useLocale()
  const data = useCatalog((state) => state.data)
  const workspaceId = useWorkbench((state) => state.workspaceId)
  const selected = useWorkbench((state) => state.activeSession)
  const archived = useWorkbench((state) => state.showArchived)
  const query = useSessionNavigation((state) => state.queries[workspaceId] ?? '')
  const operations = useSessionNavigation((state) => state.operations)
  const draft = useSessionNavigation((state) => state.draft)
  const actions = useSessionNavigation.getState()
  const copy = getSessionNavigatorCopy(locale, archived, Boolean(query))
  const items = (data?.sessions ?? [])
    .filter(
      (session) =>
        session.workspaceId === workspaceId &&
        session.archived === archived &&
        session.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    )
    .map((session) => ({
      id: session.id,
      title: session.title,
      detail: copy.date(session.updatedAt, Boolean(session.parentId)),
      busy: operations[session.id]?.busy,
      error: operations[session.id]?.error,
    }))
  return (
    <HbarAppUiSessionNavigator
      items={items}
      labels={copy.labels}
      selectedId={selected}
      query={query}
      archived={archived}
      draft={draft}
      onQuery={(value) => actions.setQuery(workspaceId, value)}
      onToggleArchive={actions.toggleArchived}
      onCreate={onNew}
      onSelect={onSelect}
      onRename={actions.startRename}
      onDraftChange={actions.changeDraft}
      onCancel={actions.cancelRename}
      onFork={(id) => {
        void mutateSessionNavigation(id, 'fork').then((childId) => {
          if (childId) onSelect(childId)
        })
      }}
      onArchive={(id) => {
        void mutateSessionNavigation(id, 'archive')
      }}
      onSave={(id) => {
        void mutateSessionNavigation(id, 'rename')
      }}
    />
  )
}
