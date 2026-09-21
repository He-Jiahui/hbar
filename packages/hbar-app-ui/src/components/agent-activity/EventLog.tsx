import {
  LumenFrame,
  LumenText,
 LumenButton } from '@lumen/app-ui'
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
    <LumenFrame as="section" className="hbar-app-ui-event-log" aria-label={labels.title} aria-busy={loading}>
      <LumenFrame as="header">
        <LumenText as="strong">{labels.title}</LumenText>
        <LumenText as="small">{labels.scope}</LumenText>
      </LumenFrame>
      {loading && <LumenText as="p" role="status">{labels.loading}</LumenText>}
      {error && (
        <LumenFrame role="alert">
          <LumenText as="p">{error}</LumenText>
          <LumenButton type="button" onClick={onRetry}>
            {labels.retry}
          </LumenButton>
        </LumenFrame>
      )}
      <HbarAppUiVirtualList
        items={items}
        label={labels.title}
        empty={<LumenText as="p">{labels.empty}</LumenText>}
        renderRow={(item) => (
          <LumenButton
            type="button"
            className="hbar-app-ui-event-row"
            aria-current={selectedId === item.id ? 'true' : undefined}
            onClick={() => onSelect(item.id)}
          >
            <LumenText as="span">{item.sequence}</LumenText>
            <LumenText as="code">{item.type}</LumenText>
            <LumenText as="time">{item.time}</LumenText>
          </LumenButton>
        )}
      />
    </LumenFrame>
  )
}
