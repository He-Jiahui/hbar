export type CompareSource = { before: string; after: string }

export function parseUnifiedDiff(source: string): CompareSource | null {
  const before: string[] = []
  const after: string[] = []
  let inHunk = false
  for (const line of source.split(/\r?\n/)) {
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
  if (!inHunk) return null
  return { before: before.join('\n'), after: after.join('\n') }
}
