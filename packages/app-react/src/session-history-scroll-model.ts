export interface HistoryPageEdge {
  readonly eligible: boolean
  readonly firstMessageId: string | null
  readonly scrollTop: number
  readonly threshold: number
}

/** A reader gesture may request one page; geometry corrections cannot request another. */
export function createHistoryPageTrigger() {
  let armed = false
  let pending = false
  let attemptedCursor: string | null = null
  return {
    get armed(): boolean {
      return armed && !pending
    },
    arm(eligible: boolean): void {
      armed = eligible && !pending
    },
    disarm(): void {
      armed = false
    },
    take(edge: HistoryPageEdge): boolean {
      if (!edge.eligible) armed = false
      if (
        !armed ||
        pending ||
        !edge.firstMessageId ||
        attemptedCursor === edge.firstMessageId ||
        !Number.isFinite(edge.scrollTop) ||
        !Number.isFinite(edge.threshold) ||
        edge.threshold < 0 ||
        edge.scrollTop > edge.threshold
      )
        return false
      armed = false
      pending = true
      attemptedCursor = edge.firstMessageId
      return true
    },
    settle(): void {
      pending = false
    },
  }
}
