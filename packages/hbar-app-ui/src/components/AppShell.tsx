import { HbarAppUiIcon } from '../icon'
import {useState} from 'react'
import {HbarAppUiWorkbenchShell, useHbarAppUiShellContent} from './app-shell/WorkbenchShell'
import {ChevronDown, FileText, LayoutDashboard, Search, Settings2, Sparkles} from 'lucide-react'
import {
    HbarAppUiButton,
    HbarAppUiMetricStrip,
    HbarAppUiSpotlight,
    HbarAppUiStatus,
    HbarAppUiTabs,
    HbarAppUiToolbar
} from '../primitives'
import type {HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'

type ShellProps = HbarAppUiVariantProps

function ShellSidebar({spec, onAction}: ShellProps) {
    const [open, setOpen] = useState(true)
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-shell-variant-1">
        <div className="hbar-app-ui-shell-layout">
            <aside>
                <div className="hbar-app-ui-shell-brand"><HbarAppUiIcon icon={Sparkles} tier="sm" /><strong>hbar workspace</strong></div>
                <button type="button" onClick={() => setOpen((value) => !value)}><HbarAppUiIcon icon={ChevronDown} tier="sm"
                                                                                              className={open ? '' : 'is-collapsed'}/>Workspace
                </button>
                {open && <nav><span
                    className="is-active">Overview</span><span>Sessions <small>12</small></span><span>Files</span><span>Settings</span>
                </nav>}</aside>
            <main><HbarAppUiToolbar title="Overview" detail="Workspace / October reconciliation"/><HbarAppUiButton
                onClick={() => onAction?.({variantId: spec.id, actionId: 'search'})}><HbarAppUiIcon icon={Search} tier="sm"
                />Search</HbarAppUiButton><HbarAppUiMetricStrip
                metrics={[{label: 'Active tasks', value: '24'}, {
                    label: 'Reviews',
                    value: '04',
                    tone: 'warning'
                }, {label: 'Usage', value: '64%'}]}/><HbarAppUiSpotlight><strong>Recent records</strong>
                <div className="hbar-app-ui-mini-list"><span>October invoices <small>Updated 2m ago</small></span><span>Workspace sync <small>Healthy</small></span><span>Release notes <small>Draft</small></span>
                </div>
            </HbarAppUiSpotlight></main>
        </div>
    </ActionSurfaceFrame>
}

function ShellRails({spec, onAction}: ShellProps) {
    const [area, setArea] = useState('Overview')
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-shell-variant-2">
        <div className="hbar-app-ui-three-pane">
            <nav className="hbar-app-ui-icon-rail">
                <button type="button" aria-label="Overview" className={area === 'Overview' ? 'is-active' : ''}
                        onClick={() => setArea('Overview')}><HbarAppUiIcon icon={LayoutDashboard} tier="sm" /></button>
                <button type="button" aria-label="Sessions" className={area === 'Sessions' ? 'is-active' : ''}
                        onClick={() => setArea('Sessions')}><HbarAppUiIcon icon={FileText} tier="sm" /></button>
                <button type="button" aria-label="Settings" className={area === 'Settings' ? 'is-active' : ''}
                        onClick={() => setArea('Settings')}><HbarAppUiIcon icon={Settings2} tier="sm" /></button>
            </nav>
            <aside><strong>{area}</strong><span
                className="is-active">Pinned workspace</span><span>Recent run</span><span>Shared files</span></aside>
            <main><HbarAppUiToolbar title={area} detail="Contents swap with the selected product area"/><HbarAppUiStatus
                value="Connected" tone="positive"/><HbarAppUiSpotlight><h3>{area} details</h3><p>Select a rail item to
                inspect its content without leaving the frame.</p></HbarAppUiSpotlight></main>
        </div>
    </ActionSurfaceFrame>
}

function ShellTopbar({spec, onAction}: ShellProps) {
    const content = useHbarAppUiShellContent()
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-shell-variant-3">
        {content && <HbarAppUiWorkbenchShell {...content} />}
    </ActionSurfaceFrame>
}

function ShellContext({spec, onAction}: ShellProps) {
    const [contextOpen, setContextOpen] = useState(true)
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-shell-variant-4"><HbarAppUiToolbar
        title="Three-column workspace" detail="Context can stay alongside the main content"/><HbarAppUiButton
        onClick={() => {
            setContextOpen((value) => !value);
            onAction?.({variantId: spec.id, actionId: 'toggle-context', value: String(!contextOpen)})
        }}>{contextOpen ? 'Hide context' : 'Show context'}</HbarAppUiButton>
        <div className={`hbar-app-ui-context-columns ${contextOpen ? '' : 'is-hidden'}`}>
            <aside><strong>Navigation</strong><span>Inbox</span><span
                className="is-active">Current run</span><span>Archive</span></aside>
            <main><HbarAppUiSpotlight><h3>Current run</h3><p>Primary content remains readable while context is open.</p>
            </HbarAppUiSpotlight></main>
            {contextOpen &&
                <aside><strong>Context</strong><span>4 files</span><span>2 tools</span><span>1 approval</span></aside>}
        </div>
    </ActionSurfaceFrame>
}

function ShellTriage({spec, onAction}: ShellProps) {
    const [selected, setSelected] = useState('Invoice reconciliation')
    const records = ['Invoice reconciliation', 'Workspace sync', 'Release review', 'Usage alert']
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-shell-variant-5">
        <div className="hbar-app-ui-triage">
            <nav className="hbar-app-ui-icon-rail">
                <button type="button" className="is-active"><HbarAppUiIcon icon={LayoutDashboard} tier="sm" /></button>
                <button type="button"><HbarAppUiIcon icon={FileText} tier="sm" /></button>
            </nav>
            <aside>
                <div className="hbar-app-ui-inline-search"><HbarAppUiIcon icon={Search} tier="sm" /><input placeholder="Filter records"
                                                                                     aria-label="Filter records"/></div>
                {records.map((record) => <button type="button" className={selected === record ? 'is-selected' : ''}
                                                 key={record} onClick={() => {
                    setSelected(record);
                    onAction?.({variantId: spec.id, actionId: 'open', value: record})
                }}>{record}<small>2m</small></button>)}</aside>
            <main><HbarAppUiToolbar title={selected} detail="Reading pane"/><HbarAppUiStatus value="Needs review"
                                                                                             tone="warning"/><HbarAppUiSpotlight>
                <h3>{selected}</h3><p>Review details, related events and the latest response in this pane.</p>
            </HbarAppUiSpotlight></main>
        </div>
    </ActionSurfaceFrame>
}

function ShellDocument({spec, onAction}: ShellProps) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-shell-variant-6"><HbarAppUiToolbar
        title="Document workspace" detail="Keyboard-navigable tree · centred editor"/><HbarAppUiButton
        onClick={() => onAction?.({variantId: spec.id, actionId: 'save'})}>Save</HbarAppUiButton>
        <div className="hbar-app-ui-document-shell">
            <aside><strong>Files</strong>
                <button type="button" className="is-active">README.md</button>
                <button type="button">docs/</button>
                <button type="button"> architecture.md</button>
                <button type="button"> testing.md</button>
            </aside>
            <main>
                <div className="hbar-app-ui-format-toolbar">
                    <button type="button"><strong>B</strong></button>
                    <button type="button"><em>I</em></button>
                    <button type="button">Code</button>
                    <button type="button">Link</button>
                </div>
                <textarea defaultValue={'# Workspace notes\n\nCapture decisions and context here.'}/></main>
        </div>
    </ActionSurfaceFrame>
}

