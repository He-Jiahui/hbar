import { messageLiteralSegments } from './message-literal-text-model'

/** Operator prompts are literal text, not Markdown documents or code previews. */
export function MessageLiteralText({ text }: { readonly text: string }) {
  return (
    <p className="hbar-session-message-literal">
      {messageLiteralSegments(text).map((segment, index) =>
        segment.kind === 'url' ? (
          <a key={index} href={segment.value} target="_blank" rel="noreferrer noopener">
            {segment.value}
          </a>
        ) : (
          segment.value
        ),
      )}
    </p>
  )
}
