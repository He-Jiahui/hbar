/** Visual projection only. The persisted result and Copy source never change. */
export const MAX_COMMAND_READING_CHARACTERS = 1_000_000

export interface CommandReadingProjection {
  readonly text: string
  readonly changed: boolean
}

function controlEnd(text: string, start: number): number | null {
  let cursor = start
  const first = text.charCodeAt(cursor++)
  const kind = first === 0x1b ? text.charCodeAt(cursor++) : first
  if (kind === 0x5b || kind === 0x9b) {
    // CSI parameters, intermediates, then one final byte. Not a cursor emulator.
    while (cursor < text.length && text.charCodeAt(cursor) >= 0x30 && text.charCodeAt(cursor) <= 0x3f) cursor++
    while (cursor < text.length && text.charCodeAt(cursor) >= 0x20 && text.charCodeAt(cursor) <= 0x2f) cursor++
    const final = text.charCodeAt(cursor)
    return final >= 0x40 && final <= 0x7e ? cursor + 1 : null
  }
  if ([0x5d, 0x50, 0x58, 0x5e, 0x5f, 0x9d, 0x90, 0x98, 0x9e, 0x9f].includes(kind)) {
    // OSC/DCS/SOS/PM/APC strings. Missing termination falls back to raw, not
    // silently swallowing the rest of an incomplete or malformed diagnostic.
    while (cursor < text.length) {
      const code = text.charCodeAt(cursor)
      if (code === 7 || code === 0x9c) return cursor + 1
      if (code === 0x1b && text[cursor + 1] === '\\') return cursor + 2
      cursor++
    }
    return null
  }
  if (first === 0x1b) {
    let final = kind
    while (final >= 0x20 && final <= 0x2f) final = text.charCodeAt(cursor++)
    return final >= 0x30 && final <= 0x7e ? cursor : null
  }
  return cursor
}

function stripControls(text: string): string | null {
  const chunks: string[] = []
  let start = 0
  let cursor = 0
  while (cursor < text.length) {
    const code = text.charCodeAt(cursor)
    if ((code < 0x20 && code !== 9 && code !== 10 && code !== 13) || (code >= 0x7f && code <= 0x9f)) {
      const end =
        code === 0x1b || [0x90, 0x98, 0x9b, 0x9d, 0x9e, 0x9f].includes(code) ? controlEnd(text, cursor) : cursor + 1
      if (end === null) return null
      chunks.push(text.slice(start, cursor))
      start = end
      cursor = end
    } else cursor++
  }
  chunks.push(text.slice(start))
  return chunks.join('')
}

/** Plain text/CRLF stays byte-for-byte unchanged. Lone CR selects the final
 * frame on that line, as in the CC reference, without pretending to execute
 * erase/cursor commands, render links, or provide an interactive terminal. */
export function projectCommandReading(raw: string): CommandReadingProjection {
  const original = { text: raw, changed: false }
  if (raw.length > MAX_COMMAND_READING_CHARACTERS) return original
  const stripped = stripControls(raw)
  if (stripped === null) return original
  const lines: string[] = []
  let start = 0
  let rewritten = false
  for (let cursor = 0; cursor < stripped.length; cursor++) {
    if (stripped[cursor] === '\r' && stripped[cursor + 1] !== '\n') {
      start = cursor + 1
      rewritten = true
    } else if (stripped[cursor] === '\n') {
      lines.push(stripped.slice(start, cursor + 1))
      start = cursor + 1
    }
  }
  const text = rewritten ? [...lines, stripped.slice(start)].join('') : stripped
  return { text, changed: text !== raw }
}
