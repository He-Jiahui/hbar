import { expect, test, type Locator } from '@playwright/test'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const prefix = 'hbar-reading-return-'
async function cleanupFixture(root: string): Promise<void> {
  const exact = resolve(root)
  if (dirname(exact) !== resolve(tmpdir()) || !basename(exact).startsWith(prefix))
    throw new Error('Refusing to remove an unowned reading-return fixture')
  await rm(exact, { recursive: true, force: true })
}

async function readingAnchor(viewport: Locator, settled = false) {
  return viewport.evaluate(async (element, shouldSettle) => {
    const measure = () => {
      const box = element.getBoundingClientRect()
      const rows = [...element.querySelectorAll<HTMLElement>('[data-message-id]')]
      const visible = rows.find((row) => {
        const rect = row.getBoundingClientRect()
        return rect.bottom > box.top + element.clientTop && rect.top < box.bottom
      })
      return {
        id: visible?.dataset.messageId ?? null,
        offset: visible ? visible.getBoundingClientRect().top - box.top - element.clientTop : null,
        atEnd: element.scrollHeight - element.scrollTop - element.clientHeight < 48,
      }
    }
    if (!shouldSettle) return measure()
    let previous = ''
    let stable = 0
    // Wheel dispatch and deferred virtual measurements are asynchronous. Base
    // the leaving assertion on a settled reader, not on a moving intermediate frame.
    for (let frame = 0; frame < 30; frame++) {
      await new Promise<void>((done) => requestAnimationFrame(() => done()))
      const measured = measure()
      const key = JSON.stringify([measured, element.scrollHeight, element.clientWidth])
      stable = key === previous ? stable + 1 : 0
      if (stable >= 3) return measured
      previous = key
    }
    throw new Error('Reading geometry did not settle before navigation')
  }, settled)
}

test('reading earlier messages survives Settings and Files workbench returns without following the latest', async ({
  browser,
}, info) => {
  test.setTimeout(60_000)
  const root = await mkdtemp(join(tmpdir(), prefix))
  const context = await browser.newContext({
    locale: 'zh-CN',
    colorScheme: 'light',
    viewport: { width: 1440, height: 900 },
  })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, historyCount: 180, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    page.setDefaultTimeout(10_000)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const copy = getShellCopy('zh-CN')
    await page.goto(base)
    await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
    const input = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    const draft = '先读旧消息，再打开设置，回来应该继续读同一处。'
    await input.fill(draft)
    const viewport = page.locator('.lumen-conversation-messages')
    const readingTolerance = await page.evaluate(() =>
      Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
    )
    await expect(viewport.locator('[data-message-id]').first()).toBeVisible()
    await expect
      .poll(async () => viewport.evaluate((element) => element.scrollHeight > element.clientHeight * 2))
      .toBe(true)
    // A real wheel intent cancels the initial measured-end correction. Direct
    // scrollTop assignment can race that initial positioning, unlike user reading.
    await viewport.hover()
    await page.mouse.wheel(0, -1800)
    await expect.poll(async () => (await readingAnchor(viewport)).atEnd).toBe(false)
    await page.screenshot({ path: info.outputPath('reading-before-settings-1440.png') })
    const before = await readingAnchor(viewport, true)
    expect(before.id).not.toBeNull()
    expect(before.atEnd).toBe(false)
    await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
    await expect(viewport).toHaveCount(0)
    await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
    await expectComposerText(input, draft)
    await expect(viewport).toBeVisible()
    await page.screenshot({ path: info.outputPath('reading-after-settings-1440.png') })
    await expect.poll(async () => (await readingAnchor(viewport)).id).toBe(before.id)
    await expect(page.locator('.hbar-app-react-session-main')).toHaveAttribute('data-reading-restoring', 'false')
    await expect.poll(async () => (await readingAnchor(viewport)).atEnd).toBe(false)
    const after = await readingAnchor(viewport)
    // Preserve the original message and reading range, allowing sub-line
    // measurement changes instead of treating this as a pixel screenshot test.
    expect(Math.abs((after.offset ?? 0) - (before.offset ?? 0))).toBeLessThan(readingTolerance)
    await expect(page.getByText(copy.session.readingPositionUnavailable, { exact: true })).toHaveCount(0)

    // Reading a previously loaded page must survive a workbench which replaces
    // the entire conversation tree, not just a sibling tool drawer.
    const loadOlder = page.getByRole('button', { name: copy.session.loadOlder, exact: true })
    await loadOlder.click()
    await expect(viewport.locator('.lumen-conversation-virtual')).toHaveAttribute(
      'data-hbar-app-ui-message-count',
      '120',
    )
    await loadOlder.click()
    await expect(viewport.locator('.lumen-conversation-virtual')).toHaveAttribute(
      'data-hbar-app-ui-message-count',
      '180',
    )
    await viewport.hover()
    await page.mouse.wheel(0, -8000)
    await expect.poll(async () => (await readingAnchor(viewport)).atEnd).toBe(false)
    await page.getByRole('button', { name: copy.session.tools.files, exact: true }).click()
    const dock = page.locator('.hbar-app-react-file-workspace:not(.hbar-app-react-file-workbench)')
    await dock.getByRole('button', { name: 'browser-e2e.md', exact: true }).click()
    await page.screenshot({ path: info.outputPath('reading-before-workbench-1440.png') })
    const beforeWorkbench = await readingAnchor(viewport, true)
    expect(Number(beforeWorkbench.id?.replace('history-', ''))).toBeLessThan(121)
    await dock.getByRole('button', { name: copy.files.expandWorkbench, exact: true }).click()
    const workbench = page.locator('.hbar-app-react-file-workbench')
    await expect(workbench).toBeVisible()
    await expect(viewport).toHaveCount(0)
    await workbench.getByRole('button', { name: copy.files.returnToConversation, exact: true }).click()
    await expectComposerText(input, draft)
    await expect.poll(async () => (await readingAnchor(viewport)).id).toBe(beforeWorkbench.id)
    await expect(page.locator('.hbar-app-react-session-main')).toHaveAttribute('data-reading-restoring', 'false')
    await expect.poll(async () => (await readingAnchor(viewport)).atEnd).toBe(false)
    const afterWorkbench = await readingAnchor(viewport, true)
    expect(Math.abs((afterWorkbench.offset ?? 0) - (beforeWorkbench.offset ?? 0))).toBeLessThan(readingTolerance)
    await expect(page.getByText(copy.session.readingPositionUnavailable, { exact: true })).toHaveCount(0)
    await page.screenshot({ path: info.outputPath('reading-after-workbench-1440.png') })
    const beforeSwitch = await readingAnchor(viewport, true)

    const other = await createWorkspaceSessionCommandClient(host.client).execute(
      'session.create',
      {
        workspaceId: host.ready.workspaceId,
        title: '新会话 · 不继承其他会话读点',
      },
      { idempotencyKey: crypto.randomUUID() },
    )
    await page.getByRole('treeitem', { name: other.title, exact: true }).click()
    await expectComposerText(input, '')
    await expect.poll(async () => (await readingAnchor(viewport)).atEnd).toBe(true)
    await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
    await expectComposerText(input, draft)
    await expect.poll(async () => (await readingAnchor(viewport)).id).toBe(beforeSwitch.id)
    await expect(page.locator('.hbar-app-react-session-main')).toHaveAttribute('data-reading-restoring', 'false')
    expect((await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs).toHaveLength(0)
    expect(errors).toEqual([])
  } finally {
    try {
      await context.close()
    } finally {
      try {
        if (host) await stopWebSessionHost(host)
      } finally {
        await cleanupFixture(root)
      }
    }
  }
})
