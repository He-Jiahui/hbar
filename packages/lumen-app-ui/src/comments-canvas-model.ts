export interface LumenCommentsCanvasReferencePin {
  readonly id: string
  readonly reviewerId: string
  readonly label: string
  /** Percentages of the diagram, not positions of ordinary UI content. */
  readonly x: number
  readonly y: number
  readonly initials: string
  readonly author: string
  readonly time: string
  readonly body: string
  readonly resolved: boolean
}
export interface LumenCommentsCanvasProjection {
  readonly pins: readonly LumenCommentsCanvasReferencePin[]
  readonly selected: LumenCommentsCanvasReferencePin | undefined
  readonly unresolved: number
  readonly reviewers: number
}
export function normalizeLumenCommentsCanvasCoordinate(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 50
}
export function projectLumenCommentsCanvas(
  items: readonly LumenCommentsCanvasReferencePin[],
  activeId: string,
): LumenCommentsCanvasProjection {
  const seen = new Set<string>()
  const pins = items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
  return {
    pins,
    selected: pins.find((pin) => pin.id === activeId) ?? pins[0],
    unresolved: pins.filter((pin) => !pin.resolved).length,
    reviewers: new Set(pins.map((pin) => pin.reviewerId)).size,
  }
}
