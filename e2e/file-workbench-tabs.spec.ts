import { expect, test } from '@playwright/test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { workspaceTabsCopy } from '../apps/web/src/workspace-tabs-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const base = () => `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
const filename = 'a-long-file-name-for-workbench-draft-and-navigation.md'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`real Host file workbench reuses its draft and Back returns to the source: ${locale}`, async ({ browser }) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-workbench-tabs-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } })
    let host: WebSessionHost | undefined
    try {
      await writeFile(join(root, filename), '# source\n')
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const copy = getShellCopy(locale)
      const tabs = workspaceTabsCopy((zh, en) => (locale === 'zh-CN' ? zh : en))
      await page.goto(base())
      const expand = page.getByRole('button', {
        name: copy.shell.expandWorkspace(host.ready.workspaceName),
        exact: true,
      })
      if (await expand.isVisible()) await expand.click()
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      await page.getByRole('textbox', { name: copy.session.prompt.input }).fill('source conversation draft')
      await page.getByRole('button', { name: copy.session.tools.files, exact: true }).click()
      const dock = page.locator('.hbar-app-react-file-workspace:not(.hbar-app-react-file-workbench)')
      await dock.getByRole('button', { name: filename, exact: true }).click()
      await dock.getByRole('button', { name: copy.files.edit, exact: true }).click()
      await dock.getByRole('textbox', { name: filename, exact: true }).fill('# unsaved workbench draft')
      await dock.getByRole('button', { name: copy.files.expandWorkbench, exact: true }).click()
      const workbench = page.getByRole('tab', { name: tabs.workbenchTitle, exact: true })
      await expect(workbench).toHaveAttribute('aria-selected', 'true')
      await expect(dock).toHaveCount(0)
      const expanded = page.locator('.hbar-app-react-file-workbench')
      await expect(expanded.getByRole('textbox', { name: filename, exact: true })).toHaveValue(
        '# unsaved workbench draft',
      )
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `artifacts/reference-ux-v2/hbar-workbench-${locale}-${width}.png` })
      }
      await page.getByRole('tab', { name: host.ready.sessionTitle, exact: true }).click()
      await expect(page.getByRole('textbox', { name: copy.session.prompt.input })).toHaveValue(
        'source conversation draft',
      )
      await expect(dock).toHaveCount(0)
      await workbench.click()
      await expect(expanded.getByRole('textbox', { name: filename, exact: true })).toHaveValue(
        '# unsaved workbench draft',
      )
      await expanded.getByRole('button', { name: copy.files.returnToConversation, exact: true }).click()
      await expect(workbench).toHaveCount(0)
      await expect(page.getByRole('tab', { name: host.ready.sessionTitle, exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      await expect(page.getByRole('tab', { name: host.ready.sessionTitle, exact: true })).toBeFocused()
      await expect(page.getByRole('textbox', { name: copy.session.prompt.input })).toHaveValue(
        'source conversation draft',
      )
      await page.getByRole('button', { name: copy.session.tools.files, exact: true }).click()
      await expect(page.getByRole('textbox', { name: filename, exact: true })).toHaveValue('# unsaved workbench draft')
      await page.getByRole('button', { name: copy.files.close, exact: true }).click()
      await page.reload()
      await expect(workbench).toHaveCount(0)
      await expect(page.getByRole('tab', { name: host.ready.sessionTitle, exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      expect(await readFile(join(root, filename), 'utf8')).toBe('# source\n')
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}

test('Workbench X chooses a surviving neighbour without deleting either Host session', async ({ browser }) => {
  test.setTimeout(120_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-workbench-close-'))
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 900 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, sessionCount: 2, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
    expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const copy = getShellCopy('en-US')
    const tabs = workspaceTabsCopy((_zh, en) => en)
    await page.goto(base())
    for (const title of ['Session 001', 'Session 002'])
      await page.getByRole('button', { name: copy.shell.openSession(title), exact: true }).click()
    await page.getByRole('tab', { name: 'Session 001', exact: true }).click()
    await page.getByRole('button', { name: copy.session.tools.files, exact: true }).click()
    await page.getByRole('button', { name: copy.files.expandWorkbench, exact: true }).click()
    await expect(page.getByRole('tab', { name: tabs.workbenchTitle, exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await page.getByRole('button', { name: tabs.tabs.close(tabs.workbenchTitle), exact: true }).click()
    await expect(page.getByRole('tab', { name: tabs.workbenchTitle, exact: true })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Session 002', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tab', { name: 'Session 002', exact: true })).toBeFocused()
    await expect(page.locator('.hbar-app-react-file-workspace')).toHaveCount(0)
    const sessions = await createWorkspaceSessionCommandClient(host.client).execute('session.list', {
      workspaceId: host.ready.workspaceId,
      limit: 100,
    })
    expect(sessions.items).toHaveLength(2)
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await rm(root, { recursive: true, force: true })
  }
})

test('workspace-scoped Files can expand without a source conversation and return to the workspace', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-workbench-workspace-'))
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 390, height: 844 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
    expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const copy = getShellCopy('en-US')
    const tabs = workspaceTabsCopy((_zh, en) => en)
    await page.goto(base())
    await page.getByRole('button', { name: copy.shell.showSidebar, exact: true }).click()
    await page.getByTitle(copy.shell.workspaceActions(host.ready.workspaceName), { exact: true }).click()
    await page.getByRole('menuitem', { name: copy.shell.workspaceFiles, exact: true }).click()
    await page.getByRole('button', { name: copy.files.expandWorkbench, exact: true }).click()
    await expect(page.getByRole('tab', { name: tabs.workbenchTitle, exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByRole('tab')).toHaveCount(1)
    const expanded = page.locator('.hbar-app-react-file-workbench')
    await expanded.getByRole('button', { name: copy.files.returnToWorkspace, exact: true }).click()
    await expect(page.getByRole('tab')).toHaveCount(0)
    await expect(page.getByText(copy.empty.title, { exact: true })).toBeVisible()
    await expect(page.locator('.hbar-settings-page-focus')).toBeFocused()
    await page.reload()
    await expect(page.getByRole('tab')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await rm(root, { recursive: true, force: true })
  }
})
