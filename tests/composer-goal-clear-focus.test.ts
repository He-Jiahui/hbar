import { expect, test } from 'bun:test'
import { canReturnGoalClearFocus, sameGoalClearFocusScope } from '../packages/app-react/src/composer-goal-clear-focus'

const runtime = {}
const scope = { runtime, sessionId: 'a', lifetime: 1 }
const confirmed = {
  captured: { ...scope, goalId: 'goal-a' },
  current: scope,
  kind: 'confirmed' as const,
  currentGoalId: null,
  confirmed: true,
  selectedSessionId: 'a',
  conversationVisible: true,
  navigationIdle: true,
  focusOwned: true,
  otherTopLayer: false,
}
test('confirmed original clear may return vacant focus to the explicitly provided composer Goal trigger', () => {
  expect(canReturnGoalClearFocus(confirmed)).toBe(true)
})
test('Cancel returns only to the still-current Clear control that owns the interaction', () => {
  expect(canReturnGoalClearFocus({ ...confirmed, kind: 'cancel', confirmed: false, currentGoalId: 'goal-a' })).toBe(
    true,
  )
  expect(canReturnGoalClearFocus({ ...confirmed, kind: 'cancel', currentGoalId: null })).toBe(false)
  expect(canReturnGoalClearFocus({ ...confirmed, kind: 'cancel', currentGoalId: 'replacement' })).toBe(false)
})
test('an empty Goal fact before ACK or after an unknown result is not an accepted clear focus lease', () => {
  expect(canReturnGoalClearFocus({ ...confirmed, confirmed: false })).toBe(false)
  expect(canReturnGoalClearFocus({ ...confirmed, currentGoalId: undefined })).toBe(false)
  expect(canReturnGoalClearFocus({ ...confirmed, currentGoalId: 'goal-a' })).toBe(false)
})
test('a replacement Goal must never lose focus to the original clear', () => {
  expect(canReturnGoalClearFocus({ ...confirmed, currentGoalId: 'goal-b' })).toBe(false)
})
test('A to B and A to B to A lifetimes invalidate the original focus owner', () => {
  expect(canReturnGoalClearFocus({ ...confirmed, current: { ...scope, sessionId: 'b' } })).toBe(false)
  expect(canReturnGoalClearFocus({ ...confirmed, current: { ...scope, lifetime: 3 } })).toBe(false)
  expect(sameGoalClearFocusScope(scope, { ...scope, lifetime: 3 })).toBe(false)
})
test('replacement runtime and an independently selected session invalidate late focus', () => {
  expect(canReturnGoalClearFocus({ ...confirmed, current: { ...scope, runtime: {} } })).toBe(false)
  expect(canReturnGoalClearFocus({ ...confirmed, selectedSessionId: 'b' })).toBe(false)
})
test('Settings, Workbench, pending navigation and higher native overlays keep ownership of focus', () => {
  expect(canReturnGoalClearFocus({ ...confirmed, conversationVisible: false })).toBe(false)
  expect(canReturnGoalClearFocus({ ...confirmed, navigationIdle: false })).toBe(false)
  expect(canReturnGoalClearFocus({ ...confirmed, otherTopLayer: true })).toBe(false)
})
test('a deliberate newer focus move cancels both Cancel and accepted-clear fallback', () => {
  expect(canReturnGoalClearFocus({ ...confirmed, focusOwned: false })).toBe(false)
  expect(canReturnGoalClearFocus({ ...confirmed, kind: 'cancel', currentGoalId: 'goal-a', focusOwned: false })).toBe(
    false,
  )
})
