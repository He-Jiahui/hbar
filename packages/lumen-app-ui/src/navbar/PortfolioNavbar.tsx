import { LumenButton } from '../primitives'
import { Menu } from './glyphs'
import { type LumenNavbarPortfolioContent, uniqueLumenNavbarItems } from './content'
import { NavbarNavigationOwner } from './navigation'
import { NavbarButton, NavbarFrame, NavbarIconOnly, type NavbarSurfaceProps, reportNavbarAction } from './primitives'
import * as React from 'react'
import { LumenDrawer } from '../ui-controls'

function PortfolioNavbarLegacy({
  spec,
  onAction,
  content,
}: NavbarSurfaceProps & {
  readonly content: LumenNavbarPortfolioContent
}) {
  const projects = uniqueLumenNavbarItems(content.projects)
  return (
    <NavbarNavigationOwner
      navigation={content.navigation}
      items={[...content.leftNav, ...content.rightNav].map((label) => ({ id: label, label }))}
      onChoose={(id) => reportNavbarAction(onAction, spec, 'navigate', id)}
    >
      {({ open, toggle }) => (
        <NavbarFrame spec={spec} onAction={onAction} className="hbar-app-ui-navbar-portfolio">
          <header>
            <nav className="hbar-app-ui-navbar-portfolio-left" aria-label={content.brand}>
              {content.leftNav.map((item, index) => (
                <NavbarButton
                  key={`${index}-${item}`}
                  onClick={() => reportNavbarAction(onAction, spec, 'navigate', item)}
                >
                  {item}
                </NavbarButton>
              ))}
            </nav>
            <strong>{content.brand}</strong>
            <nav className="hbar-app-ui-navbar-portfolio-right" aria-label={content.brand}>
              {content.rightNav.map((item, index) => (
                <NavbarButton
                  key={`${index}-${item}`}
                  onClick={() => reportNavbarAction(onAction, spec, 'navigate', item)}
                >
                  {item}
                </NavbarButton>
              ))}
            </nav>
            <NavbarIconOnly
              className="hbar-app-ui-navbar-portfolio-menu"
              label={open && content.navigation ? content.navigation.close : content.labels.menu}
              data-navbar-navigation-trigger="true"
              aria-expanded={content.navigation ? open : undefined}
              icon={Menu}
              tier="sm"
              onClick={() => (content.navigation ? toggle() : reportNavbarAction(onAction, spec, 'menu'))}
            />
          </header>
          <main
            data-hbar-app-ui-list-strategy={content.projectStrategy.kind}
            data-hbar-app-ui-expected-maximum={content.projectStrategy.expectedMaximum}
          >
            <p>{content.labels.eyebrow}</p>
            <h1>{content.title}</h1>
            <ol>
              {projects.map((project) => (
                <li key={project.id}>
                  <LumenButton type="button" onClick={() => reportNavbarAction(onAction, spec, 'open', project.id)}>
                    <strong>{project.name}</strong>
                    <span>{project.detail}</span>
                    <time>{project.year}</time>
                  </LumenButton>
                </li>
              ))}
            </ol>
          </main>
        </NavbarFrame>
      )}
    </NavbarNavigationOwner>
  )
}
;('use client')

function PortfolioNavbarWorkflow({
  spec,
  onAction,
  content,
}: NavbarSurfaceProps & {
  readonly content: PortfolioNavbarWorkflowContent
}) {
  const projects = uniqueLumenNavbarItems(content.projects)
  const [menuOpen, setMenuOpen] = React.useState(false)
  return (
    <NavbarFrame spec={spec} className="hbar-app-ui-navbar-portfolio">
      <header>
        <nav className="hbar-app-ui-navbar-portfolio-left" aria-label={content.brand}>
          {content.leftNav.map((item, index) => (
            <NavbarButton key={`${index}-${item}`} onClick={() => reportNavbarAction(onAction, spec, 'navigate', item)}>
              {item}
            </NavbarButton>
          ))}
        </nav>
        <strong>{content.brand}</strong>
        <nav className="hbar-app-ui-navbar-portfolio-right" aria-label={content.brand}>
          {content.rightNav.map((item, index) => (
            <NavbarButton key={`${index}-${item}`} onClick={() => reportNavbarAction(onAction, spec, 'navigate', item)}>
              {item}
            </NavbarButton>
          ))}
        </nav>
        <NavbarIconOnly
          className="hbar-app-ui-navbar-portfolio-menu"
          label={content.labels.menu}
          icon={Menu}
          tier="sm"
          aria-expanded={menuOpen}
          onClick={() => {
            setMenuOpen(true)
            reportNavbarAction(onAction, spec, 'menu')
          }}
        />
      </header>
      <LumenDrawer
        open={menuOpen}
        title={content.labels.overlayTitle}
        closeLabel={content.labels.closeMenu}
        onClose={() => setMenuOpen(false)}
        side="bottom"
        className="hbar-app-ui-navbar-portfolio-overlay"
      >
        <p>{content.labels.overlayDescription}</p>
        <nav aria-label={content.labels.overlayTitle}>
          {[...content.leftNav, ...content.rightNav].map((item, index) => (
            <LumenButton
              variant="text"
              key={`${index}-${item}`}
              onClick={() => {
                reportNavbarAction(onAction, spec, 'navigate', item)
                setMenuOpen(false)
              }}
            >
              {item}
            </LumenButton>
          ))}
        </nav>
        <ol>
          {projects.map((project) => (
            <li key={project.id}>
              <LumenButton
                variant="text"
                onClick={() => {
                  reportNavbarAction(onAction, spec, 'open', project.id)
                  setMenuOpen(false)
                }}
              >
                <span>{project.name}</span>
                <small>{project.year}</small>
              </LumenButton>
            </li>
          ))}
        </ol>
      </LumenDrawer>
      <main
        data-hbar-app-ui-list-strategy={content.projectStrategy.kind}
        data-hbar-app-ui-expected-maximum={content.projectStrategy.expectedMaximum}
      >
        <p>{content.labels.eyebrow}</p>
        <h1>{content.title}</h1>
        <ol>
          {projects.map((project) => (
            <li key={project.id}>
              <LumenButton type="button" onClick={() => reportNavbarAction(onAction, spec, 'open', project.id)}>
                <strong>{project.name}</strong>
                <span>{project.detail}</span>
                <time>{project.year}</time>
              </LumenButton>
            </li>
          ))}
        </ol>
      </main>
    </NavbarFrame>
  )
}
interface PortfolioNavbarWorkflowContent extends LumenNavbarPortfolioContent {
  readonly labels: LumenNavbarPortfolioContent['labels'] & {
    readonly closeMenu: NonNullable<LumenNavbarPortfolioContent['labels']['closeMenu']>
    readonly overlayTitle: NonNullable<LumenNavbarPortfolioContent['labels']['overlayTitle']>
    readonly overlayDescription: NonNullable<LumenNavbarPortfolioContent['labels']['overlayDescription']>
  }
}
function hasPortfolioNavbarWorkflow(content: LumenNavbarPortfolioContent): content is PortfolioNavbarWorkflowContent {
  return (
    content.labels.closeMenu !== undefined &&
    content.labels.overlayTitle !== undefined &&
    content.labels.overlayDescription !== undefined
  )
}

export function PortfolioNavbar(props: NavbarSurfaceProps & { readonly content: LumenNavbarPortfolioContent }) {
  return hasPortfolioNavbarWorkflow(props.content) ? (
    <PortfolioNavbarWorkflow {...props} content={props.content} />
  ) : (
    <PortfolioNavbarLegacy {...props} />
  )
}
