import {ArrowLeft, Bookmark, Copy, List, Share2} from 'lucide-react'
import type {HbarAppUiNavbarArticleContent} from './NavbarContent'
import {uniqueHbarAppUiNavbarItems} from './NavbarContent'
import {NavbarButton, NavbarFrame, NavbarGlyph, NavbarIconOnly, reportNavbarAction, type NavbarSurfaceProps} from './NavbarPrimitives'

export function ArticleNavbar({spec, onAction, content}: NavbarSurfaceProps & {readonly content: HbarAppUiNavbarArticleContent}) {
    const sections = uniqueHbarAppUiNavbarItems(content.sections)
    return <NavbarFrame spec={spec} onAction={onAction} className="hbar-app-ui-navbar-article">
        <header>
            <NavbarIconOnly label={content.labels.back} icon={ArrowLeft} tier="sm" onClick={() => reportNavbarAction(onAction, spec, 'back')}/>
            <div className="hbar-app-ui-navbar-article-summary"><p>{content.title}</p><small>{content.authorMeta}</small></div>
            <section>
                <NavbarButton className="hbar-app-ui-navbar-article-contents" onClick={() => reportNavbarAction(onAction, spec, 'contents')}><NavbarGlyph icon={List} tier="sm"/><span>{content.labels.contents}</span></NavbarButton>
                <NavbarIconOnly label={content.labels.bookmark} icon={Bookmark} tier="sm" onClick={() => reportNavbarAction(onAction, spec, 'bookmark')}/>
                <NavbarIconOnly label={content.labels.copyLink} icon={Copy} tier="sm" onClick={() => reportNavbarAction(onAction, spec, 'copy')}/>
                <NavbarIconOnly label={content.labels.share} icon={Share2} tier="sm" onClick={() => reportNavbarAction(onAction, spec, 'share')}/>
            </section>
        </header>
        <main data-hbar-app-ui-list-strategy={content.sectionStrategy.kind} data-hbar-app-ui-expected-maximum={content.sectionStrategy.expectedMaximum}>
            <article><h1>{content.title}</h1><p>{content.description}</p>{sections.map((section) => <section key={section.id}><h2>{section.title}</h2><p>{section.body}</p>{section.placeholder && <i aria-hidden="true"/>}</section>)}</article>
        </main>
    </NavbarFrame>
}
