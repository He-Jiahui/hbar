import { test, expect, type Page } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { build, preview, type PreviewServer } from 'vite'

const artifactRoot = resolve('artifacts/app-ui-migration-audit/notifications-controlled')
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
      outDir: resolve(artifactRoot, 'web'),
      emptyOutDir: true,
      chunkSizeWarningLimit: 1500,
      rolldownOptions: { input: resolve('e2e/fixtures/notifications-controlled.html') },
    },
  })
  server = await preview({
    configFile: false,
    build: { outDir: resolve(artifactRoot, 'web') },
    preview: { host: '127.0.0.1', port: 0, strictPort: false },
  })
  const address = server.httpServer.address()
  if (!address || typeof address === 'string') throw new Error('Missing notification preview')
  url = `http://127.0.0.1:${address.port}/e2e/fixtures/notifications-controlled.html`
})
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve()
    server.httpServer.close((error) => (error ? reject(error) : resolve()))
  })
})

async function load(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(url)
  await expect(page.getByRole('heading', { name: '通知中心' })).toBeVisible()
  await expect(page.getByRole('button', { name: '标记 运行完成 为已读' }).first()).toBeVisible()
  expect(errors).toEqual([])
}

test('read conflict remains unread; explicit open captures its original target without another write', async ({
  page,
}) => {
  await load(page)
  await page.evaluate(() => {
    if (window.__notifications) window.__notifications.mode = 'conflict'
  })
  await page.getByRole('button', { name: '标记 运行完成 为已读' }).click()
  await expect(page.locator('li[data-unread="true"]')).toHaveCount(1)
  await expect(page.getByRole('button', { name: '标记 运行完成 为已读' })).toBeEnabled()
  expect(await page.evaluate(() => window.__notifications?.opens)).toEqual([])
  await page.getByRole('button', { name: '打开 运行完成' }).click()
  await page.evaluate(() => window.__notifications?.replaceTarget())
  expect(await page.evaluate(() => window.__notifications?.opens)).toEqual([
    { kind: 'session', workspaceId: 'workspace-original', sessionId: 'session-original', runId: 'run-original' },
  ])
  expect(await page.evaluate(() => window.__notifications?.writes)).toBe(1)
  await expect(page.locator('li[data-unread="true"]')).toHaveCount(1)
})

test('unknown read remains disabled until its original receipt confirms, without replay', async ({ page }) => {
  await load(page)
  await page.evaluate(() => {
    if (window.__notifications) window.__notifications.mode = 'timeout'
  })
  await page.getByRole('button', { name: '标记 运行完成 为已读' }).click()
  await expect(page.getByRole('button', { name: '标记 运行完成 为已读' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '全部标为已读' })).toBeDisabled()
  await page.evaluate(async () => {
    try {
      await window.__notifications?.reconcile()
    } catch {
      /* still unavailable */
    }
  })
  await expect(page.locator('li[data-unread="true"]')).toHaveCount(1)
  await page.evaluate(async () => {
    if (!window.__notifications) throw new Error('Missing fixture controls')
    window.__notifications.receiptReady = true
    await window.__notifications.reconcile()
  })
  await expect(page.getByRole('button', { name: '标记 运行完成 为未读' })).toBeEnabled()
  await expect(page.locator('li[data-unread="true"]')).toHaveCount(0)
  expect(await page.evaluate(() => window.__notifications?.writes)).toBe(1)
})

test('external Host read and unread refresh control the same visible notification', async ({ page }) => {
  await load(page)
  await page.evaluate(() => window.__notifications?.refreshRead(true))
  await expect(page.getByRole('button', { name: '标记 运行完成 为未读' })).toBeVisible()
  await expect(page.locator('li[data-unread="true"]')).toHaveCount(0)
  await page.evaluate(() => window.__notifications?.refreshRead(false))
  await expect(page.getByRole('button', { name: '标记 运行完成 为已读' })).toBeVisible()
  await expect(page.locator('li[data-unread="true"]')).toHaveCount(1)
  expect(await page.evaluate(() => window.__notifications?.writes)).toBe(0)
})

test('paged Chinese content caps at 400, deduplicates IDs and flows at 320px', async ({ page }) => {
  await load(page)
  await page.setViewportSize({ width: 320, height: 800 })
  await page.evaluate(async () => {
    if (!window.__notifications) throw new Error('Missing fixture controls')
    await window.__notifications.replaceItems(401, true)
    for (let pageIndex = 0; pageIndex < 10; pageIndex++) await window.__notifications.loadMore()
  })
  await expect(page.locator('li[data-unread="true"]')).toHaveCount(400)
  expect(await page.evaluate(() => window.__notifications?.itemIds())).toHaveLength(400)
  expect(
    await page.evaluate(() => {
      const ids = window.__notifications?.itemIds() ?? []
      return new Set(ids).size
    }),
  ).toBe(400)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  )
  await page.getByRole('button', { name: '打开 运行完成' }).last().focus()
  await page.keyboard.press('Enter')
  expect(await page.evaluate(() => window.__notifications?.opens.length)).toBe(1)
})
