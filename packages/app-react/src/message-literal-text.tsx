import { messageLiteralSegments } from './message-literal-text-model'
import { LumenFrame, LumenText } from '@lumen/app-ui'
import { splitMessageFileReferences } from './message-file-reference-model'
import { MessageFileReferenceLink, type MessageFileReferenceContext } from './message-file-reference'
import { MessageImagePreview } from './message-image-preview'
import { imageLinkSource, MAX_MESSAGE_IMAGE_PREVIEWS } from './message-image-preview-model'
import { splitResourceReferences } from './message-resource-model'
import { MessageResourceLink, useMessageResources } from './message-resource'

/** Operator prompts are literal text, not Markdown documents or code previews. */
export function MessageLiteralText({
  text,
  fileReferences,
}: {
  readonly text: string
  readonly fileReferences?: MessageFileReferenceContext | undefined
}) {
  const resources = useMessageResources()
  if (resources && fileReferences?.source)
    return (
      <LumenText as="p" className="hbar-session-message-literal">
        {splitResourceReferences(text).map((part, index) =>
          part.kind === 'resource' ? (
            <MessageResourceLink key={index} reference={part.reference} context={fileReferences}>
              {part.value}
            </MessageResourceLink>
          ) : (
            part.value
          ),
        )}
      </LumenText>
    )
  const parts = messageLiteralSegments(text)
  const previewIndices = new Set(
    parts
      .flatMap((part, index) => (part.kind === 'url' && imageLinkSource(part.value) ? [index] : []))
      .slice(0, MAX_MESSAGE_IMAGE_PREVIEWS),
  )
  return (
    <LumenText as="p" className="hbar-session-message-literal">
      {parts.map((segment, index) =>
        segment.kind === 'url' ? (
          <LumenFrame
            as="span"
            key={index}
            className={previewIndices.has(index) ? 'hbar-message-image-link' : undefined}
          >
            <LumenFrame as="a" href={segment.value} target="_blank" rel="noreferrer noopener">
              {segment.value}
            </LumenFrame>
            {previewIndices.has(index) && <MessageImagePreview source={segment.value} />}
          </LumenFrame>
        ) : fileReferences ? (
          splitMessageFileReferences(segment.value).map((part, ordinal) =>
            part.kind === 'file' ? (
              <MessageFileReferenceLink key={ordinal} reference={part.reference} context={fileReferences}>
                {part.value}
              </MessageFileReferenceLink>
            ) : (
              part.value
            ),
          )
        ) : (
          segment.value
        ),
      )}
    </LumenText>
  )
}
