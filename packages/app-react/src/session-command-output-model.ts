/** Reference shell output starts with twelve lines; Copy always keeps the source. */
export const COMMAND_OUTPUT_PREVIEW_LINES = 12
export const COMMAND_OUTPUT_PREVIEW_CHARACTERS = 12_000

export interface CommandOutputWindow {
  readonly previewEnd: number
  readonly hiddenLines: number
  readonly collapsible: boolean
}

/** Original offsets, including CRLF and lone CR; never terminal byte emulation. */
export function commandOutputWindow(text: string): CommandOutputWindow {
  const breaks = /\r\n|\r|\n/g
  let count = 0
  let lineEnd = text.length
  let ending = 0
  for (const match of text.matchAll(breaks)) {
    count++
    ending = match.index + match[0].length
    if (count === COMMAND_OUTPUT_PREVIEW_LINES) lineEnd = ending
  }
  const lines = text.length ? count + (ending < text.length ? 1 : 0) : 0
  let previewEnd = Math.min(lineEnd, COMMAND_OUTPUT_PREVIEW_CHARACTERS)
  // Character capacity is only a visual window. Never cut an astral character
  // or a CRLF pair; the hidden tail and Copy retain the complete original.
  if (previewEnd < text.length && previewEnd > 0) {
    const before = text.charCodeAt(previewEnd - 1)
    const after = text.charCodeAt(previewEnd)
    if (
      (before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff) ||
      (text[previewEnd - 1] === '\r' && text[previewEnd] === '\n')
    )
      previewEnd--
  }
  return {
    previewEnd,
    hiddenLines: previewEnd === lineEnd ? Math.max(0, lines - COMMAND_OUTPUT_PREVIEW_LINES) : 0,
    collapsible: previewEnd < text.length,
  }
}
