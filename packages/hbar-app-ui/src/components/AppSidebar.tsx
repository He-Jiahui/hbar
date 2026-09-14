import {useState} from 'react'
import {ChevronDown, ChevronRight, Folder, Menu, MoreHorizontal, Search, Settings2, Sparkles, Users} from 'lucide-react'
import {
    HbarAppUiButton,
    HbarAppUiIconButton,
    HbarAppUiSpotlight,
    HbarAppUiStatus,
    HbarAppUiToolbar
} from '../primitives'
import type {HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'

type SidebarProps = HbarAppUiVariantProps

function PrimarySidebar({spec, onAction}: SidebarProps) {
    const [open, setOpen] = useState(true)
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-sidebar-variant-1">
        <aside className="hbar-app-ui-primary-sidebar">
            <div className="hbar-app-ui-sidebar-title"><Sparkles
                size={15}/><strong>Workspace</strong><HbarAppUiIconButton label="More workspace actions"><MoreHorizontal
                size={14}/></HbarAppUiIconButton></div>
            <button type="button" onClick={() => setOpen((value) => !value)}><ChevronDown size={13}
                                                                                          className={open ? '' : 'is-collapsed'}/>Projects
            </button>
            {open && <nav><span className="is-active">Overview <small>⌘1</small></span><span>Sessions <small>12</small></span><span>Files</span><span>Members</span>
            </nav>}
            <footer><Users size={14}/>Avery Chen</footer>
        </aside>
    </ActionSurfaceFrame>
}

function IconRail({spec, onAction}: SidebarProps) {
    const [flyout, setFlyout] = useState<string | undefined>()
    const icons = [{id: 'workspace', icon: Folder}, {id: 'members', icon: Users}, {id: 'settings', icon: Settings2}]
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-sidebar-variant-2">
        <div className="hbar-app-ui-sidebar-rail-demo">
            <nav>{icons.map(({id, icon: Icon}) => <button type="button" aria-label={id} key={id}
                                                          onMouseEnter={() => setFlyout(id)}
                                                          onFocus={() => setFlyout(id)} onClick={() => onAction?.({
                variantId: spec.id,
                actionId: 'open',
                value: id
            })}><Icon size={16}/></button>)}</nav>
            {flyout && <HbarAppUiSpotlight
                className="hbar-app-ui-sidebar-flyout"><strong>{flyout}</strong><span>Overview</span><span>Recent activity</span><span>Settings</span></HbarAppUiSpotlight>}
            <div className="hbar-app-ui-tooltip-note">Hover an icon to reveal its submenu.</div>
        </div>
    </ActionSurfaceFrame>
}

function ScopedSidebar({spec, onAction}: SidebarProps) {
    const [scope, setScope] = useState('Workspace')
    const [query, setQuery] = useState('')
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-sidebar-variant-3">
        <aside className="hbar-app-ui-scoped-sidebar"><select aria-label="Workspace scope" value={scope}
                                                              onChange={(event) => {
                                                                  setScope(event.target.value);
                                                                  onAction?.({
                                                                      variantId: spec.id,
                                                                      actionId: 'picker',
                                                                      value: event.target.value
                                                                  })
                                                              }}>
            <option>Workspace</option>
            <option>Project Atlas</option>
            <option>Personal</option>
        </select><label className="hbar-app-ui-inline-search"><Search size={13}/><input value={query}
                                                                                        onChange={(event) => setQuery(event.target.value)}
                                                                                        placeholder="Search pinned"/></label><strong>Pinned</strong>{['Overview', 'Current run', 'Release notes', 'Design files'].filter((item) => item.toLowerCase().includes(query.toLowerCase())).map((item) =>
            <button type="button" className={item === 'Overview' ? 'is-active' : ''} key={item}
                    onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: item})}>{item}<ChevronRight
                size={13}/></button>)}</aside>
    </ActionSurfaceFrame>
}

function DualSidebar({spec, onAction}: SidebarProps) {
    const [section, setSection] = useState('Activity')
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-sidebar-variant-4">
        <div className="hbar-app-ui-dual-sidebar">
            <nav className="hbar-app-ui-icon-rail">
                <button type="button" className="is-active"><Sparkles size={15}/></button>
                <button type="button"><Folder size={15}/></button>
                <button type="button"><Settings2 size={15}/></button>
            </nav>
            <aside><HbarAppUiToolbar title={section} detail="Contextual panel"/><HbarAppUiButton onClick={() => {
                setSection(section === 'Activity' ? 'Files' : 'Activity');
                onAction?.({variantId: spec.id, actionId: 'tabs', value: section})
            }}>{section === 'Activity' ? 'Show files' : 'Show activity'}</HbarAppUiButton><span className="is-active">Current item</span><span>Recent item</span><span>Shared item</span>
            </aside>
        </div>
    </ActionSurfaceFrame>
}

