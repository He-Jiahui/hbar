import { HbarAppUiIcon } from '../icon'
import {useState} from 'react'
import {
    Activity,
    BarChart3,
    BriefcaseBusiness,
    CalendarClock,
    ChevronDown,
    ChevronRight,
    CreditCard,
    Folder,
    Grid2X2,
    LayoutDashboard,
    Menu,
    MoreHorizontal,
    Palette,
    PanelLeftClose,
    Search,
    Settings,
    Settings2,
    Sparkles,
    Users,
    type LucideIcon
} from 'lucide-react'
import {
    HbarAppUiButton,
    HbarAppUiIconButton,
    HbarAppUiSpotlight,
    HbarAppUiStatus,
    HbarAppUiToolbar
} from '../primitives'
import type {HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'
import './AppSidebarSurface.css'

type SidebarProps = HbarAppUiVariantProps

type SidebarGroup = readonly [string, readonly [string, number | undefined, LucideIcon][]]

const primarySidebarGroups: readonly SidebarGroup[] = [
    ['WORKSPACE', [
        ['Command center', 8, Grid2X2],
        ['Inbox', 12, BriefcaseBusiness],
        ['Approvals', 5, CalendarClock],
        ['Automations', undefined, Grid2X2],
        ['Projects', undefined, BriefcaseBusiness],
    ]],
    ['INSIGHTS', [
        ['Performance', undefined, LayoutDashboard],
        ['Usage', undefined, BarChart3],
        ['Activity log', undefined, Activity],
    ]],
    ['ACCOUNT', [
        ['Members', undefined, Users],
        ['Billing', undefined, CreditCard],
        ['Settings', undefined, Settings],
    ]],
]

function PrimarySidebar({spec, onAction}: SidebarProps) {
    const [collapsed, setCollapsed] = useState(false)
    const [mobileOpen, setMobileOpen] = useState(false)
    const [selected, setSelected] = useState('Command center')
    const [subdued, setSubdued] = useState(false)
    const selectItem = (item: string) => {
        setSelected(item)
        setMobileOpen(false)
        onAction?.({variantId: spec.id, actionId: 'open', value: item})
    }
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className={`hbar-app-ui-sidebar-variant-1${subdued ? ' is-subdued' : ''}`}>
        <button type="button" className="hbar-app-ui-sidebar-mobile-trigger" aria-label="Open navigation" onClick={() => {
            setMobileOpen(true)
            onAction?.({variantId: spec.id, actionId: 'open', value: 'navigation'})
        }}><HbarAppUiIcon icon={Menu} tier="md" /></button>
        <aside className={`hbar-app-ui-primary-sidebar${collapsed ? ' is-collapsed' : ''}${mobileOpen ? ' is-mobile-open' : ''}`}>
            <header className="hbar-app-ui-primary-sidebar-header"><span>M</span><div><p>Meridian</p><small>Operations</small></div></header>
            <nav>{primarySidebarGroups.map(([group, items]) => <section key={group}><p>{group}</p><ul>{items.map(([label, count, Icon]) => <li key={label}>
                <button type="button" className={selected === label ? 'is-selected' : ''} onClick={() => selectItem(label)}><HbarAppUiIcon icon={Icon} tier="sm" /><span>{label}</span>{count !== undefined && <small>{count}</small>}</button>
            </li>)}</ul></section>)}</nav>
            <footer>
                <button type="button" className="hbar-app-ui-sidebar-collapse" onClick={() => {
                    setCollapsed((value) => !value)
                    onAction?.({variantId: spec.id, actionId: 'collapse', value: collapsed ? 'expanded' : 'collapsed'})
                }}><HbarAppUiIcon icon={PanelLeftClose} tier="sm" /><span>{collapsed ? 'Expand sidebar' : 'Collapse sidebar'}</span></button>
                <button type="button" className="hbar-app-ui-sidebar-profile" onClick={() => onAction?.({
                    variantId: spec.id,
                    actionId: 'open',
                    value: 'profile'
                })}><span>IR</span><span><b>Iris Renner</b><small>Operations lead</small></span><HbarAppUiIcon icon={ChevronDown} tier="sm" /></button>
            </footer>
        </aside>
        {mobileOpen && <button type="button" className="hbar-app-ui-sidebar-dismiss" aria-label="Close navigation" onClick={() => setMobileOpen(false)}/>}
        <button type="button" className="hbar-app-ui-sidebar-theme-control" onClick={() => {
            setSubdued((value) => !value)
            onAction?.({variantId: spec.id, actionId: 'theme', value: subdued ? 'standard' : 'subdued'})
        }}><HbarAppUiIcon icon={Palette} tier="sm" />{subdued ? 'Standard' : 'Theme'}</button>
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
            })}><HbarAppUiIcon icon={Icon} tier="md" /></button>)}</nav>
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
        </select><label className="hbar-app-ui-inline-search"><HbarAppUiIcon icon={Search} tier="sm" /><input value={query}
                                                                                        onChange={(event) => setQuery(event.target.value)}
                                                                                        placeholder="Search pinned"/></label><strong>Pinned</strong>{['Overview', 'Current run', 'Release notes', 'Design files'].filter((item) => item.toLowerCase().includes(query.toLowerCase())).map((item) =>
            <button type="button" className={item === 'Overview' ? 'is-active' : ''} key={item}
                    onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: item})}>{item}<HbarAppUiIcon icon={ChevronRight} tier="sm"
                /></button>)}</aside>
    </ActionSurfaceFrame>
}

function DualSidebar({spec, onAction}: SidebarProps) {
    const [section, setSection] = useState('Activity')
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-sidebar-variant-4">
        <div className="hbar-app-ui-dual-sidebar">
            <nav className="hbar-app-ui-icon-rail">
                <button type="button" className="is-active"><HbarAppUiIcon icon={Sparkles} tier="sm" /></button>
                <button type="button"><HbarAppUiIcon icon={Folder} tier="sm" /></button>
                <button type="button"><HbarAppUiIcon icon={Settings2} tier="sm" /></button>
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
            <button type="button" onClick={() => toggle('src')}><HbarAppUiIcon icon={ChevronDown} tier="sm"
                                                                             className={open.src ? '' : 'is-collapsed'}/>src/
            </button>
            {open.src && <div>
                <button type="button" onClick={() => onAction?.({
                    variantId: spec.id,
                    actionId: 'open',
                    value: 'App.tsx'
                })}>App.tsx <HbarAppUiIcon icon={MoreHorizontal} tier="xs" /></button>
                <button type="button">ActivityPanel.tsx <HbarAppUiIcon icon={MoreHorizontal} tier="xs" /></button>
            </div>}
            <button type="button" onClick={() => toggle('docs')}><HbarAppUiIcon icon={ChevronDown} tier="sm"
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
            <header><HbarAppUiIconButton label="Open menu" onClick={() => setOpen((value) => !value)}><HbarAppUiIcon icon={Menu} tier="md" /></HbarAppUiIconButton><strong>Overview</strong>
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
                <div className="hbar-app-ui-sidebar-title"><HbarAppUiIcon icon={Sparkles} tier="sm" /><strong>hbar</strong></div>
                {sections.map((section) => <button type="button"
                                                   className={section === activeSection ? 'is-active' : ''}
                                                   key={section} onClick={() => {
                    setActiveSection(section)
                    onAction?.({variantId: spec.id, actionId: 'tabs', value: section})
                }}>{section}</button>)}
            </aside>
            <main><HbarAppUiToolbar title={`Workspace / ${activeSection}`}
                                    detail="Full application shell"/><HbarAppUiStatus
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
