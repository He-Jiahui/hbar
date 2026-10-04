import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { chromium, expect, type Page } from '@playwright/test'
import type { ImageEntrySnapshot } from '../e2e/fixtures/image-entry-lifecycle/main'

const repository = resolve(import.meta.dirname, '..')
const output = resolve(repository, 'artifacts/image-entry-lifecycle')
await mkdir(output, { recursive: true })
const server = await createServer({
  configFile: false,
  root: resolve(repository, 'e2e/fixtures/image-entry-lifecycle'),
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  cacheDir: resolve(output, 'vite-cache'),
  server: { host: '127.0.0.1', port: 45126, strictPort: true },
})
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
const errors: string[] = []
const observations: {
  readonly locale: string
  readonly width: number
  readonly snapshots: Record<string, ImageEntrySnapshot>
}[] = []
const snapshot = (page: Page) => page.evaluate(() => window.imageEntryProbe.snapshot())
const ready = async (page: Page) => {
  await expect
    .poll(async () => {
      const value = await snapshot(page)
      return (
        value.entries.length === 2 &&
        value.entries.every((entry) => entry.complete && entry.naturalWidth === 4 && entry.naturalHeight === 4)
      )
    })
    .toBe(true)
  await expect.poll(async () => (await snapshot(page)).live).toBe(2)
}
const leave = async (page: Page) => {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await expect.poll(async () => (await snapshot(page)).entries.every((entry) => entry.bottom <= 0)).toBe(true)
  await expect.poll(async () => (await snapshot(page)).live).toBe(0)
}
const enter = async (page: Page) => {
  await page.evaluate(() => window.scrollTo(0, 0))
  await ready(page)
}
try {
  await server.listen()
  browser = await chromium.launch({ channel: process.env.HBAR_BROWSER_CHANNEL ?? 'msedge', headless: true })
  for (const locale of ['en-US', 'zh-CN']) {
    for (const width of [1440, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 800 } })
      const unexpectedRequests: string[] = []
      page.on('pageerror', (error) => errors.push(`${locale}/${width}: ${error.message}`))
      page.on('request', (request) => {
        if (/\/(?:rpc|api\/|auth\/)/.test(new URL(request.url()).pathname)) unexpectedRequests.push(request.url())
      })
      const values: Record<string, ImageEntrySnapshot> = {}
      try {
        await page.goto(`http://127.0.0.1:45126/?locale=${locale}`)
        await page.waitForFunction(() => Boolean(window.imageEntryProbe))
        await ready(page)
        values.orphan = await snapshot(page)
        expect(values.orphan.strictSetups).toBeGreaterThanOrEqual(2)
        expect(values.orphan.strictCleanups).toBeGreaterThanOrEqual(1)
        await page.screenshot({ path: resolve(output, `orphan-${locale}-${width}.png`) })

        await page.evaluate(() => window.imageEntryProbe.change('paired'))
        await expect.poll(async () => (await snapshot(page)).stage).toBe('paired')
        await ready(page)
        values.paired = await snapshot(page)
        await leave(page)
        values.pairedOutside = await snapshot(page)
        await enter(page)
        values.pairedReturned = await snapshot(page)
        expect(values.pairedReturned.reads).toBeGreaterThan(values.pairedOutside.reads)

        // Move the same second occurrence into a new rendered image group while offscreen.
        const beforeSplitNodes = values.pairedReturned.entries.map((entry) => entry.nodeId)
        await leave(page)
        await page.evaluate(() => window.imageEntryProbe.change('split'))
        await expect.poll(async () => (await snapshot(page)).stage).toBe('split')
        values.splitOutside = await snapshot(page)
        expect(values.splitOutside.entries[1]?.nodeId).not.toBe(beforeSplitNodes[1])
        expect(values.splitOutside.live).toBe(0)
        // Only the replaced second node becomes visible. Seeing the unchanged first node
        // would also activate the entire collection and could conceal a stale observer.
        await page.evaluate(() => {
          const second = document.querySelectorAll<HTMLElement>('[data-image-occurrence]')[1]
          if (!second) throw new Error('Missing replaced second occurrence')
          window.scrollTo(0, window.scrollY + second.getBoundingClientRect().top - 20)
        })
        await expect
          .poll(async () => {
            const entries = (await snapshot(page)).entries
            const first = entries[0]
            const second = entries[1]
            return Boolean(first && second && first.bottom <= 0 && second.top >= 0 && second.bottom <= 800)
          })
          .toBe(true)
        await ready(page)
        values.splitReturned = await snapshot(page)
        expect(values.splitReturned.reads).toBeGreaterThan(values.splitOutside.reads)
        await page.screenshot({ path: resolve(output, `split-returned-${locale}-${width}.png`) })

        await leave(page)
        await page.evaluate(() => window.imageEntryProbe.change('merged'))
        await expect.poll(async () => (await snapshot(page)).stage).toBe('merged')
        values.mergedOutside = await snapshot(page)
        await enter(page)
        values.mergedReturned = await snapshot(page)
        expect(values.mergedReturned.reads).toBeGreaterThan(values.mergedOutside.reads)
        expect(values.mergedReturned.entries[1]?.nodeId).not.toBe(values.splitReturned.entries[1]?.nodeId)

        await page.evaluate(() => window.imageEntryProbe.finish())
        await expect.poll(async () => (await snapshot(page)).live).toBe(0)
        values.finished = await snapshot(page)
        expect(values.finished.reads).toBe(values.finished.revoked)
        expect(values.finished.duplicateReleases).toBe(0)
        expect(values.finished.subscriptions).toBe(0)
        expect(values.finished.strictSetups).toBe(values.finished.strictCleanups)
        expect(Object.values(values).every((value) => value.canonicalUnchanged && value.commandCalls === 0)).toBe(true)
        expect(unexpectedRequests).toEqual([])
      } finally {
        await page
          .evaluate(() => window.imageEntryProbe?.finish())
          .catch((error: unknown) => errors.push(`Fixture cleanup: ${String(error)}`))
        observations.push({ locale, width, snapshots: values })
        await page.close()
      }
    }
  }
  expect(errors).toEqual([])
  console.log(
    'PASS: actual StrictMode message image entries; 4 locale/viewport cases; regroup/viewport/cleanup; 0 commands/HTTP',
  )
} finally {
  await browser?.close()
  await server.close()
  await writeFile(
    resolve(output, 'observations.json'),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        scope:
          'Actual HbarMessageBlocks/HbarSessionImageLayer in development StrictMode and real Edge IntersectionObserver/MutationObserver. Canonical facade over createAppRuntime; local synthetic PNG Blob adapter. No Host, production App, authenticated read, native WebView or model Run.',
        observations,
        errors,
      },
      null,
      2,
    ),
  )
}