function ShellScope({spec, onAction}: ShellProps) {
    const [scope, setScope] = useState('Production')
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-shell-variant-7"><HbarAppUiToolbar
        title="Scoped workspace" detail="Organization · project · environment"/>
        <div className="hbar-app-ui-scope-pickers">{['Organization', 'Project', 'Environment'].map((label) => <label
            key={label}>{label}<select value={label === 'Environment' ? scope : 'Default'} onChange={(event) => {
            if (label === 'Environment') setScope(event.target.value);
            onAction?.({variantId: spec.id, actionId: 'picker', value: `${label}:${event.target.value}`})
        }}>
            <option>Default</option>
            <option>Staging</option>
            <option>Production</option>
        </select></label>)}</div>
        <HbarAppUiSpotlight><strong>Showing {scope}</strong><p>Changing a scope updates the entire screen and keeps the
            active record visible.</p></HbarAppUiSpotlight></ActionSurfaceFrame>
}

function ShellAdaptive({spec, onAction}: ShellProps) {
    const [view, setView] = useState('Desktop')
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-shell-variant-8"><HbarAppUiToolbar
        title="Adaptive frame" detail="Mobile tabs → icon rail → full sidebar"/><HbarAppUiTabs label="Frame size"
                                                                                               value={view} options={[{
        id: 'Mobile',
        label: 'Mobile'
    }, {id: 'Tablet', label: 'Tablet'}, {id: 'Desktop', label: 'Desktop'}]} onChange={(value) => {
        setView(value);
        onAction?.({variantId: spec.id, actionId: 'tabs', value})
    }}/>
        <div className={`hbar-app-ui-adaptive-frame hbar-app-ui-adaptive-${view.toLowerCase()}`}>
            <aside><span
                className="is-active">Overview</span><span>Sessions</span><span>Files</span><span>Settings</span>
            </aside>
            <main><HbarAppUiSpotlight><strong>{view} content</strong><p>One module identity remains available at every
                breakpoint.</p></HbarAppUiSpotlight></main>
            <nav>
                <button type="button">Home</button>
                <button type="button">Activity</button>
                <button type="button">More</button>
            </nav>
        </div>
    </ActionSurfaceFrame>
}

