import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, lineNumbers, highlightActiveLineGutter } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { keymap } from '@codemirror/view'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { referenceAttributes } from './react-bits'

const themeSyntax = syntaxHighlighting(HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--hbar-ac)' },
  { tag: [tags.name, tags.variableName], color: 'var(--hbar-t1)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--hbar-ok)' },
  { tag: tags.comment, color: 'var(--hbar-t3)' },
  { tag: tags.number, color: 'var(--hbar-info)' },
  { tag: tags.operator, color: 'var(--hbar-ac2)' },
  { tag: tags.typeName, color: 'var(--hbar-highlight)' },
]))

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
          themeSyntax,
          EditorState.readOnly.of(readOnly),
          EditorView.lineWrapping,
          EditorView.theme({
            '&': { fontSize: 'var(--hbar-font-size-code)', backgroundColor: 'var(--hbar-code)' },
            '.cm-content': { fontFamily: 'var(--dsh-font-family-code)', padding: '10px 0', color: 'var(--hbar-t1)' },
            '.cm-gutters': { backgroundColor: 'var(--hbar-code)', border: 'none', color: 'var(--hbar-t3)' },
            '.cm-activeLineGutter': { backgroundColor: 'var(--hbar-s1)', color: 'var(--hbar-t1)' },
            '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--hbar-ac) 8%, transparent)' },
            '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'color-mix(in srgb, var(--hbar-ac) 25%, transparent)' },
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
  return (
    <div
      {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/editor', 'artifact')}
      ref={root}
      className="code-editor"
    />
  )
}
