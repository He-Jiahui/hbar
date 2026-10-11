import { useEffect, useMemo, useState } from 'react'
import { LumenContentText, LumenText } from '@lumen/app-ui'
import { highlightMarkdownCode, type CodeTokenRange } from './markdown-code-highlight'
import { plainCodeTokenRanges } from './plain-code-tokens'

interface HighlightState {
  readonly source: string
  readonly language: string | null
  readonly owner: object | undefined
  readonly ranges: readonly CodeTokenRange[] | null
}

/** The sole original code text stream, shared by Messages, Plans and Files. */
export function MarkdownCodeContent({
  source,
  language,
  owner,
  previewEnd,
  collapsible,
  expanded,
  streaming = false,
}: {
  readonly source: string
  readonly language: string | null
  readonly owner?: object | undefined
  readonly previewEnd: number
  readonly collapsible: boolean
  readonly expanded: boolean
  readonly streaming?: boolean | undefined
}) {
  const [highlight, setHighlight] = useState<HighlightState | null>(null)
  useEffect(() => {
    if (streaming) return
    const controller = new AbortController()
    highlightMarkdownCode(source, language, controller.signal).then(
      (ranges) => {
        if (!controller.signal.aborted) setHighlight({ source, language, owner, ranges })
      },
      () => {
        if (!controller.signal.aborted) setHighlight({ source, language, owner, ranges: null })
      },
    )
    return () => controller.abort()
  }, [language, owner, source, streaming])
  // Fence at render as well as effect completion: a new source/owner must never
  // display a previous block's colored ranges for even one committed frame.
  const ranges =
    !streaming && highlight?.source === source && highlight.language === language && highlight.owner === owner
      ? highlight.ranges
      : null
  const fallback = useMemo(() => (ranges ? null : plainCodeTokenRanges(source)), [ranges, source])
  const reading = ranges ?? fallback
  const content = (start: number, end: number) =>
    reading
      ? reading.flatMap((range) => {
          const from = Math.max(start, range.start)
          const to = Math.min(end, range.end)
          return from < to
            ? [
                <LumenContentText context="message.inline" key={from} data-code-token={range.role}>
                  {source.slice(from, to)}
                </LumenContentText>,
              ]
            : []
        })
      : source.slice(start, end)
  return (
    <LumenText
      as="code"
      variant="code"
      data-code-highlight={ranges ? 'ready' : 'plain'}
      data-code-fallback={!ranges && fallback ? 'lexical' : undefined}
    >
      {content(0, previewEnd)}
      {collapsible && (
        <LumenContentText context="message.inline" data-code-tail="" hidden={!expanded}>
          {content(previewEnd, source.length)}
        </LumenContentText>
      )}
    </LumenText>
  )
}
