import { expect, type Locator } from '@playwright/test'

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
    expect(metric.clipped, String(metric.text)).toBe(false)
    expect(metric.spread, String(metric.text)).toBeLessThanOrEqual(6)
  }
  return metrics
}
