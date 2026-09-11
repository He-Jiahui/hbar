import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { HbarClient } from '../packages/client/src/index'

const runFile = promisify(execFile)

async function login(context: BrowserContext) {
  const fixture = JSON.parse(await readFile('.dev/e2e.json', 'utf8')) as { url: string; token: string; root: string }
  const api = new HbarClient(fixture.url, fixture.token)
  await api.connect()
  const response = await context.request.post(`${fixture.url}/auth/token`, { data: { token: fixture.token } })
  expect(response.ok()).toBeTruthy()
  return { ...fixture, api }
}

async function git(cwd: string, ...args: string[]) {
  await runFile('git', args, {
    cwd,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' },
    windowsHide: true,
  })
}

async function openMobileMore(page: Page) {
  await page.locator('.mobile-nav').getByRole('button', { name: '更多', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '更多', exact: true })).toBeVisible()
}

test('Git tool window previews, stages, commits and reopens on mobile', async ({ page, context }) => {
  const fixture = await login(context)
  const workspacePath = join(fixture.root, 'git-panel-workspace')
  try {
    await mkdir(workspacePath, { recursive: true })
    await git(workspacePath, 'init', '-q')
    await git(workspacePath, 'config', 'user.name', 'hbar e2e')
    await git(workspacePath, 'config', 'user.email', 'hbar@example.invalid')
    await writeFile(join(workspacePath, 'README.md'), 'initial\n')
    await git(workspacePath, 'add', 'README.md')
    await git(workspacePath, 'commit', '-q', '-m', 'initial')
    await writeFile(join(workspacePath, 'README.md'), 'updated from Git panel\n')
    await writeFile(join(workspacePath, 'new-file.txt'), 'new\n')

    const workspace = await fixture.api.call('workspace.create', { path: workspacePath })
    await page.goto(fixture.url)
    await expect(page.locator('.app-shell')).toBeVisible()
    await page.getByRole('combobox', { name: '选择工作区', exact: true }).selectOption(workspace.id)

    await page.locator('.right-rail').getByRole('button', { name: 'Git', exact: true }).click()
    const panel = page.locator('.git-panel').filter({ visible: true })
    await expect(panel).toBeVisible()
    const panelGeometry = await panel.evaluate((element) => {
      const panel = element.getBoundingClientRect()
      const glass = element.querySelector('.git-panel-glass')
      const header = element.querySelector('.git-panel-header')
      if (!glass || !header) return null
      const glassStyle = getComputedStyle(glass)
      const headerRect = header.getBoundingClientRect()
      return {
        glassPosition: glassStyle.position,
        glassHeight: glass.getBoundingClientRect().height,
        panelHeight: panel.height,
        headerTop: headerRect.top,
        panelTop: panel.top,
      }
    })
    expect(panelGeometry).not.toBeNull()
    expect(panelGeometry?.glassPosition).toBe('absolute')
    expect(panelGeometry?.glassHeight).toBeCloseTo(panelGeometry?.panelHeight ?? 0, 0)
    expect(panelGeometry?.headerTop).toBeCloseTo(panelGeometry?.panelTop ?? 0, 0)
    await expect(panel.locator('.git-change-row')).toHaveCount(2)

    const readme = panel.locator('.git-change-row').filter({ hasText: 'README.md' })
    await readme.click()
    await expect(panel.locator('.git-diff-card')).toContainText('updated from Git panel')
    await readme.getByRole('button', { name: '暂存 README.md', exact: true }).click()
    await expect(panel.getByRole('button', { name: '取消暂存 README.md', exact: true })).toBeVisible()
    await panel.getByRole('button', { name: '取消暂存 README.md', exact: true }).click()
    await expect(panel.getByRole('button', { name: '暂存 README.md', exact: true })).toBeVisible()

    await panel.getByRole('textbox', { name: '提交说明', exact: true }).fill('Git panel commit')
    page.once('dialog', (dialog) => void dialog.accept())
    await panel.getByRole('button', { name: '暂存并提交', exact: true }).click()
    await expect(panel.getByText('工作区干净', { exact: true })).toBeVisible()
    await panel.getByRole('button', { name: /历史/, exact: true }).click()
    await expect(panel.locator('.git-commit-row').first()).toContainText('Git panel commit')
    await panel.getByRole('button', { name: /分支/, exact: true }).click()
    await expect(panel.locator('.git-branch-row.selected')).toContainText('当前分支')
    await page.screenshot({ path: `artifacts/${Date.now()}-desktop-git-panel.png` })

    await page.setViewportSize({ width: 390, height: 844 })
    await openMobileMore(page)
    await page.locator('.mobile-tool-grid').getByRole('button', { name: 'Git', exact: true }).click()
    const mobilePanel = page.locator('.git-panel').filter({ visible: true })
    await expect(mobilePanel).toBeVisible()
    await expect(mobilePanel.getByText('工作区干净', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    await page.screenshot({ path: `artifacts/${Date.now()}-mobile-git-panel.png` })
  } finally {
    fixture.api.disconnect()
  }
})
