import { uniqueLumenSchedulingItems } from './scheduling-model'

export interface LumenTimelineInterval {
  readonly id: string
  readonly startMinutes: number
  readonly durationMinutes: number
}

export interface LumenTimelineGroup<T extends LumenTimelineInterval> {
  readonly startMinutes: number
  readonly endMinutes: number
  readonly lanes: readonly (readonly T[])[]
}

/** Time intervals, not screen coordinates. Each collision group flows after the preceding gap. */
export function groupLumenTimelineIntervals<T extends LumenTimelineInterval>(
  items: readonly T[],
  start: number,
  end: number,
): readonly LumenTimelineGroup<T>[] {
  const sorted = uniqueLumenSchedulingItems(items)
    .filter(
      (item) =>
        Number.isFinite(item.startMinutes) &&
        Number.isFinite(item.durationMinutes) &&
        item.durationMinutes > 0 &&
        item.startMinutes >= start &&
        item.startMinutes + item.durationMinutes <= end,
    )
    .sort((a, b) => a.startMinutes - b.startMinutes)
  const groups: { startMinutes: number; endMinutes: number; lanes: T[][] }[] = []
  for (const item of sorted) {
    let group = groups.at(-1)
    if (!group || item.startMinutes >= group.endMinutes) {
      group = { startMinutes: item.startMinutes, endMinutes: item.startMinutes + item.durationMinutes, lanes: [[]] }
      groups.push(group)
    }
    const lane = group.lanes.find(
      (values) =>
        !values.length ||
        (values.at(-1)?.startMinutes ?? 0) + (values.at(-1)?.durationMinutes ?? 0) <= item.startMinutes,
    )
    if (lane) lane.push(item)
    else group.lanes.push([item])
    group.endMinutes = Math.max(group.endMinutes, item.startMinutes + item.durationMinutes)
  }
  return groups
}

/** Quarter-hour input snapping is independent of rendered layout size. */
export function snapLumenTimelineMinutes(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(value / 15) * 15))
}
