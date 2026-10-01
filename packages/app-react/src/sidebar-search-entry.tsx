import { Search } from 'lucide-react'
import { LumenButton, LumenIcon } from '@lumen/app-ui'
import './sidebar-search-entry.css'

/** A content-grown global-search trigger; no query or navigation state is duplicated here. */
export function SidebarSearchEntry({
  label,
  shortcut,
  open,
  onOpen,
}: {
  readonly label: string
  readonly shortcut: string
  readonly open: boolean
  readonly onOpen: () => void
}) {
  return (
    <LumenButton
      type="button"
      variant="outlined"
      indicator="none"
      className="hbar-sidebar-search-entry"
      aria-label={label}
      title={label}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onOpen}
    >
      <LumenIcon icon={Search} tier="sm" />
      <span className="hbar-sidebar-search-label">{label}</span>
      <kbd aria-hidden="true">{shortcut}</kbd>
    </LumenButton>
  )
}
