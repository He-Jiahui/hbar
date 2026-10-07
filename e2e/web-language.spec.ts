import { expect, test } from '@playwright/test'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { WEB_LANGUAGE_STORAGE_KEY } from '../apps/web/src/language'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function removeOwnedFixture(root: string) {
  const target = await realpath(root)
  if (
    dirname(target) !== (await realpath(tmpdir())) ||
    !['hbar-web-language-', 'hbar-language-two-windows-'].some((prefix) => basename(target).startsWith(prefix))
  )
    throw new Error('Unexpected language fixture root')
  await rm(target, { recursive: true, force: true })
}

test('device language switches in place, keeps live Host workspace and unsaved appearance, and persists on reload', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-web-language-'))
  const context = await browser.newContext({ locale: 'en-US' })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({
      root,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
      goalAutoContinue: false,
      budgetAutoContinue: false,
    })
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    let sockets = 0
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('websocket', () => sockets++)
    const en = getShellCopy('en-US')
    const zh = getShellCopy('zh-CN')
    await page.goto(base)
    await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
    await page
      .getByRole('textbox', { name: en.session.prompt.input, exact: true })
      .fill('Unsent language-switch draft 保留')
    await page.getByRole('button', { name: 'Files', exact: true }).click()
    await expect(page.locator('.hbar-app-react-file-workspace')).toHaveCount(1)
    await page.getByRole('button', { name: en.shell.settings, exact: true }).click()
    // Cold Settings still starts at Providers. Language is a nearby explicit device group.
    await expect(page.locator('.hbar-app-react-settings-groups button[aria-current="page"]')).toHaveText('Providers')
    await page.getByRole('button', { name: en.appearance.group, exact: true }).click()
    await page.getByRole('radio', { name: en.appearance.theme.dark, exact: true }).click()
    await expect(page.getByText(en.appearance.unsaved, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: en.general.group, exact: true }).click()
    // Settings deliberately hides the tool and captures it in returnContext; switching language must not change that.
    await expect(page.locator('.hbar-app-react-file-workspace')).toHaveCount(0)
    const connectedSocketCount = sockets
    const chinese = page.getByRole('radio', { name: '简体中文', exact: true })
    await chinese.click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
    await expect(page.getByRole('heading', { name: zh.general.title, exact: true })).toBeVisible()
    await expect(chinese).toBeFocused()
    await expect(chinese).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByText(zh.general.saved, { exact: true })).toBeVisible()
    await expect(page.locator('.hbar-app-react-file-workspace')).toHaveCount(0)
    await page.getByRole('button', { name: zh.appearance.group, exact: true }).click()
    await expect(page.getByRole('radio', { name: zh.appearance.theme.dark, exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await expect(page.getByText(zh.appearance.unsaved, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: zh.general.group, exact: true }).click()
    await page.getByRole('radio', { name: 'English', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US')
    await page.getByRole('button', { name: en.settings.back, exact: true }).click()
    await expect(page.getByRole('textbox', { name: en.session.prompt.input, exact: true })).toHaveText(
      'Unsent language-switch draft 保留',
    )
    await expect(page.getByRole('heading', { level: 1, name: host.ready.sessionTitle, exact: true })).toBeVisible()
    await expect(page.locator('.hbar-app-react-file-workspace')).toHaveCount(1)
    expect(sockets).toBe(connectedSocketCount)
    await page.getByRole('button', { name: en.shell.settings, exact: true }).click()
    for (const locale of ['en-US', 'zh-CN'] as const) {
      const copy = getShellCopy(locale)
      await page.getByRole('radio', { name: locale === 'en-US' ? 'English' : '简体中文', exact: true }).click()
      for (const width of [1440, 900, 390, 320]) {
        await page.setViewportSize({ width, height: 900 })
        await expect(page.getByRole('radiogroup', { name: copy.general.language, exact: true })).toBeVisible()
        await expect
          .poll(() =>
            page
              .locator('.hbar-web-general-choices button')
              .evaluateAll((nodes) =>
                nodes.every((node) => node.getAnimations().every((animation) => animation.playState !== 'running')),
              ),
          )
          .toBe(true)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `artifacts/desktop-entry-matrix/language/production-${locale}-${width}.png` })
      }
      await page.setViewportSize({ width: 1440, height: 900 })
    }
    expect(await page.evaluate((key) => localStorage.getItem(key), WEB_LANGUAGE_STORAGE_KEY)).toBe('zh-CN')
    expect((await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs).toEqual([])
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
    await page.getByRole('button', { name: zh.shell.settings, exact: true }).click()
    await expect(page.getByRole('heading', { name: zh.general.title, exact: true })).toBeVisible()
    await expect(page.getByRole('radio', { name: '简体中文', exact: true })).toHaveAttribute('aria-checked', 'true')
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await removeOwnedFixture(root)
  }
})

test('language stays usable offline with corrupt storage, honest write failure, retry and radio keyboard navigation', async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: 'en-US' })
  try {
    await context.addInitScript((key) => {
      localStorage.setItem(key, 'unsupported-language')
      const setItem = Storage.prototype.setItem
      Object.defineProperty(window, '__languageWriteBlocked', { value: true, writable: true })
      Storage.prototype.setItem = function (storageKey, value) {
        if (storageKey === key && Reflect.get(window, '__languageWriteBlocked'))
          throw new Error('Language write unavailable')
        setItem.call(this, storageKey, value)
      }
    }, WEB_LANGUAGE_STORAGE_KEY)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const en = getShellCopy('en-US')
    const zh = getShellCopy('zh-CN')
    await page.goto(`http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`)
    await page.getByRole('button', { name: en.shell.settings, exact: true }).click()
    await page.getByRole('button', { name: en.general.group, exact: true }).click()
    await expect(page.getByText(en.general.readError('INVALID_PREFERENCE'), { exact: true })).toBeVisible()
    const environment = page.getByRole('radio', { name: en.general.options.system, exact: true })
    await environment.focus()
    await environment.press('End')
    const chinese = page.getByRole('radio', { name: '简体中文', exact: true })
    await expect(chinese).toBeFocused()
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
    await expect(page.getByText(zh.general.saveError, { exact: true })).toBeVisible()
    await expect(page.getByText(zh.general.saved, { exact: true })).toHaveCount(0)
    expect(await page.evaluate((key) => localStorage.getItem(key), WEB_LANGUAGE_STORAGE_KEY)).toBe(
      'unsupported-language',
    )
    await page.setViewportSize({ width: 320, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: 'artifacts/desktop-entry-matrix/language/production-offline-save-error-320.png' })
    await page.evaluate(() => Reflect.set(window, '__languageWriteBlocked', false))
    await page.getByRole('button', { name: zh.general.retrySave, exact: true }).click()
    await expect(page.getByText(zh.general.saved, { exact: true })).toBeVisible()
    await expect(chinese).toBeFocused()
    await chinese.focus()
    await chinese.press('Home')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US')
    await expect(environment).toBeFocused()
    await environment.press('ArrowRight')
    await expect(page.getByRole('radio', { name: 'English', exact: true })).toBeFocused()
    expect(await page.getByRole('radio').count()).toBe(3)
    expect(errors).toEqual([])
  } finally {
    await context.close()
  }
})

