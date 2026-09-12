import { useMemo, useState } from 'react'
import { Check, ExternalLink, Filter, Maximize2, RefreshCw, Search, X } from 'lucide-react'
import { FloatingSurface } from '../../FloatingLayer'
import GlassSurface from '../GlassSurface'
import { getReferenceVariant, listReferenceVariants, REFERENCE_CATEGORY_COUNTS } from './reference-manifest'
import type { ReferenceCategory, ReferenceViewport } from './reference-types'
import './ReferenceGallery.css'

type ReferenceGalleryProps = { open: boolean; onClose(): void }

export default function ReferenceGallery({ open, onClose }: ReferenceGalleryProps) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<ReferenceCategory | 'all'>('all')
  const [selectedId, setSelectedId] = useState('reactbits.ai-chat-9')
  const [viewport, setViewport] = useState<ReferenceViewport>('desktop')
  const selected = getReferenceVariant(selectedId) ?? listReferenceVariants()[0]
  const variants = useMemo(() => listReferenceVariants(category === 'all' ? undefined : category).filter((variant) => `${variant.referenceId} ${variant.title} ${variant.description}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [category, query])
  const selectCategory = (next: ReferenceCategory | 'all') => {
    setCategory(next)
    const nextVariants = listReferenceVariants(next === 'all' ? undefined : next)
    if (nextVariants[0]) setSelectedId(nextVariants[0].referenceId)
  }
  if (!open || !selected) return null
  const Fixture = selected.fixture
  return <FloatingSurface mode="modal" open={open} onClose={onClose} className="rb-reference-gallery-overlay" backdropClassName="rb-reference-gallery-backdrop">
    <GlassSurface className="rb-reference-gallery" width="min(1220px, calc(100vw - 32px))" height="min(860px, calc(100vh - 32px))" role="dialog" aria-modal="true" aria-label="ReactBits 参考画廊">
      <header className="rb-reference-gallery-header"><div><strong>ReactBits Application UI</strong><small>38 categories · 300 variants · clean-room reference gallery</small></div><div className="rb-reference-gallery-actions"><button title="Refresh fixture" aria-label="Refresh fixture"><RefreshCw size={14} /></button><button title="Fullscreen" aria-label="Fullscreen"><Maximize2 size={14} /></button><button title="Close" aria-label="Close" onClick={onClose}><X size={16} /></button></div></header>
      <div className="rb-reference-gallery-body"><aside className="rb-reference-gallery-sidebar"><label className="rb-reference-search"><Search size={14} /><input aria-label="Search references" placeholder="Search variants" value={query} onChange={(event) => setQuery(event.target.value)} /></label><button className={category === 'all' ? 'selected rb-reference-category' : 'rb-reference-category'} onClick={() => selectCategory('all')}><Filter size={13} />All variants <span>300</span></button><div className="rb-reference-category-list">{Object.entries(REFERENCE_CATEGORY_COUNTS).map(([key, count]) => <button key={key} className={category === key ? 'selected rb-reference-category' : 'rb-reference-category'} onClick={() => selectCategory(key as ReferenceCategory)}><span>{key}</span><span>{count}</span></button>)}</div></aside><main className="rb-reference-gallery-main"><div className="rb-reference-breadcrumb"><span>Application UI</span><span>/</span><strong>{selected.title}</strong><a href={selected.sourceUrl} target="_blank" rel="noreferrer" title="Open source reference"><ExternalLink size={13} /></a></div><div className="rb-reference-variant-toolbar"><div><h2>{selected.title}</h2><p>{selected.description}</p></div><div className="rb-reference-toolbar-controls"><select aria-label="Select reference variant" value={selected.referenceId} onChange={(event) => setSelectedId(event.target.value)}>{variants.map((variant) => <option key={variant.referenceId} value={variant.referenceId}>{variant.referenceId}</option>)}</select><div className="rb-reference-viewport-toggle">{(['desktop', 'tablet', 'mobile'] as const).map((mode) => <button key={mode} className={viewport === mode ? 'selected' : ''} onClick={() => setViewport(mode)}>{mode}</button>)}</div></div></div><div className={`rb-reference-preview rb-reference-preview-${viewport}`}><Fixture definition={selected} viewport={viewport} /></div><footer className="rb-reference-gallery-footer"><span><Check size={13} /> {selected.skill}</span><span>{selected.productionBinding.mode === 'hbar-bound' ? `adapter · ${selected.productionBinding.adapterId}` : 'fixture-only'}</span><div className="rb-reference-variant-nav">{variants.slice(0, 3).map((variant) => <button key={variant.referenceId} className={variant.referenceId === selected.referenceId ? 'selected' : ''} onClick={() => setSelectedId(variant.referenceId)}>{variant.variantSlug}</button>)}</div></footer></main></div>
    </GlassSurface>
  </FloatingSurface>
}
