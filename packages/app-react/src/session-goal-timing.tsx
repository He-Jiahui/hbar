import { LumenContentText } from '@lumen/app-ui'
import type { ThreadGoal } from '@hbar/contracts'
import { goalElapsedSeconds } from './session-elapsed-model'
import { useSessionClock } from './session-tool-clock'

export function useGoalElapsed(
  goal: ThreadGoal | null | undefined,
  receivedAt: number | undefined,
  connected: boolean,
) {
  const now = useSessionClock(
    connected && goal?.status !== 'complete' && Boolean(goal?.timing?.running) && receivedAt !== undefined,
  )
  return goal ? goalElapsedSeconds(goal, receivedAt, now, connected) : 0
}

export function HbarGoalTiming({
  goal,
  receivedAt,
  connected,
  format,
}: {
  readonly goal: ThreadGoal
  readonly receivedAt: number | undefined
  readonly connected: boolean
  readonly format: (seconds: number) => string
}) {
  const seconds = useGoalElapsed(goal, receivedAt, connected)
  return (
    <LumenContentText context="message.inline" data-goal-elapsed={seconds}>
      {format(seconds)}
    </LumenContentText>
  )
}
