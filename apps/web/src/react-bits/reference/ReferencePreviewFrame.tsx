import { Component, Suspense, useState, type CSSProperties, type ErrorInfo, type ReactNode } from 'react'
import { Code2, Columns3, FileCode2, Maximize2, RefreshCw, Smartphone, Tablet, Monitor, X } from 'lucide-react'
import type { ReferenceFixtureProps, ReferenceVariantDefinition, ReferenceViewport } from './reference-types'
import { ReferenceButton, ReferenceTabs } from './primitives/ReferencePrimitives'
import './ReferencePreviewFrame.css'

type ReferencePreviewFrameProps = {
  readonly definition: ReferenceVariantDefinition
  readonly viewport: ReferenceViewport
  onViewportChange(viewport: ReferenceViewport): void
  refreshKey: number
  onRefresh(): void
  onFullscreen(): void
  fullscreen: boolean
  onInteraction?: (interaction: ReferenceFixtureProps['definition']['interactions'][number]) => void
}

type ErrorBoundaryState = { error: Error | null }

class FixtureErrorBoundary extends Component<{ children: ReactNode; onRetry(): void }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void info
    console.error('ReactBits reference fixture failed to render', error)
  }

  render() {
    if (this.state.error) return <div className="rb-reference-fixture-error" role="alert"><strong>Fixture failed to render</strong><code>{this.state.error.message}</code><ReferenceButton variant="secondary" onClick={() => { this.setState({ error: null }); this.props.onRetry() }}>Retry fixture</ReferenceButton></div>
    return this.props.children
  }
}

const viewportLabels: Record<ReferenceViewport, string> = { desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile' }

export default function ReferencePreviewFrame({ definition, viewport, onViewportChange, refreshKey, onRefresh, onFullscreen, fullscreen, onInteraction }: ReferencePreviewFrameProps) {
  const [tab, setTab] = useState('Preview')
  const [split, setSplit] = useState(58)
  const Fixture = definition.fixture
  const observation = definition.observation
  const viewportIcon = (mode: ReferenceViewport) => mode === 'desktop' ? <Monitor size={12} /> : mode === 'tablet' ? <Tablet size={12} /> : <Smartphone size={12} />
  return <section className={`rb-reference-preview-frame${fullscreen ? ' is-fullscreen' : ''}`} aria-label={`Preview ${definition.title}`}><header className="rb-reference-frame-toolbar"><ReferenceTabs tabs={['Preview', 'Code']} value={tab} onChange={setTab} /><div className="rb-reference-frame-actions"><span className="rb-reference-frame-id">{definition.variantSlug}</span>{(['desktop', 'tablet', 'mobile'] as const).map((mode) => <button type="button" key={mode} className={viewport === mode ? 'selected' : ''} aria-label={`${viewportLabels[mode]} preview width`} aria-pressed={viewport === mode} onClick={() => onViewportChange(mode)}>{viewportIcon(mode)}</button>)}<button type="button" aria-label={fullscreen ? 'Close fullscreen preview' : 'Open fullscreen preview'} onClick={onFullscreen}>{fullscreen ? <X size={13} /> : <Maximize2 size={13} />}</button><button type="button" aria-label="Refresh preview" onClick={onRefresh}><RefreshCw size={13} /></button></div></header>{tab === 'Code' ? <div className="rb-reference-code-pane"><div className="rb-reference-code-heading"><FileCode2 size={16} /><div><strong>Clean-room fixture source</strong><small>Private ReactBits source is not accessed or copied.</small></div></div><pre>{`// ${definition.sourceUrl}\n// fixture: ${definition.variantSlug}\n// skill: ${definition.skill}\n\nexport { default } from './variants/${definition.category}/${definition.variantSlug}'\n\n// Public observations\n// ${observation.publicSurface.join('\n// ')}`}</pre><div className="rb-reference-code-note"><Code2 size={13} /> This view describes the local recreation contract. It never exposes a paywalled Code tab.</div></div> : <div className="rb-reference-frame-workspace" style={{ '--rb-split': `${split}%` } as CSSProperties}><div className="rb-reference-frame-preview"><div className={`rb-reference-preview rb-reference-preview-${viewport}`}><FixtureErrorBoundary onRetry={onRefresh}><Suspense fallback={<div className="rb-reference-fixture-loading" aria-busy="true"><RefreshCw size={16} /> Loading fixture…</div>}><Fixture key={refreshKey} definition={definition} viewport={viewport} refreshKey={refreshKey} onInteraction={onInteraction} /></Suspense></FixtureErrorBoundary></div></div><div className="rb-reference-frame-divider" role="separator" aria-label="Drag to resize preview" aria-valuemin={25} aria-valuemax={75} aria-valuenow={split} tabIndex={0} onPointerDown={(event) => { const target = event.currentTarget.parentElement; if (!target) return; const move = (moveEvent: PointerEvent) => { const rect = target.getBoundingClientRect(); setSplit(Math.min(75, Math.max(25, ((moveEvent.clientX - rect.left) / rect.width) * 100))) }; const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }; window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); event.currentTarget.setPointerCapture?.(event.pointerId) }} onKeyDown={(event) => { if (event.key === 'ArrowLeft') setSplit((value) => Math.max(25, value - 2)); if (event.key === 'ArrowRight') setSplit((value) => Math.min(75, value + 2)) }}><Columns3 size={12} /></div><aside className="rb-reference-observation-pane"><header><div><strong>Public observation</strong><small>HTML/CSS/JS clean-room record</small></div><span>{observation.captureStatus === 'public-observed' ? 'captured' : 'fixture-derived'}</span></header><dl><div><dt>Source</dt><dd><a href={definition.sourceUrl} target="_blank" rel="noreferrer">{definition.sourceUrl}</a></dd></div><div><dt>Surface</dt><dd>{observation.publicSurface.join(' · ')}</dd></div><div><dt>Controls</dt><dd>{(observation.viewportControls ?? []).join(' · ') || 'Desktop / tablet / mobile'}</dd></div><div><dt>ARIA roles</dt><dd>{Object.entries(observation.ariaRoles ?? {}).map(([role, count]) => `${role} × ${count}`).join(' · ') || 'recorded from public shell'}</dd></div><div><dt>Resources</dt><dd>{observation.cssResourceCount ?? observation.cssResources.length} CSS · {observation.jsResourceCount ?? observation.jsResources.length} JS hashes</dd></div></dl><div className="rb-reference-observation-actions"><ReferenceButton variant="ghost" onClick={onRefresh}><RefreshCw size={12} /> Re-run fixture</ReferenceButton></div></aside></div>}</section>
}
