import { Bold, Code2, Italic, Link2, Redo2, Strikethrough, Undo2 } from 'lucide-react'
import { useState } from 'react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './editor-1.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/editor/editor-1. */
export default function Editor1({ onInteraction }: ReferenceFixtureProps) {
  const [title, setTitle] = useState('Audit ledger design notes')
  const [body, setBody] = useState('Halcyon writes every permission change to an append-only ledger. Each entry records the actor, the resource, the previous value and the reason supplied at the time of the change.\n\nEntries are immutable. A correction is a new entry that supersedes the old one, which means the history of a resource can always be replayed exactly as it happened.\n\nRetention follows the workspace plan: ninety days on Team, one year on Scale, and seven years on Enterprise.')
  const [saved, setSaved] = useState(true)
  const [format, setFormat] = useState('Paragraph')
  return <section className="rb-public-editor-1" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><header className="rb-editor-toolbar"><button type="button" className="format" onClick={() => setFormat(format === 'Paragraph' ? 'Heading 1' : 'Paragraph')}>{format}<span>⌄</span></button><button type="button" aria-label="Bold"><Bold size={15} /></button><button type="button" aria-label="Italic"><Italic size={15} /></button><button type="button" aria-label="Strikethrough"><Strikethrough size={15} /></button><button type="button" aria-label="Inline code"><Code2 size={15} /></button><button type="button" aria-label="Link"><Link2 size={15} /></button><i /><button type="button" aria-label="Undo"><Undo2 size={15} /></button><button type="button" aria-label="Redo"><Redo2 size={15} /></button><span className={saved ? 'saved' : ''}>{saved ? 'Saved' : 'Unsaved'}</span></header><main className="rb-editor-document"><input aria-label="Document title" value={title} onChange={(event) => { setTitle(event.target.value); setSaved(false) }} /><p>Draft by Ana Reyes · last edited 4 minutes ago</p><textarea aria-label="Document body" value={body} onChange={(event) => { setBody(event.target.value); setSaved(false) }} /><footer><span>{body.split(/\s+/).filter(Boolean).length} words</span><span>{body.length} characters</span><span>1 min read</span><span>Markdown shortcuts are on</span></footer></main><button type="button" className="rb-editor-theme">◉&nbsp; Theme</button></section>
}
