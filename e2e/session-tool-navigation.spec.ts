import { expect, test } from '@playwright/test'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { mobileShellNavigationLabel } from '../apps/web/src/mobile-shell-navigation-copy'
import { workspaceTabsCopy } from '../apps/web/src/workspace-tabs-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`session tools remain readable, keyboard-operable and scoped at every width: ${locale}`, async ({ browser }) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-session-tools-'))
    const context = await browser.newContext({ locale })
    const copy = getShellCopy(locale)
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      await prompt.fill('A draft belongs to this session — 工具切换不应丢失草稿')
      const tools = page.getByRole('group', { name: copy.session.tools.label, exact: true })
      const filesAction = page
        .getByRole('toolbar', { name: copy.session.tools.label, exact: true })
        .getByRole('button', { name: copy.session.tools.files, exact: true })
      const labels = [
        copy.session.find.entry,
        copy.session.tools.activity,
        copy.session.tools.monitoring,
        copy.session.tools.agents,
        copy.session.tools.goals,
        copy.session.tools.settings,
      ]
      const panels = [
        { label: copy.session.tools.files, title: copy.files.title, close: copy.files.close },
        { label: copy.session.tools.monitoring, title: copy.monitoring.title, close: copy.monitoring.close },
        { label: copy.session.tools.agents, title: copy.agents.title, close: copy.agents.close },
        { label: copy.session.tools.goals, title: copy.goals.title, close: copy.goals.close },
      ]
      const toolAction = (label: string) =>
        label === copy.session.tools.files ? filesAction : tools.getByRole('button', { name: label, exact: true })
      for (const viewport of [
        { width: 1440, height: 960 },
        { width: 900, height: 700 },
      ]) {
        await page.setViewportSize(viewport)
        await expect(tools.getByRole('button')).toHaveCount(6)
        await expect(tools.getByRole('button', { name: copy.session.tools.files, exact: true })).toHaveCount(0)
        for (const label of [copy.session.tools.files, ...labels]) {
          const action = toolAction(label)
          await expect(action).toBeVisible()
          await expect(action).toBeInViewport()
          await expect(action).toHaveAttribute('aria-label', label)
          await expect(action).toHaveAttribute('title', label)
          await expect(action).toHaveText('')
          await expect(action.locator('svg')).toHaveAttribute('aria-hidden', 'true')
        }
        expect(
          await tools.evaluate((element) => {
            const bounds = element.getBoundingClientRect()
            const buttons = [...element.querySelectorAll('button')]
            const rects = buttons.map((button) => button.getBoundingClientRect())
            return {
              fits: element.scrollWidth <= element.clientWidth + 1,
              buttonsFit: buttons.every((button) => {
                const rect = button.getBoundingClientRect()
                return (
                  rect.left >= bounds.left - 1 &&
                  rect.right <= bounds.right + 1 &&
                  button.scrollWidth <= button.clientWidth + 1
                )
              }),
              flowing: rects.every((rect, index) =>
                rects
                  .slice(0, index)
                  .every((previous) => rect.top >= previous.bottom - 1 || rect.left >= previous.right - 1),
              ),
            }
          }),
        ).toEqual({ fits: true, buttonsFit: true, flowing: true })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        const headerBounds = await page.locator('.hbar-app-react-session-workspace > .lumen-page-header').boundingBox()
        const headingBounds = await page.locator('.hbar-app-react-session-workspace .lumen-page-heading').boundingBox()
        const actionBounds = await tools.boundingBox()
        if (!headerBounds || !headingBounds || !actionBounds) throw new Error('Session header must remain measurable')
        expect(headerBounds.height).toBeLessThanOrEqual(headingBounds.height + actionBounds.height + 32)
        if (viewport.width <= 560)
          expect(headingBounds.y + headingBounds.height).toBeLessThanOrEqual(actionBounds.y + 1)
        await page.screenshot({ path: `artifacts/desktop-experience/session-tools-${locale}-${viewport.width}.png` })

        await tools.getByRole('button', { name: copy.session.find.entry, exact: true }).focus()
        for (const label of labels.slice(1)) {
          await page.keyboard.press('Tab')
          await expect(tools.getByRole('button', { name: label, exact: true })).toBeFocused()
        }
        expect(
          await tools
            .getByRole('button', { name: copy.session.tools.settings, exact: true })
            .evaluate(
              (element) => element.matches(':focus-visible') && getComputedStyle(element).outlineStyle !== 'none',
            ),
        ).toBe(true)
        for (const [index, panel] of panels.entries()) {
          const action = toolAction(panel.label)
          await expect(action).toHaveAttribute('aria-pressed', 'false')
          await action.focus()
          await page.keyboard.press(index % 2 ? 'Space' : 'Enter')
          const pane = page.getByRole('region', { name: panel.title, exact: true }).filter({
            has: page.getByRole('button', { name: panel.close, exact: true }),
          })
          await expect(pane).toBeVisible()
          if (viewport.width > 1024) {
            await expect(action).toHaveAttribute('aria-pressed', 'true')
            for (const other of panels.filter((candidate) => candidate !== panel))
              await expect(toolAction(other.label)).toHaveAttribute('aria-pressed', 'false')
          }
          await pane.getByRole('button', { name: panel.close, exact: true }).click()
          await expect(action).toHaveAttribute('aria-pressed', 'false')
          await expectComposerText(prompt, 'A draft belongs to this session — 工具切换不应丢失草稿')
          await expect(page.getByRole('heading', { level: 1 })).toHaveText(host.ready.sessionTitle)
        }
        const settings = tools.getByRole('button', { name: copy.session.tools.settings, exact: true })
        await expect(settings).not.toHaveAttribute('aria-pressed')
        await settings.focus()
        await page.keyboard.press('Enter')
        await expect(page.getByRole('combobox', { name: copy.settings.scopes })).toHaveValue('session')
        await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
        await expectComposerText(prompt, 'A draft belongs to this session — 工具切换不应丢失草稿')
      }
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })

  test(`narrow shell consolidates navigation without losing tools, tabs or return focus: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-mobile-navigation-'))
    const evidence = 'artifacts/desktop-experience/mobile-navigation'
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    const copy = getShellCopy(locale)
    const tabCopy = workspaceTabsCopy((zh, en) => (locale === 'zh-CN' ? zh : en))
    const title =
      locale === 'zh-CN'
        ? '这是一段很长很长很长的会话标题，用于验证窄屏标题截断、操作入口和本地化导航布局。'
        : 'A very long session title that checks narrow header truncation, localized navigation, and reachable actions.'
    const draft = `Preserve mobile navigation draft — 保持移动端草稿 ${locale}`
    let host: WebSessionHost | undefined
    try {
      await mkdir(evidence, { recursive: true })
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      await createWorkspaceSessionCommandClient(host.client).execute('session.rename', {
        sessionId: host.ready.sessionId,
        title,
      })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      const showSidebar = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      if (await showSidebar.isVisible()) await showSidebar.click()
      await page.getByRole('button', { name: copy.shell.openSession(title), exact: true }).click()
      const hideSidebar = page.getByRole('button', { name: copy.shell.hideSidebar, exact: true })
      if (await hideSidebar.isVisible()) await hideSidebar.click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      await prompt.fill(draft)
      const header = page.locator('.hbar-app-react-shell-header')
      const titleHeading = page.locator('.hbar-app-react-shell-header-active-title')
      const trigger = page.locator('.hbar-mobile-header-menu-trigger')
      const panel = page.locator('.hbar-mobile-header-menu-content')
      await expect(trigger).toHaveAttribute('aria-label', mobileShellNavigationLabel(locale))
      const tools = () => panel.getByRole('region', { name: copy.session.tools.label, exact: true })
      const menuTool = (label: string) => tools().getByRole('button', { name: label, exact: true })
      const tabs = () => panel.getByRole('region', { name: tabCopy.tabs.tabs, exact: true })
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 320, height: 720 },
        { width: 320, height: 560 },
      ]) {
        await page.setViewportSize(viewport)
        await expect(titleHeading).toHaveText(title)
        await expect(titleHeading).toBeVisible()
        await expect(page.locator('.hbar-app-react-session-workspace > .lumen-page-header')).toBeHidden()
        await expect(page.locator('.hbar-workspace-tabs-bar')).toBeHidden()
        const before = await header.evaluate((element) => element.getBoundingClientRect().height)
        const titleGeometry = await titleHeading.evaluate((element) => ({
          width: element.clientWidth,
          scrollWidth: element.scrollWidth,
          overflow: getComputedStyle(element).textOverflow,
        }))
        expect(titleGeometry.scrollWidth).toBeGreaterThan(titleGeometry.width)
        expect(titleGeometry.overflow).toBe('ellipsis')
        expect(before).toBeLessThanOrEqual(64)
        const screenshotSize = viewport.height === 560 ? '320x560' : String(viewport.width)
        await page.screenshot({ path: `${evidence}/shell-${locale}-${screenshotSize}-closed.png` })

        await trigger.focus()
        await page.keyboard.press('Enter')
        await expect(trigger).toHaveAttribute('aria-expanded', 'true')
        await expect(panel).toBeVisible()
        const openGeometry = await page.evaluate(() => {
          const shellHeader = document.querySelector('.hbar-app-react-shell-header')!
          const menuTrigger = document.querySelector('.hbar-mobile-header-menu-trigger')!
          const menuPanel = document.querySelector('.hbar-mobile-header-menu-content')!
          const headerRect = shellHeader.getBoundingClientRect()
          const triggerRect = menuTrigger.getBoundingClientRect()
          const panelRect = menuPanel.getBoundingClientRect()
          return {
            headerHeight: headerRect.height,
            triggerBottom: triggerRect.bottom,
            panelTop: panelRect.top,
            panelRight: panelRect.right,
            panelBottom: panelRect.bottom,
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
            positioning: getComputedStyle(menuPanel).position,
            overflow: menuPanel.scrollHeight > menuPanel.clientHeight,
            scrollHeight: menuPanel.scrollHeight,
            clientHeight: menuPanel.clientHeight,
            documentWidth: document.documentElement.scrollWidth,
            scrollbarWidth: getComputedStyle(menuPanel).scrollbarWidth,
          }
        })
        expect(openGeometry.headerHeight).toBeCloseTo(before, 1)
        expect(openGeometry.positioning).toBe('absolute')
        expect(openGeometry.panelTop).toBeGreaterThanOrEqual(openGeometry.triggerBottom - 1)
        expect(openGeometry.panelRight).toBeLessThanOrEqual(openGeometry.viewportWidth + 1)
        expect(openGeometry.panelBottom).toBeLessThanOrEqual(openGeometry.viewportHeight + 1)
        if (viewport.height <= 720) {
          expect(openGeometry.overflow).toBe(true)
          expect(openGeometry.clientHeight).toBeLessThanOrEqual(viewport.height / 2 + 1)
          expect(openGeometry.scrollbarWidth).toBe('thin')
        }
        expect(openGeometry.documentWidth).toBeLessThanOrEqual(viewport.width + 1)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        const sendButton = page.getByRole('button', { name: copy.session.prompt.send, exact: true })
        await expect(sendButton).toBeVisible()
        const sendBox = await sendButton.boundingBox()
        if (!sendBox) throw new Error('Expected the session send control to remain rendered')
        const sendOverlappedByMenu =
          openGeometry.panelTop < sendBox.y + sendBox.height && openGeometry.panelBottom > sendBox.y
        expect(sendOverlappedByMenu).toBe(false)
        await expect(tools().getByRole('button')).toHaveCount(7)
        for (const label of [
          copy.session.find.entry,
          copy.session.tools.files,
          copy.session.tools.activity,
          copy.session.tools.monitoring,
          copy.session.tools.agents,
          copy.session.tools.goals,
          copy.session.tools.settings,
        ]) {
          await expect(menuTool(label)).toBeVisible()
          await expect(menuTool(label)).toBeEnabled()
        }
        await page.screenshot({ path: `${evidence}/shell-${locale}-${screenshotSize}-open.png` })
        if (viewport.height <= 720) {
          await menuTool(copy.session.tools.settings).scrollIntoViewIfNeeded()
          const lastToolBox = await menuTool(copy.session.tools.settings).boundingBox()
          const panelBox = await panel.boundingBox()
          if (!lastToolBox || !panelBox) throw new Error('Expected the last session tool to be reachable in the menu')
          expect(lastToolBox.y).toBeGreaterThanOrEqual(panelBox.y)
          expect(lastToolBox.y + lastToolBox.height).toBeLessThanOrEqual(panelBox.y + panelBox.height + 1)
          await expect(sendButton).toBeVisible()
          const sendAfterScroll = await sendButton.boundingBox()
          if (!sendAfterScroll) throw new Error('Expected the session send control after scrolling the menu')
          expect(sendAfterScroll.y).toBe(sendBox.y)
          await page.screenshot({ path: `${evidence}/shell-${locale}-${screenshotSize}-open-scrolled.png` })
        }

        await page.keyboard.press('Escape')
        await expect(panel).toHaveCount(0)
        await expect(trigger).toBeFocused()
        await trigger.click()
        await prompt.click()
        await expect(panel).toHaveCount(0)
        await expect(prompt).toBeFocused()

        await trigger.click()
        await menuTool(copy.session.find.entry).focus()
        await page.keyboard.press('Enter')
        const findInput = page.getByRole('searchbox', { name: copy.session.find.input, exact: true })
        await expect(findInput).toBeFocused()
        await page.keyboard.press('Escape')
        await expect(page.locator('[data-session-find-bar]')).toHaveCount(0)
        await expect(trigger).toBeFocused()

        await trigger.click()
        await menuTool(copy.session.tools.files).click()
        const files = page.locator('.lumen-app-tool-drawer')
        await expect(files).toBeVisible()
        await expect(files.getByRole('button', { name: copy.files.close, exact: true })).toBeVisible()
        await files.getByRole('button', { name: copy.files.close, exact: true }).click()
        await expect(files).toHaveCount(0)
        await expect(trigger).toBeFocused()
        await expectComposerText(prompt, draft)

        await trigger.click()
        await menuTool(copy.session.tools.settings).click()
        await expect(page.getByRole('combobox', { name: copy.settings.scopes })).toHaveValue('session')
        await expect(titleHeading).toHaveText(copy.shell.settings)
        await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
        await expect(titleHeading).toHaveText(title)
        await expectComposerText(prompt, draft)

        await trigger.click()
        await menuTool(copy.session.tools.files).click()
        const fileWorkspace = page.locator('.hbar-app-react-file-workspace:not(.hbar-app-react-file-workbench)')
        await expect(fileWorkspace).toBeVisible()
        await fileWorkspace.getByRole('button', { name: copy.files.expandWorkbench, exact: true }).click()
        const workbench = page.locator('.hbar-app-react-file-workbench')
        await expect(workbench).toBeVisible()
        await expect(titleHeading).toHaveText(copy.shell.workspaceFiles)
        await expect(page.locator('.hbar-workspace-tabs-bar')).toBeHidden()

        await trigger.click()
        const activeWorkbenchTab = tabs().getByRole('button', {
          name: `${tabCopy.workbenchTitle} — ${host.ready.workspaceName}`,
          exact: true,
        })
        await expect(activeWorkbenchTab).toHaveAttribute('aria-current', 'page')
        await tabs()
          .getByRole('button', { name: `${title} — ${host.ready.workspaceName}`, exact: true })
          .click()
        await expect(titleHeading).toHaveText(title)
        await trigger.click()
        await expect(
          tabs().getByRole('button', { name: `${title} — ${host.ready.workspaceName}`, exact: true }),
        ).toHaveAttribute('aria-current', 'page')
        await tabs()
          .getByRole('button', { name: `${tabCopy.workbenchTitle} — ${host.ready.workspaceName}`, exact: true })
          .click()
        await expect(titleHeading).toHaveText(copy.shell.workspaceFiles)
        await workbench.getByRole('button', { name: copy.files.returnToConversation, exact: true }).click()
        await expect(titleHeading).toHaveText(title)
        await expectComposerText(prompt, draft)

        await trigger.click()
        await menuTool(copy.session.tools.files).click()
        const returnedFiles = page.locator('.hbar-app-react-file-workspace:not(.hbar-app-react-file-workbench)')
        await expect(returnedFiles).toBeVisible()
        await returnedFiles.getByRole('button', { name: copy.files.expandWorkbench, exact: true }).click()
        await expect(workbench).toBeVisible()
        await trigger.click()
        await tabs()
          .getByRole('button', { name: `${title} — ${host.ready.workspaceName}`, exact: true })
          .click()
        await expect(titleHeading).toHaveText(title)
        await trigger.click()
        await tabs()
          .getByRole('button', { name: tabCopy.tabs.close(tabCopy.workbenchTitle), exact: true })
          .click()
        await expect(titleHeading).toHaveText(title)
        await trigger.click()
        await expect(
          tabs().getByRole('button', { name: tabCopy.tabs.close(tabCopy.workbenchTitle), exact: true }),
        ).toHaveCount(0)
        await page.keyboard.press('Escape')
        await expect(panel).toHaveCount(0)
        await expect(trigger).toBeFocused()
        await expectComposerText(prompt, draft)
        await noOverflowForMobile(page)
      }
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}

async function noOverflowForMobile(page: import('@playwright/test').Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
}
