export type LumenCodeToken = Readonly<{
  kind: 'plain' | 'keyword' | 'type' | 'function' | 'string' | 'number' | 'comment'
  value: string
}>

const keywords = new Set([
  'import',
  'from',
  'export',
  'type',
  'const',
  'let',
  'function',
  'async',
  'await',
  'for',
  'of',
  'if',
  'else',
  'continue',
  'break',
  'return',
  'new',
  'void',
])
const primitiveTypes = new Set(['string', 'number', 'boolean', 'unknown', 'any'])
const tokenPattern = /\/\/.*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b\d[\d_]*\b|\b[A-Za-z_$][\w$]*\b/g

/** A visual TypeScript preview only; this deliberately does not evaluate or edit code. */
export function tokenizeLumenCodeLine(line: string): readonly LumenCodeToken[] {
  const tokens: LumenCodeToken[] = []
  let position = 0
  for (const match of line.matchAll(tokenPattern)) {
    const index = match.index
    if (index > position) tokens.push({ kind: 'plain', value: line.slice(position, index) })
    const value = match[0]
    let kind: LumenCodeToken['kind'] = 'plain'
    if (value.startsWith('//')) kind = 'comment'
    else if (value.startsWith('"') || value.startsWith("'")) kind = 'string'
    else if (/^\d/.test(value)) kind = 'number'
    else if (keywords.has(value) && (value !== 'from' || line.trimStart().startsWith('import '))) kind = 'keyword'
    else if (primitiveTypes.has(value) || /^[A-Z][a-z]/.test(value)) kind = 'type'
    else if (/^\s*\(/.test(line.slice(index + value.length))) kind = 'function'
    tokens.push({ kind, value })
    position = index + value.length
  }
  if (position < line.length) tokens.push({ kind: 'plain', value: line.slice(position) })
  return tokens
}

export function uniqueLumenCodeFiles<T extends { readonly id: string }>(files: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return files.filter((file) => {
    if (seen.has(file.id)) return false
    seen.add(file.id)
    return true
  })
}
