import {ArrowRight, ChevronDown, Menu} from 'lucide-react'
import type {HbarAppUiNavbarLandingContent} from './NavbarContent'
import {NavbarButton, NavbarFrame, NavbarGlyph, NavbarIconOnly, reportNavbarAction, type NavbarSurfaceProps} from './NavbarPrimitives'

export function LandingNavbar({spec, onAction, content, centered = false}: NavbarSurfaceProps & {
    readonly content: HbarAppUiNavbarLandingContent
    readonly centered?: boolean
}) {
    const displayArrow = spec.variant === 5
    return <NavbarFrame spec={spec} onAction={onAction} className={`hbar-app-ui-navbar-landing${centered ? ' hbar-app-ui-navbar-landing-centered' : ''}`}>
        <header>
            <div className="hbar-app-ui-navbar-landing-brand"><span>{content.brandMark}</span><strong>{content.brand}</strong></div>
            <nav aria-label={content.brand}>{content.navItems.map((item, index) => <NavbarButton key={`${index}-${item}`} onClick={() => reportNavbarAction(onAction, spec, 'navigate', item)}><span>{item}</span>{index < 2 && <NavbarGlyph icon={ChevronDown} tier="xs"/>}</NavbarButton>)}</nav>
            <div className="hbar-app-ui-navbar-landing-actions">
                {!centered && <NavbarButton className="hbar-app-ui-navbar-landing-sign-in" onClick={() => reportNavbarAction(onAction, spec, 'sign-in')}>{content.labels.signIn}</NavbarButton>}
                {!centered && <NavbarButton className="hbar-app-ui-navbar-landing-primary" onClick={() => reportNavbarAction(onAction, spec, 'primary')}><span>{content.labels.primaryAction}</span>{displayArrow && <NavbarGlyph icon={ArrowRight} tier="sm"/>}</NavbarButton>}
                <NavbarIconOnly label={content.labels.menu} icon={Menu} tier="md" onClick={() => reportNavbarAction(onAction, spec, 'menu')}/>
            </div>
        </header>
        <main>
            {content.labels.eyebrow && <p className="hbar-app-ui-navbar-landing-eyebrow">{content.labels.eyebrow}</p>}<h1>{content.title}</h1><p className="hbar-app-ui-navbar-landing-description">{content.description}</p>
            {content.stats ? <dl data-hbar-app-ui-list-strategy={content.statsStrategy?.kind} data-hbar-app-ui-expected-maximum={content.statsStrategy?.expectedMaximum}>{content.stats.map((stat) => <div key={stat.label}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>)}</dl> : <div className="hbar-app-ui-navbar-landing-placeholders">{Array.from({length: content.placeholderCount}, (_, index) => <i aria-hidden="true" key={index}/>)}</div>}
        </main>
    </NavbarFrame>
}
