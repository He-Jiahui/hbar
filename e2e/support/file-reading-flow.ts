import { expect, type Page } from '@playwright/test'

/** Measure content-owned rows, not a fixed screenshot height. */
export async function expectFileReadingFlow(page: Page): Promise<void> {
  for (const modes of await page.locator('.lumen-file-document:visible .hbar-file-document-modes').all()) {
    const reading = await modes.evaluate((element) => {
      const style = getComputedStyle(element)
      const rows = new Map<number, number>()
      for (const button of element.querySelectorAll('button')) {
        const rect = button.getBoundingClientRect()
        const top = Math.round(rect.top)
        rows.set(top, Math.max(rows.get(top) ?? 0, rect.height))
      }
      if (!rows.size) throw new Error('Visible file mode controls are missing')
      const feedback = element.parentElement?.querySelector<HTMLElement>('.hbar-file-add-feedback')
      let feedbackHeight = 0
      let feedbackContentHeight = 0
      if (feedback) {
        const feedbackStyle = getComputedStyle(feedback)
        const range = document.createRange()
        range.selectNodeContents(feedback)
        feedbackHeight = feedback.getBoundingClientRect().height
        const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)))
        const lineHeight = parseFloat(feedbackStyle.lineHeight)
        if (!Number.isFinite(lineHeight)) throw new Error('File feedback has no measurable line box')
        feedbackContentHeight =
          lines.size * lineHeight + parseFloat(feedbackStyle.paddingTop) + parseFloat(feedbackStyle.paddingBottom)
      }
      return {
        modeHeight: element.getBoundingClientRect().height,
        intrinsicHeight:
          [...rows.values()].reduce((sum, height) => sum + height, 0) +
          parseFloat(style.rowGap) * (rows.size - 1) +
          parseFloat(style.paddingTop) +
          parseFloat(style.paddingBottom),
        feedbackHeight,
        feedbackContentHeight,
      }
    })
    expect(reading.modeHeight, JSON.stringify(reading)).toBeLessThanOrEqual(reading.intrinsicHeight + 1)
    expect(reading.feedbackHeight, JSON.stringify(reading)).toBeLessThanOrEqual(reading.feedbackContentHeight + 1)
  }
  for (const title of await page.locator('.lumen-file-document:visible .lumen-file-document-title').all()) {
    const overflow = await title.evaluate((element) => ({
      viewport: element.clientWidth,
      content: element.scrollWidth,
      overflow: getComputedStyle(element).overflowX,
      labels: [...element.children].map((label) => {
        const range = document.createRange()
        range.selectNodeContents(label)
        return {
          textWidth: range.getBoundingClientRect().width,
          width: label.getBoundingClientRect().width,
          whiteSpace: getComputedStyle(label).whiteSpace,
          textOverflow: getComputedStyle(label).textOverflow,
        }
      }),
    }))
    expect(overflow.labels.length).toBeGreaterThan(0)
    for (const label of overflow.labels) {
      expect(label.whiteSpace).toBe('nowrap')
      expect(label.textOverflow).not.toBe('ellipsis')
      expect(label.textWidth, JSON.stringify(label)).toBeLessThanOrEqual(label.width + 1)
    }
    if (overflow.content <= overflow.viewport + 1) continue
    expect(overflow.overflow).toBe('auto')
    const previousFocus = await page.evaluateHandle(() => document.activeElement)
    await title.evaluate((element) => {
      element.scrollLeft = 0
    })
    await title.focus()
    await expect(title).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => title.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
    await previousFocus.evaluate((element) => {
      if (element === document.body) {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      } else if (element instanceof HTMLElement && element.isConnected && element.getClientRects().length > 0) {
        element.focus()
      }
    })
    await previousFocus.dispose()
  }
}
