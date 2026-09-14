import {useState} from 'react'
import {Hash} from 'lucide-react'
import {CommandBackdrop, CommandFrame, CommandHint, CommandSearch, CommandShortcut, reportCommandAction, type CommandMenuProps, useCommandEscape} from './CommandPrimitives'

const rooms = [
    ['Northwind', 'Current room'],
    ['Aurora mobile', 'Active 4m ago'],
    ['Ledger billing', 'Active 1h ago'],
    ['Atlas search platform', 'Active yesterday'],
    ['Relay notifications', 'Active 2 days ago'],
    ['Vault access control', 'Active last week'],
] as const

export function RoomCommandPalette({spec, onAction}: CommandMenuProps): React.JSX.Element {
    const [query, setQuery] = useState('')
    const [open, setOpen] = useState(true)
    const filtered = rooms.filter(([name, detail]) => `${name} ${detail}`.toLowerCase().includes(query.toLowerCase()))
    const close = () => {
        setOpen(false)
        reportCommandAction(onAction, spec, 'close')
    }
    useCommandEscape(open, close)
    return <CommandFrame spec={spec} onAction={onAction} className="hbar-app-ui-command-variant-6">
        <button type="button" className="hbar-app-ui-command-trigger" onClick={() => {setOpen(true); reportCommandAction(onAction, spec, 'open')}}>Northwind</button>
        {open && <CommandBackdrop onClose={close}><section className="hbar-app-ui-command-dialog hbar-app-ui-command-dialog-room" role="dialog" aria-modal="true" aria-label="Switch room">
            <header className="hbar-app-ui-command-dialog-header"><CommandSearch value={query} onChange={setQuery} placeholder="Find a room" ariaLabel="Find a room"/></header>
            <div className="hbar-app-ui-command-list" role="listbox">{filtered.map(([name, detail], index) => <button type="button" role="option" className={index === 0 ? 'is-selected' : ''} key={name} onClick={() => reportCommandAction(onAction, spec, 'switch', name)}><Hash size={16}/><span><strong>{name}</strong><small>{detail}</small></span><CommandHint>{index + 1}</CommandHint></button>)}</div>
            <footer className="hbar-app-ui-command-footer"><CommandShortcut keys="↵" label="to switch"/><span className="hbar-app-ui-command-key-range"><CommandShortcut keys={<><CommandHint>1</CommandHint> – <CommandHint>6</CommandHint></>} label="to jump"/></span></footer>
        </section></CommandBackdrop>}
    </CommandFrame>
}
