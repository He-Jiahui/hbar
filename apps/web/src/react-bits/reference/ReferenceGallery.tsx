import { useMemo, useState } from 'react'
import { Check, ExternalLink, Filter, Maximize2, Search, X } from 'lucide-react'
import { FloatingSurface } from '../../FloatingLayer'
import GlassSurface from '../GlassSurface'
import { getReferenceVariant, listReferenceVariants, REFERENCE_CATEGORY_COUNTS } from './reference-manifest'
import ReferencePreviewFrame from './ReferencePreviewFrame'
import type { ReferenceCategory, ReferenceInteraction, ReferenceViewport } from './reference-types'
import './ReferenceGallery.css'

type ReferenceGalleryProps = { open: boolean; onClose(): void }

const categoryLabels: Record<ReferenceCategory, string> = {
  'ai-chat': 'AI Chat', 'prompt-input': 'Prompt Input', 'agent-activity': 'Agent Activity', 'tool-calls': 'Tool Calls', 'agent-approval': 'Agent Approval', 'agent-plan': 'Agent Plan', 'ai-usage': 'AI Usage',
  'app-shell': 'App Shell', 'app-sidebar': 'App Sidebar', 'command-menu': 'Command Menu', navbar: 'Navbar', mobile: 'Mobile',
  card: 'Card', 'data-table': 'Data Table', dashboard: 'Dashboard', analytics: 'Analytics', list: 'List', filtering: 'Filtering', 'file-manager': 'File Manager', monitoring: 'Monitoring', 'empty-state': 'Empty State',
  'settings-form': 'Settings Form', forms: 'Forms', 'app-dialog': 'App Dialog', notifications: 'Notifications', onboarding: 'Onboarding', paywall: 'Paywall', authentication: 'Authentication',
  kanban: 'Kanban', wizard: 'Wizard', comments: 'Comments', scheduling: 'Scheduling', integrations: 'Integrations', editor: 'Editor', feedback: 'Feedback', support: 'Support', billing: 'Billing', chat: 'Chat',
}

