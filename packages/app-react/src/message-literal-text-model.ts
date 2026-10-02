export type MessageLiteralSegment =
  { readonly kind: 'text'; readonly value: string } | { readonly kind: 'url'; readonly value: string }

// Only a typed HTTP(S) address is interactive. Markdown destinations, file paths,
// HTML and other schemes stay authored text; CJK punctuation ends a prose URL.
const httpAddress =
  /https?:\/\/(?:\[[0-9a-f:.]+\]|[a-z0-9_-]+(?:\.[a-z0-9_-]+)*)(?::\d{1,5})?(?:[/?#][^\s<>"'`，。；、！？：）】》」』（【《「『“”‘’…]*)?/gi
const sentenceEnd = /[.,;:!?\]}]+$/

/** Link boundaries never remove or normalize characters from the visible text. */
export function messageLiteralSegments(text: string): readonly MessageLiteralSegment[] {
  const segments: MessageLiteralSegment[] = []
  let offset = 0
  for (const match of text.matchAll(httpAddress)) {
    let address = match[0].replace(sentenceEnd, '')
    let parenthesisBalance = 0
    for (const character of address) {
      if (character === '(') parenthesisBalance++
      else if (character === ')') parenthesisBalance--
    }
    let end = address.length
    while (parenthesisBalance < 0 && address[end - 1] === ')') {
      end--
      parenthesisBalance++
    }
    address = address.slice(0, end)
    // Reject a partial authority rather than linking a credential/oversized
    // port prefix to a different destination than the visible address.
    const following = text[match.index + match[0].length]
    if (following === '@' || following === ':' || (following !== undefined && /[\d_-]/.test(following))) continue
    try {
      const parsed = new URL(address)
      if (!parsed.hostname || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) continue
    } catch {
      continue
    }
    if (match.index > offset) segments.push({ kind: 'text', value: text.slice(offset, match.index) })
    segments.push({ kind: 'url', value: address })
    offset = match.index + address.length
  }
  if (offset < text.length) segments.push({ kind: 'text', value: text.slice(offset) })
  return segments
}
