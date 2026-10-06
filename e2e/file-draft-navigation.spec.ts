import { expect, test, type Locator, type Page } from '@playwright/test'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const firstPath = '草稿需要在返回列表重新打开和关闭面板后保留-long-workspace-document.md'
const otherPath = 'second-document.md'
const source = '# Original file\n来源内容必须保持不变。\n'
const draft = '# Unsaved working draft\n未保存的内容不能被打开文件操作覆盖。\n'.repeat(8)
const base = () => `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`

async function showSidebar(page: Page, locale: ShellLocale) {
  const show = page.getByRole('button', { name: getShellCopy(locale).shell.showSidebar, exact: true })
  if (await show.isVisible()) await show.click()
}

async function inViewport(control: Locator, page: Page) {
  await expect(control).toBeVisible()
  const box = await control.boundingBox()
  expect(box).not.toBeNull()
  const viewport = page.viewportSize()
  expect(viewport).not.toBeNull()
  if (!box || !viewport) throw new Error('Visible control or viewport geometry is unavailable')
  expect(box.x).toBeGreaterThanOrEqual(-1)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1)
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`file draft survives production navigation and discards only its confirmed target: ${locale}`, async ({
    browser,
  }) => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-file-draft-browser-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    const copy = getShellCopy(locale)
    let host: WebSessionHost | undefined
    try {
      await writeFile(join(root, firstPath), source)
      await writeFile(join(root, otherPath), 'Second file source')
      const secondRoot = join(root, '第二个工作区-target-isolation')
      await mkdir(secondRoot)
      await writeFile(join(secondRoot, firstPath), 'Independent workspace source')
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const second = await createWorkspaceSessionCommandClient(host.client).execute('workspace.create', {
        path: secondRoot,
      })
      expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(`${base()}${process.env.HBAR_FILES_E2E_ENTRY ?? '/'}`)
      await page
        .getByTitle(copy.shell.workspaceActions(host.ready.workspaceName), { exact: true })
        .waitFor({ state: 'attached' })
      const expand = page.getByRole('treeitem', { expanded: false, name: host.ready.workspaceName, exact: true })
      if (await expand.isVisible()) await expand.click()
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      const openOwnFiles = page.getByRole('button', { name: copy.session.tools.files, exact: true })
      await openOwnFiles.click()
      const files = page.locator('.hbar-app-react-file-workspace')
      const editor = files.getByRole('textbox', { name: firstPath, exact: true })
      const back = files.getByRole('button', { name: copy.files.backToFiles, exact: true })
      const edit = () => files.getByRole('button', { name: copy.files.edit, exact: true }).click()
      const openFirst = async () => {
        await files.getByRole('button', { name: firstPath, exact: true }).click()
        await edit()
      }
      await openFirst()
      await expect(editor).toHaveValue(source)
      await editor.fill(draft)
      await expect(files.locator('footer').getByRole('status')).toHaveText(copy.files.dirty)
      await back.click()
      await openFirst()
      await expect(editor).toHaveValue(draft)
      await back.click()
      await files.getByRole('button', { name: otherPath, exact: true }).click()
      await edit()
      const otherEditor = files.getByRole('textbox', { name: otherPath, exact: true })
      await otherEditor.fill('A separate unsaved draft')
      await back.click()
      await openFirst()
      await expect(editor).toHaveValue(draft)
      await files.getByRole('button', { name: copy.files.close, exact: true }).click()
      await expect(files).toHaveCount(0)
      await openOwnFiles.click()
      await expect(editor).toHaveValue(draft)

      await page.getByTitle(copy.shell.workspaceActions(second.name), { exact: true }).click()
      await page
        .getByRole('menu', { name: copy.shell.workspaceActions(second.name), exact: true })
        .getByRole('menuitem', { name: locale === 'zh-CN' ? '文件' : 'Files', exact: true })
        .click()
      await openFirst()
      await expect(editor).toHaveValue('Independent workspace source')
      await editor.fill('Independent workspace draft')
      await openOwnFiles.click()
      await expect(editor).toHaveValue(draft)

      // The ordinary production tool remains reachable with long paths at narrow sizes.
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 })
        await inViewport(files.getByRole('button', { name: copy.files.save, exact: true }), page)
        await inViewport(files.getByRole('button', { name: copy.files.reload, exact: true }), page)
        await inViewport(back, page)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `artifacts/reference-files-v2/file-draft-${locale}-${width}.png` })
      }
      await files.getByRole('button', { name: copy.files.reload, exact: true }).click()
      const confirmation = page.getByRole('dialog', { name: copy.files.reloadTitle(firstPath), exact: true })
      await expect(confirmation).toContainText(copy.files.reloadDescription)
      await expect(confirmation.locator('.hbar-app-react-file-reload-target')).toHaveText(firstPath)
      expect(
        await confirmation
          .locator('.hbar-app-react-file-reload-target')
          .evaluate(
            (element) =>
              element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1,
          ),
      ).toBe(true)
      await inViewport(confirmation.getByRole('button', { name: copy.files.discardAndReload, exact: true }), page)
      await page.screenshot({ path: `artifacts/reference-files-v2/file-discard-${locale}-320.png` })
      await confirmation.getByRole('button', { name: copy.files.keepDraft, exact: true }).last().click()
      await expect(editor).toHaveValue(draft)
      await files.getByRole('button', { name: copy.files.reload, exact: true }).click()
      await confirmation.getByRole('button', { name: copy.files.discardAndReload, exact: true }).click()
      await expect(editor).toHaveValue(source)
      await expect(files.getByRole('button', { name: copy.files.save, exact: true })).toBeDisabled()
      await back.click()
      await files.getByRole('button', { name: otherPath, exact: true }).click()
      await edit()
      await expect(otherEditor).toHaveValue('A separate unsaved draft')
      await otherEditor.fill('Saved only through its own button')
      await files.getByRole('button', { name: copy.files.save, exact: true }).click()
      await expect(files.locator('footer').getByRole('status')).toHaveText(copy.files.saved)
      expect(await readFile(join(root, otherPath), 'utf8')).toBe('Saved only through its own button')
      expect(await readFile(join(root, firstPath), 'utf8')).toBe(source)
      expect(await readFile(join(secondRoot, firstPath), 'utf8')).toBe('Independent workspace source')
      await files.getByRole('button', { name: copy.files.close, exact: true }).click()
      await showSidebar(page, locale)
      await page.getByTitle(copy.shell.workspaceActions(second.name), { exact: true }).click()
      await page
        .getByRole('menu', { name: copy.shell.workspaceActions(second.name), exact: true })
        .getByRole('menuitem', { name: locale === 'zh-CN' ? '文件' : 'Files', exact: true })
        .click()
      await expect(editor).toHaveValue('Independent workspace draft')
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}

