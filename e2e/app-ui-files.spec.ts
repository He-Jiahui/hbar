import { test, expect } from '@playwright/test'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

test('file pane virtualizes directories, opens real source and survives narrow layout', async ({ page, context }) => {
  const fixture = JSON.parse(await readFile('.dev/e2e.json', 'utf8')) as { url: string; token: string; root: string }
  const directory = join(fixture.root, 'file-browser-fixture')
  await mkdir(directory, { recursive: true })
  for (let index = 0; index < 80; index++)
    await writeFile(join(directory, `record-${index}.ts`), `export const fixtureRecord = ${index}\n`)
  await context.request.post(`${fixture.url}/auth/token`, { data: { token: fixture.token } })
  await page.goto(fixture.url)
  await page
    .getByRole('navigation', { name: '导航', exact: true })
    .getByRole('button', { name: '文件', exact: true })
    .click()
  const files = page.locator('.hbar-app-ui-workspace-files').filter({ visible: true })
  await files.getByRole('button', { name: 'file-browser-fixture', exact: true }).click()
  await expect(files.getByRole('button', { name: 'record-0.ts', exact: true })).toBeVisible()
  expect(await files.locator('[role="listitem"]').count()).toBeLessThan(80)
  await files.getByRole('button', { name: 'record-0.ts', exact: true }).click()
  const documentPane = page.locator('.hbar-app-ui-file-document').filter({ visible: true })
  await expect(documentPane.locator('.cm-content')).toContainText('export const fixtureRecord = 0')
  await documentPane.getByRole('button', { name: '刷新文件', exact: true }).click()
  await expect(documentPane.locator('.cm-content')).toContainText('export const fixtureRecord = 0')
  await page.setViewportSize({ width: 320, height: 844 })
  await page.locator('.mobile-nav').getByRole('button', { name: '文件', exact: true }).click()
  await files.getByRole('button', { name: 'record-0.ts', exact: true }).click()
  await expect(documentPane.locator('.cm-content')).toContainText('export const fixtureRecord = 0')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const bodyBounds = await documentPane.locator('.hbar-app-ui-file-document-body').boundingBox()
  const editorBounds = await documentPane.locator('.code-editor').boundingBox()
  expect(bodyBounds).not.toBeNull()
  expect(editorBounds?.height).toBeCloseTo(bodyBounds?.height ?? 0, 0)
  await mkdir('artifacts/app-ui-integration', { recursive: true })
  await page.screenshot({ path: 'artifacts/app-ui-integration/file-mobile.png' })
})
