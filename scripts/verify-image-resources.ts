import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build, preview } from 'vite'
import { chromium, expect } from '@playwright/test'

const repository = resolve(import.meta.dirname, '..')
const output = resolve(repository, 'artifacts/image-resources')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  root: resolve(repository, 'e2e/fixtures/image-resources'),
  build: { outDir: resolve(output, 'web'), emptyOutDir: false },
})
const server = await preview({
  configFile: false,
  root: resolve(repository, 'e2e/fixtures/image-resources'),
  build: { outDir: resolve(output, 'web') },
  preview: { host: '127.0.0.1', port: 45123, strictPort: true },
})
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
try {
  browser = await chromium.launch({ channel: process.env.HBAR_BROWSER_CHANNEL ?? 'msedge', headless: true })
  const page = await browser.newPage({ viewport: { width: 320, height: 240 } })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('http://127.0.0.1:45123')
  await page.waitForFunction(() => Boolean(window.imageResourceProbe))
  const cases = await page.evaluate(() => window.imageResourceProbe.cases)
  const observations: unknown[] = []
  for (const fixture of cases) {
    const full = await page.evaluate((name) => window.imageResourceProbe.open(name), fixture.name)
    expect(full).toEqual({ width: 4, height: 4, naturalWidth: 4, naturalHeight: 4 })
    const images = new Set<string>()
    for (let frame = 0; frame < (fixture.frames > 1 ? 8 : 2); frame += 1) {
      const screenshot = await page
        .locator('#preview')
        .screenshot({ path: resolve(output, `${fixture.name}-full-${frame}.png`), animations: 'allow' })
      images.add(createHash('sha256').update(screenshot).digest('hex'))
      // Sampling advances animation time; this is not a readiness wait.
      await page.waitForTimeout(75)
    }
    expect(images.size).toBe(fixture.frames > 1 ? 2 : 1)
    const thumbnail = await page.evaluate((name) => window.imageResourceProbe.open(name, 'thumbnail'), fixture.name)
    expect(thumbnail.width).toBeLessThanOrEqual(256)
    expect(thumbnail.height).toBeLessThanOrEqual(256)
    observations.push({ name: fixture.name, full, distinctRenderedFrames: images.size, thumbnail })
  }
  const cancellation = await page.evaluate(() => window.imageResourceProbe.cancelWorker())
  expect(cancellation).toEqual({ code: 'CANCELLED', started: true })
  const counters = await page.evaluate(() => window.imageResourceProbe.finish())
  expect(counters.created).toBe(counters.revoked)
  expect(counters.workers).toBe(counters.terminated)
  expect(counters.liveWorkers).toBe(0)
  expect(counters.maxWorkers).toBe(1)
  expect(errors).toEqual([])
  await writeFile(
    resolve(output, 'observations.json'),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        observations,
        cancellation,
        counters,
        errors,
        scope:
          'Real bundled Chromium worker and image resources only; no Host, product gallery, native WebView or model Run.',
      },
      null,
      2,
    ),
  )
  console.log(
    `PASS: ${cases.length} real image formats, original animation frames, thumbnails, worker abort, exact resource cleanup`,
  )
} finally {
  await browser?.close()
  await new Promise<void>((resolveClose, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolveClose())),
  )
}
