import {useState} from 'react'
import {
    ArrowLeft,
    Bot,
    Check,
    ChevronRight,
    Command,
    CornerDownLeft,
    Search,
    Settings2,
    Sparkles,
    Terminal,
    X
} from 'lucide-react'
import {HbarAppUiButton, HbarAppUiDialog, HbarAppUiSpotlight, HbarAppUiStatus, HbarAppUiToolbar} from '../primitives'
import type {HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'

type CommandProps = HbarAppUiVariantProps

function GroupedPalette({spec, onAction}: CommandProps) {
    const [query, setQuery] = useState('')
    const commands = [{group: 'Recent', name: 'Open workspace', icon: Sparkles}, {
        group: 'Navigation',
        name: 'Run diagnostics',
        icon: Terminal
    }, {group: 'Actions', name: 'Create new session', icon: Command}, {
        group: 'Actions',
        name: 'Change theme',
        icon: Settings2
    }]
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-command-variant-1">
        <div className="hbar-app-ui-command-palette">
            <div className="hbar-app-ui-command-search"><Search size={15}/><input autoFocus value={query}
                                                                                  onChange={(event) => setQuery(event.target.value)}
                                                                                  placeholder="Search commands"
                                                                                  aria-label="Search commands"/><kbd>⌘
                K</kbd></div>
            {['Recent', 'Navigation', 'Actions'].map((group) => <section key={group}>
                <strong>{group}</strong>{commands.filter((command) => command.group === group && command.name.toLowerCase().includes(query.toLowerCase())).map(({
                                                                                                                                                                    name,
                                                                                                                                                                    icon: Icon
                                                                                                                                                                }) =>
                <button type="button" key={name}
                        onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: name})}><Icon
                    size={14}/>{name}<small><CornerDownLeft size={11}/>Enter</small></button>)}</section>)}</div>
    </ActionSurfaceFrame>
}

function NestedPalette({spec, onAction}: CommandProps) {
    const [page, setPage] = useState<'root' | 'workspace'>('root')
    const items = page === 'root' ? ['Workspace', 'Session', 'Preferences'] : ['Open current run', 'Export report', 'Archive session']
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-command-variant-2">
        <div className="hbar-app-ui-command-palette">
            <div className="hbar-app-ui-command-breadcrumb">{page !== 'root' &&
                <button type="button" onClick={() => setPage('root')}><ArrowLeft size={14}/>Back
                </button>}<strong>{page === 'root' ? 'Command menu' : 'Workspace'}</strong></div>
            {items.map((item) => <button type="button" key={item} onClick={() => {
                if (page === 'root') setPage('workspace');
                onAction?.({variantId: spec.id, actionId: page === 'root' ? 'navigate' : 'open', value: item})
            }}>{item}<ChevronRight size={13}/></button>)}</div>
    </ActionSurfaceFrame>
}

function PreviewPalette({spec, onAction}: CommandProps) {
    const [query, setQuery] = useState('')
    const [selected, setSelected] = useState('Run diagnostics')
    const commands = ['Run diagnostics', 'Open workspace', 'Review activity', 'Export report']
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-command-variant-3"><HbarAppUiToolbar title="Search commands"
                                                                                           detail="Typed filters show an inline preview"/>
        <div className="hbar-app-ui-inline-search"><Search size={13}/><input value={query}
                                                                             onChange={(event) => setQuery(event.target.value)}
                                                                             placeholder="Type to filter"/></div>
        <div className="hbar-app-ui-command-preview-layout">
            <div>{commands.filter((item) => item.toLowerCase().includes(query.toLowerCase())).map((item) => <button
                type="button" className={selected === item ? 'is-selected' : ''} key={item}
                onClick={() => setSelected(item)}><Command size={13}/>{item}</button>)}</div>
            <HbarAppUiSpotlight><strong>{selected}</strong><p>Runs with the current workspace and returns a result in
                the activity panel.</p><HbarAppUiButton tone="accent" onClick={() => onAction?.({
                variantId: spec.id,
                actionId: 'open',
                value: selected
            })}>Run command</HbarAppUiButton></HbarAppUiSpotlight></div>
    </ActionSurfaceFrame>
}

