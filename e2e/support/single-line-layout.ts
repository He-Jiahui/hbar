import { expect, type Locator } from '@playwright/test'

/** Horizontal reading may overflow inline; its text and icons must fit vertically. */
export async function completeControlRailHeight(rail: Locator): Promise<void> {
  await expect(rail).toBeVisible()
  await expect(rail.getByRole('button').first()).toBeVisible()
  await expect
    .poll(() =>
      rail.evaluate((element) => {
        const viewport = element.getBoundingClientRect()
        const top = viewport.top + element.clientTop
        const bottom = top + element.clientHeight
        const buttons = [...element.querySelectorAll('button')].filter(
          (button) => button.getClientRects().length > 0 && !button.closest('[popover], dialog'),
        )
        const glyphs: DOMRect[] = []
        for (const button of buttons) {
          const walker = element.ownerDocument.createTreeWalker(button, NodeFilter.SHOW_TEXT)
          while (walker.nextNode()) {
            const text = walker.currentNode
            if (!text.textContent?.trim() || text.parentElement?.closest('svg')) continue
            const range = element.ownerDocument.createRange()
            range.selectNodeContents(text)
            glyphs.push(...range.getClientRects())
          }
          for (const icon of button.querySelectorAll('svg')) glyphs.push(icon.getBoundingClientRect())
        }
        return glyphs.length > 0 && glyphs.every((glyph) => glyph.top >= top - 1 && glyph.bottom <= bottom + 1)
      }),
    )
    .toBe(true)
}

/** Measure actual text ranges; titles and nowrap alone cannot prove legibility. */
export async function completeLine(elements: Locator) {
  const metrics = await elements.evaluateAll((nodes) =>
    nodes
      .filter((node) => node.getClientRects().length > 0)
      .map((node) => {
        const box = node.getBoundingClientRect()
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
        const rects: DOMRect[] = []
        while (walker.nextNode()) {
          if (!walker.currentNode.textContent?.trim() || walker.currentNode.parentElement?.closest('svg')) continue
          const range = document.createRange()
          range.selectNodeContents(walker.currentNode)
          rects.push(...range.getClientRects())
        }
        const centers = rects.map((rect) => rect.top + rect.height / 2)
        return {
          text: node.textContent,
          component: `${node.tagName}.${node.className}`,
          width: box.width,
          height: box.height,
          ellipsis: getComputedStyle(node).textOverflow === 'ellipsis',
          clipped: rects.some((rect) => rect.left < box.left - 1 || rect.right > box.right + 1),
          spread: centers.length ? Math.max(...centers) - Math.min(...centers) : 0,
        }
      }),
  )
  expect(metrics.length).toBeGreaterThan(0)
  for (const metric of metrics) {
    expect(metric.ellipsis, String(metric.text)).toBe(false)
    expect(metric.clipped, `${metric.component}: ${metric.text}`).toBe(false)
    expect(metric.spread, String(metric.text)).toBeLessThanOrEqual(6)
  }
  return metrics
}
