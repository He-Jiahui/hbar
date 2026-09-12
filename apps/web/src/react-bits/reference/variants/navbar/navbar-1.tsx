import { ChevronRight, Ellipsis, Folder, Plus, Search, Star } from 'lucide-react'
import { useState } from 'react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './navbar-1.css'

const tabs = ['Discussion', 'Tasks', 'Timeline', 'Files', 'Overview'] as const
const columns = [
  ['In progress', ['Wallet sheet', 'Card vaulting']],
  ['In review', ['Step-up challenge state']],
  ['Done', ['Order summary', 'Tax breakdown']],
] as const

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/navbar/navbar-1. */
export default function Navbar1({ onInteraction }: ReferenceFixtureProps) {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>('Tasks')
  const [starred, setStarred] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [theme, setTheme] = useState(false)
  const [invited, setInvited] = useState(false)
  return <div className={`rb-public-navbar-1${theme ? ' light' : ''}`} onClickCapture={(event) => reportFixtureClick(event, onInteraction)}>
    <header className="rb-public-navbar-1-header">
      <h1>Checkout Flow</h1>
      <div className="rb-public-navbar-1-meta">
        <nav aria-label="Breadcrumb"><ol><li><a href="#products"><Folder size={14} /> <span>Products</span></a><ChevronRight size={14} /></li><li><a href="#mobile"><Folder size={14} /> <span>Mobile</span></a><ChevronRight size={14} /></li><li><span className="current">Checkout Flow</span></li></ol></nav>
        <div className="rb-public-navbar-1-actions"><button type="button" aria-label="Search this project" className={showSearch ? 'active' : ''} onClick={() => setShowSearch((value) => !value)}><Search size={16} /></button><button type="button" aria-label="Add to starred" className={starred ? 'active' : ''} onClick={() => setStarred((value) => !value)}><Star size={16} fill={starred ? 'currentColor' : 'none'} /></button><div className="rb-public-navbar-1-more"><button type="button" aria-label="More project actions" className={showMore ? 'active' : ''} onClick={() => setShowMore((value) => !value)}><Ellipsis size={16} /></button>{showMore && <div role="menu"><button type="button">Duplicate project</button><button type="button">Archive project</button></div>}</div></div>
      </div>
      {showSearch && <label className="rb-public-navbar-1-search"><Search size={14} /><input autoFocus placeholder="Search this project" aria-label="Project search" /></label>}
      <div className="rb-public-navbar-1-tabs-row"><div className="rb-public-navbar-1-tabs" role="tablist">{tabs.map((tab) => <button type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? 'selected' : ''} key={tab} onClick={() => setActiveTab(tab)}>{tab}{tab === 'Discussion' && <span>3</span>}</button>)}</div><div className="rb-public-navbar-1-people"><button type="button" className="invite" aria-label="Invite people to this project" onClick={() => setInvited((value) => !value)}><Plus size={16} /></button><ul aria-label="Project members"><li>AM</li><li>RK</li><li>TN</li><li>JD</li></ul><span className="more-members">+{invited ? 10 : 9}</span></div><button type="button" className="mobile-invite" aria-label="Invite people to this project" onClick={() => setInvited((value) => !value)}><Plus size={18} /></button></div>
    </header>
    <main className="rb-public-navbar-1-board">{columns.map(([heading, items]) => <section key={heading}><h2>{heading}</h2><ul>{items.map((item) => <li key={item}><button type="button" onClick={() => setActiveTab('Tasks')}>{item}</button></li>)}</ul></section>)}</main>
    <button type="button" className="rb-public-navbar-1-theme" onClick={() => setTheme((value) => !value)} aria-label="Theme">◉&nbsp; Theme</button>
  </div>
}
