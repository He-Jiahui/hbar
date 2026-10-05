import {
  canHighlightCode,
  MAX_CODE_HIGHLIGHT_TOKENS,
  type CodeTokenRange,
  type CodeTokenRole,
} from './markdown-code-highlight'

// Reading hints only: these lexemes never decide a tool's outcome or execution state.
const lexemes =
  /https?:\/\/[^\s<>"'`]+|(?<![\p{L}\p{N}_<>])(?:[A-Za-z]:[\\/]|\.{0,2}\/)[^\s<>"'`]+|[\p{L}\p{N}_-]+\.(?:[cm]?[jt]sx?|json|ya?ml|md|css|html|log|py|rs|go|toml)(?::\d+(?::\d+)?)?|"(?:\\[^\r\n]|[^"\\\r\n])*"|'(?:\\[^\r\n]|[^'\\\r\n])*'|`[^`\r\n]*`|\b(?:const|let|var|function|return|import|export|class|interface|type|async|await|throw|new|if|else|true|false|null|undefined)\b|\b(?:ERROR|WARN(?:ING)?|INFO|DEBUG)(?=[:\s])|\b(?:0x[\da-f]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b/giu

function role(value: string, following: string): CodeTokenRole {
  if (/^https?:\/\//i.test(value)) return 'link'
  if (
    /^(?:[A-Za-z]:[\\/]|\.{0,2}\/)/.test(value) ||
    /\.(?:[cm]?[jt]sx?|json|ya?ml|md|css|html|log|py|rs|go|toml)(?::\d+(?::\d+)?)?$/i.test(value)
  )
    return 'path'
  if (/^["'`]/.test(value)) return /^\s*:/.test(following) ? 'property' : 'string'
  if (/^\d/.test(value)) return 'number'
  if (/^ERROR$/i.test(value)) return 'deleted'
  if (/^WARN(?:ING)?$/i.test(value)) return 'type'
  if (/^INFO$/i.test(value)) return 'function'
  if (/^DEBUG$/i.test(value)) return 'comment'
  return 'keyword'
}

/** Bounded exact source ranges for live code and untyped tool logs; no source is rewritten. */
export function plainCodeTokenRanges(source: string): readonly CodeTokenRange[] | null {
  if (!canHighlightCode(source)) return null
  const ranges: CodeTokenRange[] = []
  let cursor = 0
  for (const match of source.matchAll(lexemes)) {
    const start = match.index
    const end = start + match[0].length
    if (start > cursor) ranges.push({ start: cursor, end: start, role: 'plain' })
    ranges.push({ start, end, role: role(match[0], source.slice(end, end + 128)) })
    if (ranges.length > MAX_CODE_HIGHLIGHT_TOKENS) return null
    cursor = end
  }
  if (cursor < source.length) ranges.push({ start: cursor, end: source.length, role: 'plain' })
  return ranges.length <= MAX_CODE_HIGHLIGHT_TOKENS ? ranges : null
}

/** A JSON grammar is selected only for a bounded, complete serialized object or array. */
export function serializedReadingLanguage(source: string): 'json' | null {
  if (!canHighlightCode(source)) return null
  const first = source.trimStart()[0]
  if (first !== '{' && first !== '[') return null
  try {
    const value: unknown = JSON.parse(source)
    return typeof value === 'object' && value !== null ? 'json' : null
  } catch {
    return null
  }
}
