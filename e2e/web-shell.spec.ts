import { expect, test } from '@playwright/test'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'

async function startSessionHost(root: string) {
  const bun =
    process.platform === 'win32'
      ? (process.env.PATH ?? '')
          .split(delimiter)
          .flatMap((directory) => [
            join(directory, 'bun.exe'),
            join(directory, 'node_modules', 'bun', 'bin', 'bun.exe'),
          ])
          .find(existsSync)
      : 'bun'
  if (!bun) throw new Error('Bun executable is unavailable for the E2E Host fixture')
  const child = spawn(bun, ['scripts/e2e-session-host.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, HBAR_E2E_DATA_ROOT: root, HBAR_E2E_HOST_PORT: '4317' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let errors = ''
  child.stderr!.on('data', (chunk) => {
    errors += String(chunk)
  })
  const output = createInterface({ input: child.stdout! })
  const ready = await new Promise<{ token: string; sessionId: string; sessionTitle: string }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`E2E Host did not start: ${errors}`)), 20_000)
    output.on('line', (line) => {
      try {
        const value = JSON.parse(line) as { token?: string; sessionId?: string; sessionTitle?: string }
        if (value.token && value.sessionId && value.sessionTitle) {
          clearTimeout(timer)
          resolve(value as { token: string; sessionId: string; sessionTitle: string })
        }
      } catch {
        // Ignore non-protocol diagnostics; stderr is included in startup failures.
      }
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`E2E Host exited with ${code}: ${errors}`))
    })
  })
  output.close()
  return { child, ready }
}

async function stopSessionHost(child: ChildProcess) {
  if (child.exitCode !== null) return
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  child.kill()
  await Promise.race([exited, new Promise<void>((resolve) => setTimeout(resolve, 5_000))])
  if (child.exitCode === null) child.kill('SIGKILL')
}

for (const locale of ['zh-CN', 'en-US'] as const) {
  for (const viewport of [
    { width: 1440, height: 960 },
    { width: 390, height: 844 },
  ]) {
    test(`command shell without a Host: ${locale} ${viewport.width}`, async ({ browser }) => {
      const context = await browser.newContext({ locale, viewport })
      const page = await context.newPage()
      const errors: string[] = []
      const businessRequests: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('websocket', (socket) => {
        if (new URL(socket.url()).pathname === '/rpc') businessRequests.push(socket.url())
      })
      page.on('request', (request) => {
        if (/\/(rpc|auth|api|healthz)(?:[/?]|$)/.test(new URL(request.url()).pathname))
          businessRequests.push(request.url())
      })
      await page.addInitScript(() => localStorage.setItem('hbar.workbench.v1', '{broken legacy state'))
      try {
        await page.goto(`http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`)
        const navigationName = locale === 'zh-CN' ? '工程与会话' : 'Projects and sessions'
        await expect(page.locator('[data-hbar-app-ui-shell="app"]')).toBeVisible()
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(
          locale === 'zh-CN' ? '选择一个会话' : 'Select a session',
        )
        await expect(page.locator('html')).toHaveAttribute('lang', locale)
        if (viewport.width < 1024) {
          await expect(page.getByRole('complementary', { name: navigationName })).toBeHidden()
          await page.screenshot({
            path: `artifacts/ui-redesign/shell/content-${locale}-${viewport.width}.png`,
            fullPage: true,
          })
          await expect(
            page.getByRole('button', {
              name: locale === 'zh-CN' ? '显示工程与会话侧栏' : 'Show projects and sessions sidebar',
            }),
          ).toBeVisible()
          await page
            .getByRole('button', {
              name: locale === 'zh-CN' ? '显示工程与会话侧栏' : 'Show projects and sessions sidebar',
            })
            .click()
          await expect(page.getByRole('complementary', { name: navigationName })).toBeVisible()
          await page.screenshot({
            path: `artifacts/ui-redesign/shell/drawer-${locale}-${viewport.width}.png`,
            fullPage: true,
          })
        } else {
          await expect(page.getByRole('complementary', { name: navigationName })).toBeVisible()
          await page.screenshot({
            path: `artifacts/ui-redesign/shell/sidebar-${locale}-${viewport.width}.png`,
            fullPage: true,
          })
        }
        await expect(page.locator('footer')).toContainText(locale === 'zh-CN' ? '未连接' : 'Disconnected')
        await expect(page.getByRole('button', { name: locale === 'zh-CN' ? '命令' : 'Commands' })).toBeVisible()
        await page.keyboard.press('Control+K')
        const commandDialog = page.getByRole('dialog', { name: locale === 'zh-CN' ? '命令目录' : 'Command catalog' })
        await expect(commandDialog.getByRole('heading', { level: 1 })).toHaveText(
          locale === 'zh-CN' ? '命令目录' : 'Command catalog',
        )
        await expect(
          commandDialog.getByRole('searchbox', { name: locale === 'zh-CN' ? '搜索命令' : 'Search commands' }),
        ).toBeVisible()
        if (viewport.width < 1024)
          await page.screenshot({
            path: `artifacts/ui-redesign/outlets/command-${locale}-${viewport.width}.png`,
            fullPage: true,
          })
        await commandDialog
          .getByRole('button', { name: locale === 'zh-CN' ? '关闭命令目录' : 'Close command catalog' })
          .click()
        if (viewport.width < 1024)
          await page
            .getByRole('button', {
              name: locale === 'zh-CN' ? '显示工程与会话侧栏' : 'Show projects and sessions sidebar',
            })
            .click()
        await page.getByRole('button', { name: locale === 'zh-CN' ? '设置' : 'Settings' }).click()
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(locale === 'zh-CN' ? '设置' : 'Settings')
        await expect(page.getByText(locale === 'zh-CN' ? /设置操作失败/ : /Settings action failed/)).toBeVisible()
        const emptyProjects = page.getByText(locale === 'zh-CN' ? '尚无工程' : 'No projects yet')
        if (viewport.width < 1024) await expect(emptyProjects).toBeAttached()
        else await expect(emptyProjects).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        await page.screenshot({ path: `artifacts/web-b1/shell-${locale}-${viewport.width}.png`, fullPage: true })
        await page.reload()
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        expect(await page.evaluate(() => localStorage.getItem('hbar.workbench.v1'))).toBe('{broken legacy state')
        expect(businessRequests.length).toBeGreaterThan(0)
        expect(errors).toEqual([])
      } finally {
        await context.close()
      }
    })
  }
}

