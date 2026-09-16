import { useState } from 'react'
import { HbarAppUiSessionNavigator, type HbarAppUiSessionRow } from 'hbar-app-ui'
import { SESSION_NAVIGATOR_LABELS, SESSION_NAVIGATOR_ROWS } from '../../../tests/fixtures/hbar-app-ui-sessions-fixtures'

/** All example mutations stay in the preview host. */
export function SessionPreviewHost() {
  const [rows, setRows] = useState(SESSION_NAVIGATOR_ROWS)
  const [selectedId, setSelected] = useState('')
  const [query, setQuery] = useState('')
  const [archived, setArchived] = useState<readonly string[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [draft, setDraft] = useState<{ id: string; title: string } | null>(null)
  const add = (row?: HbarAppUiSessionRow) => {
    const id = crypto.randomUUID()
    setRows((current) => [
      ...current,
      { id, title: row?.title ?? SESSION_NAVIGATOR_LABELS.create, detail: row?.detail ?? '' },
    ])
    setSelected(id)
  }
  return (
    <HbarAppUiSessionNavigator
      items={rows.filter(
        (row) => archived.includes(row.id) === showArchived && row.title.toLowerCase().includes(query.toLowerCase()),
      )}
      labels={SESSION_NAVIGATOR_LABELS}
      selectedId={selectedId}
      query={query}
      archived={showArchived}
      draft={draft}
      onQuery={setQuery}
      onToggleArchive={() => setShowArchived((value) => !value)}
      onCreate={() => add()}
      onSelect={setSelected}
      onFork={(id) => {
        const row = rows.find((item) => item.id === id)
        if (row) add(row)
      }}
      onArchive={(id) =>
        setArchived((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]))
      }
      onRename={(id) => {
        const row = rows.find((item) => item.id === id)
        if (row) setDraft({ id, title: row.title })
      }}
      onDraftChange={(title) => setDraft((current) => (current ? { ...current, title } : null))}
      onCancel={() => setDraft(null)}
      onSave={(id) => {
        if (draft?.id === id)
          setRows((current) => current.map((row) => (row.id === id ? { ...row, title: draft.title } : row)))
        setDraft(null)
      }}
    />
  )
}
