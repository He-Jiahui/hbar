import { expect, test } from '@playwright/test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function removeOwnedLiteralFixture(root: string) {
  const target = await realpath(root)
  if (
    dirname(target).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
    !basename(target).startsWith('hbar-user-literal-')
  )
    throw new Error('Refusing non-owned literal fixture cleanup')
  await rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
}

test('operator text stays literal while assistant Markdown, Copy and Find remain coherent', async ({
  browser,
}, info) => {
  test.setTimeout(60_000)
  const root = await realpath(await mkdtemp(join(tmpdir(), 'hbar-user-literal-')))
  const context = await browser.newContext({
    locale: 'zh-CN',
    viewport: { width: 1440, height: 960 },
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
    const owned = host
    const origin = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${origin}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const copy = getShellCopy('zh-CN')
    const copyMessage = copy.session.messageActions.copyMessage
    if (!copyMessage) throw new Error('Host operator Copy label missing')
    await page.goto(origin)
    await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
    const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    const text =
      '# 保留我的原始输入\n**不要变成粗体** 和 `不是代码块`\n- 这不是列表\n\n  两个空格开头\nD:\\Git\\hbar\\src\\index.ts\n```ts\nconst value = "<tag>&amp;"\n```\n打开 https://example.invalid/docs，然后继续。'
    await prompt.fill(text)
    await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
    await expect
      .poll(async () =>
        (await owned.client.call('session.snapshot', { sessionId: owned.ready.sessionId })).runs.some(
          (run) => run.status === 'completed',
        ),
      )
      .toBe(true)
    const snapshot = await owned.client.call('session.snapshot', { sessionId: owned.ready.sessionId })
    const user = snapshot.messages.find(
      (message) =>
        message.role === 'user' && message.content.some((block) => block.type === 'text' && block.text === text),
    )
    if (!user) throw new Error('Canonical operator message missing')
    const row = page.locator(`article[data-message-id="${user.id}"]`)
    const literal = row.locator('.hbar-session-message-literal')
    await expect(literal).toHaveText(text)
    expect(await literal.textContent()).toBe(text)
    await expect(literal.locator('h1,strong,code,pre,ul,li')).toHaveCount(0)
    await expect(literal.getByRole('link')).toHaveAttribute('href', 'https://example.invalid/docs')
    await expect(page.locator('article[data-role="assistant"] strong').first()).toHaveText('不要变成粗体')
    await expect(page.locator('article[data-role="assistant"] a').first()).toHaveAttribute(
      'href',
      'https://example.invalid/docs',
    )
    await row.getByRole('button', { name: copyMessage, exact: true }).click()
    await expect(row.getByRole('status')).toHaveText(copy.session.messageActions.copied)
    expect((await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n')).toBe(text)
    await prompt.fill('保留这份未发送草稿')
    await page.screenshot({ path: info.outputPath('literal-wide.png') })
    await page.setViewportSize({ width: 320, height: 900 })
    await page.getByRole('button', { name: copy.session.find.entry, exact: true }).click()
    const find = page.getByRole('search', { name: copy.session.find.title, exact: true })
    await find.getByRole('searchbox', { name: copy.session.find.input, exact: true }).fill('**不要变成粗体**')
    await expect(find.getByRole('status')).toHaveText(copy.session.find.count(1, 1, false))
    await expect
      .poll(() =>
        page.evaluate(() =>
          [...(CSS.highlights.get('hbar-session-find-active') ?? [])].map((range) => range.toString()).join(''),
        ),
      )
      .toBe('**不要变成粗体**')
    expect(
      await literal.evaluate((node) => ({
        whiteSpace: getComputedStyle(node).whiteSpace,
        fits: node.scrollWidth <= node.clientWidth + 1,
      })),
    ).toEqual({ whiteSpace: 'pre-wrap', fits: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: info.outputPath('literal-narrow-find.png') })
    await find.getByRole('button', { name: copy.session.find.close, exact: true }).click()
    await expectComposerText(prompt, '保留这份未发送草稿')
    const assistantLink = page.locator('article[data-role="assistant"] a').first()
    await expect(assistantLink).toHaveAttribute('target', '_blank')
    await context.route('https://example.invalid/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<main>Owned local link destination</main>',
      }),
    )
    await assistantLink.scrollIntoViewIfNeeded()
    const originalUrl = page.url()
    const popupReady = page.waitForEvent('popup')
    await assistantLink.click()
    const popup = await popupReady
    await popup.waitForURL('https://example.invalid/docs')
    await popup.close()
    expect(page.url()).toBe(originalUrl)
    await expect(assistantLink).toBeFocused()
    await page.screenshot({ path: info.outputPath('assistant-url-narrow.png') })
    await expectComposerText(prompt, '保留这份未发送草稿')
    expect((await owned.client.call('session.snapshot', { sessionId: owned.ready.sessionId })).runs).toHaveLength(1)
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await removeOwnedLiteralFixture(root)
  }
})
