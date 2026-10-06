/** A normal Run boundary transition, distinct from execution failure or user cancellation. */
export interface GoalReplacementStop {
  readonly stop: 'goal_replaced'
  readonly previousGoalId: string
  readonly goalId: string
}

/** Requests may unwind before a provider request exists. Drivers must not serialize this as an error. */
export class RunControlSignal extends Error {
  constructor(readonly control: GoalReplacementStop) {
    super('The Run is handing off to the replacement Goal')
    this.name = 'RunControlSignal'
  }
}
