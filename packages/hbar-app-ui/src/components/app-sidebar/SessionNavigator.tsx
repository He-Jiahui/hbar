import { Archive, GitBranch, MessageSquare, Pencil, Plus, Search } from 'lucide-react'
import { HbarAppUiIcon } from '../../icon'
import { HbarAppUiVirtualList } from '../../VirtualList'
import './SessionNavigator.css'

export interface HbarAppUiSessionRow {
  readonly id: string
  readonly title: string
  readonly detail: string
  readonly busy?: boolean | undefined
  readonly error?: string | undefined
}
export interface HbarAppUiSessionLabels {
  readonly title: string
  readonly search: string
  readonly empty: string
  readonly create: string
  readonly archiveFilter: string
  readonly fork: (title: string) => string
  readonly archive: (title: string) => string
  readonly rename: (title: string) => string
  readonly name: string
  readonly save: string
  readonly cancel: string
}
export interface HbarAppUiSessionNavigatorProps {
  readonly items: readonly HbarAppUiSessionRow[]
  readonly labels: HbarAppUiSessionLabels
  readonly selectedId: string
  readonly query: string
  readonly archived: boolean
  readonly draft: { readonly id: string; readonly title: string } | null
  readonly onQuery: (value: string) => void
  readonly onToggleArchive: () => void
  readonly onCreate: () => void
  readonly onSelect: (id: string) => void
  readonly onFork: (id: string) => void
  readonly onArchive: (id: string) => void
  readonly onRename: (id: string) => void
  readonly onDraftChange: (value: string) => void
  readonly onSave: (id: string) => void
  readonly onCancel: () => void
}

export function HbarAppUiSessionNavigator(props: HbarAppUiSessionNavigatorProps) {
  const { labels } = props
  return (
    <section className="hbar-app-ui-session-navigator session-nav" aria-label={labels.title}>
      <header>
        <strong>{labels.title}</strong>
        <button
          type="button"
          aria-label={labels.archiveFilter}
          title={labels.archiveFilter}
          aria-pressed={props.archived}
          onClick={props.onToggleArchive}
        >
          <HbarAppUiIcon icon={Archive} tier="sm" />
        </button>
      </header>
      <label className="hbar-app-ui-session-search">
        <HbarAppUiIcon icon={Search} tier="sm" />
        <input
          type="search"
          value={props.query}
          onChange={(event) => props.onQuery(event.target.value)}
          aria-label={labels.search}
          placeholder={labels.search}
        />
      </label>
      <HbarAppUiVirtualList
        items={props.items}
        label={labels.title}
        empty={<p>{labels.empty}</p>}
        className="session-list"
        renderRow={(row) => (
          <article className={`hbar-app-ui-session-row session-item${row.id === props.selectedId ? ' selected' : ''}`}>
            {props.draft?.id === row.id ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  props.onSave(row.id)
                }}
              >
                <input
                  aria-label={labels.name}
                  value={props.draft.title}
                  onChange={(event) => props.onDraftChange(event.target.value)}
                  disabled={row.busy}
                  autoFocus
                />
                <div>
                  <button type="submit" disabled={row.busy || !props.draft.title.trim()}>
                    {labels.save}
                  </button>
                  <button type="button" onClick={props.onCancel} disabled={row.busy}>
                    {labels.cancel}
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                className="session-select"
                aria-current={row.id === props.selectedId ? 'true' : undefined}
                onClick={() => props.onSelect(row.id)}
                onDoubleClick={() => props.onRename(row.id)}
              >
                <HbarAppUiIcon icon={MessageSquare} tier="sm" />
                <span>
                  <strong>{row.title}</strong>
                  <small>{row.detail}</small>
                </span>
              </button>
            )}
            <div className="hbar-app-ui-session-actions">
              <button
                type="button"
                aria-label={labels.rename(row.title)}
                title={labels.rename(row.title)}
                disabled={row.busy}
                onClick={() => props.onRename(row.id)}
              >
                <HbarAppUiIcon icon={Pencil} tier="xs" />
              </button>
              <button
                type="button"
                aria-label={labels.fork(row.title)}
                title={labels.fork(row.title)}
                disabled={row.busy}
                onClick={() => props.onFork(row.id)}
              >
                <HbarAppUiIcon icon={GitBranch} tier="xs" />
              </button>
              <button
                type="button"
                aria-label={labels.archive(row.title)}
                title={labels.archive(row.title)}
                disabled={row.busy}
                onClick={() => props.onArchive(row.id)}
              >
                <HbarAppUiIcon icon={Archive} tier="xs" />
              </button>
            </div>
            {row.error && <p role="alert">{row.error}</p>}
          </article>
        )}
      />
      <footer>
        <button type="button" className="new-session" onClick={props.onCreate}>
          <HbarAppUiIcon icon={Plus} />
          {labels.create}
        </button>
      </footer>
    </section>
  )
}
