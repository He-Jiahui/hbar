/** UI interaction identity only; no Goal facts or command receipts are stored here. */
export interface GoalClearFocusScope {
  readonly runtime: object
  readonly sessionId: string
  readonly lifetime: number
}

export function sameGoalClearFocusScope(captured: GoalClearFocusScope, current: GoalClearFocusScope): boolean {
  return (
    captured.runtime === current.runtime &&
    captured.sessionId === current.sessionId &&
    captured.lifetime === current.lifetime
  )
}

export function canReturnGoalClearFocus(input: {
  readonly captured: GoalClearFocusScope & { readonly goalId: string }
  readonly current: GoalClearFocusScope
  readonly kind: 'cancel' | 'confirmed'
  readonly currentGoalId: string | null | undefined
  readonly confirmed: boolean
  readonly selectedSessionId: string | null
  readonly conversationVisible: boolean
  readonly navigationIdle: boolean
  readonly focusOwned: boolean
  readonly otherTopLayer: boolean
}): boolean {
  return (
    sameGoalClearFocusScope(input.captured, input.current) &&
    input.selectedSessionId === input.captured.sessionId &&
    input.conversationVisible &&
    input.navigationIdle &&
    input.focusOwned &&
    !input.otherTopLayer &&
    (input.kind === 'cancel'
      ? input.currentGoalId === input.captured.goalId
      : input.confirmed && input.currentGoalId === null)
  )
}
