import {useState} from 'react'
import {
    Bell,
    ChevronDown,
    FileText,
    Home,
    Menu,
    MessageCircle,
    MoreHorizontal,
    Plus,
    Search,
    Settings2,
    X
} from 'lucide-react'
import {HbarAppUiButton, HbarAppUiIconButton, HbarAppUiSpotlight, HbarAppUiTabs, HbarAppUiToolbar} from '../primitives'
import type {HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'

type MobileProps = HbarAppUiVariantProps

function BottomTabs({spec, onAction}: MobileProps) {
    const [tab, setTab] = useState('Home');
    const tabs = [{id: 'Home', icon: Home}, {id: 'Activity', icon: MessageCircle}, {
        id: 'Files',
        icon: FileText
    }, {id: 'Alerts', icon: Bell}, {id: 'More', icon: MoreHorizontal}];
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-mobile-variant-1">
        <div className="hbar-app-ui-mobile-screen">
            <main><HbarAppUiToolbar title={tab}
                                    detail="Crossfading panel per tab"/><HbarAppUiSpotlight><strong>{tab} panel</strong>
                <p>Mobile content changes without losing the bottom navigation.</p></HbarAppUiSpotlight></main>
            <nav className="hbar-app-ui-bottom-tabs">{tabs.map(({id, icon: Icon}) => <button type="button"
                                                                                             className={tab === id ? 'is-active' : ''}
                                                                                             key={id} onClick={() => {
                setTab(id);
                onAction?.({variantId: spec.id, actionId: 'tabs', value: id})
            }}><Icon size={16}/><span>{id}</span>{id === 'Alerts' && <i>3</i>}</button>)}</nav>
        </div>
    </ActionSurfaceFrame>
}

function ExpandingAction({spec, onAction}: MobileProps) {
    const [open, setOpen] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-mobile-variant-2">
        <div className="hbar-app-ui-mobile-action"><HbarAppUiSpotlight><strong>Current workspace</strong><p>Quick
            actions stay within thumb reach.</p></HbarAppUiSpotlight>{open && <div className="hbar-app-ui-action-fan">
            <button type="button"
                    onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: 'new-session'})}>New session
            </button>
            <button type="button"
                    onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: 'upload'})}>Upload file
            </button>
            <button type="button"
                    onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: 'invite'})}>Invite member
            </button>
        </div>}<HbarAppUiButton tone="accent" className="hbar-app-ui-floating-action"
                                onClick={() => setOpen((value) => !value)}>{open ? <X size={18}/> :
            <Plus size={18}/>}</HbarAppUiButton></div>
    </ActionSurfaceFrame>
}

function SearchDock({spec, onAction}: MobileProps) {
    const [search, setSearch] = useState('');
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-mobile-variant-3">
        <div className="hbar-app-ui-mobile-search-dock"><HbarAppUiSpotlight><strong>Recent results</strong><span>Workspace sync</span><span>Run history</span><span>Release notes</span></HbarAppUiSpotlight><label><Search
            size={15}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search"
                              aria-label="Search"/>
            <button type="button" onClick={() => setSearch('')}><X size={13}/></button>
        </label><HbarAppUiButton
            onClick={() => onAction?.({variantId: spec.id, actionId: 'search', value: search})}>Search</HbarAppUiButton>
        </div>
    </ActionSurfaceFrame>
}

function NavigationSheet({spec, onAction}: MobileProps) {
    const [open, setOpen] = useState(true);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-mobile-variant-4"><HbarAppUiToolbar title="Mobile shortcuts"
                                                                                          detail="Two-snap navigation sheet"/><HbarAppUiIconButton
        label="Toggle shortcuts" onClick={() => setOpen((value) => !value)}><ChevronDown
        size={15}/></HbarAppUiIconButton>{open && <div className="hbar-app-ui-navigation-sheet">
        <button type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: 'new-run'})}><Plus
            size={15}/>New run
        </button>
        <button type="button"><FileText size={15}/>Files</button>
        <button type="button"><Bell size={15}/>Notifications</button>
        <button type="button"><Settings2 size={15}/>Settings</button>
    </div>}</ActionSurfaceFrame>
}

function FullscreenMenu({spec, onAction}: MobileProps) {
    const [open, setOpen] = useState(false);
    const [section, setSection] = useState('Workspace');
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-mobile-variant-5">
        <header className="hbar-app-ui-mobile-topbar"><HbarAppUiIconButton label="Open full-screen menu"
                                                                           onClick={() => setOpen(true)}><Menu
            size={16}/></HbarAppUiIconButton><strong>Workspace</strong><HbarAppUiIconButton
            label="Messages"><MessageCircle size={16}/></HbarAppUiIconButton></header>
        <HbarAppUiTabs label="Mobile section" value={section} options={[{id: 'Workspace', label: 'Workspace'}, {
            id: 'Activity',
            label: 'Activity'
        }, {id: 'Settings', label: 'Settings'}]} onChange={(value) => {
            setSection(value);
            onAction?.({variantId: spec.id, actionId: 'tabs', value})
        }}/>{open && <div className="hbar-app-ui-fullscreen-mobile-menu"><HbarAppUiIconButton label="Close menu"
                                                                                              onClick={() => setOpen(false)}><X
        size={15}/></HbarAppUiIconButton><strong>Navigate</strong>
        <button type="button"
                onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: 'Overview'})}>Overview
        </button>
        <button type="button">Sessions</button>
        <button type="button">Files</button>
        <button type="button">Settings</button>
    </div>}</ActionSurfaceFrame>
}

export function Mobile({spec, onAction}: MobileProps) {
    switch (spec.variant) {
        case 1:
            return <BottomTabs spec={spec} onAction={onAction}/>;
        case 2:
            return <ExpandingAction spec={spec} onAction={onAction}/>;
        case 3:
            return <SearchDock spec={spec} onAction={onAction}/>;
        case 4:
            return <NavigationSheet spec={spec} onAction={onAction}/>;
        case 5:
            return <FullscreenMenu spec={spec} onAction={onAction}/>;
        default:
            return <BottomTabs spec={spec} onAction={onAction}/>
    }
}
