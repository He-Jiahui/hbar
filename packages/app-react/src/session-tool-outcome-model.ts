import type { SessionToolResult, SessionToolRow } from './session-message-model'

export type ToolDisplayOutcome =
  NonNullable<SessionToolResult['outcome']>['kind'] | 'legacy-error' | 'legacy-result' | 'pending'

/** Legacy errors have incomplete settlement evidence, not a confirmed failure. */
export function sessionToolOutcome(result: SessionToolResult | undefined): ToolDisplayOutcome {
  if (!result) return 'pending'
  return result.outcome?.kind ?? (result.isError ? 'legacy-error' : 'legacy-result')
}

/** The caller supplies canonical rows already joined/deduplicated by buildMessageRows. */
export function toolOutcomeCounts(rows: readonly SessionToolRow[]): Readonly<Record<ToolDisplayOutcome, number>> {
  const counts: Record<ToolDisplayOutcome, number> = {
    succeeded: 0,
    failed: 0,
    denied: 0,
    cancelled: 0,
    interrupted: 0,
    unknown: 0,
    'legacy-error': 0,
    'legacy-result': 0,
    pending: 0,
  }
  for (const row of rows) counts[sessionToolOutcome(row.result)] += 1
  return counts
}

/** Inspect only this prefix, including escape payloads/blank lines, regardless of output size. */
export const MAX_TOOL_ERROR_PREVIEW_SCAN_CHARACTERS = 8_192
/** The visible line is not shortened for layout; the extraction scan remains bounded. */
export const MAX_TOOL_ERROR_PREVIEW_CHARACTERS = MAX_TOOL_ERROR_PREVIEW_SCAN_CHARACTERS
type EscapeState = 'text' | 'escape' | 'intermediate' | 'csi' | 'string' | 'string-escape'

function firstVisibleLine(text: string): { text: string; truncated: boolean } {
  const output: string[] = []
  let state: EscapeState = 'text'
  let whitespace = false
  let inspected = 0
  for (const character of text) {
    if (inspected + character.length > MAX_TOOL_ERROR_PREVIEW_SCAN_CHARACTERS) break
    inspected += character.length
    const code = character.codePointAt(0) ?? 0
    if (state === 'string' || state === 'string-escape') {
      if (code === 7 || code === 0x9c || (state === 'string-escape' && character === '\\')) state = 'text'
      else state = code === 27 ? 'string-escape' : 'string'
      continue
    }
    if (code === 27) {
      state = 'escape'
      continue
    }
    if (state === 'escape') {
      if (character === '[') state = 'csi'
      else if (']PX^_'.includes(character)) state = 'string'
      else state = code >= 0x20 && code <= 0x2f ? 'intermediate' : 'text'
      continue
    }
    if (state === 'csi' || state === 'intermediate') {
      if (code >= (state === 'csi' ? 0x40 : 0x30) && code <= 0x7e) state = 'text'
      continue
    }
    if (code === 0x9b) {
      state = 'csi'
      continue
    }
    if ([0x90, 0x98, 0x9d, 0x9e, 0x9f].includes(code)) {
      state = 'string'
      continue
    }
    if (character === '\n' || character === '\r' || code === 0x2028 || code === 0x2029) {
      if (output.length) return { text: output.join(''), truncated: false }
      continue
    }
    if (/\s/u.test(character)) {
      whitespace = output.length > 0
      continue
    }
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) continue
    if (whitespace) output.push(' ')
    whitespace = false
    output.push(character)
  }
  return { text: output.join(''), truncated: inspected < text.length }
}

/** Only confirmed failures or explicitly incomplete legacy errors get a diagnostic preview. */
export function toolErrorPreview(result: SessionToolResult | undefined, fullContentLabel = ''): string {
  const outcome = sessionToolOutcome(result)
  if (!result || (outcome !== 'failed' && outcome !== 'legacy-error')) return ''
  const line = firstVisibleLine(result.text)
  if (!line.text) return ''
  // A bounded source preview must announce its original-content route. Without
  // Host copy, omit that preview rather than present a prefix as a complete line.
  if (line.truncated) return fullContentLabel ? `${line.text} · ${fullContentLabel}` : ''
  return line.text
}
