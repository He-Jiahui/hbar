import { useMemo } from 'react'
import { LumenFrame } from '@lumen/app-ui'
import { messageLiteralSegments } from './message-literal-text-model'
import { imageLinkSource, MAX_MESSAGE_IMAGE_PREVIEWS } from './message-image-preview-model'
import { MessageImagePreview } from './message-image-preview'
import { MessageResourceLink, useMessageResources, useMessageResourceSource } from './message-resource'
import { splitResourceReferences } from './message-resource-model'

/** A bounded media supplement leaves exact, copyable source output intact. */
export function ToolOutputImageLinks({ text }: { readonly text: string }) {
  const resources = useMessageResources()
  const context = useMessageResourceSource()
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
  if (resources && context?.source) {
    const trimmed = text.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        JSON.parse(trimmed)
        return null
      } catch {
        /* Readable prose retains resource references. */
      }
    }
    const refs = splitResourceReferences(text)
      .filter((part) => part.kind === 'resource')
      .slice(0, MAX_MESSAGE_IMAGE_PREVIEWS)
    if (!refs.length) return null
    return (
      <LumenFrame className="hbar-tool-output-image-links" data-session-find-exclude="resource-navigation">
        {refs.map((part, index) => (
          <MessageResourceLink key={index} reference={part.reference} context={context}>
            {part.value}
          </MessageResourceLink>
        ))}
      </LumenFrame>
    )
  }
  if (!sources.length) return null
  return (
    <LumenFrame className="hbar-tool-output-image-links">
      {sources.map((source, ordinal) => (
        <MessageImagePreview key={`${ordinal}:${source}`} source={source} />
      ))}
    </LumenFrame>
  )
}
