import {useState} from 'react'
import {
    Bell,
    Bookmark,
    ChevronDown,
    ChevronRight,
    Copy,
    Menu,
    MoreHorizontal,
    Search,
    Share2,
    ShoppingBag,
    Sun,
    Users,
    X
} from 'lucide-react'
import {
    HbarAppUiButton,
    HbarAppUiIconButton,
    HbarAppUiProgress,
    HbarAppUiSpotlight,
    HbarAppUiStatus,
    HbarAppUiTabs,
    HbarAppUiToolbar
} from '../primitives'
import type {HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'

type NavbarProps = HbarAppUiVariantProps

function ProjectHeader({spec, onAction}: NavbarProps) {
    const [tab, setTab] = useState('Overview');
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-navbar-variant-1">
        <div className="hbar-app-ui-project-header">
            <div><small>Workspace / Project Atlas</small><h3>Project Atlas</h3></div>
            <div className="hbar-app-ui-avatar-stack"><span>A</span><span>M</span><span>+4</span></div>
        </div>
        <HbarAppUiTabs label="Project sections" value={tab} options={[{id: 'Overview', label: 'Overview'}, {
            id: 'Activity',
            label: 'Activity'
        }, {id: 'Settings', label: 'Settings'}]} onChange={(value) => {
            setTab(value);
            onAction?.({variantId: spec.id, actionId: 'tabs', value})
        }}/></ActionSurfaceFrame>
}

function BreadcrumbToolbar({spec, onAction}: NavbarProps) {
    const [menu, setMenu] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-navbar-variant-2"><HbarAppUiToolbar title="Workspace / Sessions"
                                                                                          detail="Compact breadcrumb actions"/>
        <div className="hbar-app-ui-chip-row"><span>Open</span><span>Assigned to me</span><span>Newest</span></div>
        <HbarAppUiButton onClick={() => setMenu((value) => !value)}><MoreHorizontal
            size={14}/>More</HbarAppUiButton>{menu && <HbarAppUiSpotlight className="hbar-app-ui-navbar-popover">
            <button type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'invite'})}><Users
                size={13}/>Invite
            </button>
            <button type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'sort'})}>Sort oldest first
            </button>
        </HbarAppUiSpotlight>}</ActionSurfaceFrame>
}

function WorkspaceSwitcher({spec, onAction}: NavbarProps) {
    const [project, setProject] = useState('Project Atlas');
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-navbar-variant-3">
        <div className="hbar-app-ui-switcher-bar"><label>Organization<select>
            <option>hbar</option>
            <option>Acme</option>
        </select></label><ChevronRight size={14}/><label>Project<select value={project} onChange={(event) => {
            setProject(event.target.value);
            onAction?.({variantId: spec.id, actionId: 'picker', value: event.target.value})
        }}>
            <option>Project Atlas</option>
            <option>Project Nova</option>
        </select></label><ChevronRight size={14}/><label>Environment<select>
            <option>Production</option>
            <option>Staging</option>
        </select></label></div>
    </ActionSurfaceFrame>
}

function MarketingHeader({spec, onAction}: NavbarProps) {
    const [open, setOpen] = useState<string | undefined>();
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-navbar-variant-4">
        <header className="hbar-app-ui-marketing-header"><strong>hbar</strong>
            <nav>{['Product', 'Solutions', 'Resources', 'Pricing'].map((item) => <button type="button" key={item}
                                                                                         onMouseEnter={() => setOpen(item)}
                                                                                         onFocus={() => setOpen(item)}>{item}<ChevronDown
                size={12}/></button>)}</nav>
            <HbarAppUiButton tone="accent"
                             onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: 'start'})}>Get
                started</HbarAppUiButton></header>
        {open && <HbarAppUiSpotlight className="hbar-app-ui-mega-panel"><strong>{open}</strong>
            <p>Explore {open.toLowerCase()} for your workspace.</p></HbarAppUiSpotlight>}</ActionSurfaceFrame>
}

function MegaHeader({spec, onAction}: NavbarProps) {
    const [open, setOpen] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-navbar-variant-5">
        <header className="hbar-app-ui-mega-header"><strong>hbar</strong>
            <nav>
                <button type="button" onClick={() => setOpen((value) => !value)}>Platform <ChevronDown size={12}/>
                </button>
                <button type="button">Developers</button>
                <button type="button">Company</button>
            </nav>
            <HbarAppUiButton tone="accent"
                             onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: 'demo'})}>Book a
                demo</HbarAppUiButton></header>
        {open && <div className="hbar-app-ui-mega-columns">
            <div><strong>Platform</strong><span>AI workspace</span><span>Activity</span><span>Integrations</span></div>
            <div><strong>Resources</strong><span>Docs</span><span>Guides</span><span>Changelog</span></div>
        </div>}</ActionSurfaceFrame>
}

