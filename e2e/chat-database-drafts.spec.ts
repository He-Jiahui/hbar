import { expect, test } from '@playwright/test'
import { createChatDatabaseCommandClient } from '@hbar/client'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { expectComposerText } from './support/composer-text'

async function removeFixture(root: string) {
  const exact = await realpath(root)
  if (
    dirname(exact).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
    !basename(exact).startsWith('hbar-database-drafts-')
  )
    throw new Error('Refusing cleanup outside owned draft fixture')
  await rm(exact, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

test('two real windows keep separate durable attachment owners, including a closed offline draft', async ({
  browser,
}, info) => {
  test.setTimeout(60_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-database-drafts-'))
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 960 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const copy = getShellCopy('zh-CN')
    const page = await context.newPage()
    await page.goto(base)
    await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
    const composer = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    await composer.fill('保留这个窗口的草稿附件')
    await page.locator('input[type="file"]').setInputFiles({
      name: 'offline-draft.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('durable two-window attachment'),
    })
    await expect(page.locator('.lumen-attachment-chip').filter({ hasText: 'offline-draft.txt' })).toBeVisible()
    const commands = createChatDatabaseCommandClient(host.client)
    await expect
      .poll(
        async () =>
          (await commands.execute('chatDatabase.draft.list', {})).items.filter(
            (owner) => owner.kind === 'session' && owner.artifactIds.length === 1,
          ).length,
      )
      .toBe(1)
    const original = (await commands.execute('chatDatabase.draft.list', {})).items.find(
      (owner) => owner.kind === 'session' && owner.artifactIds.length === 1,
    )
    if (!original) throw new Error('Missing first window owner')
    await expect
      .poll(async () =>
        page.evaluate(() =>
          Object.entries(localStorage).some(
            ([key, value]) =>
              key.startsWith('hbar:web:drafts:') &&
              key.endsWith(sessionStorage.getItem('hbar:web:window-owner') ?? '') &&
              value.includes('offline-draft.txt'),
          ),
        ),
      )
      .toBe(true)
    const popupPromise = page.waitForEvent('popup')
    await page.evaluate((url) => {
      window.open(url, '_blank')
    }, base)
    const popup = await popupPromise
    await popup.waitForLoadState()
    await popup.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
    const ownerKey = 'hbar:web:window-owner'
    await info.attach('owned-window-storage', {
      body: JSON.stringify(
        await popup.evaluate(() => ({
          opener: Boolean(window.opener),
          owner: sessionStorage.getItem('hbar:web:window-owner'),
          inherited: sessionStorage.getItem('hbar:web:window-inherited'),
          drafts: Object.fromEntries(
            Object.entries(localStorage).filter(([key]) => key.startsWith('hbar:web:drafts:')),
          ),
        })),
      ),
      contentType: 'application/json',
    })
    expect(await page.evaluate((key) => sessionStorage.getItem(key), ownerKey)).not.toBe(
      await popup.evaluate((key) => sessionStorage.getItem(key), ownerKey),
    )
    await expectComposerText(
      popup.getByRole('textbox', { name: copy.session.prompt.input, exact: true }),
      '保留这个窗口的草稿附件',
    )
    await expect(popup.locator('.lumen-attachment-chip').filter({ hasText: 'offline-draft.txt' })).toBeVisible()
    await expect
      .poll(
        async () =>
          (await commands.execute('chatDatabase.draft.list', {})).items.filter(
            (owner) => owner.kind === 'session' && owner.artifactIds.length === 1,
          ).length,
      )
      .toBe(2)
    const removeLabel = copy.session.prompt.removeAttachment({
      id: original.artifactIds[0] ?? '',
      kind: 'file',
      name: 'offline-draft.txt',
    })
    await popup.getByRole('button', { name: removeLabel, exact: true }).click()
    await expect
      .poll(
        async () =>
          (await commands.execute('chatDatabase.draft.list', {})).items.filter(
            (owner) => owner.kind === 'session' && owner.artifactIds.length === 1,
          ).length,
      )
      .toBe(1)
    expect(
      (await commands.execute('chatDatabase.draft.list', {})).items.find((owner) => owner.id === original.id)
        ?.artifactIds,
    ).toEqual(original.artifactIds)
    await page.close()
    await popup.reload()
    await popup.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
    await expectComposerText(
      popup.getByRole('textbox', { name: copy.session.prompt.input, exact: true }),
      '保留这个窗口的草稿附件',
    )
    expect(
      (await commands.execute('chatDatabase.draft.list', {})).items.find((owner) => owner.id === original.id)
        ?.artifactIds,
    ).toEqual(original.artifactIds)
    await expect.poll(async () => (await commands.execute('chatDatabase.inventory.get', {})).complete).toBe(true)
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await removeFixture(root)
  }
})
