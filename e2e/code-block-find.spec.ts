import { expect, test } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { build, preview, type PreviewServer } from 'vite'
import type { CodeFindScenario } from '../tests/fixtures/code-block-find-browser'

const root = join(process.cwd(), 'artifacts/code-block-copy/find-test')
const base = 'http://127.0.0.1:45542'
let server: PreviewServer | undefined

test.beforeAll(async () => {
  test.setTimeout(60_000)
  await mkdir(root, { recursive: true })
  await writeFile(
    join(root, 'index.html'),
    '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>::highlight(hbar-session-find-results){background:#fff2a8}::highlight(hbar-session-find-active){background:#ffbf47;color:#111}</style></head><body><script type="module" src="../../../tests/fixtures/code-block-find-browser.ts"></script></body></html>',
  )
  await build({ configFile: false, root, build: { outDir: join(root, 'web'), emptyOutDir: true } })
  server = await preview({
    configFile: false,
    root,
    build: { outDir: join(root, 'web') },
    preview: { host: '127.0.0.1', port: 45542, strictPort: true },
  })
})

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve()
    server.httpServer.close((error) => (error ? reject(error) : resolve()))
  })
})

test('registered code chrome does not corrupt the AST text mapping', async ({ page }) => {
  await page.goto(base)
  const result = await page.evaluate(() => window.codeBlockFind.baseline())
  expect(result.ranges).toEqual(['alpha'])
})

test('only registered chrome is excluded, barriers split ranges, cleanup is identity-safe', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(base)
  const result = await page.evaluate(() => window.codeBlockFind.mapping())
  expect(result.fakeMarker).toBeNull()
  expect(result.registered).toEqual(['alpha', ' beta\n'])
  expect(result.copyChanged).toEqual(result.registered)
  expect(result.replacedOwner).toEqual({ mapped: result.registered, registered: true })
  expect(result.mismatch).toBeNull()
  expect(result.afterCleanup).toEqual({ mapped: null, registered: false })
  expect(result.ariaHiddenBody).toEqual(['alpha beta\n'])
  expect(await page.evaluate(() => window.codeBlockFind.registry())).toEqual({
    oldCalls: 0,
    calls: 1,
    changed: true,
    afterCleanup: false,
  })
  expect(errors).toEqual([])
})

for (const locale of ['en', 'zh'] as const) {
  for (const width of [1440, 900, 320]) {
    test(`explicit hidden-tail navigation, strict source mapping and non-seeking repaint ${locale} ${width}`, async ({
      page,
    }, testInfo) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })
      await page.setViewportSize({ width, height: 960 })
      await page.goto(base)
      for (const scenario of ['normal', 'cross-tail', 'proposal', 'stream'] as const) {
        const result = await page.evaluate(({ scenario, locale }) => window.codeBlockFind.painter(scenario, locale), {
          scenario,
          locale,
        })
        expect(result.initial).toEqual({ hidden: true, calls: 0, scroll: 0 })
        expect(result.revealed.hidden).toBe(false)
        expect(result.revealed.calls).toBe(1)
        expect(result.revealed.scroll).toBeGreaterThan(0)
        expect(result.targetInViewport).toBe(true)
        expect(result.activeText).toEqual([scenario === 'cross-tail' ? 'line-020\nline-021' : 'line-045'])
        expect(result.repainted).toEqual({ hidden: true, calls: 1, scroll: 0 })
        expect(result.feedback.every((value) => value === null)).toBe(true)
      }
      await page.evaluate((locale) => window.codeBlockFind.painter('normal', locale, true), locale)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`controlled-dom-${locale}-${width}.png`) })
      expect(errors).toEqual([])
    })
  }
}

for (const scenario of [
  'cancel',
  'aba',
  'projection',
  'request',
  'row',
  'segment',
  'mismatch',
  'dispose',
  'null',
] satisfies readonly CodeFindScenario[]) {
  test(`synchronous reveal revalidates ${scenario} before scrolling`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base)
    const result = await page.evaluate((scenario) => window.codeBlockFind.painter(scenario, 'en'), scenario)
    expect(result.initial).toEqual({ hidden: true, calls: 0, scroll: 0 })
    expect(result.revealed.calls).toBe(1)
    expect(result.revealed.scroll).toBe(0)
    expect(result.repainted.scroll).toBe(0)
    expect(result.repainted.calls).toBe(1)
    expect(errors).toEqual([])
  })
}
