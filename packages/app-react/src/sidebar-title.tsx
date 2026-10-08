import { LumenContentText } from '@lumen/app-ui'
import './sidebar-title.css'

/** Project and session identities flow as complete titles in their owning tree row. */
export function SidebarTitle({
  text,
  title = text,
  className,
}: {
  readonly text: string
  readonly title?: string
  readonly className?: string
}) {
  return (
    <LumenContentText
      context="collection.title"
      size="s"
      className={['hbar-sidebar-title', className].filter(Boolean).join(' ')}
      title={title}
    >
      {text}
    </LumenContentText>
  )
}
