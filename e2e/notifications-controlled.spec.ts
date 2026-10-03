import { test, expect, type Page } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'

const artifactRoot = resolve('artifacts/app-ui-migration-audit/notifications-controlled')
const bundle = resolve(artifactRoot, 'notifications-controlled.js')
test.beforeAll(() => {
  mkdirSync(artifactRoot, { recursive: true })
  const bunBinary =
    process.platform === 'win32'
      ? (process.env.PATH ?? '')
          .split(';')
          .flatMap((directory) => [resolve(directory, 'bun.exe'), resolve(directory, 'node_modules/bun/bin/bun.exe')])
          .find(existsSync)
      : 'bun'
  if (!bunBinary) throw new Error('Bun executable was not found on PATH')
  const result = spawnSync(
    bunBinary,
    [
      'build',
      './e2e/fixtures/notifications-controlled.tsx',
      '--target',
      'browser',
      '--format',
      'iife',
      '--outdir',
      artifactRoot,
      '--entry-naming',
      '[name].[ext]',
      '--define',
      'process.env.NODE_ENV="production"',
    ],
    { encoding: 'utf8', timeout: 30_000 },
  )
  if (result.status !== 0)
    throw new Error(result.stderr || result.stdout || result.error?.message || 'Fixture build failed')
})

async function load(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const url = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? '4329'}/`
  await page.route(url, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><head><style>html,body,#root{margin:0;height:100%;min-width:0}</style></head><body><div id="root"></div></body></html>',
    }),
  )
  await page.goto(url)
  await page.addScriptTag({ path: bundle })
  await page.addStyleTag({ path: resolve(artifactRoot, 'notifications-controlled.css') })
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
