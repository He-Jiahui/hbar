import {
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenText,
 LumenButton, LumenDisclosure } from '@lumen/app-ui'
import { MoreHorizontal, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { HbarAppUiIcon } from '../../icon'
import { HbarAppUiButton, HbarAppUiIconButton, HbarAppUiStatus } from '../../primitives'
import './SettingsList.css'

export interface HbarAppUiSettingsListItem {
  readonly id: string
  readonly title: string
  readonly metadata: readonly string[]
  readonly status?: {
    readonly label: string
    readonly tone: 'neutral' | 'positive' | 'warning' | 'danger'
  }
  readonly editLabel: string
  readonly menuLabel: string
  readonly removeLabel?: string
}

export interface HbarAppUiSettingsListProps {
  readonly label: string
  readonly description?: string
  readonly empty: string
  readonly addLabel: string
  readonly refreshLabel: string
  readonly items: readonly HbarAppUiSettingsListItem[]
  readonly disabled?: boolean
  readonly busy?: boolean
  readonly onAdd: () => void
  readonly onRefresh: () => void
  readonly onOpen: (id: string) => void
  readonly onRemove?: (id: string) => void
}

export function HbarAppUiSettingsList({
  label,
  description,
  empty,
  addLabel,
  refreshLabel,
  items,
  disabled = false,
  busy = false,
  onAdd,
  onRefresh,
  onOpen,
  onRemove,
}: HbarAppUiSettingsListProps) {
  return (
    <LumenFrame as="section" className="hbar-app-ui-settings-list" aria-label={label} aria-busy={busy || undefined}>
      <LumenFrame as="header">
        <LumenFrame>
          <LumenText as="h2">{label}</LumenText>
          {description && <LumenText as="p">{description}</LumenText>}
        </LumenFrame>
        <LumenFrame className="hbar-app-ui-settings-list-header-actions">
          <HbarAppUiIconButton label={refreshLabel} disabled={disabled || busy} onClick={onRefresh}>
            <HbarAppUiIcon icon={RefreshCw} tier="sm" />
          </HbarAppUiIconButton>
          <HbarAppUiButton tone="accent" disabled={disabled || busy} onClick={onAdd}>
            <HbarAppUiIcon icon={Plus} tier="sm" />
            {addLabel}
          </HbarAppUiButton>
        </LumenFrame>
      </LumenFrame>
      {items.length === 0 ? (
        <LumenText as="p" className="hbar-app-ui-settings-list-empty">{empty}</LumenText>
      ) : (
        <LumenCollection as="ol">
          {items.map((item) => (
            <LumenCollectionItem key={item.id}>
              <LumenButton
                type="button"
                className="hbar-app-ui-settings-list-row"
                aria-label={item.editLabel}
                disabled={disabled || busy}
                onClick={() => onOpen(item.id)}
              >
                <LumenText as="span" className="hbar-app-ui-settings-list-copy">
                  <LumenText as="strong">{item.title}</LumenText>
                  <LumenText as="span" className="hbar-app-ui-settings-list-metadata">
                    {item.metadata.map((value, index) => (
                      <LumenText as="small" key={`${item.id}:${index}`}>{value}</LumenText>
                    ))}
                  </LumenText>
                </LumenText>
                {item.status && <HbarAppUiStatus value={item.status.label} tone={item.status.tone} />}
              </LumenButton>
              {item.removeLabel && onRemove && (
                <LumenDisclosure
                  summary={<HbarAppUiIcon icon={MoreHorizontal} tier="sm" />}
                  className="hbar-app-ui-settings-list-menu"
                  aria-label={item.menuLabel}
                  onKeyDown={(event) => {
                    if (event.key !== 'Escape') return
                    event.preventDefault()
                    event.currentTarget.removeAttribute('open')
                    event.currentTarget.querySelector('summary')?.focus()
                  }}
                >
                  <LumenFrame className="hbar-app-ui-dialog-menu" role="menu" aria-label={item.menuLabel}>
                    <LumenButton type="button" role="menuitem" onClick={() => onRemove(item.id)}>
                      <HbarAppUiIcon icon={Trash2} tier="sm" />
                      {item.removeLabel}
                    </LumenButton>
                  </LumenFrame>
                </LumenDisclosure>
              )}
            </LumenCollectionItem>
          ))}
        </LumenCollection>
      )}
    </LumenFrame>
  )
}
