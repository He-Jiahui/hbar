import { useEffect, useMemo, useRef } from 'react'
import { MergeView } from '@codemirror/merge'
import { EditorState } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import PatchViewer from './PatchViewer'
import { selectRendererSlot } from './ui-plugins'
import { parseUnifiedDiff } from './git-diff-parser'
import { useLocale } from './locale'
import RendererBoundary from './RendererBoundary'
import { useThemeSettings } from './theme-store'

const editorTheme = EditorView.theme({
  '&': {
    minHeight: '220px',
    maxHeight: 'min(70vh, 720px)',
    backgroundColor: 'var(--hbar-code)',
    color: 'var(--hbar-t1)',
    fontSize: 'var(--hbar-font-size-code)',
  },
  '.cm-content': { fontFamily: 'var(--dsh-font-family-code)', padding: '10px 0' },
  '.cm-gutters': { backgroundColor: 'var(--hbar-code)', color: 'var(--hbar-t3)', border: 'none' },
  '.cm-scroller': { overflow: 'auto' },
  '&.cm-focused': { outline: 'none' },
})

export default function GitDiffViewer({ source, path = '', truncated = false }: { source: string; path?: string; truncated?: boolean }) {
  const preferredRenderer = useThemeSettings((state) => state.profile.renderer['git-diff'])
  const rendererLanguage = path.includes('.') ? path.slice(path.lastIndexOf('.') + 1) : undefined
  const renderer = selectRendererSlot('git-diff', rendererLanguage, preferredRenderer)
  const compare = useMemo(() => parseUnifiedDiff(source, { truncated }), [source, truncated])
  const root = useRef<HTMLDivElement>(null)
  const { t } = useLocale()

  useEffect(() => {
    if (!root.current || !compare) return
    const readOnly = [EditorState.readOnly.of(true), EditorView.editable.of(false), lineNumbers(), editorTheme]
    const view = new MergeView({
      a: { doc: compare.before, extensions: readOnly },
      b: { doc: compare.after, extensions: readOnly },
      parent: root.current,
      orientation: 'a-b',
      highlightChanges: true,
      gutter: true,
      collapseUnchanged: { margin: 3, minSize: 4 },
      diffConfig: { scanLimit: 500 },
    })
    return () => view.destroy()
  }, [compare])

  if (renderer) {
    const CustomRenderer = renderer.component
    const FallbackRenderer = renderer.fallback
    return (
      <RendererBoundary source={source} fallback={FallbackRenderer ? <FallbackRenderer source={source} language={path} /> : undefined}>
        <CustomRenderer source={source} language={path} />
      </RendererBoundary>
    )
  }
  if (compare?.kind === 'binary') {
    return <div className="git-diff-notice" role="status">{t('binaryDiff')}</div>
  }
  const renameNotice = compare?.kind === 'rename' && !compare.before && !compare.after
    ? `${t('renamedFile')}: ${compare.oldPath ?? path} → ${compare.newPath ?? path}`
    : null
  if (!compare) return <PatchViewer source={source} language={path || 'diff'} />
  return (
    <div className="git-diff-render">
      {(renameNotice || compare.truncated) && <div className="git-diff-notice" role="status">{renameNotice ?? t('truncatedDiff')}</div>}
      <div ref={root} className="git-compare-view" aria-label={t('gitComparison')} />
    </div>
  )
}
