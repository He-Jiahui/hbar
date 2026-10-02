import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { DEFAULT_LUMEN_APPEARANCE, LumenFrame, LumenProvider } from '@lumen/app-ui'
import { HBAR_APP_UI_CATEGORIES, type HbarAppUiRegistryEntry } from 'hbar-app-ui/catalog'
import type { PreviewWorkspaceCopy } from '../../../tests/fixtures/preview-workspace-copy'
import { PreviewHeader } from './PreviewHeader'
import { PreviewCatalog } from './PreviewCatalog'
import { PreviewInspector } from './PreviewInspector'
import { PreviewStage, PreviewToolbar } from './PreviewStage'
import { PreviewScene } from './PreviewScene'
import { createPreviewWorkspaceStore, filterPreviewEntries } from './preview-workspace-store'
import { previewLayoutStyle } from './preview-layout'

export interface PreviewAppProps {
  readonly entries: readonly HbarAppUiRegistryEntry[]
  readonly parameters: URLSearchParams
  readonly copy: PreviewWorkspaceCopy
}
export function PreviewApp({ entries, parameters, copy }: PreviewAppProps) {
  const [store] = useState(() => createPreviewWorkspaceStore(entries, parameters))
  const selectedId = useStore(store, (state) => state.selectedId)
  const query = useStore(store, (state) => state.query)
  const theme = useStore(store, (state) => state.theme)
  const viewport = useStore(store, (state) => state.viewport)
  const eventLog = useStore(store, (state) => state.eventLog)
  const chooseEntry = useStore(store, (state) => state.chooseEntry)
  const chooseCategory = useStore(store, (state) => state.chooseCategory)
  const setQuery = useStore(store, (state) => state.setQuery)
  const setViewport = useStore(store, (state) => state.setViewport)
  const toggleTheme = useStore(store, (state) => state.toggleTheme)
  const reset = useStore(store, (state) => state.reset)
  const recordAction = useStore(store, (state) => state.recordAction)
  const selected = useMemo(() => {
    const entry = entries.find((candidate) => candidate.spec.id === selectedId) ?? entries[0]
    if (!entry) throw new Error('No preview component is registered.')
    return entry
  }, [entries, selectedId])
  const filteredEntries = useMemo(() => filterPreviewEntries(entries, query), [entries, query])
  const visibleCategories = useMemo(() => {
    const matching = new Set(filteredEntries.map(({ spec }) => spec.category))
    return HBAR_APP_UI_CATEGORIES.filter((category) => matching.has(category))
  }, [filteredEntries])
  const [fullscreen, setFullscreen] = useState(false)
  const [fullscreenError, setFullscreenError] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const isolated = parameters.get('mode') === 'isolated'

  useEffect(() => {
    const handleFullscreen = () => setFullscreen(document.fullscreenElement === previewRef.current)
    document.addEventListener('fullscreenchange', handleFullscreen)
    return () => document.removeEventListener('fullscreenchange', handleFullscreen)
  }, [])
  useEffect(() => {
    const next = new URLSearchParams(window.location.search)
    next.set('variant', selected.spec.id)
    window.history.replaceState(null, '', `${window.location.pathname}?${next.toString()}`)
  }, [selected.spec.id])
  function toggleFullscreen(): void {
    setFullscreenError(false)
    const update = async () => {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await previewRef.current?.requestFullscreen()
    }
    update().catch(() => setFullscreenError(true))
  }
  return (
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: theme }} withCssBaseline={false}>
      {isolated ? (
        <LumenFrame
          className="hbar-app-ui-canvas hbar-app-ui-isolated-canvas"
          data-hbar-app-ui-theme={theme}
          style={previewLayoutStyle}
          data-hbar-app-ui-variant={selected.spec.id}
        >
          <PreviewScene selected={selected} onAction={recordAction} />
        </LumenFrame>
      ) : (
        <LumenFrame
          ref={previewRef}
          className="hbar-app-ui-canvas hbar-app-ui-preview"
          data-hbar-app-ui-theme={theme}
          style={previewLayoutStyle}
        >
          <PreviewHeader
            theme={theme}
            fullscreen={fullscreen}
            fullscreenError={fullscreenError}
            copy={copy}
            onTheme={toggleTheme}
            onReset={reset}
            onFullscreen={toggleFullscreen}
          />
          <LumenFrame className="hbar-app-ui-preview-body">
            <PreviewCatalog
              query={query}
              categories={visibleCategories}
              selectedCategory={selected.spec.category}
              shown={filteredEntries.length}
              total={entries.length}
              copy={copy}
              onQuery={setQuery}
              onCategory={chooseCategory}
            />
            <LumenFrame as="main" className="hbar-app-ui-preview-main">
              <PreviewToolbar selected={selected} viewport={viewport} copy={copy} onViewport={setViewport} />
              <LumenFrame className="hbar-app-ui-preview-content">
                <PreviewStage selected={selected} viewport={viewport} copy={copy} onAction={recordAction} />
                <PreviewInspector
                  selected={selected}
                  entries={filteredEntries}
                  eventLog={eventLog}
                  copy={copy}
                  onEntry={chooseEntry}
                  onAction={recordAction}
                />
              </LumenFrame>
            </LumenFrame>
          </LumenFrame>
        </LumenFrame>
      )}
    </LumenProvider>
  )
}
