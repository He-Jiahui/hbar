import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Maximize2, Moon, RotateCcw, Search, Sun, X } from 'lucide-react'
import {
  HBAR_APP_UI_CATEGORIES,
  HBAR_APP_UI_CATEGORY_COUNTS,
  HbarAppUiButton,
  HbarAppUiIconButton,
  HbarAppUiStatus,
  listHbarAppUiVariants,
} from 'hbar-app-ui'
import type { HbarAppUiEvent, HbarAppUiRegistryEntry, HbarAppUiVariantComponent, HbarAppUiCategory } from 'hbar-app-ui'
import 'hbar-app-ui/theme.css'
import './preview.css'

type Viewport = 'desktop' | 'tablet' | 'mobile'
type Theme = 'dark' | 'light'

const allEntries = listHbarAppUiVariants()
const viewportWidths: Record<Viewport, string> = { desktop: '100%', tablet: '768px', mobile: '390px' }

function readInitialVariant(): HbarAppUiRegistryEntry {
  const requested = new URLSearchParams(window.location.search).get('variant')
  const entry = allEntries.find((candidate) => candidate.spec.id === requested)
  return entry ?? allEntries[0]!
}

function PreviewApp() {
  const [selected, setSelected] = useState<HbarAppUiRegistryEntry>(readInitialVariant)
  const [query, setQuery] = useState('')
  const [theme, setTheme] = useState<Theme>('dark')
  const [viewport, setViewport] = useState<Viewport>('desktop')
  const [eventLog, setEventLog] = useState<readonly HbarAppUiEvent[]>([])
  const [isFullscreen, setIsFullscreen] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

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
    const nextUrl = `${window.location.pathname}?variant=${encodeURIComponent(selected.spec.id)}`
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

  return (
    <div className="hbar-app-ui-canvas hbar-app-ui-preview" data-hbar-app-ui-theme={theme} ref={previewRef}>
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
                <SelectedComponent spec={selected.spec} onAction={handleAction} />
              </div>
            </section>

            <aside className="hbar-app-ui-preview-inspector" aria-label="Variant inspector">
              <div className="hbar-app-ui-preview-inspector-section">
                <div className="hbar-app-ui-preview-section-heading"><strong>Variants</strong><small>{filteredEntries.filter(({ spec }) => spec.category === selected.spec.category).length} shown</small></div>
                <div className="hbar-app-ui-preview-variant-list">
                  {filteredEntries.filter(({ spec }) => spec.category === selected.spec.category).map((entry) => <button className={entry.spec.id === selected.spec.id ? 'is-selected' : ''} key={entry.spec.id} type="button" onClick={() => chooseEntry(entry)}><span>{entry.spec.title}</span><small>{entry.spec.layout}</small></button>)}
                </div>
              </div>
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
