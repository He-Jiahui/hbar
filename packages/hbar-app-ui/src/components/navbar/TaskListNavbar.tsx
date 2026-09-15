import {Grid2X2, House, Filter, MoreHorizontal, SlidersHorizontal, UserPlus} from 'lucide-react'
import type {HbarAppUiNavbarTaskListContent} from './NavbarContent'
import {uniqueHbarAppUiNavbarItems} from './NavbarContent'
import {NavbarButton, NavbarFrame, NavbarGlyph, NavbarIconOnly, reportNavbarAction, type NavbarSurfaceProps} from './NavbarPrimitives'

export function TaskListNavbar({spec, onAction, content}: NavbarSurfaceProps & {readonly content: HbarAppUiNavbarTaskListContent}) {
    const rows = uniqueHbarAppUiNavbarItems(content.rows)
    return <NavbarFrame spec={spec} onAction={onAction} className="hbar-app-ui-navbar-task-list">
        <header className="hbar-app-ui-navbar-task-header">
            <nav aria-label={content.labels.breadcrumbLabel(content.breadcrumbs)}>
                {content.breadcrumbs.map((item, index) => <span className={index === content.breadcrumbs.length - 1 ? 'is-current' : ''} key={`${index}-${item}`}>
                    <NavbarGlyph icon={index === 0 ? House : Grid2X2} tier="xs"/><span>{item}</span>
                    {index < content.breadcrumbs.length - 1 && <i>{content.labels.metadataSeparator}</i>}
                </span>)}
            </nav>
            <div className="hbar-app-ui-navbar-task-people">{content.avatars.map((avatar, index) => <span key={`${index}-${avatar}`}>{avatar}</span>)}<small>{content.extraAvatarLabel}</small></div>
            <NavbarButton className="hbar-app-ui-navbar-task-invite" onClick={() => reportNavbarAction(onAction, spec, 'invite')}><NavbarGlyph icon={UserPlus} tier="sm"/><span>{content.labels.invite}</span></NavbarButton>
            <NavbarIconOnly label={content.labels.filter} icon={Filter} tier="sm" onClick={() => reportNavbarAction(onAction, spec, 'filter')}/>
            <NavbarIconOnly label={content.labels.sort} icon={SlidersHorizontal} tier="sm" onClick={() => reportNavbarAction(onAction, spec, 'sort')}/>
            <NavbarIconOnly label={content.labels.more} icon={MoreHorizontal} tier="sm" onClick={() => reportNavbarAction(onAction, spec, 'more')}/>
        </header>
        <main className="hbar-app-ui-navbar-task-main" data-hbar-app-ui-list-strategy={content.listStrategy.kind} data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}>
            <p>{content.labels.sortedBy}</p>
            <ol>{rows.map((row) => <li key={row.id}><button type="button" onClick={() => reportNavbarAction(onAction, spec, 'open', row.id)}><strong>{row.title}</strong><span>{row.sprint}{content.labels.metadataSeparator}{row.owner}</span></button></li>)}</ol>
        </main>
    </NavbarFrame>
}
