import {Bell, CircleHelp, Plus, Search} from 'lucide-react'
import type {HbarAppUiNavbarActivityContent} from './NavbarContent'
import {uniqueHbarAppUiNavbarItems} from './NavbarContent'
import {NavbarButton, NavbarFrame, NavbarGlyph, NavbarIconOnly, reportNavbarAction, type NavbarSurfaceProps} from './NavbarPrimitives'

export function ActivityNavbar({spec, onAction, content}: NavbarSurfaceProps & {readonly content: HbarAppUiNavbarActivityContent}) {
    const items = uniqueHbarAppUiNavbarItems(content.items)
    return <NavbarFrame spec={spec} onAction={onAction} className="hbar-app-ui-navbar-activity">
        <header>
            <div className="hbar-app-ui-navbar-activity-brand"><span>{content.brandInitial}</span><strong>{content.brand}</strong></div>
            <label className="hbar-app-ui-navbar-activity-search"><NavbarGlyph icon={Search} tier="sm"/><input aria-label={content.labels.searchLabel} placeholder={content.labels.searchPlaceholder}/><kbd>{content.labels.shortcut}</kbd></label>
            <div className="hbar-app-ui-navbar-activity-actions">
                <NavbarButton className="hbar-app-ui-navbar-activity-new" onClick={() => reportNavbarAction(onAction, spec, 'new')}><NavbarGlyph icon={Plus} tier="sm"/><span>{content.labels.newItem}</span></NavbarButton>
                <NavbarIconOnly className="hbar-app-ui-navbar-activity-mobile-search" label={content.labels.openSearch} icon={Search} tier="sm" onClick={() => reportNavbarAction(onAction, spec, 'search')}/>
                <NavbarIconOnly label={content.labels.helpLabel} icon={CircleHelp} tier="sm" onClick={() => reportNavbarAction(onAction, spec, 'help')}/>
                <NavbarIconOnly label={content.labels.notifications} icon={Bell} tier="sm" onClick={() => reportNavbarAction(onAction, spec, 'notifications')}/>
                <NavbarButton aria-label={content.labels.accountLabel} className="hbar-app-ui-navbar-account-button" onClick={() => reportNavbarAction(onAction, spec, 'account')}><span className="hbar-app-ui-navbar-account">{content.labels.accountInitial}</span></NavbarButton>
            </div>
        </header>
        <main data-hbar-app-ui-list-strategy={content.listStrategy.kind} data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}><h1>{content.labels.today}</h1><ol>{items.map((item) => <li key={item.id}><button type="button" onClick={() => reportNavbarAction(onAction, spec, 'open', item.id)}><span><strong>{item.actor}</strong> {item.message}</span><time>{item.age}</time></button></li>)}</ol></main>
    </NavbarFrame>
}
