import {useState} from 'react'
import {FileText, GitBranch, UserRound} from 'lucide-react'
import {CommandBackdrop, CommandFrame, CommandHint, CommandSearch, CommandShortcut, reportCommandAction, type CommandMenuProps, useCommandEscape} from './CommandPrimitives'

type SearchResult = {readonly title: string; readonly detail: string; readonly kind: 'doc' | 'person' | 'workflow'}
const searchResults: readonly SearchResult[] = [
    {title: 'Launch readiness review', detail: 'Runbook · Aurora mobile 2.4', kind: 'doc'},
    {title: 'Checkout latency postmortem', detail: 'Incident 4821', kind: 'doc'},
    {title: 'Rollback procedure for staged deploys', detail: 'Runbook · Platform', kind: 'doc'},
    {title: 'Priya Anand', detail: 'Staff engineer · Release', kind: 'person'},
    {title: 'Marcus Reed', detail: 'Senior engineer · Reliability', kind: 'person'},
    {title: 'Staged deploy to production', detail: 'Runs on merge to main', kind: 'workflow'},
    {title: 'Rotate signing keys', detail: 'Runs weekly, Mondays', kind: 'workflow'},
    {title: 'Nightly database backup', detail: 'Runs daily, 02:00 UTC', kind: 'workflow'},
]

export function SearchEverythingPalette({spec, onAction}: CommandMenuProps): React.JSX.Element {
    const [query, setQuery] = useState('')
    const [tab, setTab] = useState('All')
    const [selected, setSelected] = useState(searchResults[0]!)
    const [open, setOpen] = useState(true)
    const filtered = searchResults.filter((item) => (tab === 'All' || (tab === 'Docs' && item.kind === 'doc') || (tab === 'People' && item.kind === 'person') || (tab === 'Workflows' && item.kind === 'workflow')) && `${item.title} ${item.detail}`.toLowerCase().includes(query.toLowerCase()))
    const close = () => {
        setOpen(false)
        reportCommandAction(onAction, spec, 'close')
    }
    useCommandEscape(open, close)
    return <CommandFrame spec={spec} onAction={onAction} className="hbar-app-ui-command-variant-3">
        <button type="button" className="hbar-app-ui-command-trigger" onClick={() => {setOpen(true); reportCommandAction(onAction, spec, 'open')}}>Search docs, people, workflows</button>
        {open && <CommandBackdrop closeLabel="Close search" onClose={close}><section className="hbar-app-ui-command-dialog hbar-app-ui-command-dialog-search" role="dialog" aria-modal="true" aria-label="Search everything">
            <header className="hbar-app-ui-command-dialog-header"><CommandSearch value={query} onChange={setQuery} placeholder="Search everything" ariaLabel="Search everything"/></header>
            <nav className="hbar-app-ui-command-tabs" aria-label="Search scope">{['All', 'Docs', 'People', 'Workflows'].map((option) => <button type="button" className={tab === option ? 'is-selected' : ''} key={option} onClick={() => setTab(option)}>{option}</button>)}</nav>
            <div className="hbar-app-ui-command-search-grid"><div className="hbar-app-ui-command-list" role="listbox">{filtered.map((item) => {const Icon = item.kind === 'doc' ? FileText : item.kind === 'person' ? UserRound : GitBranch; return <button type="button" role="option" className={selected.title === item.title ? 'is-selected' : ''} key={item.title} onClick={() => setSelected(item)}><Icon size={16}/><span><strong>{item.title}</strong><small>{item.detail}</small></span></button>})}</div><article className="hbar-app-ui-command-detail"><small>{selected.kind === 'doc' ? 'DOC' : selected.kind.toUpperCase()}</small><h2>{selected.title}</h2><p>{selected.detail}</p><dl><div><dt>Owner</dt><dd>Priya Anand</dd></div><div><dt>Section</dt><dd>Release</dd></div><div><dt>Updated</dt><dd>6m ago</dd></div></dl><p>Gate checklist covering rollout stages, alerting thresholds, and the rollback owner for the 2.4 launch.</p><button type="button" onClick={() => reportCommandAction(onAction, spec, 'open', selected.title)}>Open result</button></article></div>
            <footer className="hbar-app-ui-command-footer"><CommandShortcut keys={<><CommandHint>↑</CommandHint><CommandHint>↓</CommandHint></>} label="to move"/><CommandShortcut keys="↵" label="to open"/><CommandShortcut keys="esc" label="to close"/><span className="hbar-app-ui-command-result-count">{filtered.length} of 8</span></footer>
        </section></CommandBackdrop>}
    </CommandFrame>
}
