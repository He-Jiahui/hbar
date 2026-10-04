import type { HighlighterCore, ThemedToken, ThemeRegistration } from 'shiki/core'

export const MAX_CODE_HIGHLIGHT_CHARACTERS = 65_536
export const MAX_CODE_HIGHLIGHT_LINES = 512
export const MAX_CODE_HIGHLIGHT_LINE_CHARACTERS = 4_096
export const MAX_CODE_HIGHLIGHT_TOKENS = 8_192
export const MAX_CODE_HIGHLIGHT_ACTIVE = 4
export const MAX_CODE_HIGHLIGHT_PENDING = 32

export type CodeTokenRole =
  | 'plain'
  | 'comment'
  | 'string'
  | 'keyword'
  | 'function'
  | 'type'
  | 'number'
  | 'property'
  | 'punctuation'
  | 'inserted'
  | 'deleted'

export interface CodeTokenRange {
  readonly start: number
  readonly end: number
  readonly role: CodeTokenRole
}

// Colors are an internal role encoding, never copied as untrusted DOM styles.
// The CSS palette adapts those roles to the host's current color scheme.
const colorRoles: Readonly<Record<string, CodeTokenRole>> = {
  '#111111': 'plain',
  '#8A8478': 'comment',
  '#437220': 'string',
  '#B8533B': 'keyword',
  '#1D5A8C': 'function',
  '#7E5520': 'type',
  '#1B7A6A': 'number',
  '#7A3E20': 'property',
  '#5C504A': 'punctuation',
  '#227341': 'inserted',
  '#B23B35': 'deleted',
}
const theme: ThemeRegistration = {
  name: 'hbar-reading',
  type: 'light',
  fg: '#111111',
  bg: '#FFFFFF',
  settings: [
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: '#8A8478' } },
    { scope: ['string'], settings: { foreground: '#437220' } },
    { scope: ['keyword', 'storage'], settings: { foreground: '#B8533B' } },
    { scope: ['entity.name.function', 'support.function'], settings: { foreground: '#1D5A8C' } },
    {
      scope: ['entity.name.type', 'support.type', 'support.class', 'entity.name.class', 'entity.other.inherited-class'],
      settings: { foreground: '#7E5520' },
    },
    { scope: ['variable'], settings: { foreground: '#111111' } },
    {
      scope: [
        'variable.other.property',
        'support.type.property-name',
        'meta.object-literal.key',
        'entity.other.attribute-name',
      ],
      settings: { foreground: '#7A3E20' },
    },
    {
      scope: ['variable.other.constant', 'variable.other.enummember', 'meta.decorator'],
      settings: { foreground: '#7E5520' },
    },
    {
      scope: ['constant.numeric', 'constant.language', 'entity.name.type.parameter'],
      settings: { foreground: '#1B7A6A' },
    },
    { scope: ['punctuation', 'meta.brace', 'meta.bracket'], settings: { foreground: '#5C504A' } },
    { scope: ['entity.name.tag', 'punctuation.definition.tag'], settings: { foreground: '#B8533B' } },
    { scope: ['markup.inserted'], settings: { foreground: '#227341' } },
    { scope: ['markup.deleted'], settings: { foreground: '#B23B35' } },
  ],
}

/** Validate the third-party token stream against the original UTF-16 source.
 * Newlines/blank lines are original gaps, not synthesized line joins.
 * Any mismatch falls back atomically to plaintext rather than dropping text.
 */
export function codeTokenRanges(
  source: string,
  lines: readonly (readonly ThemedToken[])[],
): readonly CodeTokenRange[] | null {
  const ranges: CodeTokenRange[] = []
  let cursor = 0
  let count = 0
  for (const line of lines) {
    for (const token of line) {
      if (++count > MAX_CODE_HIGHLIGHT_TOKENS) return null
      const start = token.offset
      const end = start + token.content.length
      if (
        !Number.isSafeInteger(start) ||
        start < cursor ||
        end > source.length ||
        source.slice(start, end) !== token.content
      )
        return null
      if (start > cursor) {
        if (!/^[\r\n]*$/.test(source.slice(cursor, start))) return null
        ranges.push({ start: cursor, end: start, role: 'plain' })
      }
      if (end > start) ranges.push({ start, end, role: colorRoles[token.color?.toUpperCase() ?? ''] ?? 'plain' })
      cursor = end
    }
  }
  if (cursor < source.length) {
    if (!/^[\r\n]*$/.test(source.slice(cursor))) return null
    ranges.push({ start: cursor, end: source.length, role: 'plain' })
  }
  return ranges
}

