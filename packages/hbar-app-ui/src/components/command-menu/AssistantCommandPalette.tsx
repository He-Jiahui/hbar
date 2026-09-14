import {useState} from 'react'
import {MessageSquare, SearchX} from 'lucide-react'
import {CommandBackdrop, CommandFrame, CommandHint, CommandSearch, reportCommandAction, type CommandMenuProps, useCommandEscape} from './CommandPrimitives'

export function AssistantCommandPalette({spec, onAction}: CommandMenuProps): React.JSX.Element {
    const [query, setQuery] = useState('quarterly burn rate by team')
    const [open, setOpen] = useState(true)
    const close = () => {
        setOpen(false)
        reportCommandAction(onAction, spec, 'close')
    }
    useCommandEscape(open, close)
    return <CommandFrame spec={spec} onAction={onAction} className="hbar-app-ui-command-variant-5">
        <button type="button" className="hbar-app-ui-command-trigger" onClick={() => {setOpen(true); reportCommandAction(onAction, spec, 'open')}}>Search or ask</button>
        {open && <CommandBackdrop onClose={close}><section className="hbar-app-ui-command-dialog hbar-app-ui-command-dialog-assistant" role="dialog" aria-modal="true" aria-label="Search or ask">
            <header className="hbar-app-ui-command-dialog-header"><CommandSearch value={query} onChange={setQuery} placeholder="Search or ask" ariaLabel="Search or ask"/></header>
            <div className="hbar-app-ui-command-assistant-body"><SearchX size={28}/><h2>No commands match</h2><p>Nothing in this workspace matches that. Ask the assistant to answer it from your data instead.</p><button type="button" className="hbar-app-ui-command-assistant-ask" onClick={() => reportCommandAction(onAction, spec, 'ask', query)}><MessageSquare size={16}/><span>Ask about “{query}”</span></button><small>TRY INSTEAD</small><div className="hbar-app-ui-command-suggestions"><button type="button" onClick={() => setQuery('Billing settings')}>Billing settings</button><button type="button" onClick={() => setQuery('Invite a teammate')}>Invite a teammate</button><button type="button" onClick={() => setQuery('Usage report')}>Usage report</button></div></div>
            <footer className="hbar-app-ui-command-footer"><CommandHint>↵</CommandHint><small>to ask</small><CommandHint>esc</CommandHint><small>to close</small><span className="hbar-app-ui-command-result-count">0 of 3</span></footer>
        </section></CommandBackdrop>}
    </CommandFrame>
}
