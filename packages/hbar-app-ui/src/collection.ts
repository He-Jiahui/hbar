/** Last record wins while the first occurrence keeps its position. */
export function uniqueItems<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()]
}

/** A stale active ID deliberately has no implicit replacement. */
export function selectedItem<T extends { readonly id: string }>(
  items: readonly T[],
  id: string | undefined,
): T | undefined {
  return id === undefined ? undefined : items.find((item) => item.id === id)
}
