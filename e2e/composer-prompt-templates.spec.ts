import { expect, test, type Page } from '@playwright/test'
import { createPromptTemplateCommandClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { globalFeatureCopy } from '../apps/web/src/global-feature-copy'
import { preSessionLaunchCopy } from '../apps/web/src/pre-session-launch-copy'
import { promptTemplateCopy } from '../apps/web/src/prompt-template-copy'
import { expectComposerText } from './support/composer-text'
import { openComposerTemplates } from './support/composer-templates-menu'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function removeFixture(root: string): Promise<void> {
  if (dirname(root) !== (await realpath(tmpdir())) || !basename(root).startsWith('hbar-composer-templates-'))
    throw new Error('Unexpected template fixture cleanup path')
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
}

async function chooseProject(page: Page, locale: ShellLocale, name: string): Promise<void> {
  const labels = preSessionLaunchCopy(locale).location
  await page.locator('.hbar-pre-session-location-picker > button').click()
  const dialog = page.getByRole('dialog', { name: labels.title, exact: true })
  if (await dialog.isVisible()) await dialog.getByRole('button').filter({ hasText: labels.directory }).click()
  const picker = page.getByRole('dialog', { name: labels.chooseDirectory, exact: true })
  await picker.locator('.hbar-pre-session-location-list').getByRole('button').filter({ hasText: name }).click()
  await dialog.getByRole('button', { name: labels.close, exact: true }).click()
}

for (const locale of ['zh-CN', 'en-US'] as const)
  test(`composer templates retain their session or first-send draft target without sending: ${locale}`, async ({
    browser,
  }, info) => {
    test.setTimeout(90_000)
    const root = await realpath(await mkdtemp(join(tmpdir(), 'hbar-composer-templates-')))
    const source = join(root, 'composer-project')
    const other = join(root, 'other-project')
    await mkdir(source)
    await mkdir(other)
    const context = await browser.newContext({ locale, colorScheme: locale === 'zh-CN' ? 'dark' : 'light' })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root: source,
        home: join(root, 'profile'),
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        goalAutoContinue: false,
        budgetAutoContinue: false,
      })
      const directory = createWorkspaceSessionCommandClient(host.client)
      const templates = createPromptTemplateCommandClient(host.client)
      const unrelated = await directory.execute('workspace.create', { path: other })
      const name = 'Review 🎉 — 长目标与模板变量 '.repeat(4)
      const body = '检查 {{topic}} 的变更并保留已验证成果。'
      const output = '检查 navigation 的变更并保留已验证成果。'
      await templates.execute(
        'promptTemplate.save',
        {
          workspaceId: host.ready.workspaceId,
          name,
          description: 'Local temporary template with a required variable',
          body,
          variables: [{ id: 'topic', label: 'Review topic', required: true, defaultValue: 'navigation' }],
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      const unrelatedName = 'Template in another project — 不属于当前工程'
      await templates.execute(
        'promptTemplate.save',
        { workspaceId: unrelated.id, name: unrelatedName, description: '', body: 'Other project', variables: [] },
        { idempotencyKey: crypto.randomUUID() },
      )
      const origin = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${origin}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      page.setDefaultTimeout(10_000)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const copy = getShellCopy(locale)
      const labels = promptTemplateCopy(locale)
      await page.goto(origin)
      const landing = page.locator('.hbar-pre-session-landing')
      const firstInput = landing.getByRole('textbox', { name: copy.preSession.prompt.input, exact: true })
      await landing.getByRole('button', { name: copy.session.addMenu.open, exact: true }).click()
      const menu = page.getByRole('dialog', { name: copy.session.addMenu.menu, exact: true })
      const disabled = menu.getByRole('button', { name: copy.session.addMenu.templates, exact: true })
      await expect(disabled).toBeDisabled()
      await expect(disabled).toHaveAttribute('title', copy.session.addMenu.templatesUnavailable)
      await page.keyboard.press('Escape')
      await expect(landing.getByRole('button', { name: copy.session.addMenu.open, exact: true })).toBeFocused()
      await chooseProject(page, locale, host.ready.workspaceName)
      const firstDraft = 'First-send draft — 还未创建会话'
      await firstInput.fill(firstDraft)
      await page.setViewportSize({ width: 320, height: 900 })
      await openComposerTemplates(page, copy.session.addMenu, info.outputPath('composer-add-first-send-320.png'))
      const feature = page.locator('[data-global-page="prompt-templates"]')
      await expect(feature.getByRole('button', { name: unrelatedName, exact: true })).toHaveCount(0)
      await feature.getByRole('button', { name, exact: true }).click()
      await expect(feature.locator('#prompt-template-target')).toHaveAttribute('data-value', /^pre-session:/)
      await feature.getByRole('button', { name: labels.apply, exact: true }).click()
      await expect(feature.getByText(labels.applied, { exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: info.outputPath('templates-first-send-320.png') })
      await feature.getByRole('button', { name: globalFeatureCopy(locale).back, exact: true }).click()
      await expectComposerText(firstInput, `${firstDraft}\n\n${output}`)
      await page.setViewportSize({ width: 1440, height: 900 })
      const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      if (await show.isVisible()) await show.click()
      const project = page.getByRole('treeitem', { name: host.ready.workspaceName, exact: true })
      if ((await project.getAttribute('aria-expanded')) === 'false') await project.press('ArrowRight')
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      const input = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const draft = 'Existing session draft — 保留未发送输入'
      await input.fill(draft)
      await openComposerTemplates(page, copy.session.addMenu, info.outputPath('composer-add-session-1440.png'))
      await feature.getByRole('button', { name, exact: true }).click()
      await expect(feature.locator('#prompt-template-target')).toHaveAttribute(
        'data-value',
        `session:${host.ready.sessionId}`,
      )
      await feature.getByRole('button', { name: labels.apply, exact: true }).click()
      await expect(feature.getByText(labels.applied, { exact: true })).toBeVisible()
      await page.screenshot({ path: info.outputPath('templates-session-1440.png') })
      await feature.getByRole('button', { name: globalFeatureCopy(locale).back, exact: true }).click()
      await expectComposerText(input, `${draft}\n\n${output}`)
      expect((await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs).toHaveLength(0)
      expect((await directory.execute('session.list', { workspaceId: host.ready.workspaceId })).items).toHaveLength(1)
      await stopWebSessionHost(host)
      host = undefined
      await expect(page.locator('.lumen-app-host-status')).toContainText(copy.shell.disconnected)
      await page.getByRole('button', { name: copy.session.addMenu.open, exact: true }).click()
      await expect(disabled).toBeDisabled()
      await expect(disabled).toHaveAttribute('title', copy.session.addMenu.templatesUnavailable)
      await page.keyboard.press('Escape')
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await removeFixture(root)
    }
  })
