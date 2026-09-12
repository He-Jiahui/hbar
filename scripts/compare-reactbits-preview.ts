import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium, type Page } from '@playwright/test'
import { getReferenceVariant, listReferenceVariants } from '../apps/web/src/react-bits/reference/reference-manifest'

type Viewport = 'desktop' | 'tablet' | 'mobile'
type Size = { width: number; height: number }
type DiffResult = { comparable: boolean; width: number; height: number; differingPixels: number; totalPixels: number; diffPercent: number; meanChannelDelta: number; reason?: string }

const sizes: Record<Viewport, Size> = {
  desktop: { width: 1280, height: 720 },
  tablet: { width: 768, height: 900 },
  mobile: { width: 390, height: 844 },
}
const baseUrl = (Bun.argv.find((arg) => arg.startsWith('--base-url='))?.slice(11) ?? process.env.HBAR_REFERENCE_BASE_URL ?? 'http://127.0.0.1:4317').replace(/\/$/, '')
const threshold = Number(Bun.argv.find((arg) => arg.startsWith('--threshold='))?.slice(12) ?? 0.5)
const requested = Bun.argv.slice(2).filter((arg) => !arg.startsWith('--'))
const compareAll = Bun.argv.includes('--all')
const variants = compareAll
  ? listReferenceVariants()
  : requested.length > 0
  ? requested.map((id) => getReferenceVariant(id.startsWith('reactbits.') ? id : `reactbits.${id}`)).filter((value): value is NonNullable<typeof value> => Boolean(value))
  : listReferenceVariants().slice(0, 3)
const viewports = (Bun.argv.find((arg) => arg.startsWith('--viewports='))?.slice(12).split(',') ?? ['desktop', 'tablet', 'mobile']).filter((value): value is Viewport => value === 'desktop' || value === 'tablet' || value === 'mobile')
const outputDir = join(process.cwd(), 'artifacts', 'reactbits-reference', 'diffs')

function browserExecutable(): string | undefined {
  const configured = process.env.HBAR_CHROMIUM_PATH
  if (configured && existsSync(configured)) return configured
  const localAppData = process.env.LOCALAPPDATA ?? ''
  const candidates = [
    join(localAppData, 'ms-playwright', 'chromium-1234', 'chrome-win64', 'chrome.exe'),
    join(localAppData, 'ms-playwright', 'chromium-1208', 'chrome-win64', 'chrome.exe'),
    join(localAppData, 'ms-playwright', 'chromium-1148', 'chrome-win', 'chrome.exe'),
  ]
  return candidates.find((candidate) => existsSync(candidate))
}

function dataUrl(bytes: ArrayBuffer, mime = 'image/png'): string {
  const bytesView = new Uint8Array(bytes)
  let binary = ''
  for (let offset = 0; offset < bytesView.length; offset += 0x8000) binary += String.fromCharCode(...bytesView.subarray(offset, Math.min(offset + 0x8000, bytesView.length)))
  return `data:${mime};base64,${btoa(binary)}`
}

function pngSize(bytes: ArrayBuffer): Size | undefined {
  const view = new DataView(bytes)
  if (view.byteLength < 24 || view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a) return undefined
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

async function compareImages(page: Page, expectedPath: string, actualPath: string): Promise<DiffResult> {
  const expected = await Bun.file(expectedPath).arrayBuffer()
  const actual = await Bun.file(actualPath).arrayBuffer()
  return page.evaluate(async ({ expectedUrl, actualUrl }) => {
    const load = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error(`Unable to decode ${url}`))
      image.src = url
    })
    const [expected, actual] = await Promise.all([load(expectedUrl), load(actualUrl)])
    if (expected.naturalWidth !== actual.naturalWidth || expected.naturalHeight !== actual.naturalHeight) return { comparable: false, width: actual.naturalWidth, height: actual.naturalHeight, differingPixels: 0, totalPixels: 0, diffPercent: 100, meanChannelDelta: 0, reason: `dimension mismatch: expected ${expected.naturalWidth}x${expected.naturalHeight}, actual ${actual.naturalWidth}x${actual.naturalHeight}` }
    const canvas = document.createElement('canvas')
    canvas.width = expected.naturalWidth
    canvas.height = expected.naturalHeight
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Canvas 2D context unavailable')
    context.drawImage(expected, 0, 0)
    const expectedData = context.getImageData(0, 0, canvas.width, canvas.height).data
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(actual, 0, 0)
    const actualData = context.getImageData(0, 0, canvas.width, canvas.height).data
    let differingPixels = 0
    let channelDelta = 0
    for (let index = 0; index < expectedData.length; index += 4) {
      const delta = Math.abs(expectedData[index]! - actualData[index]!) + Math.abs(expectedData[index + 1]! - actualData[index + 1]!) + Math.abs(expectedData[index + 2]! - actualData[index + 2]!)
      channelDelta += delta / 3
      if (delta > 15 || Math.abs(expectedData[index + 3]! - actualData[index + 3]!) > 15) differingPixels++
    }
    const totalPixels = canvas.width * canvas.height
    return { comparable: true, width: canvas.width, height: canvas.height, differingPixels, totalPixels, diffPercent: (differingPixels / totalPixels) * 100, meanChannelDelta: channelDelta / totalPixels }
  }, { expectedUrl: dataUrl(expected), actualUrl: dataUrl(actual) })
}

