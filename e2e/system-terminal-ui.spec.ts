import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { systemTerminalCopy } from '../apps/web/src/system-terminal-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('.hbar-system-terminal-panel')
    return {
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      panelClient: panel?.clientWidth ?? 0,
      panelScroll: panel?.scrollWidth ?? 0,
      panelLeft: panel?.getBoundingClientRect().left ?? 0,
      panelRight: panel?.getBoundingClientRect().right ?? 0,
    }
  })
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport)
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport)
  expect(dimensions.panelScroll).toBeLessThanOrEqual(dimensions.panelClient)
  expect(dimensions.panelLeft).toBeGreaterThanOrEqual(0)
  expect(dimensions.panelRight).toBeLessThanOrEqual(dimensions.viewport)
}

async function saveTerminalScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({ path: testInfo.outputPath(name), fullPage: true })
}

test('operator session opens and controls the System Terminal panel at desktop and narrow widths', async ({
  browser,
}, testInfo) => {
  test.setTimeout(90_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-system-terminal-ui-'))
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 960 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base)
    await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
    const shell = getShellCopy('en-US')
    const terminal = systemTerminalCopy('en-US')
    await page.getByRole('button', { name: shell.session.tools.systemTerminal, exact: true }).click()
    const panel = page.locator('.hbar-system-terminal-panel')
    await expect(panel.getByText(terminal.title, { exact: true })).toBeVisible()
    const openButton = panel.getByRole('button', { name: terminal.open })
    await expect(openButton).toBeVisible()
    await openButton.click()
    const closeButton = panel.getByRole('button', { name: terminal.close })
    await expect(closeButton).toBeVisible()
    const viewport = panel.locator('.hbar-system-terminal-viewport')
    await expect(viewport).toBeVisible()
    await viewport.click()
    const terminalInput = viewport.locator('.xterm-helper-textarea')
    await expect.poll(() => terminalInput.evaluate((element) => element === document.activeElement)).toBe(true)
    await page.keyboard.type('echo HBAR_SYSTEM_TERMINAL_E2E')
    await page.keyboard.press('Enter')
    const outputRows = viewport.locator('.xterm-rows > div')
    await expect
      .poll(async () => (await outputRows.allTextContents()).some((line) => line.trim() === 'HBAR_SYSTEM_TERMINAL_E2E'))
      .toBe(true)
    const typography = await viewport.evaluate((root) => {
      const styleOf = (element: Element | null) => {
        if (!element) return null
        const style = getComputedStyle(element)
        return { fontFamily: style.fontFamily, fontSize: style.fontSize, lineHeight: style.lineHeight }
      }
      const rows = root.querySelector('.xterm-rows')
      const rowRects = rows
        ? [...rows.children].slice(0, 3).map((row) => {
            const rect = row.getBoundingClientRect()
            return { height: rect.height, top: rect.top }
          })
        : []
      const xterm = root.querySelector('.xterm')
      const screen = root.querySelector('.xterm-screen')
      const computed = getComputedStyle(root)
      return {
        tokens: {
          background: computed.getPropertyValue('--lumen-contrast').trim(),
          foreground: computed.getPropertyValue('--lumen-ink').trim(),
          accent: computed.getPropertyValue('--lumen-accent').trim(),
        },
        viewport: styleOf(root),
        xterm: styleOf(xterm),
        row: styleOf(rows?.firstElementChild ?? null),
        screenBackground: screen ? getComputedStyle(screen).backgroundColor : '',
        rowRects,
      }
    })
    expect(typography.tokens.background).not.toBe('')
    expect(typography.tokens.foreground).not.toBe('')
    expect(typography.tokens.accent).not.toBe('')
    expect(typography.viewport?.fontFamily).toContain('monospace')
    expect(typography.xterm?.fontFamily).toBe(typography.viewport?.fontFamily)
    expect(typography.xterm?.fontSize).toBe(typography.viewport?.fontSize)
    const lineHeight = Number.parseFloat(typography.xterm?.lineHeight ?? '')
    const rowHeight = typography.rowRects[0]?.height ?? 0
    expect(rowHeight).toBeGreaterThan(0)
    expect(lineHeight).toBeCloseTo(Number.parseFloat(typography.xterm?.fontSize ?? '') * 1.2, 1)
    expect(typography.row?.lineHeight).toBe(`${rowHeight}px`)
    const rowStep = (typography.rowRects[1]?.top ?? 0) - (typography.rowRects[0]?.top ?? 0)
    expect(Math.abs(rowStep - rowHeight)).toBeLessThanOrEqual(1)
    expect(typography.screenBackground).not.toBe('rgb(0, 0, 0)')
    await expectNoHorizontalOverflow(page)
    await saveTerminalScreenshot(page, testInfo, 'system-terminal-operator-1440.png')

    await page.setViewportSize({ width: 390, height: 844 })
    await expectNoHorizontalOverflow(page)
    await expect(closeButton).toBeVisible()
    await viewport.click()
    await expect.poll(() => terminalInput.evaluate((element) => element === document.activeElement)).toBe(true)
    await saveTerminalScreenshot(page, testInfo, 'system-terminal-operator-390.png')
    await closeButton.click()
    await expect(panel).toHaveCount(0)
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await rm(root, { recursive: true, force: true })
  }
})
