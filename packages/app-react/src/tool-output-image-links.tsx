import { useMemo } from 'react'
import { LumenFrame } from '@lumen/app-ui'
import { messageLiteralSegments } from './message-literal-text-model'
import { imageLinkSource, MAX_MESSAGE_IMAGE_PREVIEWS } from './message-image-preview-model'
import { MessageImagePreview } from './message-image-preview'

/** A bounded media supplement leaves exact, copyable source output intact. */
export function ToolOutputImageLinks({ text }: { readonly text: string }) {
  const sources = useMemo(
    () =>
      messageLiteralSegments(text)
        .flatMap((part) => {
          const source = part.kind === 'url' ? imageLinkSource(part.value) : null
          return source ? [source] : []
        })
        .slice(0, MAX_MESSAGE_IMAGE_PREVIEWS),
    [text],
  )
  if (!sources.length) return null
  return (
    <LumenFrame className="hbar-tool-output-image-links">
      {sources.map((source, ordinal) => (
        <MessageImagePreview key={`${ordinal}:${source}`} source={source} />
      ))}
    </LumenFrame>
  )
}
