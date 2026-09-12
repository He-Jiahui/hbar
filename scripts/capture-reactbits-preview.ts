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
type ElementObservation = {
  tag: string
  role?: string
  className?: string
  text: string
  rect: { x: number; y: number; width: number; height: number }
  styles: { display: string; position: string; fontSize: string; lineHeight: string; color: string; backgroundColor: string; border: string; borderRadius: string; padding: string; gap: string }
}
type PreviewRecord = {
  capturedAt: string
  viewport: PreviewViewport
  visibleText: string
  controls: string[]
  roles: Record<string, number>
  geometry: { iframe: Geometry; body: Geometry; root: Geometry }
  styles: StyleSummary
  elements: ElementObservation[]
  viewportPixels: { width: number; height: number }
  screenshotHash?: string
  pageScreenshotHash?: string
}

const timeoutMs = Math.max(4_000, Math.min(120_000, Number(Bun.argv.find((arg) => arg.startsWith('--timeout='))?.slice(10) ?? 30_000)))
const settleMs = Math.max(100, Math.min(5_000, Number(Bun.argv.find((arg) => arg.startsWith('--settle='))?.slice(9) ?? 650)))
const screenshots = Bun.argv.includes('--screenshots')
const jsonOutput = Bun.argv.includes('--json')
const workersArg = Number(Bun.argv.find((arg) => arg.startsWith('--workers='))?.slice(10) ?? 3)
const workers = Number.isFinite(workersArg) ? Math.max(1, Math.min(6, Math.floor(workersArg))) : 3
const variantTimeoutMs = Math.max(timeoutMs, Math.min(180_000, Number(Bun.argv.find((arg) => arg.startsWith('--variant-timeout='))?.slice(18) ?? timeoutMs * 2)))
const requested = Bun.argv.slice(2).filter((arg) => !arg.startsWith('--'))
const category = Bun.argv.find((arg) => arg.startsWith('--category='))?.slice(11)
const categories = Bun.argv.find((arg) => arg.startsWith('--categories='))?.slice(13).split(',').filter(Boolean) ?? []
const variants = requested.length > 0
  ? requested.map((id) => getReferenceVariant(id.startsWith('reactbits.') ? id : `reactbits.${id}`)).filter((value): value is NonNullable<typeof value> => Boolean(value))
  : categories.length > 0
    ? categories.flatMap((value) => listReferenceVariants(value as Parameters<typeof listReferenceVariants>[0]))
    : listReferenceVariants(category as Parameters<typeof listReferenceVariants>[0] | undefined)

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
    const elements: ElementObservation[] = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((element) => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
      })
      .map((element) => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        const text = (element.innerText || element.getAttribute('aria-label') || element.getAttribute('placeholder') || '').replace(/\s+/g, ' ').trim().slice(0, 180)
        return {
          tag: element.tagName.toLowerCase(),
          ...(element.getAttribute('role') ? { role: element.getAttribute('role')! } : {}),
          ...(typeof element.className === 'string' && element.className ? { className: element.className.slice(0, 180) } : {}),
          text,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          styles: {
            display: style.display,
            position: style.position,
            fontSize: style.fontSize,
            lineHeight: style.lineHeight,
            color: style.color,
            backgroundColor: style.backgroundColor,
            border: style.border,
            borderRadius: style.borderRadius,
            padding: style.padding,
            gap: style.gap,
          },
        }
      })
      .filter((element) => element.text || element.role || ['button', 'input', 'textarea', 'select', 'nav', 'header', 'footer'].includes(element.tag))
      .slice(0, 80)
    return {
      visibleText: body.innerText.replace(/\s+/g, ' ').trim().slice(0, 8_000),
      controls,
      roles,
      elements,
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
  const viewportPixels = { desktop: { width: 1280, height: 720 }, tablet: { width: 768, height: 900 }, mobile: { width: 390, height: 844 } }[viewport]
  return { capturedAt: new Date().toISOString(), viewport, viewportPixels, ...snapshot, geometry: await geometry(page, frame) }
}

async function captureVariant(page: Page, variant: (typeof variants)[number]) {
  const outputDir = join('artifacts', 'reactbits-reference', variant.variantSlug)
  await mkdir(outputDir, { recursive: true })
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
    if (screenshots) {
      const screenshotPath = join(outputDir, `preview-${viewport}.png`)
      const pageScreenshotPath = join(outputDir, `page-${viewport}.png`)
      await page.locator('iframe').first().screenshot({ path: screenshotPath })
      await page.screenshot({ path: pageScreenshotPath, animations: 'disabled' })
      const screenshotBytes = await Bun.file(screenshotPath).arrayBuffer()
      const pageScreenshotBytes = await Bun.file(pageScreenshotPath).arrayBuffer()
      const digest = await crypto.subtle.digest('SHA-256', screenshotBytes)
      const pageDigest = await crypto.subtle.digest('SHA-256', pageScreenshotBytes)
      records[records.length - 1]!.screenshotHash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
      records[records.length - 1]!.pageScreenshotHash = [...new Uint8Array(pageDigest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    }
  }
  const path = join(outputDir, 'preview-observation.json')
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
  const output: Awaited<ReturnType<typeof captureVariant>>[] = []
  let cursor = 0
  async function worker() {
    while (true) {
      const variant = variants[cursor++]
      if (!variant) return
      const page = await context!.newPage()
      try {
        const capture = captureVariant(page, variant)
        const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`variant timeout after ${variantTimeoutMs}ms`)), variantTimeoutMs))
        output.push(await Promise.race([capture, timeout]))
      } catch (error) {
        console.error(`preview capture failed: ${variant.referenceId}: ${error instanceof Error ? error.message : String(error)}`)
      } finally {
        await page.close().catch(() => undefined)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(workers, variants.length) }, () => worker()))
  output.sort((left, right) => left.referenceId.localeCompare(right.referenceId))
  const summary = { captured: output.length, requested: variants.length, screenshots, workers, exactViewportPixels: { desktop: '1280x720', tablet: '768x900', mobile: '390x844' }, records: output }
  console.log(JSON.stringify(jsonOutput ? summary : { ...summary, records: undefined }, null, 2))
} finally {
  await context?.close()
  await browser?.close()
}
