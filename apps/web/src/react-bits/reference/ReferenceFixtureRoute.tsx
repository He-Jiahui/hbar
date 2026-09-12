import { Suspense } from 'react'
import { getReferenceVariant } from './reference-manifest'
import type { ReferenceViewport } from './reference-types'

const viewportPixels: Record<ReferenceViewport, { width: number; height: number }> = {
  desktop: { width: 1280, height: 720 },
  tablet: { width: 768, height: 900 },
  mobile: { width: 390, height: 844 },
}

function parseViewport(value: string | null): ReferenceViewport {
  return value === 'tablet' || value === 'mobile' ? value : 'desktop'
}

function parseDimension(value: string | null, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 160 && parsed <= 4_000 ? Math.round(parsed) : fallback
}

/**
 * A dependency-free capture surface for visual QA. It deliberately renders a
 * single lazy fixture without the authenticated workbench shell, so screenshot
 * measurements describe the reference component rather than app chrome.
 */
export default function ReferenceFixtureRoute({ referenceId, viewport, width, height }: { referenceId: string; viewport: ReferenceViewport; width?: number; height?: number }) {
  const definition = getReferenceVariant(referenceId)
  const size = viewportPixels[viewport]
  const routeWidth = width ?? size.width
  const routeHeight = height ?? size.height
  if (!definition) return <main role="alert">Unknown ReactBits reference: {referenceId}</main>
  const Fixture = definition.fixture
  return <main id="reference-fixture-route" data-reference-id={referenceId} data-viewport={viewport} style={{ width: routeWidth, height: routeHeight, minHeight: routeHeight, maxHeight: routeHeight, boxSizing: 'border-box', overflow: 'hidden', background: 'var(--hbar-canvas)' }}><Suspense fallback={<div aria-busy="true">Loading fixture…</div>}><Fixture definition={definition} viewport={viewport} /></Suspense></main>
}

export function referenceFixtureRouteFromLocation(): { referenceId: string; viewport: ReferenceViewport; width: number; height: number } | undefined {
  const params = new URLSearchParams(window.location.search)
  const referenceId = params.get('referenceFixture')
  if (!referenceId) return undefined
  return { referenceId, viewport: parseViewport(params.get('viewport')), width: parseDimension(params.get('fixtureWidth'), viewportPixels[parseViewport(params.get('viewport'))].width), height: parseDimension(params.get('fixtureHeight'), viewportPixels[parseViewport(params.get('viewport'))].height) }
}
