import { useMemo } from 'react'
import { selectRendererSlot } from './ui-plugins'

type PatchLineKind = 'added' | 'removed' | 'hunk' | 'header' | 'context'

function lineKind(line: string): PatchLineKind {
  if (line.startsWith('@@')) return 'hunk'
  if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ')) return 'header'
  if (line.startsWith('+')) return 'added'
  if (line.startsWith('-')) return 'removed'
  return 'context'
}

export default function PatchViewer({ source, language = 'diff' }: { source: string; language?: string }) {
  const lines = useMemo(() => source.split('\n'), [source])
  const renderer = selectRendererSlot('patch', language)
  if (renderer) {
    const CustomRenderer = renderer.component
    return <CustomRenderer source={source} language={language} />
  }
  return (
    <pre className="patch-viewer" aria-label="Patch 差异">
      {lines.map((line, index) => (
        <span className={`patch-line patch-line-${lineKind(line)}`} key={`${index}:${line}`}>
          {line || ' '}
          {index < lines.length - 1 ? '\n' : ''}
        </span>
      ))}
    </pre>
  )
}
