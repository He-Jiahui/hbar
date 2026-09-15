import {ChevronDown, CircleHelp, MessageSquare, Search, Settings} from 'lucide-react'
import {useState} from 'react'
import type {HbarAppUiNavbarAnalyticsContent} from './NavbarContent'
import {NavbarButton, NavbarFrame, NavbarGlyph, NavbarIconOnly, reportNavbarAction, type NavbarSurfaceProps} from './NavbarPrimitives'

function resolveTab(items: readonly string[], requested: string): string {
    return items.includes(requested) ? requested : items[0] ?? ''
}

export function AnalyticsNavbar({spec, onAction, content}: NavbarSurfaceProps & {readonly content: HbarAppUiNavbarAnalyticsContent}) {
    const [primary, setPrimary] = useState(() => resolveTab(content.primaryTabs, content.activePrimaryTab))
    const [secondary, setSecondary] = useState(() => resolveTab(content.secondaryTabs, content.activeSecondaryTab))
    return <NavbarFrame spec={spec} onAction={onAction} className="hbar-app-ui-navbar-analytics">
        <header>
            <div className="hbar-app-ui-navbar-analytics-brand"><span>{content.workspaceInitial}</span><strong>{content.workspace}</strong><NavbarButton onClick={() => reportNavbarAction(onAction, spec, 'workspace')}><span>{content.workspaceLabel}</span><NavbarGlyph icon={ChevronDown} tier="xs"/></NavbarButton></div>
            <div className="hbar-app-ui-navbar-analytics-actions"><NavbarIconOnly label={content.labels.searchLabel} icon={Search} tier="sm" onClick={() => reportNavbarAction(onAction, spec, 'search')}/><NavbarIconOnly label={content.labels.helpLabel} icon={CircleHelp} tier="sm" onClick={() => reportNavbarAction(onAction, spec, 'help')}/><NavbarIconOnly label={content.labels.settingsLabel} icon={Settings} tier="sm" onClick={() => reportNavbarAction(onAction, spec, 'settings')}/><NavbarButton aria-label={content.labels.accountLabel} className="hbar-app-ui-navbar-account-button" onClick={() => reportNavbarAction(onAction, spec, 'account')}><span className="hbar-app-ui-navbar-account">{content.initials}</span></NavbarButton></div>
        </header>
        <nav className="hbar-app-ui-navbar-analytics-primary" aria-label={content.workspace}>{content.primaryTabs.map((tab) => <NavbarButton key={tab} className={primary === tab ? 'is-selected' : ''} onClick={() => { setPrimary(tab); reportNavbarAction(onAction, spec, 'primary-tab', tab) }}>{tab}</NavbarButton>)}<NavbarButton className="hbar-app-ui-navbar-analytics-feedback" onClick={() => reportNavbarAction(onAction, spec, 'feedback')}><NavbarGlyph icon={MessageSquare} tier="sm"/><span>{content.feedbackLabel}</span></NavbarButton></nav>
        <nav className="hbar-app-ui-navbar-analytics-secondary" aria-label={primary}>{content.secondaryTabs.map((tab) => <NavbarButton key={tab} className={secondary === tab ? 'is-selected' : ''} onClick={() => { setSecondary(tab); reportNavbarAction(onAction, spec, 'secondary-tab', tab) }}>{tab}</NavbarButton>)}</nav>
        <main><h1>{content.titleLabel(primary, secondary)}</h1><dl data-hbar-app-ui-list-strategy={content.metricsStrategy.kind} data-hbar-app-ui-expected-maximum={content.metricsStrategy.expectedMaximum}>{content.metrics.map((metric) => <div key={metric.label}><dt>{metric.label}</dt><dd>{metric.value}</dd><small>{metric.detail}</small></div>)}</dl><i aria-hidden="true"/></main>
    </NavbarFrame>
}
