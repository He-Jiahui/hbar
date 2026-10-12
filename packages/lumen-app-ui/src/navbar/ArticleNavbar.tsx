import { ArrowLeft, Bookmark, Copy, List, Share2 } from './glyphs'
import { type LumenNavbarArticleContent, uniqueLumenNavbarItems } from './content'
import { useRef } from 'react'
import { NavbarPopup } from './menu'
import { NavbarFrame, NavbarGlyph, NavbarIconOnly, type NavbarSurfaceProps, reportNavbarAction } from './primitives'

export function ArticleNavbar({
  spec,
  onAction,
  content,
}: NavbarSurfaceProps & {
  readonly content: LumenNavbarArticleContent
}) {
  const sections = uniqueLumenNavbarItems(content.sections)
  const main = useRef<HTMLElement>(null)
  return (
    <NavbarFrame spec={spec} onAction={onAction} className="hbar-app-ui-navbar-article">
      <header>
        <NavbarIconOnly
          label={content.labels.back}
          icon={ArrowLeft}
          tier="sm"
          onClick={() => reportNavbarAction(onAction, spec, 'back')}
        />
        <div className="hbar-app-ui-navbar-article-summary">
          <p>{content.title}</p>
          <small>{content.authorMeta}</small>
        </div>
        <section>
          <NavbarPopup
            label={content.labels.contents}
            className="hbar-app-ui-navbar-article-contents"
            items={sections.map((section) => ({ id: section.id, label: section.title }))}
            onChoose={(id) => {
              const section = Array.from(
                main.current?.querySelectorAll<HTMLElement>('[data-navbar-section]') ?? [],
              ).find((element) => element.dataset.navbarSection === id)
              if (!section) return
              section.scrollIntoView({ block: 'start', behavior: 'instant' })
              reportNavbarAction(onAction, spec, 'section', id)
            }}
          >
            <NavbarGlyph icon={List} tier="sm" />
            <span>{content.labels.contents}</span>
          </NavbarPopup>
          <NavbarIconOnly
            label={content.bookmarked?.label ?? content.labels.bookmark}
            icon={Bookmark}
            tier="sm"
            className="hbar-app-ui-navbar-article-bookmark"
            role={content.bookmarked ? 'checkbox' : undefined}
            aria-checked={content.bookmarked?.value}
            onClick={() => {
              if (content.bookmarked) content.bookmarked.onChange(!content.bookmarked.value)
              else reportNavbarAction(onAction, spec, 'bookmark')
            }}
          />
          <NavbarIconOnly
            label={content.labels.copyLink}
            icon={Copy}
            tier="sm"
            onClick={() => reportNavbarAction(onAction, spec, 'copy')}
          />
          <NavbarIconOnly
            label={content.labels.share}
            icon={Share2}
            tier="sm"
            onClick={() => reportNavbarAction(onAction, spec, 'share')}
          />
        </section>
      </header>
      <main
        ref={main}
        data-hbar-app-ui-list-strategy={content.sectionStrategy.kind}
        data-hbar-app-ui-expected-maximum={content.sectionStrategy.expectedMaximum}
      >
        <article>
          <h1>{content.title}</h1>
          <p>{content.description}</p>
          {sections.map((section) => (
            <section key={section.id} data-navbar-section={section.id}>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
              {section.placeholder && <i aria-hidden="true" />}
            </section>
          ))}
        </article>
      </main>
    </NavbarFrame>
  )
}
;('use client')
