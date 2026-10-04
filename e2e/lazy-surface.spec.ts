import { test, expect } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'

declare global {
  interface Window {
    __lazyAttempts: number
    __resolveLazy?: () => void
  }
}

const artifactRoot = resolve('artifacts/app-ui-migration-audit/lazy-fixture')
const bundle = resolve(artifactRoot, 'lazy-surface.js')
test.beforeAll(() => {
  mkdirSync(artifactRoot, { recursive: true })
  const bunBinary = process.platform === 'win32'
    ? (process.env.PATH ?? '').split(';').flatMap((directory) => [resolve(directory, 'bun.exe'), resolve(directory, 'node_modules/bun/bin/bun.exe')]).find(existsSync)
    : 'bun'
  if (!bunBinary) throw new Error('Bun executable was not found on PATH')
  const result = spawnSync(bunBinary, ['build', './e2e/fixtures/lazy-surface.tsx', '--target', 'browser', '--format', 'iife', '--outdir', artifactRoot, '--entry-naming', '[name].[ext]', '--define', 'process.env.NODE_ENV="production"'], { encoding: 'utf8', timeout: 30_000 })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || result.error?.message || 'Fixture build failed')
})

test('initial suspension reuses its loader and preserves original props', async ({ page }) => {
  await page.setContent('<!doctype html><div id="root" data-mode="pending"></div>')
  await page.addScriptTag({ path: bundle })
  await expect(page.getByRole('status')).toHaveText('正在加载页面…')
  expect(await page.evaluate(() => window.__lazyAttempts)).toBe(1)
  await page.evaluate(() => window.__resolveLazy?.())
  await expect(page.getByRole('status')).toHaveText('Loaded with original props')
  expect(await page.evaluate(() => window.__lazyAttempts)).toBe(1)
  await expect(page.locator('#navigation')).toHaveText('Navigation stays available')
})

test('production lazy helper retries a rejected chunk while keeping the shell', async ({ page }) => {
  await page.setContent('<!doctype html><div id="root" data-mode="reject"></div>')
  await page.addScriptTag({ path: bundle })
  await expect(page.getByRole('alert')).toContainText('页面加载失败')
  await expect(page.locator('#navigation')).toHaveText('Navigation stays available')
  expect(await page.evaluate(() => window.__lazyAttempts)).toBe(1)
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Loaded with original props')
  expect(await page.evaluate(() => window.__lazyAttempts)).toBe(2)
  await expect(page.locator('#navigation')).toHaveText('Navigation stays available')
})