function AppTopbar({spec, onAction}: NavbarProps) {
    const [searchOpen, setSearchOpen] = useState(false);
    const [noticeOpen, setNoticeOpen] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-navbar-variant-6">
        <header className="hbar-app-ui-app-topbar"><strong>Workspace</strong>{searchOpen &&
            <input autoFocus placeholder="Search" aria-label="Search"/>}<HbarAppUiIconButton label="Search"
                                                                                             onClick={() => setSearchOpen((value) => !value)}><Search
            size={14}/></HbarAppUiIconButton><HbarAppUiIconButton label="Notifications"
                                                                  onClick={() => setNoticeOpen((value) => !value)}><Bell
            size={14}/></HbarAppUiIconButton>
            <button type="button"
                    onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: 'account'})}>Avery
            </button>
        </header>
        {noticeOpen &&
            <HbarAppUiSpotlight className="hbar-app-ui-navbar-popover"><strong>Notifications</strong><span>Run completed · 2m ago</span><span>Approval needed · 18m ago</span></HbarAppUiSpotlight>}
    </ActionSurfaceFrame>
}

function DashboardHeader({spec, onAction}: NavbarProps) {
    const [tab, setTab] = useState('Overview');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-navbar-variant-7"><HbarAppUiToolbar title="Operations dashboard"
                                                                                          detail="Two-tier navigation"/><HbarAppUiStatus
        value="Live" tone="positive"/><HbarAppUiTabs label="Dashboard sections" value={tab}
                                                     options={[{id: 'Overview', label: 'Overview'}, {
                                                         id: 'Runs',
                                                         label: 'Runs'
                                                     }, {id: 'Usage', label: 'Usage'}]} onChange={(value) => {
        setTab(value);
        onAction?.({variantId: spec.id, actionId: 'tabs', value})
    }}/>
        <div className="hbar-app-ui-subnav"><span>Today</span><span>Week</span><span>Month</span></div>
    </ActionSurfaceFrame>
}

function SegmentedNavbar({spec, onAction}: NavbarProps) {
    const [tab, setTab] = useState('All');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-navbar-variant-8"><HbarAppUiToolbar title="Segmented toolbar"
                                                                                          detail="Pill indicator and overflow view"/><HbarAppUiTabs
        label="Views" value={tab}
        options={[{id: 'All', label: 'All'}, {id: 'Mine', label: 'Mine'}, {id: 'Starred', label: 'Starred'}]}
        onChange={(value) => {
            setTab(value);
            onAction?.({variantId: spec.id, actionId: 'tabs', value})
        }}/></ActionSurfaceFrame>
}

function CommerceNavbar({spec, onAction}: NavbarProps) {
    const [cart, setCart] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-navbar-variant-9">
        <header className="hbar-app-ui-commerce-header"><strong>hbar market</strong>
            <nav>
                <button type="button">New</button>
                <button type="button">Bundles</button>
                <button type="button">Guides</button>
            </nav>
            <HbarAppUiIconButton label="Cart" onClick={() => setCart((value) => !value)}><ShoppingBag
                size={15}/></HbarAppUiIconButton></header>
        {cart &&
            <HbarAppUiSpotlight className="hbar-app-ui-cart-popover"><strong>Your cart</strong><span>Workspace plan · $24</span><HbarAppUiButton
                tone="accent" onClick={() => onAction?.({
                variantId: spec.id,
                actionId: 'open',
                value: 'checkout'
            })}>Checkout</HbarAppUiButton></HbarAppUiSpotlight>}</ActionSurfaceFrame>
}

function DocsHeader({spec, onAction}: NavbarProps) {
    const [version, setVersion] = useState('v1.4');
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-navbar-variant-10">
        <header className="hbar-app-ui-docs-header"><strong>Docs</strong><select aria-label="Version" value={version}
                                                                                 onChange={(event) => {
                                                                                     setVersion(event.target.value);
                                                                                     onAction?.({
                                                                                         variantId: spec.id,
                                                                                         actionId: 'picker',
                                                                                         value: event.target.value
                                                                                     })
                                                                                 }}>
            <option>v1.4</option>
            <option>v1.3</option>
        </select><label><Search size={13}/><input placeholder="Search docs"/></label><HbarAppUiIconButton label="Theme"><Sun
            size={14}/></HbarAppUiIconButton><HbarAppUiIconButton label="Open menu"><Menu
            size={14}/></HbarAppUiIconButton></header>
    </ActionSurfaceFrame>
}

