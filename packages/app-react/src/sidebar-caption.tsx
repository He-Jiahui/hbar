import type { KeyboardEvent } from 'react'
import { LumenText } from '@lumen/app-ui'
import './sidebar-caption.css'

/** A bounded reading viewport; the Host-owned caption retains its full intrinsic width inside it. */
export function SidebarCaption({
  text,
  title = text,
  className,
  focusable = false,
}: {
  readonly text: string
  readonly title?: string
  readonly className?: string
  readonly focusable?: boolean
}) {
  const scroll = (event: KeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!direction || event.currentTarget.scrollWidth <= event.currentTarget.clientWidth) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.scrollBy({ left: direction * event.currentTarget.clientWidth * 0.75 })
  }
  return (
    <LumenText
      as="span"
      size="s"
      variant="label"
      className={['hbar-sidebar-caption', className].filter(Boolean).join(' ')}
      title={title}
      tabIndex={focusable ? 0 : undefined}
      onKeyDown={scroll}
    >
      <LumenText as="span" className="hbar-sidebar-caption-text">
        {text}
      </LumenText>
    </LumenText>
  )
}
