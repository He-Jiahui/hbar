import { expect, test } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { join } from 'node:path'
import { build, preview, type PreviewServer } from 'vite'
import { sessionContextCopy } from '../apps/web/src/session-context-copy'
import type { SessionWorkspaceContextInput } from '../tests/fixtures/session-workspace-context-browser'

const root = join(process.cwd(), 'artifacts/desktop-elements/session-workspace-context/controlled')
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
      rolldownOptions: { input: join(process.cwd(), 'tests/fixtures/session-workspace-context.html') },
    },
  })
  server = await preview({
    configFile: false,
    build: { outDir: join(root, 'web') },
    preview: { host: '127.0.0.1', port: 0 },
  })
  const address = server.httpServer.address()
  if (!address || typeof address === 'string') throw new Error('Missing owned project context preview')
  url = `http://127.0.0.1:${address.port}/tests/fixtures/session-workspace-context.html`
})
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve()
    server.httpServer.close((error) => (error ? reject(error) : resolve()))
  })
})
for (const locale of ['en-US', 'zh-CN'] as const)
  for (const mode of ['light', 'dark'] as const)
    test(`complete project identities and typed context slots ${locale} ${mode}`, async ({ browser }, info) => {
      const context = await browser.newContext({ locale, viewport: { width: 1440, height: 1000 } })
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const labels = sessionContextCopy(locale)
      const input: SessionWorkspaceContextInput = {
        locale,
        mode,
        name: (locale === 'zh-CN' ? '完整原始项目名称' : 'Complete original project name ').repeat(600).slice(0, 4000),
        branch: 'feature/' + 'original-branch-name-'.repeat(25),
        sessionId: 'original-session',
        workspaceId: 'original-workspace',
        scene: 'ready',
      }
      try {
        await page.goto(url)
        await page.evaluate((input) => window.mountSessionWorkspaceContext(input), input)
        const group = page.getByRole('group', { name: labels.project(input.name), exact: true })
        for (const width of [1440, 1100, 900, 390, 320]) {
          await page.setViewportSize({ width, height: 1000 })
          await expect(group).toHaveCount(1)
          await expect(group).toHaveAttribute('tabindex', '0')
          const name = group.locator('.hbar-session-project-context-name')
          await expect(name).toHaveText(input.name)
          await expect(name).toHaveAttribute('data-text-context', 'collection.title')
          expect(await name.evaluate((node) => getComputedStyle(node).whiteSpace)).toBe('normal')
          expect(await group.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
          await group.evaluate((node) => {
            node.scrollTop = 0
          })
          await group.focus()
          await page.keyboard.press('PageDown')
          await expect.poll(() => group.evaluate((node) => node.scrollTop)).toBeGreaterThan(0)
          const branch = group.locator('.hbar-session-project-context-branch-name')
          await expect(branch).toHaveText(input.branch)
          expect(await branch.evaluate((node) => getComputedStyle(node).whiteSpace)).toBe('normal')
          expect(await branch.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
          expect(await page.getByRole('main').evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          if (width === 320)
            await page.screenshot({ path: info.outputPath(`project-context-${locale}-${mode}-320.png`) })
        }
        expect(await page.evaluate((name) => window.canRenderSessionWorkspaceName(name), input.name + 'x')).toBe(false)
        const short = { ...input, name: 'Original 项目' }
        const update = (scene: SessionWorkspaceContextInput['scene']) =>
          page.evaluate((input) => window.updateSessionWorkspaceContext(input), { ...short, scene })
        for (const scene of ['loading', 'offline', 'error'] as const) {
          await update(scene)
          const owner = page.getByRole('group', { name: labels.project(short.name), exact: true })
          await expect(owner.locator('.hbar-session-project-context-branch')).toHaveCount(0)
          const reader =
            scene === 'error'
              ? owner.getByRole('status', { name: labels.unavailable('GIT_TIMEOUT').repeat(30), exact: true })
              : owner.getByRole('group', {
                  name: (scene === 'loading' ? labels.loading : labels.disconnected).repeat(30),
                  exact: true,
                })
          await reader.evaluate((node) => {
            node.scrollLeft = 0
          })
          await reader.focus()
          await page.keyboard.press('ArrowRight')
          await expect.poll(() => reader.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
        }
        await page.getByRole('button', { name: labels.retry.repeat(30), exact: true }).focus()
        await page.keyboard.press('Enter')
        expect(await page.evaluate(() => window.sessionWorkspaceContextTargets())).toEqual([
          { sessionId: input.sessionId, workspaceId: input.workspaceId },
        ])
        await expect(page.getByRole('button', { name: labels.retry.repeat(30), exact: true })).toHaveCount(0)
        await update('stale')
        await expect(
          page
            .getByRole('group', { name: labels.project(short.name), exact: true })
            .locator('.hbar-session-project-context-branch'),
        ).toHaveCount(0)
        await update('empty')
        await expect(page.getByRole('group')).toHaveCount(0)
        await update('launch')
        await expect(page.locator('[data-text-context="workspace.context"]:visible')).toHaveText(short.name)
        expect(errors).toEqual([])
      } finally {
        await context.close()
      }
    })
