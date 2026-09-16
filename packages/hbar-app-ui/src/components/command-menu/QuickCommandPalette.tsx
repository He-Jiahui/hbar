import { HbarAppUiIcon } from '../../icon'
import {useMemo, useState} from 'react'
import {Copy, Keyboard, Palette, UserRound, Workflow} from 'lucide-react'
import {CommandBackdrop, CommandFrame, CommandSearch, CommandShortcut, reportCommandAction, type CommandMenuProps, useCommandEscape} from './CommandPrimitives'

const quickItems = [
    {title: 'Switch project', detail: 'Currently Northwind', icon: Workflow},
    {title: 'Change theme', detail: 'Currently system', icon: Palette},
    {title: 'Set your status', detail: 'Currently active', icon: UserRound},
    {title: 'Copy link to this view', detail: '', icon: Copy},
    {title: 'Open keyboard shortcuts', detail: '', icon: Keyboard},
] as const

export function QuickCommandPalette({spec, onAction}: CommandMenuProps): React.JSX.Element {
    const [page, setPage] = useState<'root' | 'project'>('root')
    const [query, setQuery] = useState('')
    const [open, setOpen] = useState(true)
    const filtered = useMemo(() => quickItems.filter((item) => `${item.title} ${item.detail}`.toLowerCase().includes(query.toLowerCase())), [query])
    const close = () => {
        setOpen(false)
        reportCommandAction(onAction, spec, 'close')
    }
    useCommandEscape(open, close)
    return <CommandFrame spec={spec} onAction={onAction} className="hbar-app-ui-command-variant-2">
        <button type="button" className="hbar-app-ui-command-trigger" onClick={() => {setOpen(true); reportCommandAction(onAction, spec, 'open')}}>Search or run a command</button>
        {open && <CommandBackdrop onClose={close}><section className="hbar-app-ui-command-dialog hbar-app-ui-command-dialog-list" role="dialog" aria-modal="true" aria-label="Search or run a command">
            <header className="hbar-app-ui-command-dialog-header"><CommandSearch value={query} onChange={setQuery} placeholder="Search or run a command" ariaLabel="Search or run a command"/></header>
            {page === 'project' && <div className="hbar-app-ui-command-breadcrumb"><button type="button" onClick={() => setPage('root')}>Home</button><span>/</span><strong>Project</strong></div>}
            <div className="hbar-app-ui-command-list" role="listbox">{filtered.map(({title, detail, icon: Icon}, index) => <button type="button" role="option" className={index === 0 && page === 'root' ? 'is-selected' : ''} key={title} onClick={() => {setPage(title === 'Switch project' ? 'project' : 'root'); reportCommandAction(onAction, spec, title === 'Switch project' ? 'navigate' : 'open', title)}}><HbarAppUiIcon icon={Icon} tier="md" /><span><strong>{title}</strong>{detail && <small>{detail}</small>}</span><b aria-hidden="true">›</b></button>)}</div>
            <footer className="hbar-app-ui-command-footer"><CommandShortcut keys="↵" label="to select"/><CommandShortcut keys="esc" label="to close"/></footer>
        </section></CommandBackdrop>}
    </CommandFrame>
}
