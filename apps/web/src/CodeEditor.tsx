import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, lineNumbers, highlightActiveLineGutter } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { keymap } from '@codemirror/view'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'

export default function CodeEditor({
  value,
  language = '',
  readOnly = true,
  onChange,
}: {
  value: string
  language?: string
  readOnly?: boolean
  onChange?: (value: string) => void
}) {
  const root = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null),
    initialValue = useRef(value),
    onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])
  useEffect(() => {
    if (!root.current) return
    const extension = /json/.test(language)
      ? json()
      : /md|markdown/.test(language)
        ? markdown()
        : javascript({ typescript: true, jsx: true })
    const editor = new EditorView({
      parent: root.current,
      state: EditorState.create({
        doc: initialValue.current,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          extension,
          oneDark,
          EditorState.readOnly.of(readOnly),
          EditorView.lineWrapping,
          EditorView.theme({
            '&': { fontSize: '12px', backgroundColor: 'var(--editor)' },
            '.cm-content': { fontFamily: 'var(--mono)', padding: '10px 0' },
            '.cm-gutters': { backgroundColor: 'var(--editor)', border: 'none' },
            '.cm-scroller': { overflow: 'auto' },
            '&.cm-focused': { outline: 'none' },
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current?.(update.state.doc.toString())
          }),
        ],
      }),
    })
    view.current = editor
    return () => {
      editor.destroy()
      view.current = null
    }
  }, [language, readOnly])
  useEffect(() => {
    const editor = view.current
    if (editor && editor.state.doc.toString() !== value)
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } })
  }, [value])
  return <div ref={root} className="code-editor" />
}