export function canHighlightCode(source: string): boolean {
  if (!source || source.length > MAX_CODE_HIGHLIGHT_CHARACTERS) return false
  const lines = source.split(/\r\n|\r|\n/)
  return (
    lines.length <= MAX_CODE_HIGHLIGHT_LINES && lines.every((line) => line.length <= MAX_CODE_HIGHLIGHT_LINE_CHARACTERS)
  )
}

let runtime: Promise<HighlighterCore> | undefined
const grammars = new Map<string, Promise<void>>()
function highlighter(): Promise<HighlighterCore> {
  runtime ??= Promise.all([import('shiki/core'), import('shiki/engine/javascript')]).then(([core, engine]) =>
    core.createHighlighterCore({
      themes: [theme],
      langs: [],
      engine: engine.createJavaScriptRegexEngine({ forgiving: true }),
    }),
  )
  return runtime
}

interface HighlightJob {
  readonly source: string
  readonly language: string
  readonly signal: AbortSignal
  readonly finish: (ranges: readonly CodeTokenRange[] | null) => void
}
const pending: HighlightJob[] = []
let active = 0

async function tokenize(job: HighlightJob): Promise<readonly CodeTokenRange[] | null> {
  const { bundledLanguagesInfo } = await import('shiki/langs')
  if (job.signal.aborted) return null
  // Only the pinned, local bundled registry can supply grammars. Unknown fence
  // labels are data, never import paths or user-provided grammar definitions.
  const language = bundledLanguagesInfo.find(
    (entry) => entry.id === job.language || entry.aliases?.includes(job.language),
  )
  if (!language) return null
  const instance = await highlighter()
  if (job.signal.aborted) return null
  let grammar = grammars.get(language.id)
  if (!grammar) {
    grammar = instance.loadLanguage(language.import).catch((error: unknown) => {
      grammars.delete(language.id)
      throw error
    })
    grammars.set(language.id, grammar)
  }
  await grammar
  if (job.signal.aborted) return null
  return codeTokenRanges(
    job.source,
    instance.codeToTokensBase(job.source, {
      lang: language.id,
      theme: 'hbar-reading',
      // Match Shiki's default advisory per-line budget: grammar compilation on
      // first use can exceed a tiny budget and corrupt subsequent line scopes.
      // This is not a hard CPU deadline; input and queue capacities are bounded.
      tokenizeTimeLimit: 500,
    }),
  )
}

function drain(): void {
  while (active < MAX_CODE_HIGHLIGHT_ACTIVE && pending.length) {
    const job = pending.shift()
    if (!job) return
    if (job.signal.aborted) {
      job.finish(null)
      continue
    }
    active++
    // Active grammar loads retain their physical slot until actually settled.
    tokenize(job)
      .then(
        (result) => job.finish(job.signal.aborted ? null : result),
        () => job.finish(null),
      )
      .finally(() => {
        active--
        drain()
      })
      .catch(() => job.finish(null))
  }
}

/** Visual enrichment only; every failure/capacity/cancel result is plaintext. */
export function highlightMarkdownCode(
  source: string,
  language: string | null,
  signal: AbortSignal,
): Promise<readonly CodeTokenRange[] | null> {
  if (
    signal.aborted ||
    !language ||
    language.length > 64 ||
    !canHighlightCode(source) ||
    pending.length >= MAX_CODE_HIGHLIGHT_PENDING
  )
    return Promise.resolve(null)
  return new Promise((resolve) => {
    const finish = (ranges: readonly CodeTokenRange[] | null) => {
      signal.removeEventListener('abort', cancel)
      resolve(ranges)
    }
    const cancel = () => {
      const index = pending.indexOf(job)
      if (index >= 0) pending.splice(index, 1)
      finish(null)
    }
    const job: HighlightJob = { source, language: language.toLowerCase(), signal, finish }
    signal.addEventListener('abort', cancel, { once: true })
    pending.push(job)
    drain()
  })
}
