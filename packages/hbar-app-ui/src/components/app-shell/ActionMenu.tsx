import { LumenButton } from '@lumen/app-ui'
import { MoreHorizontal } from 'lucide-react'
import { HbarAppUiIcon } from '../../icon'
import './ActionMenu.css'

export interface HbarAppUiActionMenuItem<ActionId extends string = string> {
  readonly id: ActionId
  readonly label: string
  readonly tone?: 'neutral' | 'danger'
  readonly disabled?: boolean
}

export interface HbarAppUiActionMenuProps<ActionId extends string = string> {
  readonly label: string
  readonly items: readonly HbarAppUiActionMenuItem<ActionId>[]
  readonly onAction: (actionId: ActionId) => void
}

/** A compact host-labelled row menu. Business actions remain owned by the caller. */
export function HbarAppUiActionMenu<ActionId extends string = string>({
  label,
  items,
  onAction,
}: HbarAppUiActionMenuProps<ActionId>) {
  return (
    <details
      className="hbar-app-ui-action-menu"
      onToggle={(event) => {
        if (event.currentTarget.open) event.currentTarget.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.currentTarget.removeAttribute('open')
        event.currentTarget.querySelector('summary')?.focus()
      }}
    >
      <summary aria-label={label} title={label} aria-haspopup="menu">
        <HbarAppUiIcon icon={MoreHorizontal} tier="sm" />
      </summary>
      <div className="hbar-app-ui-dialog-menu hbar-app-ui-action-menu-popup" role="menu" aria-label={label}>
        {items.map((item) => (
          <LumenButton
            key={item.id}
            type="button"
            role="menuitem"
            data-tone={item.tone ?? 'neutral'}
            disabled={item.disabled}
            onClick={(event) => {
              event.currentTarget.closest('details')?.removeAttribute('open')
              onAction(item.id)
            }}
          >
            {item.label}
          </LumenButton>
        ))}
      </div>
    </details>
  )
}
