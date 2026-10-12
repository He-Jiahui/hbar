import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

// This is an offline package-CSS contract test, not a React Bits reference.
// Build @lumen/app-ui first; no hbar stylesheet or preview is loaded here.
const output = resolve('artifacts/lumen-icon-scale')
const stylesheet = await Bun.file('packages/lumen-app-ui/dist/app-ui.css').text()
const tiers = ['xs', 'sm', 'md', 'lg', 'xl'] as const
const sizes = [12, 14, 16, 20, 24]
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
await mkdir(output, { recursive: true })
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, reducedMotion: 'reduce' })
  await page.route('**/*', (route) => route.abort())
  const checks: { mode: string; rootFontSize: number; widths: number[] }[] = []
  for (const mode of ['dark', 'light']) {
    for (const rootFontSize of [16, 20]) {
      const icons = tiers
        .map(
          (tier) =>
            `<svg class="hbar-app-ui-icon-${tier}" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>`,
        )
        .join('')
      await page.setContent(`<style>${stylesheet}</style><style>:root{font-size:${rootFontSize}px}</style>
        <div data-lumen-mode="${mode}">${icons}
          <div class="hbar-app-ui-agent-approval-inline"><svg class="lumen-agent-approval-glyph" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg></div>
          <svg class="hbar-app-ui-agent-approval-diff-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
        </div>`)
      const expected = [...sizes, 12, 14].map((size) => (size * rootFontSize) / 16)
      const ink = await page
        .locator('[data-lumen-mode]')
        .evaluate((element) => getComputedStyle(element).getPropertyValue('--lumen-ink').trim())
      if (ink !== (mode === 'dark' ? '#eee' : '#171717')) {
        throw new Error(`${mode}: bundled public CSS omitted base appearance tokens (${ink})`)
      }
      const boxes = await page.locator('svg').evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect()
          return { width: rect.width, height: rect.height }
        }),
      )
      await page.screenshot({ path: resolve(output, `${mode}-${rootFontSize}.png`) })
      if (boxes.some((box, index) => box.width !== expected[index] || box.height !== expected[index])) {
        throw new Error(
          `${mode}/${rootFontSize}: Lumen-only icon geometry ${JSON.stringify(boxes)}; expected ${JSON.stringify(expected)}`,
        )
      }
      checks.push({ mode, rootFontSize, widths: boxes.map((box) => box.width) })
    }
  }
  await page.addStyleTag({ content: '[data-lumen-mode] { --lumen-icon-sm: 1.125rem; }' })
  const overridden = await page
    .locator('.hbar-app-ui-agent-approval-diff-arrow')
    .evaluate((element) => element.getBoundingClientRect().width)
  if (overridden !== 22.5) throw new Error(`Scoped host icon tier override was ignored: ${overridden}`)
  console.log(
    JSON.stringify({ standalonePackageStyles: true, hostStylesLoaded: false, scopedHostOverride: true, checks }),
  )
} finally {
  await browser.close()
}