test('test-only two-pane composition shares one draft and rejects a stale discard confirmation', async ({
  browser,
}) => {
  test.skip(process.env.HBAR_FILES_E2E_TWINS !== '1', 'Requires the explicitly built test-only two-pane entry')
  const root = await mkdtemp(join(tmpdir(), 'hbar-file-draft-twins-'))
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 960 } })
  const labels = getShellCopy('zh-CN').files
  let host: WebSessionHost | undefined
  try {
    await writeFile(join(root, firstPath), source)
    host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
    expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(
      `${base()}/e2e/support/file-draft-preview.html?workspace=${encodeURIComponent(host.ready.workspaceId)}`,
    )
    const left = page.locator('[data-test-file-pane="left"]')
    const right = page.locator('[data-test-file-pane="right"]')
    await left.getByRole('button', { name: firstPath, exact: true }).click()
    await right.getByRole('button', { name: firstPath, exact: true }).click()
    await left.getByRole('button', { name: labels.edit, exact: true }).click()
    await right.getByRole('button', { name: labels.edit, exact: true }).click()
    const leftEditor = left.getByRole('textbox', { name: firstPath, exact: true })
    const rightEditor = right.getByRole('textbox', { name: firstPath, exact: true })
    await leftEditor.fill(draft)
    await expect(rightEditor).toHaveValue(draft)
    await left.getByRole('button', { name: labels.reload, exact: true }).click()
    const confirmation = page.getByRole('dialog', { name: labels.reloadTitle(firstPath), exact: true })
    await expect(confirmation).toBeVisible()
    // Synthetic change represents a second already-open editor receiving an edit
    // while the first view's modal is open; it does not bypass runtime actions.
    await rightEditor.evaluate((element) => {
      if (!(element instanceof HTMLTextAreaElement)) throw new Error('Expected a file textarea')
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      if (!setter) throw new Error('Textarea value setter is unavailable')
      setter.call(element, 'A newer edit from the other pane')
      element.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await expect(leftEditor).toHaveValue('A newer edit from the other pane')
    await confirmation.getByRole('button', { name: labels.discardAndReload, exact: true }).click()
    await expect(leftEditor).toHaveValue('A newer edit from the other pane')
    await expect(rightEditor).toHaveValue('A newer edit from the other pane')
    await expect(left.getByRole('alert')).toBeVisible()
    await left.getByRole('button', { name: labels.reload, exact: true }).click()
    await confirmation.getByRole('button', { name: labels.discardAndReload, exact: true }).click()
    await expect(leftEditor).toHaveValue(source)
    await expect(rightEditor).toHaveValue(source)
    await rightEditor.fill('Saved from the right pane')
    await expect(leftEditor).toHaveValue('Saved from the right pane')
    await right.getByRole('button', { name: labels.save, exact: true }).click()
    await expect(left.getByRole('status')).toHaveText(labels.saved)
    await expect(right.getByRole('status')).toHaveText(labels.saved)
    expect(await readFile(join(root, firstPath), 'utf8')).toBe('Saved from the right pane')
    await page.screenshot({ path: 'artifacts/reference-files-v2/file-twins-shared-fact.png' })
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await rm(root, { recursive: true, force: true })
  }
})
