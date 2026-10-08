import { expect, test } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { join } from 'node:path'
import { build, preview, type PreviewServer } from 'vite'
import type { AgentBranchContentInput } from '../tests/fixtures/agent-branch-content-browser'
import { getShellCopy } from '../apps/web/src/shell-copy'

const root = join(process.cwd(), 'artifacts/desktop-elements/agent-branch-content/controlled')
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
      rolldownOptions: { input: join(process.cwd(), 'tests/fixtures/agent-branch-content.html') },
    },
  })
  server = await preview({
    configFile: false,
    root: process.cwd(),
    build: { outDir: join(root, 'web') },
    preview: { host: '127.0.0.1', port: 0, strictPort: false },
  })
  const address = server.httpServer.address()
  if (!address || typeof address === 'string') throw new Error('Missing owned agent branch preview')
  url = `http://127.0.0.1:${address.port}/tests/fixtures/agent-branch-content.html`
})
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve()
    server.httpServer.close((error) => (error ? reject(error) : resolve()))
  })
})

for (const locale of ['en-US', 'zh-CN'] as const)
  for (const width of [1440, 1100, 900, 390, 320]) {
    test(`Agent branch content and original targets remain readable ${locale} ${width}`, async ({ browser }, info) => {
      const context = await browser.newContext({ locale, viewport: { width, height: 1000 } })
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      try {
        await page.goto(url)
        await page.evaluate(() => {
          document.documentElement.style.zoom = '1.25'
        })
        for (const mode of ['light', 'dark'] as const) {
          for (const total of [0, 1, 7, 49, 50, 51, 127, 128, 129]) {
            const data: AgentBranchContentInput = { locale, mode, total }
            await page.evaluate((input) => window.mountAgentBranchContent(input), data)
            const parent = page.locator('[data-agent-parent="owned-parent"]')
            const rows = parent.locator('[data-sidebar-level="subagent-session"]')
            await expect(rows).toHaveCount(Math.min(50, total))
            while (await parent.locator('.hbar-app-react-agent-branch-actions button').count()) {
              const reader = parent.locator('.hbar-app-react-agent-branch-actions').first()
              await reader.focus()
              if (await reader.evaluate((node) => node.scrollWidth > node.clientWidth)) {
                await reader.press('ArrowRight')
                await expect.poll(() => reader.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
              }
              const before = await rows.count()
              const action = reader.getByRole('button')
              if (!(await action.isEnabled())) break
              await action.focus()
              await action.press('Enter')
              await expect.poll(() => rows.count()).toBeGreaterThan(before)
            }
            await expect(rows).toHaveCount(Math.min(total, 128))
            if (total > 128) {
              await expect(
                parent.getByText(getShellCopy(locale).shell.agentTree.capacity.repeat(8), { exact: true }),
              ).toBeVisible()
              await expect(parent.locator('.hbar-app-react-agent-branch-actions button')).toBeDisabled()
            }
            const titles = parent.locator('.hbar-sidebar-title')
            await expect(titles).toHaveCount(Math.min(total, 128) + 1)
            const titleGeometry = await titles.evaluateAll((nodes) =>
              nodes.map((node) => ({
                wrapping: getComputedStyle(node).whiteSpace,
                width: node.clientWidth,
                scroll: node.scrollWidth,
                clipped: getComputedStyle(node).textOverflow,
              })),
            )
            for (const title of titleGeometry) {
              expect(title.wrapping).toBe('normal')
              expect(title.scroll).toBeLessThanOrEqual(title.width + 1)
              expect(title.clipped).not.toBe('ellipsis')
            }
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
            if (total === 1) {
              const time = rows.first().locator('.hbar-app-react-session-time-reading')
              if (await time.evaluate((node) => node.scrollWidth > node.clientWidth)) {
                await time.focus()
                await time.press('ArrowRight')
                await expect.poll(() => time.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
              }
              const child = rows.first().getByRole('treeitem')
              await child.focus()
              await child.press('Enter')
              expect(await page.evaluate(() => window.agentBranchContentTargets().at(-1))).toBe('owned-child-000')
            }
          }
          await page.evaluate((input) => window.mountAgentBranchContent(input), {
            locale,
            mode,
            total: 2,
            duplicate: true,
          })
          await expect(page.locator('[data-sidebar-level="subagent-session"]')).toHaveCount(0)
          await expect(page.locator('[data-agent-parent="owned-parent"]').getByRole('alert')).toBeVisible()
          await page.evaluate((input) => window.mountAgentBranchContent(input), {
            locale,
            mode,
            total: 1,
            phase: 'failed' as const,
          })
          const parent = page.locator('[data-agent-parent="owned-parent"]')
          await expect(parent.getByRole('alert')).toBeVisible()
          await page.evaluate(() => window.repairAgentBranchContent())
          const retry = parent.getByRole('alert').getByRole('button')
          await retry.focus()
          await retry.press('Enter')
          await expect(parent.getByRole('alert')).toHaveCount(0)
          await expect(parent.locator('[data-sidebar-level="subagent-session"]')).toHaveCount(1)
          expect(
            await page.evaluate(() => window.agentBranchContentTargets().every((id) => id === 'owned-parent')),
          ).toBe(true)
          await page.evaluate((input) => window.mountAgentBranchContent(input), {
            locale,
            mode,
            total: 1,
            phase: 'loading' as const,
          })
          await expect(parent.getByRole('status')).toBeVisible()
          await page.evaluate(() => window.releaseAgentBranchContent())
          await expect(parent.locator('[data-sidebar-level="subagent-session"]')).toHaveCount(1)
          await page.screenshot({ path: info.outputPath(`agent-branch-${mode}-${width}.png`), fullPage: true })
          await page.evaluate((input) => window.mountAgentBranchContent(input), {
            locale,
            mode,
            total: 1,
            phase: 'failed' as const,
            connected: false,
          })
          await expect(parent.getByRole('alert').getByRole('button')).toBeDisabled()
        }
        expect(errors).toEqual([])
      } finally {
        await context.close()
      }
    })
  }
