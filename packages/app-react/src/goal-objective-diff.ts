import { presentableDiff } from '@codemirror/merge'

export interface GoalObjectiveFragment {
  readonly from: number
  readonly kind: 'unchanged' | 'changed' | 'omitted'
  readonly text: string
}

/** Goal text is bounded by the Host to 4,000 characters; scanning also has a fixed work limit. */
export function goalObjectiveDiff(
  previous: string,
  current: string,
): {
  readonly previous: readonly GoalObjectiveFragment[]
  readonly current: readonly GoalObjectiveFragment[]
} {
  const changes = presentableDiff(previous, current, { scanLimit: 500 })
  const fragments = (text: string, side: 'A' | 'B'): readonly GoalObjectiveFragment[] => {
    const result: GoalObjectiveFragment[] = []
    let position = 0
    for (const change of changes) {
      const from = side === 'A' ? change.fromA : change.fromB
      const to = side === 'A' ? change.toA : change.toB
      if (position < from) result.push({ from: position, kind: 'unchanged', text: text.slice(position, from) })
      // Empty fragments preserve an insertion/deletion boundary for excerpt context on the opposite side.
      result.push({ from, kind: 'changed', text: text.slice(from, to) })
      position = to
    }
    if (position < text.length) result.push({ from: position, kind: 'unchanged', text: text.slice(position) })
    return result
  }
  return { previous: fragments(previous, 'A'), current: fragments(current, 'B') }
}

/** Keep every change location visible, trimming long text at Unicode code point boundaries. */
export function excerptGoalObjective(fragments: readonly GoalObjectiveFragment[]): readonly GoalObjectiveFragment[] {
  return fragments.flatMap((fragment, index) => {
    const points = Array.from(fragment.text)
    const standalone = fragments.length === 1
    const context = fragment.kind === 'changed' || standalone ? 120 : 48
    const first = fragment.kind === 'changed' || standalone || index > 0 ? context : 0
    const last = fragment.kind === 'changed' || standalone || index < fragments.length - 1 ? context : 0
    if (points.length <= first + last + 24) return [fragment]
    const prefix = points.slice(0, first).join('')
    const suffix = last ? points.slice(-last).join('') : ''
    return [
      ...(prefix ? [{ ...fragment, text: prefix }] : []),
      { from: fragment.from + prefix.length, kind: 'omitted' as const, text: '' },
      ...(suffix ? [{ ...fragment, from: fragment.from + fragment.text.length - suffix.length, text: suffix }] : []),
    ]
  })
}
