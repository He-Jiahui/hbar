import { LumenButton } from '@lumen/app-ui'
import { HbarAppUiVirtualList } from '../../VirtualList'
import './EventLog.css'

export interface HbarAppUiEventLogItem {
  readonly id: string
  readonly sequence: string
  readonly type: string
  readonly time: string
}
export interface HbarAppUiEventLogProps {
  readonly items: readonly HbarAppUiEventLogItem[]
  readonly labels: {
    readonly title: string
    readonly scope: string
    readonly empty: string
    readonly loading: string
    readonly retry: string
  }
  readonly loading: boolean
  readonly error?: string | undefined
  readonly selectedId?: string | undefined
  readonly onSelect: (id: string) => void
  readonly onRetry: () => void
}
export function HbarAppUiEventLog({
  items,
  labels,
  loading,
  error,
  selectedId,
  onSelect,
  onRetry,
}: HbarAppUiEventLogProps) {
  return (
    <section className="hbar-app-ui-event-log" aria-label={labels.title} aria-busy={loading}>
      <header>
        <strong>{labels.title}</strong>
        <small>{labels.scope}</small>
      </header>
      {loading && <p role="status">{labels.loading}</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <LumenButton type="button" onClick={onRetry}>
            {labels.retry}
          </LumenButton>
        </div>
      )}
      <HbarAppUiVirtualList
        items={items}
        label={labels.title}
        empty={<p>{labels.empty}</p>}
        renderRow={(item) => (
          <LumenButton
            type="button"
            className="hbar-app-ui-event-row"
            aria-current={selectedId === item.id ? 'true' : undefined}
            onClick={() => onSelect(item.id)}
          >
            <span>{item.sequence}</span>
            <code>{item.type}</code>
            <time>{item.time}</time>
          </LumenButton>
        )}
      />
    </section>
  )
}
