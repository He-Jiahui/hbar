import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap } from '@codemirror/commands'
import { LumenContentText, LumenFrame } from '@lumen/app-ui'
import type { ResourceTextEntry } from './resource-browser-controller'
import './ResourceFileEditor.css'
export function ResourceFileEditor({ entry }: { readonly entry: ResourceTextEntry }) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const parent = root.current
    if (!parent) return
    const state = EditorState.create({
      doc: entry.text,
      extensions: [
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        lineNumbers(),
        EditorView.lineWrapping,
        keymap.of(defaultKeymap),
        EditorView.contentAttributes.of({ 'aria-label': entry.candidate.name, tabindex: '0' }),
      ],
    })
    const view = new EditorView({ parent, state })
    if (entry.line !== null) {
      const line = state.doc.line(Math.min(entry.line, state.doc.lines))
      const position = Math.min(line.to, line.from + Math.max(0, (entry.column ?? 1) - 1))
      view.dispatch({ selection: { anchor: position }, effects: EditorView.scrollIntoView(position, { y: 'center' }) })
    }
    return () => view.destroy()
  }, [entry])
  return (
    <LumenFrame className="hbar-resource-file">
      <LumenContentText context="section.description" className="hbar-resource-file-path">
        {entry.candidate.location}
      </LumenContentText>
      <LumenFrame ref={root} className="hbar-resource-file-editor" />
    </LumenFrame>
  )
}
