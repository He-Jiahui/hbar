export interface MessageFileReference {
  readonly path: string
  readonly line?: number
  readonly column?: number
}

export type MessageFileReferenceSegment =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'file'; readonly value: string; readonly reference: MessageFileReference }

/**
 * File extensions that are useful in the workspace and unlikely to be prose.
 * A separator proves path shape, not that the token is a file. Require a
 * known file basename too, so slash prose and serialized `\\n` stay text.
 */
const LINKABLE_EXTENSIONS: ReadonlySet<string> = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'json',
  'jsonc',
  'md',
  'mdx',
  'txt',
  'yaml',
  'yml',
  'toml',
  'css',
  'html',
  'py',
  'rs',
  'go',
  'java',
  'c',
  'cc',
  'cpp',
  'h',
  'sh',
  'sql',
  'patch',
  'diff',
])

// These are common property/method names, not useful bare file references.
const AMBIGUOUS_STANDALONE_EXTENSIONS: ReadonlySet<string> = new Set([
  'log',
  'map',
  'conf',
  'cfg',
  'properties',
  'c',
  'h',
  'm',
  's',
  'r',
])

const COMMON_DOTFILES: ReadonlySet<string> = new Set([
  '.env',
  '.gitignore',
  '.gitattributes',
  '.dockerignore',
  '.editorconfig',
  '.npmrc',
  '.nvmrc',
  '.prettierrc',
  '.eslintrc',
  '.babelrc',
  '.zshrc',
  '.bashrc',
])

const COMMON_BARE_FILENAMES: ReadonlySet<string> = new Set([
  'Dockerfile',
  'Makefile',
  'Gemfile',
  'Rakefile',
  'Procfile',
  'Vagrantfile',
  'Brewfile',
  'Justfile',
  'CODEOWNERS',
  'LICENSE',
  'NOTICE',
])

const SEGMENT_RE = /^[\p{L}\p{N}._+@~_-]+$/u
const FILE_TOKEN_RE = /[\p{L}\p{N}._+@~][^\s"'`<>[\]{}(),;!?，。；：！？、]*/gu
const TRAILING_BOUNDARY_RE = /[.,;:!?，。；：！？、)\]}>'"`]+$/u
const MAX_FILE_PATH_LENGTH = 4000
const MAX_LOCATION = 2_000_000

function extensionOf(path: string): string {
  const basename = path.split('/').at(-1) ?? ''
  const dot = basename.lastIndexOf('.')
  return dot > 0 ? basename.slice(dot + 1).toLowerCase() : ''
}

function isDomainLikeFirstSegment(segment: string): boolean {
  return /^[A-Za-z0-9-]+\.[A-Za-z]{2,63}$/.test(segment)
}

function isLinkablePath(path: string, segments: readonly string[], hadSeparator: boolean): boolean {
  const basename = segments.at(-1) ?? ''
  const extension = extensionOf(path)
  const dotfile = basename.startsWith('.') && COMMON_DOTFILES.has(`.${basename.slice(1).split('.')[0]}`)

  if (hadSeparator && isDomainLikeFirstSegment(segments[0] ?? '')) return false
  if (dotfile || COMMON_BARE_FILENAMES.has(basename)) return true
  if (!extension || !LINKABLE_EXTENSIONS.has(extension)) return false
  return hadSeparator || !AMBIGUOUS_STANDALONE_EXTENSIONS.has(extension)
}

function lineSuffix(value: string): { readonly path: string; readonly line?: number; readonly column?: number } | null {
  const match = /:(\d+)(?::(\d+))?$/.exec(value)
  if (!match) return { path: value }
  const line = Number.parseInt(match[1] ?? '', 10)
  const columnText = match[2]
  const column = columnText === undefined ? undefined : Number.parseInt(columnText, 10)
  if (
    !Number.isSafeInteger(line) ||
    line < 1 ||
    line > MAX_LOCATION ||
    (column !== undefined && (!Number.isSafeInteger(column) || column < 1 || column > MAX_LOCATION))
  )
    return null
  return { path: value.slice(0, match.index), line, ...(column === undefined ? {} : { column }) }
}

