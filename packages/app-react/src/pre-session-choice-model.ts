export interface HbarPreSessionChoiceGroup {
  readonly id: string
  readonly label: string
}

export interface HbarPreSessionChoice {
  readonly id: string
  readonly label: string
  readonly detail?: string
  readonly searchText?: string
  readonly triggerLabel?: string
  readonly group?: HbarPreSessionChoiceGroup
}

export interface HbarPreSessionChoiceSection {
  readonly key: string
  readonly label: string | null
  readonly items: readonly HbarPreSessionChoice[]
}

/** A desktop window stays searchable; only a narrow touch Web sheet avoids opening the soft keyboard. */
export function preSessionChoiceInitialFocus(presentation: 'native' | 'web', narrow: boolean, coarsePointer: boolean) {
  return presentation === 'web' && narrow && coarsePointer ? 'close' : 'search'
}

export function visiblePreSessionChoices(
  items: readonly HbarPreSessionChoice[],
  query: string,
  limit: number,
  selectedId?: string | null,
) {
  const seen = new Set<string>()
  const needle = query.trim().toLocaleLowerCase()
  const filtered = items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    const text =
      `${item.group?.label ?? ''} ${item.label} ${item.detail ?? ''} ${item.searchText ?? ''}`.toLocaleLowerCase()
    return text.includes(needle)
  })
  const capacity = Math.max(0, Math.floor(limit))
  const selectedIndex = selectedId ? filtered.findIndex((item) => item.id === selectedId) : -1
  const selected = selectedIndex >= capacity && capacity > 0 ? filtered[selectedIndex] : undefined
  const visible =
    selected && capacity > 0
      ? [selected, ...filtered.filter((item) => item !== selected).slice(0, capacity - 1)]
      : filtered.slice(0, capacity)
  return { rows: visible, remaining: Math.max(0, filtered.length - visible.length) }
}

export function groupPreSessionChoices(items: readonly HbarPreSessionChoice[]): HbarPreSessionChoiceSection[] {
  const sections = new Map<string, { key: string; label: string | null; items: HbarPreSessionChoice[] }>()
  for (const item of items) {
    const key = item.group ? `group:${item.group.id}` : 'ungrouped'
    const section = sections.get(key) ?? {
      key,
      label: item.group?.label ?? null,
      items: [],
    }
    section.items.push(item)
    sections.set(key, section)
  }
  return [...sections.values()]
}
