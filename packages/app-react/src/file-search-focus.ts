/** Native result navigation, bounded to the current rendered search list. */
export function fileSearchFocusIndex(key: string, count: number, current: number | null): number | null {
  if (count < 1) return null
  const index = current === null ? null : Math.min(count - 1, Math.max(0, current))
  switch (key) {
    case 'ArrowDown':
      return index === null ? 0 : Math.min(count - 1, index + 1)
    case 'ArrowUp':
      return index === null ? 0 : Math.max(0, index - 1)
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}
