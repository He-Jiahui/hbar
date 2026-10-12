export type LumenMarkdownInline = Readonly<{
  kind: 'text' | 'strong' | 'emphasis' | 'code'
  value: string
}>
export type LumenMarkdownBlock =
  | Readonly<{ kind: 'heading'; content: readonly LumenMarkdownInline[] }>
  | Readonly<{ kind: 'subheading'; content: readonly LumenMarkdownInline[] }>
  | Readonly<{ kind: 'paragraph'; content: readonly LumenMarkdownInline[] }>
  | Readonly<{ kind: 'quote'; content: readonly LumenMarkdownInline[] }>
  | Readonly<{
      kind: 'bullets' | 'numbers'
      items: readonly Readonly<{ marker: string; content: readonly LumenMarkdownInline[] }>[]
    }>

/** The source preview intentionally supports a small plain-text Markdown subset. Unknown syntax stays readable text. */
export function parseLumenReferenceMarkdown(source: string): readonly LumenMarkdownBlock[] {
  const inline = (text: string): readonly LumenMarkdownInline[] => {
    const tokens: LumenMarkdownInline[] = []
    const pattern = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g
    let position = 0
    for (const match of text.matchAll(pattern)) {
      const index = match.index
      if (index > position) tokens.push({ kind: 'text', value: text.slice(position, index) })
      if (match[1] !== undefined) tokens.push({ kind: 'strong', value: match[1] })
      else if (match[2] !== undefined) tokens.push({ kind: 'emphasis', value: match[2] })
      else if (match[3] !== undefined) tokens.push({ kind: 'code', value: match[3] })
      position = index + match[0].length
    }
    if (position < text.length) tokens.push({ kind: 'text', value: text.slice(position) })
    return tokens
  }
  return source
    .trim()
    .split(/\n\s*\n/)
    .flatMap((chunk): readonly LumenMarkdownBlock[] => {
      const lines = chunk
        .trim()
        .split('\n')
        .map((line) => line.trim())
      if (!lines.some(Boolean)) return []
      const text = lines.join(' ')
      if (text.startsWith('# ') && lines.length === 1) return [{ kind: 'heading', content: inline(text.slice(2)) }]
      if (text.startsWith('## ') && lines.length === 1) return [{ kind: 'subheading', content: inline(text.slice(3)) }]
      if (lines.every((line) => /^- /.test(line)))
        return [
          {
            kind: 'bullets',
            items: lines.map((line) => ({ marker: '', content: inline(line.slice(2)) })),
          },
        ]
      if (lines.every((line) => /^\d+\. /.test(line)))
        return [
          {
            kind: 'numbers',
            items: lines.map((line, index) => {
              const start = line.indexOf(' ')
              return { marker: `${index + 1}.`, content: inline(line.slice(start + 1)) }
            }),
          },
        ]
      if (text.startsWith('> ')) return [{ kind: 'quote', content: inline(text.slice(2)) }]
      return [{ kind: 'paragraph', content: inline(text) }]
    })
}

export function countLumenMarkdownWords(source: string): number {
  return source.trim() ? source.trim().split(/\s+/).length : 0
}
