import { expect, test } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { join } from 'node:path'
import { build, preview, type PreviewServer } from 'vite'
import type { OnboardingPathContentInput } from '../tests/fixtures/onboarding-path-content-browser'
import { onboardingCopy } from '../apps/web/src/onboarding-copy'

const root = join(process.cwd(), 'artifacts/desktop-elements/onboarding-path-content/controlled')
let server: PreviewServer | undefined
let url = ''
test.beforeAll(async () => {
  test.setTimeout(90_000)
  await build({
    configFile: false,
    root: process.cwd(),
    plugins: [react()],
    logLevel: 'warn',
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    resolve: { dedupe: ['react', 'react-dom'] },
    build: {
      outDir: join(root, 'web'),
      emptyOutDir: true,
      chunkSizeWarningLimit: 1500,
      rolldownOptions: { input: join(process.cwd(), 'tests/fixtures/onboarding-path-content.html') },
    },
  })
  server = await preview({
    configFile: false,
    build: { outDir: join(root, 'web') },
    preview: { host: '127.0.0.1', port: 0, strictPort: false },
  })
  const address = server.httpServer.address()
  if (!address || typeof address === 'string') throw new Error('Missing owned onboarding preview')
  url = `http://127.0.0.1:${address.port}/tests/fixtures/onboarding-path-content.html`
})
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve()
    server.httpServer.close((error) => (error ? reject(error) : resolve()))
  })
})
for (const locale of ['en-US', 'zh-CN'] as const)
  for (const mode of ['light', 'dark'] as const)
    test(`typed onboarding path and full titles ${locale} ${mode}`, async ({ browser }, info) => {
      const context = await browser.newContext({ locale, viewport: { width: 1440, height: 1200 } })
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const labels = onboardingCopy(locale)
      const input: OnboardingPathContentInput = {
        locale,
        mode,
        long: true,
        readiness: { connected: true, workspaceCount: 0, modelCount: 1, projectReady: false },
      }
      try {
        await page.goto(url)
        await page.evaluate((input) => window.mountOnboardingPathContent(input), input)
        const field = page.getByRole('textbox', { name: labels.setupPath.repeat(8), exact: true })
        await expect(field).toHaveAttribute('aria-describedby', 'hbar-onboarding-workspace-path-hint')
        await expect(page.locator('#hbar-onboarding-workspace-path-hint')).toHaveText(labels.setupPathHint.repeat(8))
        for (const width of [1440, 1100, 900, 390, 320]) {
          await page.setViewportSize({ width, height: 1200 })
          const heading = page.getByRole('heading', { name: labels.setupTitle.repeat(8), exact: true })
          await expect(heading).toBeVisible()
          const labelReader = page.getByRole('region', { name: labels.setupPath.repeat(8), exact: true })
          await expect(labelReader).toHaveAttribute('tabindex', '0')
          await labelReader.evaluate((node) => {
            node.scrollLeft = 0
          })
          await labelReader.focus()
          await page.keyboard.press('ArrowRight')
          if (await labelReader.evaluate((node) => node.scrollWidth > node.clientWidth + 1))
            await expect.poll(() => labelReader.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
          expect(await heading.evaluate((node) => getComputedStyle(node).whiteSpace)).toBe('normal')
          expect(await heading.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
          const actions = page.getByRole('group', { name: labels.setupTitle.repeat(8), exact: true })
          await expect(actions).toHaveAttribute('tabindex', '0')
          await actions.evaluate((node) => {
            node.scrollLeft = 0
          })
          await actions.focus()
          await page.keyboard.press('ArrowRight')
          if (await actions.evaluate((node) => node.scrollWidth > node.clientWidth + 1))
            await expect.poll(() => actions.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
          expect(
            await heading.evaluate((node) => {
              const owner = node.closest('.hbar-web-onboarding-page')?.getBoundingClientRect()
              const bounds = node.getBoundingClientRect()
              return Boolean(owner && bounds.left >= owner.left - 1 && bounds.right <= owner.right + 1)
            }),
          ).toBe(true)
          expect(
            await page
              .getByRole('main', { name: labels.progress, exact: true })
              .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
          ).toBe(true)
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          if (width === 320) await page.screenshot({ path: info.outputPath(`onboarding-${locale}-${mode}-320.png`) })
        }
        const path = 'D:/owned-'.padEnd(4000, locale === 'zh-CN' ? '路' : 'p')
        await field.fill(path)
        await expect(field).toHaveValue(path)
        const submit = page.getByRole('button', { name: labels.continue.repeat(12), exact: true })
        await submit.focus()
        await page.keyboard.press('Enter')
        await expect(page.getByRole('alert')).toHaveText(
          labels.error('WORKSPACE_OPEN_FAILED').repeat(8) + labels.retry.repeat(12),
        )
        expect(await page.evaluate(() => window.onboardingPathContentTargets())).toContainEqual({
          kind: 'create',
          value: path,
        })
        await expect(field).toHaveValue(path)
        await page.evaluate(() => window.setOnboardingPathContentBusy(true))
        await expect(field).toBeDisabled()
        const retry = page.getByRole('button', { name: labels.retry.repeat(12), exact: true })
        await expect(retry).toBeDisabled()
        await page.evaluate(() => window.setOnboardingPathContentBusy(false))
        await retry.focus()
        await page.keyboard.press('Enter')
        await expect(page.getByRole('alert')).toHaveCount(0)
        await expect(field).toHaveValue(path)
        await page.evaluate(() => window.repairOnboardingPathContent())
        const tooLong = path + 'x'
        await field.fill(tooLong)
        await submit.focus()
        await page.keyboard.press('Enter')
        await expect(page.getByRole('alert')).toContainText(labels.error('INVALID_INPUT').repeat(8))
        await expect(field).toHaveValue(tooLong)
        await field.fill(path)
        await submit.focus()
        await page.keyboard.press('Enter')
        await expect(page.getByRole('alert')).toHaveCount(0)
        for (const count of [1, 3, 1000, 1001]) {
          await page.evaluate((input) => window.updateOnboardingPathContent(input), {
            ...input,
            readiness: { connected: true, workspaceCount: count, modelCount: count, projectReady: true },
          })
          await expect(page.getByRole('heading', { name: labels.readyTitle.repeat(8), exact: true })).toBeVisible()
        }
        await page.evaluate((input) => window.updateOnboardingPathContent(input), {
          ...input,
          readiness: { connected: false, workspaceCount: 0, modelCount: 0, projectReady: false },
        })
        await expect(page.getByRole('heading', { name: labels.setupTitle.repeat(8), exact: true })).toBeVisible()
        await page.evaluate((input) => window.updateOnboardingPathContent(input), input)
        await expect(field).toHaveValue(path)
        expect(errors).toEqual([])
      } finally {
        await context.close()
      }
    })
