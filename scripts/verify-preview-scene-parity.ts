import { chromium, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { HBAR_APP_UI_VARIANT_SPECS } from '../packages/hbar-app-ui/src/catalog-metadata'

const beforeUrl = process.env.HBAR_PREVIEW_BEFORE_URL
const afterUrl = process.env.HBAR_PREVIEW_AFTER_URL ?? 'http://127.0.0.1:5184'
if (!beforeUrl) throw new Error('Set HBAR_PREVIEW_BEFORE_URL to an immutable build of the original preview.')
const artifactRoot = 'artifacts/workspace-maintenance/parity'
await mkdir(artifactRoot, { recursive: true })
const browser = await chromium.launch({ channel: process.env.HBAR_BROWSER_CHANNEL ?? 'msedge', headless: true })
const before = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' })
const after = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' })
const errors: { source: string; message: string }[] = []
before.on('pageerror', (error) => errors.push({ source: 'before', message: error.message }))
after.on('pageerror', (error) => errors.push({ source: 'after', message: error.message }))

async function snapshot(page: Page, base: string, id: string) {
  await page.goto(`${base}/?variant=${encodeURIComponent(id)}&mode=isolated&theme=dark`, {
    waitUntil: 'domcontentloaded',
  })
  const surface = page.locator(`[data-hbar-app-ui-component="${id}"]`).first()
  await surface.waitFor({ state: 'visible' })
  await page.waitForTimeout(80)
  return surface.evaluate((element) => {
    const text = (value: string) =>
      value
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\d+(?:\.\d+)?\s*(?:ms|s|m|h)\b/g, '<duration>')
    const rect = (node: Element) => {
      const bounds = node.getBoundingClientRect()
      return [bounds.x, bounds.y, bounds.width, bounds.height].map((value) => Math.round(value))
    }
    return {
      text: text(element instanceof HTMLElement ? element.innerText : (element.textContent ?? '')),
      rectangle: rect(element),
      controls: Array.from(element.querySelectorAll('button,input,select,textarea,[role="button"],[role="tab"]')).map(
        (node) => {
          const input =
            node instanceof HTMLInputElement || node instanceof HTMLSelectElement || node instanceof HTMLTextAreaElement
              ? node
              : null
          const style = getComputedStyle(node)
          return {
            tag: node.tagName,
            role: node.getAttribute('role'),
            name: text(
              node.getAttribute('aria-label') ??
                (node instanceof HTMLElement ? node.innerText : (node.textContent ?? '')),
            ),
            labels: input ? Array.from(input.labels ?? []).map((label) => text(label.textContent ?? '')) : [],
            value: input?.value,
            disabled: node.hasAttribute('disabled'),
            checked: node instanceof HTMLInputElement ? node.checked : node.getAttribute('aria-checked'),
            rectangle: rect(node),
            font: style.fontSize,
            color: style.color,
          }
        },
      ),
    }
  })
}
const checks: { id: string; equal: boolean; controls: number }[] = []
try {
  for (const spec of HBAR_APP_UI_VARIANT_SPECS) {
    const [original, current] = await Promise.all([
      snapshot(before, beforeUrl, spec.id),
      snapshot(after, afterUrl, spec.id),
    ])
    const equal = JSON.stringify(original) === JSON.stringify(current)
    checks.push({ id: spec.id, equal, controls: current.controls.length })
    if (!equal) {
      await writeFile(`${artifactRoot}/${spec.id}.json`, JSON.stringify({ original, current }, null, 2))
      await before.screenshot({ path: `${artifactRoot}/${spec.id}-before.png` })
      await after.screenshot({ path: `${artifactRoot}/${spec.id}-after.png` })
    }
    if (checks.length % 25 === 0) console.log(`Compared ${checks.length}/${HBAR_APP_UI_VARIANT_SPECS.length} variants`)
  }
  const failures = checks.filter((check) => !check.equal)
  await writeFile(`${artifactRoot}/report.json`, JSON.stringify({ checks, failures, errors }, null, 2))
  console.log(JSON.stringify({ variants: checks.length, failures: failures.map((check) => check.id), errors }, null, 2))
  if (failures.length || errors.length)
    throw new Error('Preview scene behavior or geometry differs; inspect the parity report.')
} finally {
  await browser.close()
}
