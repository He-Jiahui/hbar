export type CompareSource = {
  before: string
  after: string
  kind?: 'text' | 'rename' | 'binary'
  oldPath?: string
  newPath?: string
  truncated?: boolean
}

export function parseUnifiedDiff(source: string, options: { truncated?: boolean } = {}): CompareSource | null {
  const before: string[] = []
  const after: string[] = []
  let inHunk = false
  let binary = false
  let renamed = false
  let oldPath: string | undefined
  let newPath: string | undefined
  for (const line of source.split(/\r?\n/)) {
    if (line.startsWith('diff --git ')) {
      const match = line.match(/^diff --git a\/(.+) b\/(.+)$/)
      if (match) {
        oldPath = match[1]
        newPath = match[2]
      }
      continue
    }
    if (line.startsWith('rename from ')) {
      renamed = true
      oldPath = line.slice('rename from '.length)
      continue
    }
    if (line.startsWith('rename to ')) {
      renamed = true
      newPath = line.slice('rename to '.length)
      continue
    }
    if (line.startsWith('Binary files ') || line === 'GIT binary patch') {
      binary = true
      continue
    }
    if (line.startsWith('@@')) {
      inHunk = true
      continue
    }
    if (!inHunk || line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) continue
    if (line.startsWith('\\')) continue
    if (line.startsWith(' ')) {
      const text = line.slice(1)
      before.push(text)
      after.push(text)
    } else if (line.startsWith('-')) before.push(line.slice(1))
    else if (line.startsWith('+')) after.push(line.slice(1))
  }
  if (!inHunk && !binary && !renamed) return null
  const result: CompareSource = {
    before: before.join('\n'),
    after: after.join('\n'),
    ...(binary ? { kind: 'binary' as const } : renamed ? { kind: 'rename' as const } : {}),
    ...((renamed || binary) && oldPath ? { oldPath } : {}),
    ...((renamed || binary) && newPath ? { newPath } : {}),
    ...(options.truncated ? { truncated: true } : {}),
  }
  return result
}