/** Parse one complete workspace-relative file reference. */
export function parseMessageFileReference(value: string): MessageFileReference | null {
  const trimmed = value.trim()
  if (trimmed.length > MAX_FILE_PATH_LENGTH + 16) return null
  if (!trimmed || [...trimmed].some((character) => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127))
    return null

  const normalized = trimmed.replaceAll('\\', '/')
  const suffix = lineSuffix(normalized)
  if (!suffix) return null
  const rawPath = suffix.path

  // The Host accepts workspace-relative paths only. Keep URL/protocol syntax,
  // drive roots, home roots, and every parent segment out of the parser.
  if (
    !rawPath ||
    rawPath.startsWith('/') ||
    rawPath.startsWith('~') ||
    /^[A-Za-z]:/.test(rawPath) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(rawPath) ||
    rawPath.includes('://') ||
    rawPath.includes('#')
  )
    return null

  const rawSegments = rawPath.split('/')
  if (rawSegments.some((segment) => segment === '..' || segment === '')) return null
  const segments = rawSegments.filter((segment) => segment !== '.')
  if (!segments.length || segments.some((segment) => !SEGMENT_RE.test(segment))) return null

  const path = segments.join('/')
  if (path.length > MAX_FILE_PATH_LENGTH) return null
  if (!isLinkablePath(path, segments, rawPath.includes('/'))) return null
  return {
    path,
    ...(suffix.line === undefined ? {} : { line: suffix.line }),
    ...(suffix.column === undefined ? {} : { column: suffix.column }),
  }
}

function candidateEnd(value: string, start: number, end: number): number {
  const trailing = TRAILING_BOUNDARY_RE.exec(value.slice(start, end))
  return end - (trailing?.[0].length ?? 0)
}

function trimAttachedProsePrefix(value: string, start: number, end: number): number {
  const candidate = value.slice(start, end)
  const separator = candidate.search(/[\\/]/)
  const firstSegment = separator > 0 ? candidate.slice(0, separator) : candidate
  if (![...firstSegment].some((character) => character.charCodeAt(0) > 127)) return start
  const pathStart = firstSegment.search(/[A-Za-z0-9._+@~-]/)
  if (pathStart <= 0) return start
  return parseMessageFileReference(candidate.slice(pathStart)) ? start + pathStart : start
}

/** Split ordinary prose without changing its visible text. */
export function splitMessageFileReferences(value: string): readonly MessageFileReferenceSegment[] {
  if (!value) return []
  const segments: MessageFileReferenceSegment[] = []
  let cursor = 0
  FILE_TOKEN_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = FILE_TOKEN_RE.exec(value)) !== null) {
    const tokenStart = match.index
    if (tokenStart < cursor) {
      FILE_TOKEN_RE.lastIndex = cursor
      continue
    }
    const tokenEnd = candidateEnd(value, tokenStart, tokenStart + match[0].length)
    const start = trimAttachedProsePrefix(value, tokenStart, tokenEnd)
    const previous = start > 0 ? value[start - 1] : ''
    if (previous && /[A-Za-z0-9._+@~\\/:#-]/.test(previous)) continue

    const end = tokenEnd
    const raw = value.slice(start, end)
    const reference = parseMessageFileReference(raw)
    if (!reference) continue

    if (start > cursor) segments.push({ kind: 'text', value: value.slice(cursor, start) })
    segments.push({ kind: 'file', value: raw, reference })
    cursor = end
    FILE_TOKEN_RE.lastIndex = end
  }
  if (cursor < value.length) segments.push({ kind: 'text', value: value.slice(cursor) })
  return segments.length ? segments : [{ kind: 'text', value }]
}
