import {useMemo, useState} from 'react'
import {Clock3, FileText, Grid2X2, KeyRound, Settings2, UserRound, UsersRound} from 'lucide-react'
import {CommandBackdrop, CommandFrame, CommandHint, CommandSearch, CommandShortcut, reportCommandAction, type CommandMenuProps, useCommandEscape} from './CommandPrimitives'

type PaletteItem = {
    readonly group: string
    readonly title: string
    readonly detail?: string
    readonly shortcut: string
    readonly icon: typeof Clock3
}

const items: readonly PaletteItem[] = [
    {group: 'Recent', title: 'Launch readiness review', detail: 'Opened 6 minutes ago', shortcut: '1', icon: Clock3},
    {group: 'Recent', title: 'Incident 4821, checkout latency', detail: 'Opened yesterday', shortcut: '2', icon: Clock3},
    {group: 'Recent', title: 'Q3 roadmap draft', detail: 'Opened 2 days ago', shortcut: '3', icon: Clock3},
    {group: 'Navigation', title: 'Release overview', shortcut: 'G O', icon: Grid2X2},
    {group: 'Navigation', title: 'Runbooks and docs', shortcut: 'G D', icon: FileText},
    {group: 'Navigation', title: 'Team directory', shortcut: 'G P', icon: UsersRound},
    {group: 'Navigation', title: 'Workspace settings', shortcut: 'G S', icon: Settings2},
    {group: 'Actions', title: 'Invite a teammate', detail: 'Send a workspace invite by email', shortcut: 'I', icon: UserRound},
    {group: 'Actions', title: 'Schedule a launch review', detail: 'Hold a slot with product and infra', shortcut: 'S', icon: Clock3},
    {group: 'Actions', title: 'Rotate an API key', detail: 'Retire a key and issue a replacement', shortcut: 'R', icon: KeyRound},
]

export function GroupedCommandPalette({spec, onAction}: CommandMenuProps): React.JSX.Element {
    const [query, setQuery] = useState('')
    const [open, setOpen] = useState(true)
    const filtered = useMemo(() => items.filter((item) => `${item.title} ${item.detail ?? ''}`.toLowerCase().includes(query.toLowerCase())), [query])
    const close = () => {
        setOpen(false)
        reportCommandAction(onAction, spec, 'close')
    }
    useCommandEscape(open, close)
    return <CommandFrame spec={spec} onAction={onAction} className="hbar-app-ui-command-variant-1">
        <button type="button" className="hbar-app-ui-command-trigger" onClick={() => {setOpen(true); reportCommandAction(onAction, spec, 'open')}}>Search or run a command</button>
        {open && <CommandBackdrop onClose={close}>
            <section className="hbar-app-ui-command-dialog hbar-app-ui-command-dialog-list" role="dialog" aria-modal="true" aria-label="Search or run a command">
                <header className="hbar-app-ui-command-dialog-header"><CommandSearch value={query} onChange={setQuery} placeholder="Search or run a command" ariaLabel="Search or run a command"/></header>
                <div className="hbar-app-ui-command-list" role="listbox">
                    {(['Recent', 'Navigation', 'Actions']).map((group) => <section className="hbar-app-ui-command-group" key={group}><h2>{group}</h2>{filtered.filter((item) => item.group === group).map((item, index) => {const Icon = item.icon; return <button type="button" role="option" className={index === 0 && group === 'Recent' ? 'is-selected' : ''} key={item.title} onClick={() => reportCommandAction(onAction, spec, 'open', item.title)}><Icon size={16}/><span><strong>{item.title}</strong>{item.detail && <small>{item.detail}</small>}</span><CommandHint>{item.shortcut}</CommandHint></button>})}</section>)}
                </div>
                <footer className="hbar-app-ui-command-footer"><CommandShortcut keys="↕" label="to navigate"/><CommandShortcut keys="↵" label="to open"/><CommandShortcut keys="esc" label="to close"/><span className="hbar-app-ui-command-result-count">{filtered.length} results</span></footer>
            </section>
        </CommandBackdrop>}
    </CommandFrame>
}
