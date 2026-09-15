import {ArrowLeft, History, MoreHorizontal, Share2} from 'lucide-react'
import type {HbarAppUiNavbarDocumentContent} from './NavbarContent'
import {uniqueHbarAppUiNavbarItems} from './NavbarContent'
import {NavbarButton, NavbarFrame, NavbarGlyph, NavbarIconOnly, reportNavbarAction, type NavbarSurfaceProps} from './NavbarPrimitives'

export function DocumentNavbar({spec, onAction, content}: NavbarSurfaceProps & {readonly content: HbarAppUiNavbarDocumentContent}) {
    const outline = uniqueHbarAppUiNavbarItems(content.outline)
    return <NavbarFrame spec={spec} onAction={onAction} className="hbar-app-ui-navbar-document">
        <header><NavbarIconOnly label={content.labels.back} icon={ArrowLeft} tier="sm" onClick={() => reportNavbarAction(onAction, spec, 'back')}/><div className="hbar-app-ui-navbar-document-summary"><NavbarButton onClick={() => reportNavbarAction(onAction, spec, 'title')}><span>{content.title}</span></NavbarButton><span>{content.labels.saved}</span></div><section>{content.avatars.map((avatar, index) => <span key={`${index}-${avatar}`}>{avatar}</span>)}<NavbarIconOnly label={content.labels.versionHistory} icon={History} tier="sm" onClick={() => reportNavbarAction(onAction, spec, 'history')}/><NavbarButton className="hbar-app-ui-navbar-document-share" onClick={() => reportNavbarAction(onAction, spec, 'share')}><NavbarGlyph icon={Share2} tier="sm"/><span>{content.labels.share}</span></NavbarButton><NavbarIconOnly label={content.labels.actions} icon={MoreHorizontal} tier="sm" onClick={() => reportNavbarAction(onAction, spec, 'more')}/></section></header>
        <main data-hbar-app-ui-list-strategy={content.outlineStrategy.kind} data-hbar-app-ui-expected-maximum={content.outlineStrategy.expectedMaximum}><h1>{content.title}</h1><p>{content.description}</p>{outline.map((item) => <button type="button" key={item.id} onClick={() => reportNavbarAction(onAction, spec, 'open', item.id)}>{item.label}</button>)}</main>
    </NavbarFrame>
}
