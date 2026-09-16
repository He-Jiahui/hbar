import { SettingsPreviewHost } from './SettingsPreviewHost'
import { previewLayoutStyle } from './preview-layout'
import { UsagePreviewHost } from './UsagePreviewHost'
import { PlanPreviewHost } from './PlanPreviewHost'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Maximize2, Moon, RotateCcw, Search, Sun, X } from 'lucide-react'
import {
  HBAR_APP_UI_CATEGORIES,
  HBAR_APP_UI_CATEGORY_COUNTS,
  HbarAppUiButton,
  HbarAppUiAgentActivityProvider,
  HbarAppUiAgentApprovalProvider,
  HbarAppUiPaywallProvider,
  HbarAppUiFileManagerProvider,
  HbarAppUiFeedbackProvider,
  HbarAppUiAuthenticationProvider,
  HbarAppUiBillingProvider,
  HbarAppUiEditorProvider,
  HbarAppUiNavbarProvider,
  HbarAppUiToolCallsProvider,
  HbarAppUiIconButton,
  HbarAppUiStatus,
  listHbarAppUiVariants,
} from 'hbar-app-ui/catalog'
import type { HbarAppUiEvent, HbarAppUiRegistryEntry, HbarAppUiVariantComponent, HbarAppUiCategory } from 'hbar-app-ui/catalog'
import 'hbar-app-ui/theme.css'
import './preview.css'
import { VariantHarness } from './VariantHarness'
import { ShellPreviewHost } from './ShellPreviewHost'
import { ConversationPreviewHost } from './ConversationPreviewHost'
import {
  createHbarAppUiAgentApprovalLocalizedFixtures,
  createHbarAppUiAgentApprovalOverflowFixtures,
  HBAR_APP_UI_AGENT_APPROVAL_FIXTURES,
} from '../../../tests/fixtures/hbar-app-ui-agent-approval-fixtures'
import {
  createHbarAppUiAgentPlanLocalizedFixtures,
  createHbarAppUiAgentPlanOverflowFixtures,
  HBAR_APP_UI_AGENT_PLAN_FIXTURES,
} from '../../../tests/fixtures/hbar-app-ui-agent-plan-fixtures'
import {
  createHbarAppUiAgentActivityLocalizedFixtures,
  createHbarAppUiAgentActivityOverflowFixtures,
  HBAR_APP_UI_AGENT_ACTIVITY_FIXTURES,
} from '../../../tests/fixtures/hbar-app-ui-agent-activity-fixtures'
import {
  createHbarAppUiEditorLocalizedFixtures,
  createHbarAppUiEditorOverflowFixtures,
  HBAR_APP_UI_EDITOR_FIXTURES,
} from '../../../tests/fixtures/hbar-app-ui-editor-fixtures'
import {
  createHbarAppUiNavbarLocalizedFixtures,
  createHbarAppUiNavbarOverflowFixtures,
  HBAR_APP_UI_NAVBAR_FIXTURES,
} from '../../../tests/fixtures/hbar-app-ui-navbar-fixtures'
import {
  createHbarAppUiToolCallsLocalizedFixtures,
  createHbarAppUiToolCallsOverflowFixtures,
  HBAR_APP_UI_TOOL_CALLS_FIXTURES,
} from '../../../tests/fixtures/hbar-app-ui-tool-calls-fixtures'
import {
  createHbarAppUiPaywallLocalizedFixtures,
  createHbarAppUiPaywallOverflowFixtures,
  HBAR_APP_UI_PAYWALL_FIXTURES,
} from '../../../tests/fixtures/hbar-app-ui-paywall-fixtures'
import {
  createHbarAppUiFileManagerLocalizedFixtures,
  createHbarAppUiFileManagerOverflowFixtures,
  HBAR_APP_UI_FILE_MANAGER_FIXTURES,
} from '../../../tests/fixtures/hbar-app-ui-file-manager-fixtures'
import {
  createHbarAppUiFeedbackLocalizedFixtures,
  createHbarAppUiFeedbackOverflowFixtures,
  HBAR_APP_UI_FEEDBACK_FIXTURES,
} from '../../../tests/fixtures/hbar-app-ui-feedback-fixtures'
import {
  createHbarAppUiSettingsFormLocalizedFixtures,
  createHbarAppUiSettingsFormOverflowFixtures,
  HBAR_APP_UI_SETTINGS_FORM_FIXTURES,
} from '../../../tests/fixtures/hbar-app-ui-settings-form-fixtures'
import {
  createHbarAppUiAuthenticationLocalizedFixtures,
  createHbarAppUiAuthenticationOverflowFixtures,
  HBAR_APP_UI_AUTHENTICATION_FIXTURES,
} from '../../../tests/fixtures/hbar-app-ui-authentication-fixtures'
import {
  createHbarAppUiBillingLocalizedFixtures,
  createHbarAppUiBillingOverflowFixtures,
  HBAR_APP_UI_BILLING_FIXTURES,
} from '../../../tests/fixtures/hbar-app-ui-billing-fixtures'

