import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { LumenButton, LumenContentText, LumenFrame, LumenIcon } from '@lumen/app-ui'
import { createMessageScope } from './messages'
import './activity-text.css'

export interface ActivityTextLabels {
  readonly expand: string
  readonly collapse: string
}
const activityTextMessages = createMessageScope<ActivityTextLabels>()

/** Three visible lines; the pane owns scrolling and the full content stays available on expansion. */
export function ActivityText(props: {
  readonly text: string
  readonly labels: ActivityTextLabels
  readonly context?: 'feedback.detail' | 'choice.title'
  readonly children?: (caption: ReactNode) => ReactNode
}) {
  return (
    <activityTextMessages.Provider messages={props.labels}>
      <ActivityTextContent {...props} />
    </activityTextMessages.Provider>
  )
}

function ActivityTextContent({
  text,
  context = 'feedback.detail',
  children,
}: {
  readonly text: string
  readonly context?: 'feedback.detail' | 'choice.title'
  readonly children?: (caption: ReactNode) => ReactNode
}) {
  const { t } = activityTextMessages.useMessages()
  const container = useRef<HTMLDivElement>(null)
  const id = useId()
  const [expandedText, setExpandedText] = useState<string | null>(null)
  const [overflows, setOverflows] = useState(false)
  const expanded = expandedText === text

  useLayoutEffect(() => {
    const caption = container.current?.querySelector<HTMLElement>('.hbar-activity-text-content')
    if (!caption) return
    const measure = () => {
      const lineHeight = Number.parseFloat(getComputedStyle(caption).lineHeight)
      setOverflows(caption.clientWidth > 0 && caption.scrollHeight > lineHeight * 3 + 1)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(caption)
    return () => observer.disconnect()
  }, [text])

  const caption = (
    <LumenContentText id={id} context={context} className="hbar-activity-text-content" data-collapsed={!expanded}>
      {text}
    </LumenContentText>
  )
  return (
    <LumenFrame ref={container} className="hbar-activity-text">
      {children ? children(caption) : caption}
      {overflows && (
        <LumenButton
          size="s"
          variant="text"
          className="hbar-activity-text-toggle"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpandedText(expanded ? null : text)}
        >
          <LumenIcon icon={expanded ? ChevronUp : ChevronDown} tier="sm" />
          <LumenContentText context="control.label">{expanded ? t('collapse') : t('expand')}</LumenContentText>
        </LumenButton>
      )}
    </LumenFrame>
  )
}