function ArgumentPalette({spec, onAction}: CommandProps) {
    const [open, setOpen] = useState(false)
    const [value, setValue] = useState('')
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-command-variant-4">
        <div className="hbar-app-ui-command-argument"><HbarAppUiToolbar title="Action menu"
                                                                        detail="Collect an argument before running"/><HbarAppUiStatus
            value={open ? 'Ready to confirm' : 'Choose an action'}/><label>Workspace name<input value={value}
                                                                                                onChange={(event) => setValue(event.target.value)}
                                                                                                placeholder="October workspace"/></label>
            <div><HbarAppUiButton onClick={() => setOpen(true)}><X size={13}/>Cancel</HbarAppUiButton><HbarAppUiButton
                tone="accent" disabled={!value.trim()} onClick={() => {
                setOpen(true);
                onAction?.({variantId: spec.id, actionId: 'open', value})
            }}>Continue</HbarAppUiButton></div>
        </div>
        <HbarAppUiDialog open={open} title="Confirm command" onClose={() => setOpen(false)} footer={<><HbarAppUiButton
            onClick={() => setOpen(false)}>Back</HbarAppUiButton><HbarAppUiButton tone="accent" onClick={() => {
            setOpen(false);
            onAction?.({variantId: spec.id, actionId: 'confirm', value})
        }}><Check size={13}/>Run</HbarAppUiButton></>}><p>Run this command
            for <strong>{value || 'the selected workspace'}</strong>?</p></HbarAppUiDialog></ActionSurfaceFrame>
}

function AiFallbackPalette({spec, onAction}: CommandProps) {
    const [query, setQuery] = useState('')
    const hasMatch = query.toLowerCase().includes('run')
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-command-variant-5">
        <div className="hbar-app-ui-command-palette">
            <div className="hbar-app-ui-command-search"><Search size={15}/><input autoFocus value={query}
                                                                                  onChange={(event) => setQuery(event.target.value)}
                                                                                  placeholder="Ask or search commands"
                                                                                  aria-label="Ask or search commands"/>
            </div>
            {hasMatch ? <button type="button" onClick={() => onAction?.({
                    variantId: spec.id,
                    actionId: 'open',
                    value: 'Run diagnostics'
                })}><Terminal size={14}/>Run diagnostics</button> :
                <HbarAppUiSpotlight className="hbar-app-ui-command-ai"><Bot size={17}/>
                    <div><strong>Ask the workspace assistant</strong><p>No command matches “{query || '…'}”. Try
                        describing the outcome instead.</p></div>
                    <HbarAppUiButton tone="accent" onClick={() => onAction?.({
                        variantId: spec.id,
                        actionId: 'ask',
                        value: query
                    })}>Ask</HbarAppUiButton></HbarAppUiSpotlight>}</div>
    </ActionSurfaceFrame>
}

function InlinePopover({spec, onAction}: CommandProps) {
    const [open, setOpen] = useState(true)
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-command-variant-6"><HbarAppUiToolbar
        title="Inline command popover" detail="Anchored to a toolbar trigger"/><HbarAppUiButton
        onClick={() => setOpen((value) => !value)}><Command size={14}/>Commands</HbarAppUiButton>{open &&
        <HbarAppUiSpotlight className="hbar-app-ui-inline-command-popover">
            <button type="button"
                    onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: 'Open workspace'})}>
                <Sparkles size={13}/>Open workspace
            </button>
            <button type="button"
                    onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: 'Run diagnostics'})}>
                <Terminal size={13}/>Run diagnostics
            </button>
            <button type="button" onClick={() => setOpen(false)}><X size={13}/>Dismiss</button>
        </HbarAppUiSpotlight>}</ActionSurfaceFrame>
}

export function CommandMenu({spec, onAction}: CommandProps) {
    switch (spec.variant) {
        case 1:
            return <GroupedPalette spec={spec} onAction={onAction}/>
        case 2:
            return <NestedPalette spec={spec} onAction={onAction}/>
        case 3:
            return <PreviewPalette spec={spec} onAction={onAction}/>
        case 4:
            return <ArgumentPalette spec={spec} onAction={onAction}/>
        case 5:
            return <AiFallbackPalette spec={spec} onAction={onAction}/>
        case 6:
            return <InlinePopover spec={spec} onAction={onAction}/>
        default:
            return <GroupedPalette spec={spec} onAction={onAction}/>
    }
}