type Viewport = 'desktop' | 'tablet' | 'mobile'
type Theme = 'dark' | 'light'

const allEntries = listHbarAppUiVariants()
const viewportWidths: Record<Viewport, string> = { desktop: '100%', tablet: '768px', mobile: '390px' }

function readInitialVariant(): HbarAppUiRegistryEntry {
  const requested = new URLSearchParams(window.location.search).get('variant')
  const entry = allEntries.find((candidate) => candidate.spec.id === requested)
  return entry ?? allEntries[0]!
}

function readInitialTheme(): Theme {
  return new URLSearchParams(window.location.search).get('theme') === 'light' ? 'light' : 'dark'
}

function PreviewApp() {
  const [selected, setSelected] = useState<HbarAppUiRegistryEntry>(readInitialVariant)
  const [query, setQuery] = useState('')
  const [theme, setTheme] = useState<Theme>(readInitialTheme)
  const [viewport, setViewport] = useState<Viewport>('desktop')
  const [eventLog, setEventLog] = useState<readonly HbarAppUiEvent[]>([])
  const [isFullscreen, setIsFullscreen] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const isolated = useMemo(() => new URLSearchParams(window.location.search).get('mode') === 'isolated', [])
  const editorContent = useMemo(() => {
    switch (new URLSearchParams(window.location.search).get('editorFixture')) {
      case 'overflow':
        return createHbarAppUiEditorOverflowFixtures()
      case 'localized':
        return createHbarAppUiEditorLocalizedFixtures()
      case null:
      default:
        return HBAR_APP_UI_EDITOR_FIXTURES
    }
  }, [])
  const agentActivityContent = useMemo(() => {
    switch (new URLSearchParams(window.location.search).get('agentActivityFixture')) {
      case 'overflow':
        return createHbarAppUiAgentActivityOverflowFixtures()
      case 'localized':
        return createHbarAppUiAgentActivityLocalizedFixtures()
      case null:
      default:
        return HBAR_APP_UI_AGENT_ACTIVITY_FIXTURES
    }
  }, [])
  const agentApprovalContent = useMemo(() => {
    switch (new URLSearchParams(window.location.search).get('agentApprovalFixture')) {
      case 'overflow':
        return createHbarAppUiAgentApprovalOverflowFixtures()
      case 'localized':
        return createHbarAppUiAgentApprovalLocalizedFixtures()
      case null:
      default:
        return HBAR_APP_UI_AGENT_APPROVAL_FIXTURES
    }
  }, [])
  const agentPlanContent = useMemo(() => {
    switch (new URLSearchParams(window.location.search).get('agentPlanFixture')) {
      case 'overflow':
        return createHbarAppUiAgentPlanOverflowFixtures()
      case 'localized':
        return createHbarAppUiAgentPlanLocalizedFixtures()
      case null:
      default:
        return HBAR_APP_UI_AGENT_PLAN_FIXTURES
    }
  }, [])
  const navbarContent = useMemo(() => {
    switch (new URLSearchParams(window.location.search).get('navbarFixture')) {
      case 'overflow':
        return createHbarAppUiNavbarOverflowFixtures()
      case 'localized':
        return createHbarAppUiNavbarLocalizedFixtures()
      case null:
      default:
        return HBAR_APP_UI_NAVBAR_FIXTURES
    }
  }, [])
  const toolCallsContent = useMemo(() => {
    switch (new URLSearchParams(window.location.search).get('toolCallsFixture')) {
      case 'overflow':
        return createHbarAppUiToolCallsOverflowFixtures()
      case 'localized':
        return createHbarAppUiToolCallsLocalizedFixtures()
      case null:
      default:
        return HBAR_APP_UI_TOOL_CALLS_FIXTURES
    }
  }, [])
  const paywallContent = useMemo(() => {
    switch (new URLSearchParams(window.location.search).get('paywallFixture')) {
      case 'overflow':
        return createHbarAppUiPaywallOverflowFixtures()
      case 'localized':
        return createHbarAppUiPaywallLocalizedFixtures()
      case null:
      default:
        return HBAR_APP_UI_PAYWALL_FIXTURES
    }
  }, [])
  const fileManagerContent = useMemo(() => {
    switch (new URLSearchParams(window.location.search).get('fileManagerFixture')) {
      case 'overflow':
        return createHbarAppUiFileManagerOverflowFixtures()
      case 'localized':
        return createHbarAppUiFileManagerLocalizedFixtures()
      case null:
      default:
        return HBAR_APP_UI_FILE_MANAGER_FIXTURES
    }
  }, [])
  const feedbackContent = useMemo(() => {
    switch (new URLSearchParams(window.location.search).get('feedbackFixture')) {
      case 'overflow':
        return createHbarAppUiFeedbackOverflowFixtures()
      case 'localized':
        return createHbarAppUiFeedbackLocalizedFixtures()
      case null:
      default:
        return HBAR_APP_UI_FEEDBACK_FIXTURES
    }
  }, [])
  const settingsFormContent = useMemo(() => {
    switch (new URLSearchParams(window.location.search).get('settingsFormFixture')) {
      case 'overflow':
        return createHbarAppUiSettingsFormOverflowFixtures()
      case 'localized':
        return createHbarAppUiSettingsFormLocalizedFixtures()
      case null:
      default:
        return HBAR_APP_UI_SETTINGS_FORM_FIXTURES
    }
  }, [])
  const authenticationContent = useMemo(() => {
    switch (new URLSearchParams(window.location.search).get('authenticationFixture')) {
      case 'overflow':
        return createHbarAppUiAuthenticationOverflowFixtures()
      case 'localized':
        return createHbarAppUiAuthenticationLocalizedFixtures()
      case null:
      default:
        return HBAR_APP_UI_AUTHENTICATION_FIXTURES
    }
  }, [])
  const billingContent = useMemo(() => {
    switch (new URLSearchParams(window.location.search).get('billingFixture')) {
      case 'overflow':
        return createHbarAppUiBillingOverflowFixtures()
      case 'localized':
        return createHbarAppUiBillingLocalizedFixtures()
      case null:
      default:
        return HBAR_APP_UI_BILLING_FIXTURES
    }
  }, [])

  const filteredEntries = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return allEntries
    return allEntries.filter(({ spec }) => `${spec.title} ${spec.category} ${spec.description} ${spec.id}`.toLowerCase().includes(normalized))
  }, [query])

  const visibleCategories = useMemo(() => {
    const matching = new Set(filteredEntries.map(({ spec }) => spec.category))
    return HBAR_APP_UI_CATEGORIES.filter((category) => matching.has(category))
  }, [filteredEntries])

  const SelectedComponent = selected.component as HbarAppUiVariantComponent

  useEffect(() => {
    const handleFullscreen = () => setIsFullscreen(document.fullscreenElement === previewRef.current)
    document.addEventListener('fullscreenchange', handleFullscreen)
    return () => document.removeEventListener('fullscreenchange', handleFullscreen)
  }, [])

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search)
    parameters.set('variant', selected.spec.id)
    const nextUrl = `${window.location.pathname}?${parameters.toString()}`
    window.history.replaceState(null, '', nextUrl)
  }, [selected.spec.id])

  const chooseCategory = (category: HbarAppUiCategory) => {
    const first = filteredEntries.find(({ spec }) => spec.category === category) ?? allEntries.find(({ spec }) => spec.category === category)
    if (first) setSelected(first)
  }

  const chooseEntry = (entry: HbarAppUiRegistryEntry) => {
    setSelected(entry)
    setEventLog([])
  }

  const handleAction = (event: HbarAppUiEvent) => {
    setEventLog((current) => [event, ...current].slice(0, 12))
  }

  const resetPreview = () => {
    setQuery('')
    setTheme('dark')
    setViewport('desktop')
    setEventLog([])
    const first = allEntries[0]
    if (first) setSelected(first)
  }

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
      return
    }
    await previewRef.current?.requestFullscreen()
  }

  if (isolated) {
    return (
      <div
        className="hbar-app-ui-canvas hbar-app-ui-isolated-canvas"
        data-hbar-app-ui-theme={theme} style={previewLayoutStyle}
        data-hbar-app-ui-variant={selected.spec.id}
      >
        <HbarAppUiFileManagerProvider content={fileManagerContent}>
        <HbarAppUiFeedbackProvider content={feedbackContent}>
        <SettingsPreviewHost content={settingsFormContent} spec={selected.spec} onAction={handleAction}>
        <HbarAppUiAuthenticationProvider content={authenticationContent}>
        <HbarAppUiBillingProvider content={billingContent}>
        <HbarAppUiPaywallProvider content={paywallContent}>
          <PlanPreviewHost content={agentPlanContent}>
          <HbarAppUiAgentApprovalProvider content={agentApprovalContent}>
            <HbarAppUiAgentActivityProvider content={agentActivityContent}>
              <HbarAppUiToolCallsProvider content={toolCallsContent}>
                <HbarAppUiNavbarProvider content={navbarContent}>
                  <HbarAppUiEditorProvider content={editorContent}>
                    <ShellPreviewHost spec={selected.spec} onAction={handleAction}><ConversationPreviewHost spec={selected.spec} onAction={handleAction}><UsagePreviewHost spec={selected.spec} onAction={handleAction}><SelectedComponent spec={selected.spec} onAction={handleAction} /></UsagePreviewHost></ConversationPreviewHost></ShellPreviewHost>
                  </HbarAppUiEditorProvider>
                </HbarAppUiNavbarProvider>
              </HbarAppUiToolCallsProvider>
            </HbarAppUiAgentActivityProvider>
          </HbarAppUiAgentApprovalProvider>
        </PlanPreviewHost>
        </HbarAppUiPaywallProvider>
        </HbarAppUiBillingProvider>
        </HbarAppUiAuthenticationProvider>
        </SettingsPreviewHost>
        </HbarAppUiFeedbackProvider>
        </HbarAppUiFileManagerProvider>
      </div>
    )
  }

  return (
    <div className="hbar-app-ui-canvas hbar-app-ui-preview" data-hbar-app-ui-theme={theme} style={previewLayoutStyle} ref={previewRef}>
      <header className="hbar-app-ui-preview-header">
        <div className="hbar-app-ui-preview-brand">
          <span className="hbar-app-ui-preview-mark">h</span>
          <div>
            <strong>hbar-app-ui</strong>
            <small>Application UI catalog</small>
          </div>
        </div>
        <div className="hbar-app-ui-preview-header-actions">
          <HbarAppUiIconButton label={theme === 'dark' ? 'Use light theme' : 'Use dark theme'} onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </HbarAppUiIconButton>
          <HbarAppUiIconButton label="Reset preview" onClick={resetPreview}><RotateCcw size={16} /></HbarAppUiIconButton>
          <HbarAppUiIconButton label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} onClick={() => void toggleFullscreen()}><Maximize2 size={16} /></HbarAppUiIconButton>
        </div>
      </header>

      <div className="hbar-app-ui-preview-body">
        <aside className="hbar-app-ui-preview-sidebar" aria-label="hbar-app-ui categories">
          <label className="hbar-app-ui-preview-search">
            <Search size={15} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search components" aria-label="Search components" />
            {query && <HbarAppUiIconButton label="Clear search" onClick={() => setQuery('')}><X size={14} /></HbarAppUiIconButton>}
          </label>
          <div className="hbar-app-ui-preview-catalog-heading">
            <span>Categories</span>
            <small>{filteredEntries.length} / 300 variants</small>
          </div>
          <nav className="hbar-app-ui-preview-category-list">
            {visibleCategories.map((category) => <button className={selected.spec.category === category ? 'is-selected' : ''} key={category} type="button" onClick={() => chooseCategory(category)}><span>{category}</span><small>{HBAR_APP_UI_CATEGORY_COUNTS[category]}</small></button>)}
            {!visibleCategories.length && <p className="hbar-app-ui-preview-no-results">No matching components.</p>}
          </nav>
        </aside>

        <main className="hbar-app-ui-preview-main">
          <div className="hbar-app-ui-preview-toolbar">
            <div>
              <span className="hbar-app-ui-preview-eyebrow">{selected.spec.category}</span>
              <h1>{selected.spec.title}</h1>
            </div>
            <div className="hbar-app-ui-preview-viewports" role="group" aria-label="Preview viewport">
              {(Object.keys(viewportWidths) as Viewport[]).map((option) => <HbarAppUiButton key={option} className={viewport === option ? 'is-selected' : ''} aria-pressed={viewport === option} onClick={() => setViewport(option)}>{option}</HbarAppUiButton>)}
            </div>
          </div>

          <div className="hbar-app-ui-preview-content">
            <section className="hbar-app-ui-preview-stage" aria-label="Selected component preview">
              <div className="hbar-app-ui-preview-stage-meta"><HbarAppUiStatus value={`${selected.spec.variant} of ${HBAR_APP_UI_CATEGORY_COUNTS[selected.spec.category]}`} tone="positive" /><code>{selected.spec.id}</code></div>
              <div className={`hbar-app-ui-preview-frame hbar-app-ui-preview-frame-${viewport}`} style={{ maxWidth: viewportWidths[viewport] }}>
                <div
                  className={`hbar-app-ui-preview-component-canvas hbar-app-ui-surface-${selected.spec.profile.surface} hbar-app-ui-state-${selected.spec.profile.initialState} hbar-app-ui-visual-${selected.spec.profile.visualMode}`}
                  data-hbar-app-ui-variant={selected.spec.id}
                  data-hbar-app-ui-profile={selected.spec.profile.key}
                  data-hbar-app-ui-surface={selected.spec.profile.surface}
                  data-hbar-app-ui-state={selected.spec.profile.initialState}
                >
                  <HbarAppUiFileManagerProvider content={fileManagerContent}>
                  <HbarAppUiFeedbackProvider content={feedbackContent}>
                  <SettingsPreviewHost content={settingsFormContent} spec={selected.spec} onAction={handleAction}>
                  <HbarAppUiAuthenticationProvider content={authenticationContent}>
                  <HbarAppUiBillingProvider content={billingContent}>
                  <HbarAppUiPaywallProvider content={paywallContent}>
                    <PlanPreviewHost content={agentPlanContent}>
                    <HbarAppUiAgentApprovalProvider content={agentApprovalContent}>
                      <HbarAppUiAgentActivityProvider content={agentActivityContent}>
                        <HbarAppUiToolCallsProvider content={toolCallsContent}>
                          <HbarAppUiNavbarProvider content={navbarContent}>
                            <HbarAppUiEditorProvider content={editorContent}>
                              <ShellPreviewHost spec={selected.spec} onAction={handleAction}><ConversationPreviewHost spec={selected.spec} onAction={handleAction}><UsagePreviewHost spec={selected.spec} onAction={handleAction}><SelectedComponent spec={selected.spec} onAction={handleAction} /></UsagePreviewHost></ConversationPreviewHost></ShellPreviewHost>
                            </HbarAppUiEditorProvider>
                          </HbarAppUiNavbarProvider>
                        </HbarAppUiToolCallsProvider>
                      </HbarAppUiAgentActivityProvider>
                    </HbarAppUiAgentApprovalProvider>
                  </PlanPreviewHost>
                  </HbarAppUiPaywallProvider>
                  </HbarAppUiBillingProvider>
                  </HbarAppUiAuthenticationProvider>
                  </SettingsPreviewHost>
                  </HbarAppUiFeedbackProvider>
                  </HbarAppUiFileManagerProvider>
                </div>
              </div>
            </section>

            <aside className="hbar-app-ui-preview-inspector" aria-label="Variant inspector">
              <div className="hbar-app-ui-preview-inspector-section">
                <div className="hbar-app-ui-preview-section-heading"><strong>Variants</strong><small>{filteredEntries.filter(({ spec }) => spec.category === selected.spec.category).length} shown</small></div>
                <div className="hbar-app-ui-preview-variant-list">
                  {filteredEntries.filter(({ spec }) => spec.category === selected.spec.category).map((entry) => <button className={entry.spec.id === selected.spec.id ? 'is-selected' : ''} key={entry.spec.id} type="button" onClick={() => chooseEntry(entry)}><span>{entry.spec.title}</span><small>{entry.spec.layout}</small></button>)}
                </div>
              </div>
              <VariantHarness spec={selected.spec} onAction={handleAction} />
              <div className="hbar-app-ui-preview-inspector-section">
                <div className="hbar-app-ui-preview-section-heading"><strong>Interaction log</strong><small>{eventLog.length} events</small></div>
                {eventLog.length ? <ol className="hbar-app-ui-preview-events">{eventLog.map((event, index) => <li key={`${event.variantId}-${event.actionId}-${index}`}><code>{event.actionId}</code>{event.value && <span>{event.value}</span>}</li>)}</ol> : <p className="hbar-app-ui-preview-muted">Use the selected component to observe action events.</p>}
              </div>
              <div className="hbar-app-ui-preview-inspector-section hbar-app-ui-preview-contract">
                <div className="hbar-app-ui-preview-section-heading"><strong>Variant contract</strong><small>{selected.spec.density}</small></div>
                <dl><dt>Entry</dt><dd><code>{selected.spec.entry}</code></dd><dt>Behavior</dt><dd>{selected.spec.behavior.join(' / ')}</dd><dt>Observation</dt><dd>{selected.spec.observation.join(' / ')}</dd><dt>Visual checks</dt><dd>{selected.spec.visualValidation.join(' / ')}</dd></dl>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing hbar-app-ui preview root')
createRoot(root).render(<PreviewApp />)
