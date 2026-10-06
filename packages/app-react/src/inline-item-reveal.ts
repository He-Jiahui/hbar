/** Reveal the whole item when it fits; for a wider intrinsic title, keep its
 * adjacent action reachable and let the owning rail expose the complete text. */
export function revealInlineItem(rail: HTMLElement, item: HTMLElement, action: HTMLElement | null): void {
  const target = item.getBoundingClientRect().width > rail.clientWidth && action ? action : item
  target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}
