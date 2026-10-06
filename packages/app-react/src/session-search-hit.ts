/** Locate a visible literal hit inside one already-rendered message/call, without caching transcript text. */
export function sessionSearchHitBox(root: HTMLElement, query: string | null): DOMRect | null {
  if (!query || query.length > 160) return null
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  let text = ''
  let visited = 0
  while (visited++ < 2_000 && text.length < 128_000) {
    const node = walker.nextNode()
    if (!(node instanceof Text)) break
    const parent = node.parentElement
    if (!parent || parent.closest('button,[aria-hidden="true"],[data-session-find-exclude]')) continue
    nodes.push(node)
    text += node.data.slice(0, 128_000 - text.length)
  }
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const hit = new RegExp(escaped, 'iu').exec(text)
  if (!hit) return null
  const range = document.createRange()
  let offset = 0
  let started = false
  for (const node of nodes) {
    const end = offset + node.length
    if (!started && hit.index < end) {
      range.setStart(node, hit.index - offset)
      started = true
    }
    if (started && hit.index + hit[0].length <= end) {
      range.setEnd(node, hit.index + hit[0].length - offset)
      const box = range.getBoundingClientRect()
      return box.width > 0 && box.height > 0 ? box : null
    }
    offset = end
  }
  return null
}
