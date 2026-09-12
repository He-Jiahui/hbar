import { ChevronDown, ChevronRight, File, Folder, FolderOpen, Grid2X2, List, MoreHorizontal, Search, Star, Upload, Users } from 'lucide-react'
import { useState } from 'react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './file-manager-1.css'

const rows = [
  ['Brand Library', 'folder', '102.2 MB', 'Last week', 'TP', 'Theo Park', '8 items'],
  ['brand-tokens.json', 'json', '64.0 KB', 'Last week', 'KT', 'Kenji Tan', ''],
  ['Client Deliverables', 'folder-star', '482.2 MB', 'Yesterday', 'PP', 'Priya Patel', '11 items'],
  ['Harbor menu board.pdf', 'pdf', '5.4 MB', '2 days ago', 'MS', 'Mira Stone', ''],
  ['New Hire Onboarding.pdf', 'pdf', '16.0 MB', '3 weeks ago', 'MS', 'Mira Stone', ''],
  ['Northwind key visual.png', 'image', '12.4 MB', 'Today', 'PP', 'Priya Patel', ''],
  ['Q3 Studio Plan.pdf', 'pdf-star', '11.0 MB', 'Today', 'NV', 'Nora Vale', ''],
  ['specimen-grotesk.pdf', 'pdf', '3.1 MB', 'Yesterday', 'KT', 'Kenji Tan', ''],
  ['Spring Campaign', 'folder-star', '988.2 MB', 'Today', 'LG', 'Leo Grant', '10 items'],
  ['Studio Operations', 'folder', '246.0 MB', '2 days ago', 'NV', 'Nora Vale', '4 items'],
  ['Studio Reel 2026.mp4', 'video', '64.0 MB', 'Today', 'LG', 'Leo Grant', ''],
] as const

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/file-manager/file-manager-1. */
export default function FileManager1({ onInteraction }: ReferenceFixtureProps) {
  const [selected, setSelected] = useState('My Drive')
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'list' | 'grid'>('list')
  const [uploaded, setUploaded] = useState(false)
  const visible = rows.filter(([name]) => name.toLowerCase().includes(query.toLowerCase()))
  return <section className="rb-public-file-manager-1" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}>
    <div className="rb-file-frame">
      <header className="rb-file-header"><div><h2>Halcyon Drive</h2><p>Shared studio files and folders</p></div><div className="rb-file-header-actions"><button type="button" onClick={() => setUploaded(true)}><Folder size={14} /> New folder</button><button type="button" className="primary" onClick={() => setUploaded(true)}><Upload size={14} /> {uploaded ? 'Uploaded' : 'Upload'}</button></div></header>
      <div className="rb-file-body">
        <aside className="rb-file-sidebar">
          <ul className="rb-file-tree"><li><div className={`rb-file-tree-row ${selected === 'My Drive' ? 'selected' : ''}`}><button type="button" className="tree-caret" aria-label="Collapse My Drive"><ChevronDown size={13} /></button><button type="button" className="tree-label" onClick={() => setSelected('My Drive')}><FolderOpen size={14} /> My Drive</button></div><ul><li><div className={`rb-file-tree-row ${selected === 'Client Deliverables' ? 'selected' : ''}`}><button type="button" className="tree-caret" aria-label="Collapse Client Deliverables"><ChevronDown size={13} /></button><button type="button" className="tree-label" onClick={() => setSelected('Client Deliverables')}><FolderOpen size={14} /> Client Deliverables</button></div><ul><li><button type="button" className="tree-label nested" onClick={() => setSelected('Northwind Rebrand')}><Folder size={14} /> Northwind Rebrand</button></li><li><button type="button" className="tree-label nested" onClick={() => setSelected('Harbor Coffee')}><Folder size={14} /> Harbor Coffee</button></li></ul></li><li><button type="button" className="tree-label" onClick={() => setSelected('Brand Library')}><ChevronRight size={13} /><Folder size={14} /> Brand Library</button></li><li><button type="button" className="tree-label" onClick={() => setSelected('Spring Campaign')}><ChevronRight size={13} /><Folder size={14} /> Spring Campaign</button></li><li><button type="button" className="tree-label" onClick={() => setSelected('Studio Operations')}><Folder size={14} /> Studio Operations</button></li></ul></li></ul>
          <nav className="rb-file-quick"><button type="button"><Users size={14} /> Shared with me</button><button type="button"><span className="quick-clock">◷</span> Recent</button><button type="button"><Star size={14} /> Starred</button><button type="button"><span className="quick-bin">▱</span> Bin</button></nav>
          <div className="rb-file-storage"><div><strong>Storage</strong><span>88% full</span></div><i><b /></i><p>1.77 TB of 2.00 TB used</p></div>
        </aside>
        <main className="rb-file-main">
          <header className="rb-file-main-header"><strong>{selected}</strong><div><label className="rb-file-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search files" placeholder="Search files" /></label><button type="button" className={view === 'list' ? 'active' : ''} aria-label="List view" onClick={() => setView('list')}><List size={15} /></button><button type="button" className={view === 'grid' ? 'active' : ''} aria-label="Grid view" onClick={() => setView('grid')}><Grid2X2 size={14} /></button></div></header>
          <div className={`rb-file-table ${view}`}><div className="rb-file-table-head"><input type="checkbox" aria-label="Select all files" /><span>Name ↑</span><span>Size</span><span>Modified</span><span>Owner</span><span /></div>{visible.map(([name, kind, size, modified, initials, owner, count]) => <button type="button" className="rb-file-row" key={name} onClick={() => setSelected(name)}><input type="checkbox" aria-label={`Select ${name}`} onClick={(event) => event.stopPropagation()} /><span className="rb-file-name"><FileIcon kind={kind} /><strong>{name}</strong>{count && <small>{count}</small>}<span className="row-star">{kind.includes('star') ? <Star size={13} fill="currentColor" /> : <Star size={13} />}</span></span><span className="rb-file-size"><strong>{size}</strong>{count && <small>{count}</small>}</span><span>{modified}</span><span className="rb-file-owner"><i>{initials}</i>{owner}</span><span className="rb-file-more"><MoreHorizontal size={14} /></span></button>)}</div>
        </main>
      </div>
    </div><button type="button" className="rb-file-theme">◉&nbsp; Theme</button>
  </section>
}

function FileIcon({ kind }: { kind: string }) {
  if (kind.startsWith('folder')) return <Folder size={15} />
  if (kind === 'json') return <span className="file-glyph">⌘</span>
  if (kind === 'image') return <span className="file-glyph">◈</span>
  if (kind === 'video') return <span className="file-glyph">◫</span>
  return <File size={15} />
}