test('connected session workspace sends, approves, cancels, and updates usage', async ({ browser }) => {
  test.setTimeout(90_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-web-session-'))
  let fixture: Awaited<ReturnType<typeof startSessionHost>> | undefined
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 960 } })
  try {
    fixture = await startSessionHost(root)
    const authenticate = await context.request.post(
      `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}/auth/token`,
      {
        data: { token: fixture.ready.token },
      },
    )
    expect(authenticate.ok()).toBe(true)

    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`)
    await expect(page.locator('footer')).toContainText('Connected')
    await expect(page.getByRole('button', { name: `Open session ${fixture.ready.sessionTitle}` })).toBeVisible()
    await page.screenshot({ path: 'artifacts/ui-redesign/shell/connected-sidebar-1440.png', fullPage: true })
    await page.getByRole('button', { name: `Open session ${fixture.ready.sessionTitle}` }).click()
    await expect(page.getByRole('heading', { level: 1, name: fixture.ready.sessionTitle })).toBeVisible()
    const expectSessionLayout = async () =>
      expect(
        await page.evaluate(() => {
          const header = document.querySelector<HTMLElement>('.hbar-app-ui-page-header')
          const actions = [...document.querySelectorAll<HTMLElement>('.hbar-app-ui-page-action')]
          const timeline = document.querySelector<HTMLElement>('.hbar-app-ui-conversation-content')
          const composer = document.querySelector<HTMLElement>('.hbar-app-react-session-footer')
          const usage = document.querySelector<HTMLElement>('.hbar-app-ui-inline-usage')
          if (!header || actions.length !== 5 || !timeline || !composer || !usage) return false
          const actionTops = actions.map((action) => action.getBoundingClientRect().top)
          const timelineRect = timeline.getBoundingClientRect()
          const composerRect = composer.getBoundingClientRect()
          return (
            header.scrollWidth <= header.clientWidth &&
            Math.max(...actionTops) - Math.min(...actionTops) <= 1 &&
            actions.every((action) => getComputedStyle(action).writingMode === 'horizontal-tb') &&
            Math.abs(timelineRect.left - composerRect.left) <= 1 &&
            Math.abs(timelineRect.right - composerRect.right) <= 1 &&
            usage.getBoundingClientRect().height <= 48
          )
        }),
      ).toBe(true)
    await expectSessionLayout()
    await page.screenshot({ path: 'artifacts/ui-redesign/session/after/desktop-1440-empty.png', fullPage: true })
    const prompt = page.getByRole('textbox', { name: 'Prompt' })
    await expect(prompt).toBeEnabled()

    await page.getByRole('button', { name: 'Files', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'File manager' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: fixture.ready.sessionTitle })).toBeVisible()
    const expectFileToolLayout = async (view: 'browser' | 'document') =>
      expect(
        await page.evaluate((expectedView) => {
          const drawer = document.querySelector<HTMLElement>('.hbar-app-ui-app-tool-drawer')
          const workspace = document.querySelector<HTMLElement>('.hbar-app-react-file-workspace')
          const layout = document.querySelector<HTMLElement>('.hbar-app-react-file-layout')
          if (!drawer || !workspace || !layout) return false
          const drawerRect = drawer.getBoundingClientRect()
          const workspaceRect = workspace.getBoundingClientRect()
          return (
            layout.dataset.view === expectedView &&
            Math.abs(drawerRect.left - workspaceRect.left) <= 1 &&
            Math.abs(drawerRect.right - workspaceRect.right) <= 1 &&
            Math.abs(drawerRect.height - workspaceRect.height) <= 1 &&
            workspace.scrollWidth <= workspace.clientWidth
          )
        }, view),
      ).toBe(true)
    await expectFileToolLayout('browser')
    await page.screenshot({ path: 'artifacts/ui-redesign/file-tool/after/list-1440.png', fullPage: true })
    await page.getByRole('button', { name: 'browser-e2e.md' }).click()
    await expectFileToolLayout('document')
    const fileEditor = page.getByRole('textbox', { name: 'browser-e2e.md' })
    await expect(fileEditor).toHaveValue('# Browser file\n')
    await fileEditor.fill('# Browser file\n\nEdited from the file panel.\n')
    await page.getByRole('button', { name: 'Save file' }).click()
    await expect(page.getByText('File saved.')).toBeVisible()
    await page.screenshot({ path: 'artifacts/web-b5/file-manager.png', fullPage: true })
    await page.screenshot({ path: 'artifacts/ui-redesign/file-tool/after/document-1440.png', fullPage: true })
    await page.getByRole('button', { name: 'Back to files' }).click()
    await expectFileToolLayout('browser')
    await page.getByRole('button', { name: 'Close file manager' }).click()
    await expect(page.getByRole('heading', { level: 1, name: fixture.ready.sessionTitle })).toBeVisible()

    await page.getByRole('button', { name: 'Extensions', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Extensions and skills' })).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Extensions and skills' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: fixture.ready.sessionTitle })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Plugins' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Skills' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open system and diagnostic commands' })).toBeVisible()
    await page.screenshot({ path: 'artifacts/web-b5/extensions.png', fullPage: true })
    await page.getByRole('button', { name: 'Close extensions and skills' }).click()
    await expect(page.getByRole('heading', { level: 1, name: fixture.ready.sessionTitle })).toBeVisible()

    await page.getByRole('button', { name: 'Status center', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Status center' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: fixture.ready.sessionTitle })).toBeHidden()
    await expect(page.getByRole('button', { name: 'Performance' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('heading', { level: 2, name: 'Host process' })).toBeVisible()
    await page.screenshot({ path: 'artifacts/web-b6/performance.png', fullPage: true })
    await page.getByRole('button', { name: 'Close status center' }).click()
    await expect(page.getByRole('heading', { level: 1, name: fixture.ready.sessionTitle })).toBeVisible()

    await page.keyboard.press('Control+K')
    const commandDialog = page.getByRole('dialog', { name: 'Command catalog' })
    await expect(commandDialog.getByRole('heading', { level: 1, name: 'Command catalog' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: fixture.ready.sessionTitle })).toBeVisible()
    await page.getByRole('searchbox', { name: 'Search commands' }).fill('session.setBudget')
    await expect(page.getByRole('heading', { level: 2, name: 'Set session token budget' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Session ID' })).toHaveValue(fixture.ready.sessionId)
    const tokenLimit = page.getByRole('spinbutton', { name: 'Token limit' })
    await tokenLimit.fill('120000')
    await expect(tokenLimit).toHaveValue('120000')
    await page.getByRole('button', { name: 'Execute command' }).click()
    await expect(page.getByText('Command succeeded')).toBeVisible()
    await expect(tokenLimit).toHaveValue('120000')
    await page.screenshot({ path: 'artifacts/web-b4/command-palette.png', fullPage: true })
    await page.getByRole('button', { name: 'Close command catalog' }).click()
    await expect(page.getByRole('heading', { level: 1, name: fixture.ready.sessionTitle })).toBeVisible()

    await prompt.fill('hello from browser')
    await expect(prompt).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await page.screenshot({ path: 'artifacts/ui-redesign/prompt/production-session.png', fullPage: true })
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByText('hello from browser')).toBeVisible()
    await expect(page.getByText('Completed').first()).toBeVisible()
    await expect(page.getByRole('region', { name: 'AI usage' }).getByText(/^[1-9][\d,.]* tokens$/)).toBeVisible()
    await page.screenshot({ path: 'artifacts/ui-redesign/session/after/desktop-1440.png', fullPage: true })

    await page.getByRole('button', { name: 'Monitoring', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Session monitoring' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: fixture.ready.sessionTitle })).toBeVisible()
    const expectMonitoringLayout = async () =>
      page
        .evaluate(() => {
          const drawer = document.querySelector<HTMLElement>('.hbar-app-ui-app-tool-drawer')
          const monitoring = document.querySelector<HTMLElement>('.hbar-app-react-session-monitoring')
          const bars = [...document.querySelectorAll<HTMLElement>('.hbar-app-ui-bar-series i')]
          if (!drawer || !monitoring || !bars.length) return null
          const drawerRect = drawer.getBoundingClientRect()
          const monitoringRect = monitoring.getBoundingClientRect()
          const barRects = bars.map((bar) => bar.getBoundingClientRect())
          return {
            fillsDrawer:
              Math.abs(drawerRect.left - monitoringRect.left) <= 1 &&
              Math.abs(drawerRect.right - monitoringRect.right) <= 1 &&
              Math.abs(drawerRect.height - monitoringRect.height) <= 1,
            noOverflow: monitoring.scrollWidth <= monitoring.clientWidth,
            barCount: bars.length,
            minimumBarWidth: Math.min(...barRects.map((rect) => rect.width)),
            maximumBarHeight: Math.max(...barRects.map((rect) => rect.height)),
          }
        })
        .then((geometry) => {
          expect(geometry).not.toBeNull()
          expect(geometry).toMatchObject({ fillsDrawer: true, noOverflow: true })
          if (geometry!.minimumBarWidth < 1 || geometry!.maximumBarHeight < 8)
            throw new Error(`Monitoring bar geometry: ${JSON.stringify(geometry)}`)
        })
    const expectAgentLayout = async (view: 'list' | 'create' | 'detail') =>
      expect(
        await page.evaluate((expectedView) => {
          const drawer = document.querySelector<HTMLElement>('.hbar-app-ui-app-tool-drawer')
          const workspace = document.querySelector<HTMLElement>('.hbar-app-react-agent-workspace')
          if (!drawer || !workspace) return null
          const drawerRect = drawer.getBoundingClientRect()
          const workspaceRect = workspace.getBoundingClientRect()
          const actualView = workspace.querySelector('.hbar-app-react-agent-create-view')
            ? 'create'
            : workspace.querySelector('.hbar-app-react-agent-detail')
              ? 'detail'
              : workspace.querySelector('.hbar-app-react-agent-list')
                ? 'list'
                : null
          return {
            view: actualView,
            fillsDrawer:
              Math.abs(drawerRect.left - workspaceRect.left) <= 1 &&
              Math.abs(drawerRect.right - workspaceRect.right) <= 1 &&
              Math.abs(drawerRect.height - workspaceRect.height) <= 1,
            noOverflow: workspace.scrollWidth <= workspace.clientWidth,
            expectedView,
          }
        }, view),
      ).toMatchObject({ view, expectedView: view, fillsDrawer: true, noOverflow: true })
    const expectGoalPlanLayout = async (view: 'overview' | 'goal' | 'plan') =>
      expect(
        await page.evaluate((expectedView) => {
          const drawer = document.querySelector<HTMLElement>('.hbar-app-ui-app-tool-drawer')
          const workspace = document.querySelector<HTMLElement>('.hbar-app-react-goal-plan-workspace')
          if (!drawer || !workspace) return null
          const drawerRect = drawer.getBoundingClientRect()
          const workspaceRect = workspace.getBoundingClientRect()
          const actualView = workspace.querySelector('.hbar-app-react-goal-editor-view')
            ? 'goal'
            : workspace.querySelector('.hbar-app-react-plan-editor-view')
              ? 'plan'
              : workspace.querySelector('.hbar-app-react-goal-plan-overview')
                ? 'overview'
                : null
          return {
            view: actualView,
            fillsDrawer:
              Math.abs(drawerRect.left - workspaceRect.left) <= 1 &&
              Math.abs(drawerRect.right - workspaceRect.right) <= 1 &&
              Math.abs(drawerRect.height - workspaceRect.height) <= 1,
            noOverflow: workspace.scrollWidth <= workspace.clientWidth,
            expectedView,
          }
        }, view),
      ).toMatchObject({ view, expectedView: view, fillsDrawer: true, noOverflow: true })
    await expectMonitoringLayout()
    await expect(page.getByText('Total tokens')).toBeVisible()
    await expect(page.getByText('Token timeline')).toBeVisible()
    await page.screenshot({ path: 'artifacts/web-b5/session-monitoring.png', fullPage: true })
    await page.screenshot({ path: 'artifacts/ui-redesign/monitoring/after/desktop-1440.png', fullPage: true })
    await page.locator('.hbar-app-react-session-monitoring summary').filter({ hasText: 'Execution statistics' }).click()
    await expect(page.getByText('Peak request concurrency')).toBeVisible()
    await page.screenshot({ path: 'artifacts/ui-redesign/monitoring/after/desktop-1440-expanded.png', fullPage: true })
    await page.getByRole('button', { name: 'Close session monitoring' }).click()
    await expect(page.getByRole('heading', { level: 1, name: fixture.ready.sessionTitle })).toBeVisible()

    await page.getByRole('button', { name: 'Status center', exact: true }).click()
    await page.getByRole('button', { name: 'Usage', exact: true }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'AI usage' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Execution statistics' })).toBeVisible()
    await page.screenshot({ path: 'artifacts/web-b6/usage.png', fullPage: true })
    await page.locator('.hbar-app-react-status-workspace > main').evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await page.screenshot({ path: 'artifacts/web-b6/usage-details.png', fullPage: true })
    await page.getByRole('button', { name: 'Close status center' }).click()
    await expect(page.getByRole('heading', { level: 1, name: fixture.ready.sessionTitle })).toBeVisible()

    await page.getByRole('button', { name: 'Status center', exact: true }).click()
    await page.getByRole('button', { name: 'Git', exact: true }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Git repository' })).toBeVisible()
    await expect(page.getByText('Automatic commits').first()).toBeVisible()
    await page.screenshot({ path: 'artifacts/web-b6/git.png', fullPage: true })
    await page.getByRole('button', { name: 'Close status center' }).click()
    await expect(page.getByRole('heading', { level: 1, name: fixture.ready.sessionTitle })).toBeVisible()

    await page.getByRole('button', { name: 'Child agents', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Child agent management' })).toBeVisible()
    await expectAgentLayout('list')
    await page.screenshot({ path: 'artifacts/ui-redesign/agents/after/desktop-1440-empty.png', fullPage: true })
    await page.getByRole('button', { name: 'Create child agent' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Create child agent' })).toBeVisible()
    await expectAgentLayout('create')
    await page.getByRole('textbox', { name: 'Objective' }).fill('Verify the browser workflow')
    await expect(page.getByRole('textbox', { name: 'Model' })).toHaveValue('local-fixture')
    await page.getByRole('spinbutton', { name: 'Token budget' }).fill('5000')
    await page.screenshot({ path: 'artifacts/ui-redesign/agents/after/desktop-1440-create.png', fullPage: true })
    await page.getByRole('button', { name: 'Create and run' }).click()
    await expect(page.getByText('Child agent created.')).toBeVisible()
    await expect(page.getByText('Verify the browser workflow')).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Child agent details' })).toBeVisible()
    await expectAgentLayout('detail')
    await page.screenshot({ path: 'artifacts/ui-redesign/agents/after/desktop-1440-detail.png', fullPage: true })
    await page.getByRole('button', { name: 'Back to child agents' }).click()
    await expectAgentLayout('list')
    await page.screenshot({ path: 'artifacts/web-b5/child-agents.png', fullPage: true })
    await page.screenshot({ path: 'artifacts/ui-redesign/agents/after/desktop-1440-list.png', fullPage: true })
    await page.getByRole('button', { name: 'Close child agent management' }).click()
    await expect(page.getByRole('heading', { level: 1, name: fixture.ready.sessionTitle })).toBeVisible()

    await page.getByRole('button', { name: 'Goals and plans', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Goals and plans' })).toBeVisible()
    await expectGoalPlanLayout('overview')
    await page.screenshot({ path: 'artifacts/ui-redesign/goals/after/desktop-1440-empty.png', fullPage: true })
    await page.getByRole('button', { name: 'Set goal' }).click()
    await expectGoalPlanLayout('goal')
    await page.getByRole('textbox', { name: 'Goal objective' }).fill('Complete the browser verification')
    await page.getByRole('spinbutton', { name: 'Goal token budget' }).fill('16000')
    await page.getByRole('button', { name: 'Save goal' }).click()
    await expect(page.getByText('Goal saved.')).toBeVisible()
    await page.screenshot({ path: 'artifacts/ui-redesign/goals/after/desktop-1440-goal.png', fullPage: true })
    await page.getByRole('button', { name: 'Back to goals and plans' }).click()
    await expectGoalPlanLayout('overview')
    await page.getByRole('button', { name: 'Edit plan' }).click()
    await expectGoalPlanLayout('plan')
    await page.getByRole('textbox', { name: 'Plan explanation' }).fill('Keep the browser flow reviewable.')
    await page.getByRole('textbox', { name: 'Add plan step' }).fill('Verify the connected workbench')
    await page.getByRole('button', { name: 'Add step' }).click()
    await page.getByRole('button', { name: 'Save 1 step' }).click()
    await expect(page.getByText('Plan saved.')).toBeVisible()
    await page.screenshot({ path: 'artifacts/ui-redesign/goals/after/desktop-1440-plan.png', fullPage: true })
    await page.getByRole('button', { name: 'Back to goals and plans' }).click()
    await expectGoalPlanLayout('overview')
    await page.screenshot({ path: 'artifacts/web-b5/goals-and-plans.png', fullPage: true })
    await page.screenshot({ path: 'artifacts/ui-redesign/goals/after/desktop-1440-overview.png', fullPage: true })
    await page.getByRole('button', { name: 'Close goals and plans' }).click()
    await expect(page.getByRole('heading', { level: 1, name: fixture.ready.sessionTitle })).toBeVisible()

    await page.setViewportSize({ width: 1024, height: 768 })
    await expectSessionLayout()
    await page.screenshot({ path: 'artifacts/ui-redesign/shell/connected-sidebar-1024.png', fullPage: true })
    await page.screenshot({ path: 'artifacts/ui-redesign/session/after/tablet-1024.png', fullPage: true })
    await page.getByRole('button', { name: 'Files', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'File manager' })).toBeVisible()
    await expectFileToolLayout('browser')
    await page.screenshot({ path: 'artifacts/ui-redesign/outlets/files-1024.png', fullPage: true })
    await page.getByRole('button', { name: 'browser-e2e.md' }).click()
    await expectFileToolLayout('document')
    await page.screenshot({ path: 'artifacts/ui-redesign/file-tool/after/document-1024.png', fullPage: true })
    await page.getByRole('button', { name: 'Back to files' }).click()
    await page.getByRole('button', { name: 'Close file manager' }).click()
    await page.getByRole('button', { name: 'Monitoring', exact: true }).click()
    await expectMonitoringLayout()
    await page.screenshot({ path: 'artifacts/ui-redesign/monitoring/after/tablet-1024.png', fullPage: true })
    await page.getByRole('button', { name: 'Close session monitoring' }).click()
    await page.getByRole('button', { name: 'Child agents', exact: true }).click()
    await expectAgentLayout('list')
    await page.screenshot({ path: 'artifacts/ui-redesign/agents/after/tablet-1024-list.png', fullPage: true })
    await page.getByRole('button', { name: 'Close child agent management' }).click()
    await page.getByRole('button', { name: 'Goals and plans', exact: true }).click()
    await expectGoalPlanLayout('overview')
    await page.screenshot({ path: 'artifacts/ui-redesign/goals/after/tablet-1024-overview.png', fullPage: true })
    await page.getByRole('button', { name: 'Close goals and plans' }).click()
    await page.setViewportSize({ width: 390, height: 844 })
    const expectNoHorizontalOverflow = async () =>
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const openShellNavigation = async () => {
      const trigger = page.getByRole('button', { name: 'Show projects and sessions sidebar' })
      if (await trigger.isVisible()) await trigger.click()
      await expect(page.getByRole('complementary', { name: 'Projects and sessions' })).toBeVisible()
    }
    const expectShellPanesDoNotOverlap = async () =>
      expect(
        await page.evaluate(() => {
          const sidebar = document.querySelector('aside')?.getBoundingClientRect()
          const main = document.querySelector('main[aria-label="Workspace"]')?.getBoundingClientRect()
          return Boolean(sidebar && main && sidebar.bottom <= main.top + 1)
        }),
      ).toBe(true)
    await expectNoHorizontalOverflow()
    await expectShellPanesDoNotOverlap()
    await expectSessionLayout()
    await page.screenshot({ path: 'artifacts/ui-redesign/shell/connected-content-390.png', fullPage: true })
    await page.screenshot({ path: 'artifacts/ui-redesign/session/after/mobile-390.png', fullPage: true })
    await openShellNavigation()
    await page.screenshot({ path: 'artifacts/ui-redesign/shell/connected-drawer-390.png', fullPage: true })
    await page.getByRole('button', { name: 'Hide projects and sessions sidebar' }).first().click()

    await page.getByRole('button', { name: 'Files', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'File manager' })).toBeVisible()
    await expectFileToolLayout('browser')
    await expectNoHorizontalOverflow()
    await page.screenshot({ path: 'artifacts/ui-redesign/outlets/files-390.png', fullPage: true })
    await page.getByRole('button', { name: 'browser-e2e.md' }).click()
    await expectFileToolLayout('document')
    await expectNoHorizontalOverflow()
    await page.screenshot({ path: 'artifacts/ui-redesign/file-tool/after/document-390.png', fullPage: true })
    await page.getByRole('button', { name: 'Back to files' }).click()
    await page.getByRole('button', { name: 'Close file manager' }).click()

    await page.getByRole('button', { name: 'Monitoring', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Session monitoring' })).toBeVisible()
    await expectMonitoringLayout()
    await expectNoHorizontalOverflow()
    await page.screenshot({ path: 'artifacts/ui-redesign/monitoring/after/mobile-390.png', fullPage: true })
    await page.locator('.hbar-app-react-session-monitoring summary').filter({ hasText: 'Execution statistics' }).click()
    await expect(page.getByText('Peak request concurrency')).toBeVisible()
    await page.screenshot({ path: 'artifacts/ui-redesign/monitoring/after/mobile-390-expanded.png', fullPage: true })
    await page.getByRole('button', { name: 'Close session monitoring' }).click()

    await page.getByRole('button', { name: 'Child agents', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Child agent management' })).toBeVisible()
    await expectAgentLayout('list')
    await expectNoHorizontalOverflow()
    await page.screenshot({ path: 'artifacts/ui-redesign/agents/after/mobile-390-list.png', fullPage: true })
    await page.getByRole('button', { name: 'View details for Verify the browser workflow' }).click()
    await expectAgentLayout('detail')
    await page.screenshot({ path: 'artifacts/ui-redesign/agents/after/mobile-390-detail.png', fullPage: true })
    await page.getByRole('button', { name: 'Back to child agents' }).click()
    await page.getByRole('button', { name: 'Create child agent' }).click()
    await expectAgentLayout('create')
    await page.screenshot({ path: 'artifacts/ui-redesign/agents/after/mobile-390-create.png', fullPage: true })
    await page.getByRole('button', { name: 'Back to child agents' }).click()
    await page.getByRole('button', { name: 'Close child agent management' }).click()

    await page.getByRole('button', { name: 'Goals and plans', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Goals and plans' })).toBeVisible()
    await expectGoalPlanLayout('overview')
    await expectNoHorizontalOverflow()
    await page.screenshot({ path: 'artifacts/ui-redesign/goals/after/mobile-390-overview.png', fullPage: true })
    await page.getByRole('button', { name: 'Edit goal' }).click()
    await expectGoalPlanLayout('goal')
    await page.screenshot({ path: 'artifacts/ui-redesign/goals/after/mobile-390-goal.png', fullPage: true })
    await page.getByRole('button', { name: 'Back to goals and plans' }).click()
    await page.getByRole('button', { name: 'Edit plan' }).click()
    await expectGoalPlanLayout('plan')
    await page.screenshot({ path: 'artifacts/ui-redesign/goals/after/mobile-390-plan.png', fullPage: true })
    await page.getByRole('button', { name: 'Back to goals and plans' }).click()
    await page.getByRole('button', { name: 'Clear plan' }).click()
    await expect(page.getByText('Plan cleared.')).toBeVisible()
    await page.getByRole('button', { name: 'Clear goal' }).click()
    await expect(page.getByText('Goal cleared.')).toBeVisible()
    await page.getByRole('button', { name: 'Close goals and plans' }).click()

    await openShellNavigation()
    await page.getByRole('button', { name: 'Extensions', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Extensions and skills' })).toBeVisible()
    await expectNoHorizontalOverflow()
    await page.getByRole('button', { name: 'Close extensions and skills' }).click()

    await openShellNavigation()
    await page.getByRole('button', { name: 'Status center', exact: true }).click()
    await page.getByRole('button', { name: 'Usage', exact: true }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'AI usage' })).toBeVisible()
    await expectNoHorizontalOverflow()
    await expectShellPanesDoNotOverlap()
    await page.screenshot({ path: 'artifacts/web-b7/connected-status-narrow.png', fullPage: true })
    await page.getByRole('button', { name: 'Git', exact: true }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Git repository' })).toBeVisible()
    await expectNoHorizontalOverflow()
    await page.getByRole('button', { name: 'Close status center' }).click()
    await expect(page.getByRole('heading', { level: 1, name: fixture.ready.sessionTitle })).toBeVisible()
    await page.setViewportSize({ width: 1440, height: 960 })
    await openShellNavigation()

    await prompt.fill('/tool write_file {"path":"browser-e2e.txt","text":"approved"}')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByText('Agent approval')).toBeVisible()
    await page.getByRole('button', { name: 'Allow' }).click()
    await expect(page.getByText('Resolved')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Agent activity' }).getByText('2 runs')).toBeVisible()

    await page.getByRole('button', { name: 'Status center', exact: true }).click()
    await page.getByRole('button', { name: 'Usage', exact: true }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Execution statistics' })).toBeVisible()
    const toolCalls = page.locator('.hbar-app-ui-metric').filter({ hasText: 'Tool calls' })
    await expect(toolCalls).toContainText('1')
    await expect(toolCalls).toContainText('1 succeeded · 0 failed · 0 unknown')
    await expect(page.getByText('Peak request concurrency')).toBeVisible()
    await expect(page.getByText('Total Run time')).toBeVisible()
    await page.locator('.hbar-app-react-status-workspace > main').evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await page.screenshot({ path: 'artifacts/web-b6/execution-usage.png', fullPage: true })
    await page.getByRole('button', { name: 'Close status center' }).click()
    await expect(page.getByRole('heading', { level: 1, name: fixture.ready.sessionTitle })).toBeVisible()

    await prompt.fill('/slow')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByText('/slow')).toBeVisible()
    await page.getByRole('button', { name: 'Stop the current run' }).click()
    await expect(page.getByText('Cancelled', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
    const settingsScope = page.getByRole('combobox', { name: 'Settings scope' })
    await settingsScope.selectOption('session')
    await expect(page.locator('.hbar-app-ui-page-heading p')).toHaveText(
      `Session settings · ${fixture.ready.sessionTitle}`,
    )
    const settingsModel = page.getByRole('combobox', { name: 'Model' })
    await expect(settingsModel).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Thinking level' })).toBeVisible()
    const expectSettingsLayout = async (mode: 'sidebar' | 'select') =>
      expect(
        await page.locator('.hbar-app-react-settings-workspace').evaluate((element, expectedMode) => {
          const root = element.getBoundingClientRect()
          const footer = element.querySelector('.hbar-app-react-settings-footer')?.getBoundingClientRect()
          const groups = element.querySelector('.hbar-app-react-settings-groups')
          const mobile = element.querySelector('.hbar-app-react-settings-mobile-group')
          return {
            mode:
              groups && getComputedStyle(groups).display !== 'none'
                ? 'sidebar'
                : mobile && getComputedStyle(mobile).display !== 'none'
                  ? 'select'
                  : 'missing',
            footerAligned: Boolean(footer && Math.abs(root.bottom - footer.bottom) <= 1),
            noOverflow: element.scrollWidth <= element.clientWidth,
            expectedMode,
          }
        }, mode),
      ).toMatchObject({ mode, expectedMode: mode, footerAligned: true, noOverflow: true })
    await expectSettingsLayout('sidebar')
    await page.screenshot({
      path: 'artifacts/ui-redesign/settings/after/desktop-1440-model.png',
      fullPage: true,
    })
    await settingsModel.click()
    await expect(page.getByRole('listbox')).toBeVisible()
    await expect(page.getByRole('option')).not.toHaveCount(0)
    await page.screenshot({
      path: 'artifacts/ui-redesign/settings/after/desktop-1440-model-open.png',
      fullPage: true,
    })
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 1024, height: 768 })
    await expectSettingsLayout('sidebar')
    await page.screenshot({
      path: 'artifacts/ui-redesign/settings/after/tablet-1024-model.png',
      fullPage: true,
    })
    await page.setViewportSize({ width: 390, height: 844 })
    const hideSettingsNavigation = page.getByRole('button', { name: 'Hide projects and sessions sidebar' }).first()
    if (await hideSettingsNavigation.isVisible()) await hideSettingsNavigation.click()
    await expect(page.getByRole('combobox', { name: 'Settings groups' })).toBeVisible()
    await expectSettingsLayout('select')
    await expectNoHorizontalOverflow()
    await page.screenshot({
      path: 'artifacts/ui-redesign/settings/after/mobile-390-model.png',
      fullPage: true,
    })
    await page.setViewportSize({ width: 320, height: 720 })
    await expectSettingsLayout('select')
    await expectNoHorizontalOverflow()
    await page.screenshot({
      path: 'artifacts/ui-redesign/settings/after/mobile-320-model.png',
      fullPage: true,
    })
    await page.setViewportSize({ width: 1440, height: 960 })
    await page.getByRole('button', { name: 'Restore inheritance' }).click()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Settings saved.')).toBeVisible()

    await settingsScope.selectOption('global')
    await page.getByRole('button', { name: 'Providers', exact: true }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Provider configurations' })).toBeVisible()
    await expect(page.getByText('Local mock', { exact: true })).toBeVisible()
    await expect(page.getByText('Default: fixture', { exact: true })).toBeVisible()
    await expect(page.getByText('No credential', { exact: true })).toBeVisible()
    const providerActions = page.getByTitle('Actions for Local fixture', { exact: true })
    await providerActions.click()
    const providerMenu = page.getByRole('menu', { name: 'Actions for Local fixture' })
    await expect(providerMenu).toBeVisible()
    await page.screenshot({
      path: 'artifacts/ui-redesign/settings/after/desktop-1440-provider-menu.png',
      fullPage: true,
    })
    await page.getByRole('menuitem', { name: 'Delete Local fixture' }).click()
    const listDeleteDialog = page.getByRole('dialog', { name: 'Delete provider “Local fixture”?' })
    await expect(listDeleteDialog).toBeVisible()
    await page.screenshot({
      path: 'artifacts/ui-redesign/settings/after/desktop-1440-provider-delete.png',
      fullPage: true,
    })
    await page.keyboard.press('Escape')
    await expect(listDeleteDialog).toBeHidden()
    await page.keyboard.press('Escape')
    await expect(providerMenu).toBeHidden()
    await expect(providerActions).toBeFocused()
    await page.getByRole('button', { name: 'Add provider', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Add provider' })).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Add provider' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
    const preset = page.getByRole('combobox', { name: 'Provider preset' })
    await page.screenshot({ path: 'artifacts/ui-redesign/provider-editor/after/add-desktop-1440.png', fullPage: true })
    await preset.fill('OpenAI')
    await expect(page.getByRole('option').filter({ has: page.getByText('OpenAI', { exact: true }) })).toBeVisible()
    await page.screenshot({
      path: 'artifacts/ui-redesign/provider-editor/after/add-preset-open-1440.png',
      fullPage: true,
    })
    await page
      .getByRole('option')
      .filter({ has: page.getByText('OpenAI', { exact: true }) })
      .click()
    await page.getByRole('textbox', { name: 'Provider ID' }).fill('browser-provider')
    await page.getByRole('textbox', { name: 'Display name' }).first().fill('Browser provider')
    const modelCatalog = page.getByRole('combobox', { name: 'Add from preset catalog' })
    await modelCatalog.fill('gpt-5.4')
    await page
      .getByRole('option')
      .filter({ has: page.getByText('GPT-5.4', { exact: true }) })
      .click()
    await page.getByRole('button', { name: 'Set as default' }).click()
    await page.getByLabel('API key').fill('browser-secret')
    await page.getByRole('button', { name: 'Save provider' }).click()
    await expect(page.getByText('Provider saved.')).toBeVisible()
    await expect(page.getByLabel('API key')).toHaveValue('')
    const providerMain = page.locator('.hbar-app-react-provider-dialog > main')
    const providerFooter = page.locator('.hbar-app-react-provider-dialog > footer')
    const expectProviderRegionsSeparated = async () => {
      const [mainBox, footerBox] = await Promise.all([providerMain.boundingBox(), providerFooter.boundingBox()])
      expect(mainBox).not.toBeNull()
      expect(footerBox).not.toBeNull()
      expect(mainBox!.y + mainBox!.height).toBeLessThanOrEqual(footerBox!.y + 1)
    }
    await providerMain.evaluate((element) => {
      element.scrollTop = 0
    })
    await expectProviderRegionsSeparated()
    await page.screenshot({ path: 'artifacts/ui-redesign/provider-editor/after/desktop-1440.png', fullPage: true })
    const deleteProvider = page.getByRole('button', { name: 'Delete provider' })
    await deleteProvider.click()
    const deleteDialog = page.getByRole('dialog', { name: 'Delete provider “Browser provider”?' })
    await expect(deleteDialog).toBeVisible()
    await page.screenshot({
      path: 'artifacts/ui-redesign/provider-editor/after/delete-confirm-1440.png',
      fullPage: true,
    })
    await page.keyboard.press('Escape')
    await expect(deleteDialog).toBeHidden()
    await expect(deleteProvider).toBeFocused()
    await page.setViewportSize({ width: 1024, height: 768 })
    await expectNoHorizontalOverflow()
    await providerMain.evaluate((element) => {
      element.scrollTop = 0
    })
    await expectProviderRegionsSeparated()
    await page.screenshot({ path: 'artifacts/ui-redesign/provider-editor/after/tablet-1024.png', fullPage: true })
    await page.getByRole('heading', { level: 2, name: 'Models', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({
      path: 'artifacts/ui-redesign/provider-editor/after/tablet-1024-models.png',
      fullPage: true,
    })
    await page.setViewportSize({ width: 390, height: 844 })
    await expectNoHorizontalOverflow()
    await providerMain.evaluate((element) => {
      element.scrollTop = 0
    })
    await expectProviderRegionsSeparated()
    await page.screenshot({ path: 'artifacts/ui-redesign/provider-editor/after/mobile-390.png', fullPage: true })
    await page.getByRole('heading', { level: 2, name: 'Models', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: 'artifacts/ui-redesign/provider-editor/after/mobile-390-models.png', fullPage: true })
    await page.setViewportSize({ width: 1440, height: 960 })
    await page.getByRole('button', { name: 'Back to settings' }).click()
    await expect(page.getByRole('dialog', { name: /provider/i })).toBeHidden()
    await expect(page.getByRole('button', { name: 'Edit Browser provider' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: 'artifacts/web-b3/settings-workspace.png', fullPage: true })
    await page.screenshot({
      path: 'artifacts/ui-redesign/settings/after/desktop-1440-providers.png',
      fullPage: true,
    })
    await page.setViewportSize({ width: 1024, height: 768 })
    await expect(page.getByRole('button', { name: 'Edit Browser provider' })).toBeVisible()
    await expectNoHorizontalOverflow()
    await page.screenshot({
      path: 'artifacts/ui-redesign/settings/after/tablet-1024-providers.png',
      fullPage: true,
    })
    await page.setViewportSize({ width: 390, height: 844 })
    const hideProviderNavigation = page.getByRole('button', { name: 'Hide projects and sessions sidebar' }).first()
    if (await hideProviderNavigation.isVisible()) await hideProviderNavigation.click()
    await expect(page.getByRole('combobox', { name: 'Settings groups' })).toHaveValue('providers')
    await expect(page.getByRole('button', { name: 'Edit Browser provider' })).toBeVisible()
    await expectNoHorizontalOverflow()
    await page.screenshot({
      path: 'artifacts/ui-redesign/settings/after/mobile-390-providers.png',
      fullPage: true,
    })
    await page.setViewportSize({ width: 1440, height: 960 })
    await page.getByRole('button', { name: 'Back to session' }).click()
    await expect(page.getByRole('heading', { level: 1, name: fixture.ready.sessionTitle })).toBeVisible()
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (fixture) await stopSessionHost(fixture.child)
    await rm(root, { recursive: true, force: true })
  }
})
