import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page, type Frame } from '@playwright/test'
import { getReferenceVariant, listReferenceVariants } from '../apps/web/src/react-bits/reference/reference-manifest'

/**
 * Capture only the public preview iframe.  This deliberately avoids the Code
 * tab, authentication, uploads and unknown page scripts.  The resulting
 * geometry/text/style snapshot is an observation aid for clean-room fixture
 * work; it is not a runtime dependency of the web app.
 */
type PreviewViewport = 'desktop' | 'tablet' | 'mobile'
type Geometry = { x: number; y: number; width: number; height: number; scrollWidth: number; scrollHeight: number }
type StyleSummary = { fontFamily: string; fontSize: string; lineHeight: string; color: string; backgroundColor: string; borderRadius: string }
type PreviewRecord = {
  capturedAt: string
  viewport: PreviewViewport
  visibleText: string
  controls: string[]
  roles: Record<string, number>
  geometry: { iframe: Geometry; body: Geometry; root: Geometry }
  styles: StyleSummary
}

const timeoutMs = Math.max(4_000, Math.min(120_000, Number(Bun.argv.find((arg) => arg.startsWith('--timeout='))?.slice(10) ?? 30_000)))
const settleMs = Math.max(100, Math.min(5_000, Number(Bun.argv.find((arg) => arg.startsWith('--settle='))?.slice(9) ?? 650)))
const screenshots = Bun.argv.includes('--screenshots')
const requested = Bun.argv.slice(2).filter((arg) => !arg.startsWith('--'))
const category = Bun.argv.find((arg) => arg.startsWith('--category='))?.slice(11)
const variants = (requested.length > 0 ? requested.map((id) => getReferenceVariant(id.startsWith('reactbits.') ? id : `reactbits.${id}`)).filter((value): value is NonNullable<typeof value> => Boolean(value)) : listReferenceVariants(category as Parameters<typeof listReferenceVariants>[0] | undefined))

function executablePath(): string | undefined {
  const configured = process.env.HBAR_CHROMIUM_PATH
  if (configured && existsSync(configured)) return configured
  const candidates = process.platform === 'win32'
    ? [
        join(process.env.LOCALAPPDATA ?? '', 'ms-playwright', 'chromium-1234', 'chrome-win64', 'chrome.exe'),
        join(process.env.LOCALAPPDATA ?? '', 'ms-playwright', 'chromium-1208', 'chrome-win64', 'chrome.exe'),
      ]
    : []
  return candidates.find((candidate) => existsSync(candidate))
}

async function publicFrame(page: Page): Promise<Frame | undefined> {
  const iframe = page.locator('iframe').first()
  await iframe.waitFor({ state: 'attached', timeout: timeoutMs })
  await page.waitForTimeout(settleMs)
  const frame = page.frames().find((candidate) => candidate !== page.mainFrame() && candidate.url() === 'about:blank') ?? page.frames().find((candidate) => candidate !== page.mainFrame())
  if (frame) await waitForFrameContent(page, frame)
  return frame
}

/** Public examples can hydrate their srcdoc iframe after the shell is ready. */
async function waitForFrameContent(page: Page, frame: Frame): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ready = await frame.evaluate(() => Boolean(document.body?.innerText.trim() || document.body?.querySelector('style,link'))).catch(() => false)
    if (ready) return
    await page.waitForTimeout(Math.min(250, Math.max(50, settleMs / 4)))
  }
}

async function geometry(page: Page, frame: Frame): Promise<PreviewRecord['geometry']> {
  const iframeGeometry = await page.locator('iframe').first().evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scrollWidth: element.scrollWidth, scrollHeight: element.scrollHeight }
  })
  const inner = await frame.evaluate(() => {
    const body = document.body
    const root = body.firstElementChild ?? body
    const read = (element: Element): Geometry => {
      const rect = element.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scrollWidth: element.scrollWidth, scrollHeight: element.scrollHeight }
    }
    return { body: read(body), root: read(root) }
  })
  return { iframe: iframeGeometry, ...inner }
}

async function recordViewport(page: Page, frame: Frame, viewport: PreviewViewport): Promise<PreviewRecord> {
  const snapshot = await frame.evaluate(() => {
    const body = document.body
    const styles = getComputedStyle(body)
    const controls = [...document.querySelectorAll<HTMLElement>('button, input, textarea, select, [role="button"], [role="tab"], [role="option"]')]
      .map((element) => element.getAttribute('aria-label') || element.textContent?.replace(/\s+/g, ' ').trim() || element.getAttribute('placeholder') || '')
      .filter(Boolean)
      .slice(0, 80)
    const roles: Record<string, number> = {}
    for (const element of document.querySelectorAll<HTMLElement>('[role]')) {
      const role = element.getAttribute('role')
      if (role) roles[role] = (roles[role] ?? 0) + 1
    }
    return {
      visibleText: body.innerText.replace(/\s+/g, ' ').trim().slice(0, 8_000),
      controls,
      roles,
      styles: {
        fontFamily: styles.fontFamily,
        fontSize: styles.fontSize,
        lineHeight: styles.lineHeight,
        color: styles.color,
        backgroundColor: styles.backgroundColor,
        borderRadius: styles.borderRadius,
      },
    }
  })
  return { capturedAt: new Date().toISOString(), viewport, ...snapshot, geometry: await geometry(page, frame) }
}

async function captureVariant(page: Page, variant: (typeof variants)[number]) {
  await page.goto(variant.sourceUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
  const frame = await publicFrame(page)
  if (!frame) throw new Error(`public preview iframe not available: ${variant.sourceUrl}`)
  const records: PreviewRecord[] = []
  const viewportLabels: Record<PreviewViewport, string> = { desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile' }
  for (const viewport of ['desktop', 'tablet', 'mobile'] as const) {
    const control = page.getByRole('button', { name: `${viewportLabels[viewport]} preview width`, exact: true })
    if (await control.count()) await control.click({ timeout: timeoutMs }).catch(() => undefined)
    await page.waitForTimeout(settleMs)
    await waitForFrameContent(page, frame)
    records.push(await recordViewport(page, frame, viewport))
    if (screenshots) await page.screenshot({ path: join('artifacts', 'reactbits-reference', variant.variantSlug, `preview-${viewport}.png`) })
  }
  const path = join('artifacts', 'reactbits-reference', variant.variantSlug, 'preview-observation.json')
  await mkdir(join('artifacts', 'reactbits-reference', variant.variantSlug), { recursive: true })
  await Bun.write(path, JSON.stringify({ sourceUrl: variant.sourceUrl, note: 'Public preview iframe observation only; Code tab and unknown scripts are excluded.', records }, null, 2))
  return { referenceId: variant.referenceId, sourceUrl: variant.sourceUrl, records }
}

const resolvedExecutable = executablePath()
const browserOptions = resolvedExecutable ? { headless: true, executablePath: resolvedExecutable } : { headless: true }
let browser: Browser | undefined
let context: BrowserContext | undefined
try {
  browser = await chromium.launch(browserOptions)
  context = await browser.newContext({ viewport: { width: 1440, height: 960 }, colorScheme: 'dark', deviceScaleFactor: 1 })
  const page = await context.newPage()
  const output = []
  for (const variant of variants) {
    try {
      output.push(await captureVariant(page, variant))
    } catch (error) {
      console.error(`preview capture failed: ${variant.referenceId}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  console.log(JSON.stringify({ captured: output.length, requested: variants.length, screenshots, records: output }, null, 2))
} finally {
  await context?.close()
  await browser?.close()
}