function TreeSidebar({spec, onAction}: SidebarProps) {
    const [open, setOpen] = useState<Record<string, boolean>>({src: true})
    const toggle = (name: string) => setOpen((current) => ({...current, [name]: !current[name]}))
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-sidebar-variant-5">
        <aside className="hbar-app-ui-tree-sidebar"><strong>Navigation tree</strong>
            <button type="button" onClick={() => toggle('src')}><ChevronDown size={13}
                                                                             className={open.src ? '' : 'is-collapsed'}/>src/
            </button>
            {open.src && <div>
                <button type="button" onClick={() => onAction?.({
                    variantId: spec.id,
                    actionId: 'open',
                    value: 'App.tsx'
                })}>App.tsx <MoreHorizontal size={12}/></button>
                <button type="button">ActivityPanel.tsx <MoreHorizontal size={12}/></button>
            </div>}
            <button type="button" onClick={() => toggle('docs')}><ChevronDown size={13}
                                                                              className={open.docs ? '' : 'is-collapsed'}/>docs/
            </button>
            {open.docs && <div>
                <button type="button">architecture.md</button>
                <button type="button">testing.md</button>
            </div>}</aside>
    </ActionSurfaceFrame>
}

function MobileDrawer({spec, onAction}: SidebarProps) {
    const [open, setOpen] = useState(true)
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-sidebar-variant-6">
        <div className="hbar-app-ui-mobile-drawer-frame">
            <header><HbarAppUiIconButton label="Open menu" onClick={() => setOpen((value) => !value)}><Menu size={16}/></HbarAppUiIconButton><strong>Overview</strong>
            </header>
            {open && <>
                <div className="hbar-app-ui-drawer-scrim" onClick={() => setOpen(false)}/>
                <aside className="hbar-app-ui-drawer-sheet"><strong>Workspace</strong>
                    <button type="button" className="is-active">Overview</button>
                    <button type="button">Sessions</button>
                    <button type="button">Files</button>
                    <button type="button">Settings</button>
                </aside>
            </>}</div>
    </ActionSurfaceFrame>
}

function FullSidebarShell({spec, onAction}: SidebarProps) {
    const [activeSection, setActiveSection] = useState('Overview')
    const sections = ['Overview', 'Sessions', 'Files', 'Settings']
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-sidebar-variant-7">
        <div className="hbar-app-ui-full-sidebar-shell">
            <aside>
                <div className="hbar-app-ui-sidebar-title"><Sparkles size={15}/><strong>hbar</strong></div>
                {sections.map((section) => <button type="button" className={section === activeSection ? 'is-active' : ''}
                                                key={section} onClick={() => {
                    setActiveSection(section)
                    onAction?.({variantId: spec.id, actionId: 'tabs', value: section})
                }}>{section}</button>)}
            </aside>
            <main><HbarAppUiToolbar title={`Workspace / ${activeSection}`} detail="Full application shell"/><HbarAppUiStatus
                value="Connected" tone="positive"/><HbarAppUiSpotlight><h3>Content region</h3><p>The sidebar, header and
                main content share one frame.</p></HbarAppUiSpotlight></main>
        </div>
    </ActionSurfaceFrame>
}

export function AppSidebar({spec, onAction}: SidebarProps) {
    switch (spec.variant) {
        case 1:
            return <PrimarySidebar spec={spec} onAction={onAction}/>
        case 2:
            return <IconRail spec={spec} onAction={onAction}/>
        case 3:
            return <ScopedSidebar spec={spec} onAction={onAction}/>
        case 4:
            return <DualSidebar spec={spec} onAction={onAction}/>
        case 5:
            return <TreeSidebar spec={spec} onAction={onAction}/>
        case 6:
            return <MobileDrawer spec={spec} onAction={onAction}/>
        case 7:
            return <FullSidebarShell spec={spec} onAction={onAction}/>
        default:
            return <PrimarySidebar spec={spec} onAction={onAction}/>
    }
}
