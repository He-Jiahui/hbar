import { LumenButton, LumenDisclosure } from '@lumen/app-ui'
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
    <section className="hbar-app-ui-settings-list" aria-label={label} aria-busy={busy || undefined}>
      <header>
        <div>
          <h2>{label}</h2>
          {description && <p>{description}</p>}
        </div>
        <div className="hbar-app-ui-settings-list-header-actions">
          <HbarAppUiIconButton label={refreshLabel} disabled={disabled || busy} onClick={onRefresh}>
            <HbarAppUiIcon icon={RefreshCw} tier="sm" />
          </HbarAppUiIconButton>
          <HbarAppUiButton tone="accent" disabled={disabled || busy} onClick={onAdd}>
            <HbarAppUiIcon icon={Plus} tier="sm" />
            {addLabel}
          </HbarAppUiButton>
        </div>
      </header>
      {items.length === 0 ? (
        <p className="hbar-app-ui-settings-list-empty">{empty}</p>
      ) : (
        <ol>
          {items.map((item) => (
            <li key={item.id}>
              <LumenButton
                type="button"
                className="hbar-app-ui-settings-list-row"
                aria-label={item.editLabel}
                disabled={disabled || busy}
                onClick={() => onOpen(item.id)}
              >
                <span className="hbar-app-ui-settings-list-copy">
                  <strong>{item.title}</strong>
                  <span className="hbar-app-ui-settings-list-metadata">
                    {item.metadata.map((value, index) => (
                      <small key={`${item.id}:${index}`}>{value}</small>
                    ))}
                  </span>
                </span>
                {item.status && <HbarAppUiStatus value={item.status.label} tone={item.status.tone} />}
              </LumenButton>
              {item.removeLabel && onRemove && (
                <LumenDisclosure
                  summary={<HbarAppUiIcon icon={MoreHorizontal} tier="sm" />}
                  className="hbar-app-ui-settings-list-menu"
                  onKeyDown={(event) => {
                    if (event.key !== 'Escape') return
                    event.preventDefault()
                    event.currentTarget.removeAttribute('open')
                    event.currentTarget.querySelector('summary')?.focus()
                  }}
                >
                  <summary aria-label={item.menuLabel} title={item.menuLabel}>
                    <HbarAppUiIcon icon={MoreHorizontal} tier="sm" />
                  </summary>
                  <div className="hbar-app-ui-dialog-menu" role="menu" aria-label={item.menuLabel}>
                    <LumenButton type="button" role="menuitem" onClick={() => onRemove(item.id)}>
                      <HbarAppUiIcon icon={Trash2} tier="sm" />
                      {item.removeLabel}
                    </LumenButton>
                  </div>
                </LumenDisclosure>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
