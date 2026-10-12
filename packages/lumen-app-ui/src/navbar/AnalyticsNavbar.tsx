import { ChevronDown, CircleHelp, MessageSquare, Search, Settings } from './glyphs'
import { useState } from 'react'
import { type LumenNavbarAnalyticsContent, selectLumenNavbarItem, uniqueLumenNavbarItems } from './content'
import {
  NavbarButton,
  NavbarFrame,
  NavbarGlyph,
  NavbarIconOnly,
  type NavbarSurfaceProps,
  reportNavbarAction,
} from './primitives'

function resolveTab(items: readonly string[], requested: string): string {
  return items.includes(requested) ? requested : (items[0] ?? '')
}

export function AnalyticsNavbar({
  spec,
  onAction,
  content,
}: NavbarSurfaceProps & {
  readonly content: LumenNavbarAnalyticsContent
}) {
  const [localPrimary, setPrimary] = useState(() => resolveTab(content.primaryTabs, content.activePrimaryTab))
  const [localSecondary, setSecondary] = useState(() => resolveTab(content.secondaryTabs, content.activeSecondaryTab))
  const primaryOptions = uniqueLumenNavbarItems(
    content.primaryOptions ?? content.primaryTabs.map((label) => ({ id: label, label })),
  )
  const primary = selectLumenNavbarItem(
    primaryOptions,
    content.selection ? (content.selection.primaryId ?? '') : localPrimary,
  )
  const section = content.sections?.find((item) => item.primaryId === primary?.id)
  const secondaryOptions = uniqueLumenNavbarItems(
    section?.secondaryOptions ??
      content.secondaryOptions ??
      content.secondaryTabs.map((label) => ({ id: label, label })),
  )
  const secondary = selectLumenNavbarItem(
    secondaryOptions,
    content.selection ? (content.selection.secondaryId ?? '') : localSecondary,
  )
  return (
    <NavbarFrame spec={spec} onAction={onAction} className="hbar-app-ui-navbar-analytics">
      <header>
        <div className="hbar-app-ui-navbar-analytics-brand">
          <span>{content.workspaceInitial}</span>
          <strong>{content.workspace}</strong>
          <NavbarButton onClick={() => reportNavbarAction(onAction, spec, 'workspace')}>
            <span>{content.workspaceLabel}</span>
            <NavbarGlyph icon={ChevronDown} tier="xs" />
          </NavbarButton>
        </div>
        <div className="hbar-app-ui-navbar-analytics-actions">
          <NavbarIconOnly
            label={content.labels.searchLabel}
            icon={Search}
            tier="sm"
            onClick={() => reportNavbarAction(onAction, spec, 'search')}
          />
          <NavbarIconOnly
            label={content.labels.helpLabel}
            icon={CircleHelp}
            tier="sm"
            onClick={() => reportNavbarAction(onAction, spec, 'help')}
          />
          <NavbarIconOnly
            label={content.labels.settingsLabel}
            icon={Settings}
            tier="sm"
            onClick={() => reportNavbarAction(onAction, spec, 'settings')}
          />
          <NavbarButton
            aria-label={content.labels.accountLabel}
            className="hbar-app-ui-navbar-account-button"
            onClick={() => reportNavbarAction(onAction, spec, 'account')}
          >
            <span className="hbar-app-ui-navbar-account">{content.initials}</span>
          </NavbarButton>
        </div>
      </header>
      <nav className="hbar-app-ui-navbar-analytics-primary" aria-label={content.workspace} role="tablist">
        {primaryOptions.map((tab) => (
          <NavbarButton
            key={tab.id}
            role="tab"
            aria-selected={primary?.id === tab.id}
            className={primary?.id === tab.id ? 'is-selected' : ''}
            onClick={() => {
              if (content.selection) {
                content.selection.onPrimaryChange(tab.id)
                return
              }
              setPrimary(tab.id)
              setSecondary(
                content.sections?.find((item) => item.primaryId === tab.id)?.initialSecondaryId ??
                  content.activeSecondaryTab,
              )
              reportNavbarAction(onAction, spec, 'primary-tab', tab.id)
            }}
          >
            {tab.label}
          </NavbarButton>
        ))}
        <NavbarButton
          className="hbar-app-ui-navbar-analytics-feedback"
          onClick={() => reportNavbarAction(onAction, spec, 'feedback')}
        >
          <NavbarGlyph icon={MessageSquare} tier="sm" />
          <span>{content.feedbackLabel}</span>
        </NavbarButton>
      </nav>
      <nav className="hbar-app-ui-navbar-analytics-secondary" aria-label={primary?.label}>
        {secondaryOptions.map((tab) => (
          <NavbarButton
            key={tab.id}
            aria-pressed={secondary?.id === tab.id}
            className={secondary?.id === tab.id ? 'is-selected' : ''}
            onClick={() => {
              if (content.selection) {
                content.selection.onSecondaryChange(tab.id)
                return
              }
              setSecondary(tab.id)
              reportNavbarAction(onAction, spec, 'secondary-tab', tab.id)
            }}
          >
            {tab.label}
          </NavbarButton>
        ))}
      </nav>
      <main>
        <h1>{content.titleLabel(primary?.label ?? '', secondary?.label ?? '')}</h1>
        <dl
          data-hbar-app-ui-list-strategy={content.metricsStrategy.kind}
          data-hbar-app-ui-expected-maximum={content.metricsStrategy.expectedMaximum}
        >
          {(section?.metrics ?? content.metrics).map((metric) => (
            <div key={metric.label}>
              <dt>{metric.label}</dt>
              <dd>{metric.value}</dd>
              <small>{metric.detail}</small>
            </div>
          ))}
        </dl>
        <i aria-hidden="true" />
      </main>
    </NavbarFrame>
  )
}
;('use client')
