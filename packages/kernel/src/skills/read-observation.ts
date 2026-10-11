/** Bounded instruction coverage; duplicate/overlapping pages never count as a new use. */
export function createSkillReadObservation() {
  const reads = new Map<string, { through: number; completed: boolean; ranges: [number, number][] }>()
  return {
    observe(runId: string, id: string, revision: string, offset: number, characters: number, total: number): boolean {
      const key = `${runId}:${id}:${revision}`
      let saved = reads.get(key)
      if (!saved) {
        if (reads.size >= 512) reads.delete(reads.keys().next().value ?? '')
        saved = { through: 0, completed: false, ranges: [] }
        reads.set(key, saved)
      }
      if (saved.completed) return false
      saved.ranges.push([offset, offset + characters])
      saved.ranges.sort((a, b) => a[0] - b[0])
      const remaining: [number, number][] = []
      for (const range of saved.ranges) {
        if (range[0] <= saved.through) saved.through = Math.max(saved.through, range[1])
        else if (remaining.length < 128) remaining.push(range)
      }
      saved.ranges = remaining
      saved.completed = saved.through >= total
      return saved.completed
    },
    dispose: () => reads.clear(),
  }
}