function ShellChat({spec, onAction}: ShellProps) {
    const [model, setModel] = useState('Balanced')
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-shell-variant-9">
        <div className="hbar-app-ui-chat-shell">
            <aside><strong>Threads</strong>
                <button type="button" className="is-active">October reconciliation</button>
                <button type="button">Release handoff</button>
                <button type="button">Recent activity</button>
            </aside>
            <main><HbarAppUiToolbar title="AI workspace" detail="Pinned and recent threads"/><select aria-label="Model"
                                                                                                     value={model}
                                                                                                     onChange={(event) => {
                                                                                                         setModel(event.target.value);
                                                                                                         onAction?.({
                                                                                                             variantId: spec.id,
                                                                                                             actionId: 'picker',
                                                                                                             value: event.target.value
                                                                                                         })
                                                                                                     }}>
                <option>Balanced</option>
                <option>Fast</option>
                <option>Reasoning</option>
            </select>
                <div className="hbar-app-ui-chat-shell-messages"><p>How can I help with this workspace?</p>
                    <HbarAppUiSpotlight><strong>Pinned
                        context</strong><span>3 files · 1 active run</span></HbarAppUiSpotlight></div>
                <textarea placeholder="Ask the workspace assistant" onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        onAction?.({variantId: spec.id, actionId: 'send', value: event.currentTarget.value});
                        event.currentTarget.value = ''
                    }
                }}/></main>
        </div>
    </ActionSurfaceFrame>
}

export function AppShell({spec, onAction}: ShellProps) {
    switch (spec.variant) {
        case 1:
            return <ShellSidebar spec={spec} onAction={onAction}/>
        case 2:
            return <ShellRails spec={spec} onAction={onAction}/>
        case 3:
            return <ShellTopbar spec={spec} onAction={onAction}/>
        case 4:
            return <ShellContext spec={spec} onAction={onAction}/>
        case 5:
            return <ShellTriage spec={spec} onAction={onAction}/>
        case 6:
            return <ShellDocument spec={spec} onAction={onAction}/>
        case 7:
            return <ShellScope spec={spec} onAction={onAction}/>
        case 8:
            return <ShellAdaptive spec={spec} onAction={onAction}/>
        case 9:
            return <ShellChat spec={spec} onAction={onAction}/>
        default:
            return <ShellSidebar spec={spec} onAction={onAction}/>
    }
}
