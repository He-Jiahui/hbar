import type { MouseEvent } from 'react'
import type { ReferenceInteraction } from './reference-types'

/**
 * Keep fixture interaction reporting outside the visual primitives.  The
 * gallery uses this signal for validation only; it never becomes business
 * state and never calls a host/client API.
 */
export function reportFixtureClick(
  event: MouseEvent<HTMLElement>,
  onInteraction: ((interaction: ReferenceInteraction) => void) | undefined,
): void {
  if (!onInteraction) return
  const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('button, a, input, select, textarea, [role="tab"], [role="option"]') : null
  if (!target) return
  const label = target.getAttribute('aria-label') || target.textContent?.replace(/\s+/g, ' ').trim() || 'fixture control'
  onInteraction({
    action: event.type === 'click' ? 'click' : 'interaction',
    target: label.slice(0, 120),
    expectedState: 'the deterministic fixture updates its visible state and remains keyboard accessible',
  })
}