function EditorToolbar({spec, onAction}: NavbarProps) {
    const [title, setTitle] = useState('Workspace notes');
    const [saved, setSaved] = useState(true);
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-navbar-variant-11">
        <header className="hbar-app-ui-editor-toolbar"><input value={title} onChange={(event) => {
            setTitle(event.target.value);
            setSaved(false)
        }} aria-label="Document title"/><HbarAppUiStatus value={saved ? 'Saved' : 'Unsaved'}
                                                         tone={saved ? 'positive' : 'warning'}/>
            <div className="hbar-app-ui-avatar-stack"><span>A</span><span>M</span></div>
            <HbarAppUiButton onClick={() => {
                setSaved(true);
                onAction?.({variantId: spec.id, actionId: 'save'})
            }}>Save</HbarAppUiButton><HbarAppUiButton
                onClick={() => onAction?.({variantId: spec.id, actionId: 'share'})}><Share2
                size={13}/>Share</HbarAppUiButton></header>
    </ActionSurfaceFrame>
}

function FloatingNavbar({spec, onAction}: NavbarProps) {
    const [menu, setMenu] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-navbar-variant-12">
        <header className="hbar-app-ui-floating-navbar"><strong>hbar</strong>
            <nav>
                <button type="button">Workspaces</button>
                <button type="button">Pricing</button>
                <button type="button">About</button>
            </nav>
            <HbarAppUiIconButton label="Menu" onClick={() => setMenu((value) => !value)}><Menu
                size={14}/></HbarAppUiIconButton></header>
        {menu && <HbarAppUiSpotlight className="hbar-app-ui-full-menu">
            <button type="button">Workspaces</button>
            <button type="button">Pricing</button>
            <button type="button"
                    onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: 'contact'})}>Contact
            </button>
        </HbarAppUiSpotlight>}</ActionSurfaceFrame>
}

function CenteredLogoNavbar({spec, onAction}: NavbarProps) {
    const [open, setOpen] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-navbar-variant-13">
        <header className="hbar-app-ui-centered-navbar">
            <nav>
                <button type="button">Product</button>
                <button type="button">Solutions</button>
            </nav>
            <strong>hbar</strong>
            <nav>
                <button type="button">Resources</button>
                <button type="button" onClick={() => setOpen((value) => !value)}>Menu <ChevronDown size={12}/></button>
            </nav>
        </header>
        {open && <div className="hbar-app-ui-fullscreen-menu"><HbarAppUiIconButton label="Close"
                                                                                   onClick={() => setOpen(false)}><X
            size={15}/></HbarAppUiIconButton><strong>Explore hbar</strong>
            <button type="button"
                    onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: 'platform'})}>Platform
            </button>
            <button type="button">Company</button>
        </div>}</ActionSurfaceFrame>
}

function ArticleHeader({spec, onAction}: NavbarProps) {
    const [progress, setProgress] = useState(42);
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-navbar-variant-14">
        <header className="hbar-app-ui-article-header">
            <div><small>Guides / Workspaces</small><h3>Designing reliable activity panels</h3><p>How to keep state,
                actions and feedback close together.</p></div>
            <div><HbarAppUiIconButton label="Bookmark"
                                      onClick={() => onAction?.({variantId: spec.id, actionId: 'bookmark'})}><Bookmark
                size={15}/></HbarAppUiIconButton><HbarAppUiIconButton label="Copy link" onClick={() => onAction?.({
                variantId: spec.id,
                actionId: 'copy'
            })}><Copy size={15}/></HbarAppUiIconButton></div>
        </header>
        <HbarAppUiProgress value={progress} label="Reading progress" tone="accent"/><HbarAppUiButton
        onClick={() => setProgress(Math.min(100, progress + 12))}>Continue
        reading</HbarAppUiButton></ActionSurfaceFrame>
}

export function Navbar({spec, onAction}: NavbarProps) {
    switch (spec.variant) {
        case 1:
            return <ProjectHeader spec={spec} onAction={onAction}/>;
        case 2:
            return <BreadcrumbToolbar spec={spec} onAction={onAction}/>;
        case 3:
            return <WorkspaceSwitcher spec={spec} onAction={onAction}/>;
        case 4:
            return <MarketingHeader spec={spec} onAction={onAction}/>;
        case 5:
            return <MegaHeader spec={spec} onAction={onAction}/>;
        case 6:
            return <AppTopbar spec={spec} onAction={onAction}/>;
        case 7:
            return <DashboardHeader spec={spec} onAction={onAction}/>;
        case 8:
            return <SegmentedNavbar spec={spec} onAction={onAction}/>;
        case 9:
            return <CommerceNavbar spec={spec} onAction={onAction}/>;
        case 10:
            return <DocsHeader spec={spec} onAction={onAction}/>;
        case 11:
            return <EditorToolbar spec={spec} onAction={onAction}/>;
        case 12:
            return <FloatingNavbar spec={spec} onAction={onAction}/>;
        case 13:
            return <CenteredLogoNavbar spec={spec} onAction={onAction}/>;
        case 14:
            return <ArticleHeader spec={spec} onAction={onAction}/>;
        default:
            return <ProjectHeader spec={spec} onAction={onAction}/>
    }
}