test('a real same-origin language change keeps the visible conversation, file identity and unsaved editor in another window', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-language-two-windows-'))
  const context = await browser.newContext({ locale: 'en-US' })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({
      root,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
      goalAutoContinue: false,
      budgetAutoContinue: false,
    })
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const en = getShellCopy('en-US')
    const zh = getShellCopy('zh-CN')
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base)
    await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
    await page
      .getByRole('textbox', { name: en.session.prompt.input, exact: true })
      .fill('Cross-window unsent conversation')
    await page.getByRole('button', { name: en.session.tools.files, exact: true }).click()
    const files = page.locator('.hbar-app-react-file-workspace')
    await files.getByRole('button', { name: 'browser-e2e.md', exact: true }).click()
    await files.getByRole('button', { name: en.files.edit, exact: true }).click()
    await files.getByRole('textbox', { name: 'browser-e2e.md', exact: true }).fill('# Unsaved cross-window file draft')
    const other = await context.newPage()
    other.on('pageerror', (error) => errors.push(error.message))
    await other.goto(base)
    await other.getByRole('button', { name: en.shell.settings, exact: true }).click()
    await other.getByRole('button', { name: en.general.group, exact: true }).click()
    await other.getByRole('radio', { name: '简体中文', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
    await expect(page.getByRole('textbox', { name: zh.session.prompt.input, exact: true })).toHaveText(
      'Cross-window unsent conversation',
    )
    await expect(files.getByRole('textbox', { name: 'browser-e2e.md', exact: true })).toHaveValue(
      '# Unsaved cross-window file draft',
    )
    await expect(files.getByRole('button', { name: zh.files.save, exact: true })).toBeEnabled()
    await expect(page.getByRole('heading', { level: 1, name: host.ready.sessionTitle, exact: true })).toBeVisible()
    await page.screenshot({
      path: 'artifacts/desktop-entry-matrix/language/production-cross-window-file-draft-1440.png',
    })
    await other.getByRole('radio', { name: 'English', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US')
    await expect(files.getByRole('textbox', { name: 'browser-e2e.md', exact: true })).toHaveValue(
      '# Unsaved cross-window file draft',
    )
    expect(await readFile(join(root, 'browser-e2e.md'), 'utf8')).toBe('# Browser file\n')
    expect((await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs).toEqual([])
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await removeOwnedFixture(root)
  }
})
