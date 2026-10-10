import { useLayoutEffect, useRef, useState } from 'react'
import { LumenContentText, LumenFrame } from '@lumen/app-ui'
import './sidebar-caption.css'

/** A pane-sized navigation caption: preserve its beginning, clip its tail and retain the Host's full title. */
export function SidebarCaption({
  text,
  title = text,
  className,
}: {
  readonly text: string
  readonly title?: string
  readonly className?: string
}) {
  const viewport = useRef<HTMLSpanElement>(null)
  const content = useRef<HTMLSpanElement>(null)
  const [overflowing, setOverflowing] = useState(false)
  useLayoutEffect(() => {
    const element = viewport.current
    const caption = content.current
    if (!element || !caption) return undefined
    const measure = () => setOverflowing(caption.getBoundingClientRect().width > element.clientWidth + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    observer.observe(caption)
    return () => observer.disconnect()
  }, [text])
  return (
    <LumenFrame
      as="span"
      ref={viewport}
      className={['hbar-sidebar-caption', className].filter(Boolean).join(' ')}
      data-overflow={overflowing || undefined}
      title={title}
    >
      <LumenFrame as="span" ref={content} className="hbar-sidebar-caption-text">
        <LumenContentText context="navigation.item" size="s">
          {text}
        </LumenContentText>
      </LumenFrame>
    </LumenFrame>
  )
}
