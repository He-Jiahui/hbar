import { useEffect, useMemo, useRef } from 'react'
import { MergeView } from '@codemirror/merge'
import { EditorState } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import PatchViewer from './PatchViewer'
import { selectRendererSlot } from './ui-plugins'
import { parseUnifiedDiff } from './git-diff-parser'

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

export default function GitDiffViewer({ source, path = '' }: { source: string; path?: string }) {
  const renderer = selectRendererSlot('git-diff', path)
  const compare = useMemo(() => parseUnifiedDiff(source), [source])
  const root = useRef<HTMLDivElement>(null)

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
    return <CustomRenderer source={source} language={path} />
  }
  if (!compare) return <PatchViewer source={source} language={path || 'diff'} />
  return <div ref={root} className="git-compare-view" aria-label="Git before and after comparison" />
}
