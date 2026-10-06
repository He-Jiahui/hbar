import { expect, test, type Page } from '@playwright/test'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function showSidebar(page: Page, locale: ShellLocale) {
  const copy = getShellCopy(locale)
  const sidebar = page.getByRole('complementary', { name: copy.shell.projectsAndSessions, exact: true })
  if (!(await sidebar.isVisible()))
    await page.getByRole('button', { name: copy.shell.showSidebar, exact: true }).click()
  await expect(sidebar).toBeVisible()
  return sidebar
}

test('project acquisition pages beyond 100 items and keeps the form reachable in a narrow dialog', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-project-picker-capacity-'))
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 320, height: 720 } })
  const copy = getShellCopy('zh-CN')
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
    const commands = createWorkspaceSessionCommandClient(host.client)
    // Existing fixture project + 100 additional real Host directories crosses the 100-row page boundary.
    for (let index = 0; index < 100; index += 1) {
      const path = join(root, `project-${String(index).padStart(3, '0')}`)
      await mkdir(path)
      await commands.execute('workspace.create', { path })
    }
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    await page.goto(base)
    await page
      .getByTitle(copy.shell.workspaceActions(host.ready.workspaceName), { exact: true })
      .waitFor({ state: 'attached' })
    await showSidebar(page, 'zh-CN')
    await page.getByRole('button', { name: copy.shell.newSession, exact: true }).click()
    const picker = page.getByRole('dialog', { name: copy.shell.chooseWorkspace, exact: true })
    const rows = picker.locator('.hbar-app-react-workspace-picker-item')
    await expect(rows).toHaveCount(100)
    const list = picker.locator('.hbar-app-react-workspace-picker-list')
    expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
    await picker.getByRole('button', { name: copy.shell.loadMore, exact: true }).click()
    await expect(rows).toHaveCount(101)
    await expect(picker.getByRole('button', { name: copy.shell.loadMore, exact: true })).toHaveCount(0)
    const input = picker.getByRole('textbox', { name: copy.shell.workspacePath, exact: true })
    await input.focus()
    await expect(input).toBeFocused()
    await expect(input).toBeInViewport()
    await expect(picker.getByRole('button', { name: copy.shell.cancel, exact: true }).last()).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: 'artifacts/desktop-experience/session-entry/picker-101-zh-CN-320.png' })
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await rm(root, { recursive: true, force: true })
  }
})

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`session creation uses project context and a dedicated project picker: ${locale}`, async ({ browser }) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-session-entry-'))
    const context = await browser.newContext({ locale })
    const copy = getShellCopy(locale)
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const commands = createWorkspaceSessionCommandClient(host.client)
      const originalTitle = 'Original project A session — 保留草稿'
      await commands.execute('session.rename', { sessionId: host.ready.sessionId, title: originalTitle })
      const otherPath = join(root, 'project-b-有明确归属的长名称与本地目录')
      const addedPath = join(root, 'added-project')
      await mkdir(otherPath)
      await mkdir(addedPath)
      const other = await commands.execute('workspace.create', { path: otherPath })
      const countSessions = async (workspaceId: string) =>
        (await commands.execute('session.list', { workspaceId, limit: 100 })).items.length
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await expect(
        page.getByTitle(copy.shell.workspaceActions(host.ready.workspaceName), { exact: true }),
      ).toBeVisible()

      // No active project: never silently choose the first loaded project or expose an internal command form.
      const globalCreate = page.getByRole('button', { name: copy.shell.newSession, exact: true })
      await globalCreate.focus()
      await page.keyboard.press('Enter')
      const picker = page.getByRole('dialog', { name: copy.shell.chooseWorkspace, exact: true })
      await expect(picker).toBeVisible()
      await expect(
        picker.getByRole('button', { name: copy.shell.createSessionInWorkspace(other.name), exact: true }),
      ).toBeVisible()
      await expect(picker).not.toContainText('workspaceId')
      await expect(picker).not.toContainText('app.createSession')
      await page.keyboard.press('Escape')
      await expect(picker).toHaveCount(0)
      await expect(globalCreate).toBeFocused()
      expect(await countSessions(host.ready.workspaceId)).toBe(1)
      expect(await countSessions(other.id)).toBe(0)

      for (const width of [1440, 900, 390, 320]) {
        await page.setViewportSize({ width, height: width === 320 ? 720 : 960 })
        await showSidebar(page, locale)
        await globalCreate.click()
        await expect(picker).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        const bounds = await picker.boundingBox()
        expect(bounds).not.toBeNull()
        expect(bounds!.width).toBeLessThanOrEqual(width)
        await page.screenshot({ path: `artifacts/desktop-experience/session-entry/picker-${locale}-${width}.png` })
        await picker.getByRole('button', { name: copy.shell.cancel, exact: true }).last().click()
        await expect(picker).toHaveCount(0)
        await expect(globalCreate).toBeFocused()
      }

      await showSidebar(page, locale)
      await globalCreate.click()
      await picker
        .getByRole('button', { name: copy.shell.createSessionInWorkspace(host.ready.workspaceName), exact: true })
        .click()
      await expect(picker).toHaveCount(0)
      await expect.poll(() => countSessions(host!.ready.workspaceId)).toBe(2)
      await expect(page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })).toBeVisible()

      // Opening the original session preserves its draft across one-click creation in another project.
      await page.setViewportSize({ width: 1440, height: 960 })
      let sidebar = await showSidebar(page, locale)
      await sidebar.getByRole('treeitem', { name: originalTitle, exact: true }).click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const draft = '工程 A 的草稿不能跟随项目 B 的新建操作丢失 — keep the original draft'
      await prompt.fill(draft)
      for (const width of [1440, 900, 390, 320]) {
        await page.setViewportSize({ width, height: width === 320 ? 720 : 960 })
        sidebar = await showSidebar(page, locale)
        const beforeA = await countSessions(host.ready.workspaceId)
        const beforeB = await countSessions(other.id)
        const project = sidebar.locator(`section[data-workspace-id="${other.id}"]`)
        const quickCreate = project.getByRole('button', {
          name: copy.shell.createSessionInWorkspace(other.name),
          exact: true,
        })
        await expect(quickCreate).toHaveCount(1)
        await project.getByTitle(copy.shell.workspaceActions(other.name), { exact: true }).click()
        await expect(
          project.getByRole('menuitem', { name: copy.shell.newSessionInWorkspace, exact: true }),
        ).toHaveCount(0)
        await page.keyboard.press('Escape')
        // The quick action follows the project menu in keyboard order, not inside its list.
        await page.keyboard.press('Tab')
        await expect(quickCreate).toBeFocused()
        await expect(quickCreate).toHaveCSS('opacity', '1')
        const geometry = await project.locator('.hbar-app-react-workspace-line').evaluate((row) => {
          const controls = [...row.children].map((child) => child.getBoundingClientRect())
          return {
            fits: row.scrollWidth <= row.clientWidth + 1,
            separated: controls.every((rect, index) => index === 0 || rect.left >= controls[index - 1]!.right - 1),
            actionWidth: controls.at(-1)?.width ?? 0,
            menuWidth: row.querySelector('summary')?.getBoundingClientRect().width ?? 0,
          }
        })
        expect(geometry.fits).toBe(true)
        expect(geometry.separated).toBe(true)
        expect(geometry.actionWidth).toBeGreaterThanOrEqual(width < 1024 ? 44 : 32)
        if (width < 1024) expect(geometry.menuWidth).toBeGreaterThanOrEqual(44)
        await page.screenshot({
          path: `artifacts/desktop-experience/session-entry/quick-create-${locale}-${width}.png`,
        })
        await page.keyboard.press('Enter')
        await expect.poll(() => countSessions(other.id)).toBe(beforeB + 1)
        expect(await countSessions(host.ready.workspaceId)).toBe(beforeA)
        await expect(page.getByRole('dialog')).toHaveCount(0)
        await expectComposerText(prompt, '')
        sidebar = await showSidebar(page, locale)
        await expect(sidebar.locator('.hbar-app-react-session-row[data-selected="true"]')).toHaveCount(1)

        // The global action now uses B, without a title/ID/protocol form.
        await globalCreate.click()
        await expect.poll(() => countSessions(other.id)).toBe(beforeB + 2)
        await expect(page.getByRole('dialog')).toHaveCount(0)
        expect(await countSessions(host.ready.workspaceId)).toBe(beforeA)
        await expectComposerText(prompt, '')
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `artifacts/desktop-experience/session-entry/created-${locale}-${width}.png` })
        sidebar = await showSidebar(page, locale)
        await sidebar.getByRole('treeitem', { name: originalTitle, exact: true }).click()
        await expectComposerText(prompt, draft)
      }

      // Project acquisition operates on Host paths and reports invalid input locally.
      sidebar = await showSidebar(page, locale)
      await sidebar.getByRole('button', { name: copy.shell.openWorkspace, exact: true }).click()
      const openDialog = page.getByRole('dialog', { name: copy.shell.openWorkspace, exact: true })
      const path = openDialog.getByRole('textbox', { name: copy.shell.workspacePath, exact: true })
      await path.fill(join(root, 'missing-directory'))
      await openDialog.getByRole('button', { name: copy.shell.addWorkspace, exact: true }).click()
      await expect(openDialog.getByRole('alert')).toBeVisible()
      await path.fill(addedPath)
      await openDialog.getByRole('button', { name: copy.shell.addWorkspace, exact: true }).click()
      await expect(openDialog).toHaveCount(0)
      const registered = (await commands.execute('workspace.list', { limit: 100 })).items.find(
        (workspace) => workspace.name === 'added-project',
      )
      expect(registered).toBeDefined()
      expect(await countSessions(registered!.id)).toBe(0)
      await showSidebar(page, locale)
      await globalCreate.click()
      await expect.poll(() => countSessions(registered!.id)).toBe(1)
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(prompt).toBeVisible()
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