await mkdir(outputDir, { recursive: true })
const executablePath = browserExecutable()
const browser = await chromium.launch(executablePath ? { headless: true, executablePath } : { headless: true, channel: process.env.HBAR_BROWSER_CHANNEL ?? 'msedge' })
const page = await browser.newPage({ viewport: sizes.desktop, colorScheme: 'dark', deviceScaleFactor: 1 })
await page.route(`${baseUrl}/**`, async (route) => {
  const response = await route.fetch()
  const headers = { ...response.headers() }
  // The production host intentionally disallows framing.  This local-only
  // diff harness removes that response guard so the fixture can be captured
  // in the same iframe context as the public reference preview.
  delete headers['content-security-policy']
  delete headers['x-frame-options']
  await route.fulfill({ response, headers })
})
const results: Array<Record<string, unknown>> = []
for (const variant of variants) {
  for (const viewport of viewports) {
    const size = sizes[viewport]
    await page.setViewportSize(size)
    const url = `${baseUrl}/?referenceFixture=${encodeURIComponent(variant.referenceId)}&viewport=${viewport}`
    const actualPath = join(outputDir, `${variant.variantSlug}-${viewport}.png`)
    const expectedPath = join(process.cwd(), 'artifacts', 'reactbits-reference', variant.variantSlug, `preview-${viewport}.png`)
    try {
      const expectedSize = existsSync(expectedPath) ? pngSize(await Bun.file(expectedPath).arrayBuffer()) : undefined
      const captureSize = expectedSize ?? size
      await page.setViewportSize(captureSize)
      const routeUrl = `${url}&fixtureWidth=${captureSize.width}&fixtureHeight=${captureSize.height}`
      // The public reference is itself captured from an iframe.  Capture the
      // local fixture in the same compositor context so font antialiasing and
      // viewport clipping are measured on equal terms.
      // The public preview places its iframe inside a rounded-xl clipping
      // surface. Keep that compositor boundary in the local harness so the
      // corner antialiasing is compared against the same pixels.
      await page.setContent(`<style>html,body{margin:0;padding:0;overflow:hidden;background:#0a0a0a}</style><iframe title="Local fixture" src="${routeUrl}" style="display:block;width:${captureSize.width}px;height:${captureSize.height}px;border:0;border-radius:16.8px;overflow:hidden"></iframe>`)
      const frameElement = page.locator('iframe').first()
      const fixtureFrame = await frameElement.contentFrame()
      if (!fixtureFrame) throw new Error('local fixture iframe unavailable')
      const fixture = fixtureFrame.locator('#reference-fixture-route')
      await fixture.waitFor({ state: 'visible', timeout: 30_000 })
      // The route mounts the stable wrapper before its lazy fixture resolves.
      // Wait for Suspense to leave the capture surface so a slow chunk cannot
      // turn a visual comparison into a false "Loading fixture…" failure.
      await fixtureFrame.locator('[aria-busy="true"]').waitFor({ state: 'detached', timeout: 30_000 }).catch(() => undefined)
      await fixtureFrame.locator('head').evaluate((head) => {
        const style = document.createElement('style')
        style.textContent = '* { animation: none !important; transition: none !important; caret-color: transparent !important; }'
        head.appendChild(style)
      })
      await page.waitForTimeout(250)
      await frameElement.screenshot({ path: actualPath, animations: 'disabled' })
      const diff = existsSync(expectedPath) ? await compareImages(page, expectedPath, actualPath) : { comparable: false, width: size.width, height: size.height, differingPixels: 0, totalPixels: 0, diffPercent: 100, meanChannelDelta: 0, reason: 'missing public screenshot' }
      results.push({ referenceId: variant.referenceId, viewport, expectedPath, actualPath, ...diff, pass: diff.comparable && diff.diffPercent <= threshold })
    } catch (error) {
      results.push({ referenceId: variant.referenceId, viewport, expectedPath, actualPath, comparable: false, pass: false, reason: error instanceof Error ? error.message : String(error) })
    }
  }
}
await browser.close()
const comparable = results.filter((result) => result.comparable)
const output = { generatedAt: new Date().toISOString(), baseUrl, thresholdPercent: threshold, requestedVariants: variants.length, requestedViewports: viewports, comparable: comparable.length, passed: results.filter((result) => result.pass).length, failed: results.filter((result) => !result.pass).length, results }
await Bun.write(join(outputDir, 'report.json'), JSON.stringify(output, null, 2) + '\n')
console.log(JSON.stringify({ ...output, results: undefined }, null, 2))
if (output.failed > 0) process.exitCode = 1
