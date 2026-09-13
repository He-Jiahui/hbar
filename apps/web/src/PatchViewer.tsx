import { useMemo } from 'react'
import { selectRendererSlot } from './ui-plugins'
import { useLocale } from './locale'
import RendererBoundary from './RendererBoundary'
import { useThemeSettings } from './theme-store'
import { referenceAttributes } from './react-bits'

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
  const preferredRenderer = useThemeSettings((state) => state.profile.renderer.patch)
  const renderer = selectRendererSlot('patch', language, preferredRenderer)
  const { t } = useLocale()
  if (renderer) {
    const CustomRenderer = renderer.component
    const FallbackRenderer = renderer.fallback
    return (
      <RendererBoundary source={source} fallback={FallbackRenderer ? <FallbackRenderer source={source} language={language} /> : undefined}>
        <CustomRenderer source={source} language={language} />
      </RendererBoundary>
    )
  }
  return (
    <pre
      {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/tool-calls/tool-calls-3', 'artifact')}
      className="patch-viewer"
      aria-label={t('patchDiff')}
    >
      {lines.map((line, index) => (
        <span className={`patch-line patch-line-${lineKind(line)}`} key={`${index}:${line}`}>
          {line || ' '}
          {index < lines.length - 1 ? '\n' : ''}
        </span>
      ))}
    </pre>
  )
}
