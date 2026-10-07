import { expect, type Locator } from '@playwright/test'

/** Check rendered full text and natural line boxes, rather than a tooltip or clipped DOM value. */
export async function verifyReadableText(text: Locator, expected: string, multiline = false): Promise<void> {
  await text.scrollIntoViewIfNeeded()
  await expect(text).toBeInViewport()
  expect(await text.textContent()).toBe(expected)
  const geometry = await text.evaluate((node) => {
    const style = getComputedStyle(node)
    const range = document.createRange()
    range.selectNodeContents(node)
    const box = node.getBoundingClientRect()
    const lines = [...range.getClientRects()]
    let unclipped = true
    let verticalReader = false
    for (let parent: Element | null = node; parent; parent = parent.parentElement) {
      const parentStyle = getComputedStyle(parent)
      const bounds = parent.getBoundingClientRect()
      if (['hidden', 'clip'].includes(parentStyle.overflowX))
        unclipped &&= lines.every((line) => line.left >= bounds.left - 1 && line.right <= bounds.right + 1)
      if (['hidden', 'clip'].includes(parentStyle.overflowY) && !verticalReader)
        unclipped &&= lines.every((line) => line.top >= bounds.top - 1 && line.bottom <= bounds.bottom + 1)
      if (['auto', 'scroll'].includes(parentStyle.overflowY) && parent.clientHeight > 0) verticalReader = true
    }
    return {
      whiteSpace: style.whiteSpace,
      overflow: style.textOverflow,
      clamp: style.webkitLineClamp,
      lines: lines.length,
      unclipped,
      available: node.clientWidth || Math.ceil(box.width),
      content: node.scrollWidth,
    }
  })
  expect(['normal', 'pre-wrap']).toContain(geometry.whiteSpace)
  expect(geometry.overflow).not.toBe('ellipsis')
  expect(geometry.clamp).toBe('none')
  expect(geometry.unclipped, `Full text clipping geometry: ${JSON.stringify(geometry)}`).toBe(true)
  expect(geometry.content).toBeLessThanOrEqual(geometry.available + 1)
  if (multiline) expect(geometry.lines).toBeGreaterThan(1)
}