export default function ReferenceGallery({ open, onClose }: ReferenceGalleryProps) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<ReferenceCategory | 'all'>('all')
  const [selectedId, setSelectedId] = useState('reactbits.ai-chat-9')
  const [viewport, setViewport] = useState<ReferenceViewport>('desktop')
  const [refreshKey, setRefreshKey] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const [lastInteraction, setLastInteraction] = useState<ReferenceInteraction | null>(null)
  const selected = getReferenceVariant(selectedId) ?? listReferenceVariants()[0]
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const variants = useMemo(() => listReferenceVariants(category === 'all' ? undefined : category).filter((variant) => `${variant.referenceId} ${variant.title} ${variant.variantSlug} ${variant.description}`.toLocaleLowerCase().includes(normalizedQuery)), [category, normalizedQuery])
  const categoryVariants = useMemo(() => listReferenceVariants(category === 'all' ? undefined : category), [category])

  if (!open || !selected) return null
  const selectedVariant = selected

  function selectCategory(next: ReferenceCategory | 'all') {
    setCategory(next)
    const nextVariants = listReferenceVariants(next === 'all' ? undefined : next)
    if (nextVariants[0]) setSelectedId(nextVariants[0].referenceId)
    setQuery('')
  }

  function selectVariant(referenceId: string) {
    const next = getReferenceVariant(referenceId)
    if (!next) return
    setSelectedId(referenceId)
    setCategory(next.category)
    setLastInteraction(null)
  }

  function moveVariant(direction: -1 | 1) {
    const source = categoryVariants.length > 0 ? categoryVariants : listReferenceVariants()
    const index = source.findIndex((variant) => variant.referenceId === selectedVariant?.referenceId)
    const next = source[(index + direction + source.length) % source.length]
    if (next) selectVariant(next.referenceId)
  }

  return <FloatingSurface mode="modal" open={open} onClose={onClose} className="rb-reference-gallery-overlay" backdropClassName="rb-reference-gallery-backdrop"><GlassSurface className="rb-reference-gallery" width="min(1420px, calc(100vw - 32px))" height="min(900px, calc(100vh - 32px))" role="dialog" aria-modal="true" aria-label="ReactBits 参考画廊" data-testid="reactbits-reference-gallery"><header className="rb-reference-gallery-header"><div><strong>ReactBits Application UI</strong><small>38 categories · 300 variants · public clean-room recreation</small></div><div className="rb-reference-gallery-actions"><a className="rb-reference-gallery-doc-link" href="https://pro.reactbits.dev/docs/app-ui" target="_blank" rel="noreferrer"><ExternalLink size={12} /> Source matrix</a><button type="button" title="Fullscreen preview" aria-label="Fullscreen preview" onClick={() => setFullscreen((value) => !value)}><Maximize2 size={14} /></button><button type="button" title="Close" aria-label="Close" onClick={onClose}><X size={16} /></button></div></header><div className="rb-reference-gallery-body"><aside className="rb-reference-gallery-sidebar" aria-label="Reference categories"><label className="rb-reference-search"><Search size={14} /><input aria-label="Search references" placeholder="Search variants" value={query} onChange={(event) => setQuery(event.target.value)} /></label><button type="button" className={category === 'all' ? 'selected rb-reference-category' : 'rb-reference-category'} onClick={() => selectCategory('all')}><Filter size={13} />All variants <span>300</span></button><div className="rb-reference-category-list">{(Object.entries(REFERENCE_CATEGORY_COUNTS) as [ReferenceCategory, number][]).map(([key, count]) => <button type="button" key={key} className={category === key ? 'selected rb-reference-category' : 'rb-reference-category'} onClick={() => selectCategory(key)}><span>{categoryLabels[key]}</span><span>{count}</span></button>)}</div></aside><main className="rb-reference-gallery-main"><div className="rb-reference-breadcrumb"><span>Application UI</span><span>/</span><strong>{categoryLabels[selected.category]}</strong><span>/</span><strong>{selected.title}</strong><a href={selected.sourceUrl} target="_blank" rel="noreferrer" title="Open source reference"><ExternalLink size={13} /></a></div><div className="rb-reference-variant-toolbar"><div><h2>{selected.title}</h2><p>{selected.description}</p></div><div className="rb-reference-toolbar-controls"><select aria-label="Select reference variant" value={selected.referenceId} onChange={(event) => selectVariant(event.target.value)}>{variants.length > 0 ? variants.map((variant) => <option key={variant.referenceId} value={variant.referenceId}>{variant.referenceId}</option>) : <option value={selected.referenceId}>{selected.referenceId}</option>}</select><div className="rb-reference-variant-arrows"><button type="button" aria-label="Previous variant" onClick={() => moveVariant(-1)}>‹</button><button type="button" aria-label="Next variant" onClick={() => moveVariant(1)}>›</button></div></div></div><ReferencePreviewFrame definition={selected} viewport={viewport} onViewportChange={setViewport} refreshKey={refreshKey} onRefresh={() => setRefreshKey((value) => value + 1)} fullscreen={fullscreen} onFullscreen={() => setFullscreen((value) => !value)} onInteraction={setLastInteraction} /><footer className="rb-reference-gallery-footer"><span><Check size={13} /> {selected.skill}</span><span>{selected.productionBinding.mode === 'hbar-bound' ? `adapter · ${selected.productionBinding.adapterId}` : 'fixture-only · no fake production data'}</span>{lastInteraction && <span className="rb-reference-last-interaction">{lastInteraction.action} → {lastInteraction.expectedState}</span>}<div className="rb-reference-variant-nav">{categoryVariants.slice(Math.max(0, categoryVariants.findIndex((variant) => variant.referenceId === selected.referenceId) - 1), Math.max(3, categoryVariants.findIndex((variant) => variant.referenceId === selected.referenceId) + 2)).map((variant) => <button type="button" key={variant.referenceId} className={variant.referenceId === selected.referenceId ? 'selected' : ''} onClick={() => selectVariant(variant.referenceId)}>{variant.variantSlug}</button>)}</div></footer></main></div></GlassSurface></FloatingSurface>
}
