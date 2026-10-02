import { expect, test } from '@playwright/test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { z } from 'zod'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const prefix = 'hbar-message-files-'
async function cleanup(root: string) {
  const exact = resolve(root)
  if (dirname(exact) !== resolve(tmpdir()) || !basename(exact).startsWith(prefix))
    throw new Error('Refusing to remove an unowned message-files fixture')
  await rm(exact, { recursive: true, force: true })
}

test('message file references open the source session reader, reveal new locations and retain dirty edits', async ({
  browser,
}, info) => {
  const root = await mkdtemp(join(tmpdir(), prefix))
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 900 } })
  let host: WebSessionHost | undefined
  const held: { release: (() => void) | null } = { release: null }
  try {
    const path = 'src/reference.ts'
    const original = Array.from({ length: 120 }, (_, index) => `export const line${index + 1} = ${index + 1}`).join(
      '\n',
    )
    await mkdir(join(root, 'src'))
    await writeFile(join(root, path), original)
    host = await startWebSessionHost({
      root,
      historyCount: 2,
      historyText: `查看 src/reference.ts:2，再读 \`src/reference.ts:80:4\`，或者 [尾部](src/reference.ts:110)。缺失文件 missing.ts:2。`,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
    })
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    let holdNextRead = false
    const heldReads = new Set<string | number>()
    const envelope = z
      .object({
        id: z.union([z.string(), z.number()]).optional(),
        params: z
          .object({
            commandId: z.string().optional(),
            input: z.object({ path: z.string().optional() }).passthrough().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
    await page.routeWebSocket('**/rpc', (socket) => {
      const server = socket.connectToServer()
      socket.onMessage((message) => {
        if (typeof message === 'string') {
          const parsed = envelope.safeParse(JSON.parse(message))
          if (
            holdNextRead &&
            parsed.success &&
            parsed.data.id !== undefined &&
            parsed.data.params?.commandId === 'file.read' &&
            parsed.data.params.input?.path === path
          ) {
            holdNextRead = false
            heldReads.add(parsed.data.id)
          }
        }
        server.send(message)
      })
      server.onMessage((message) => {
        if (typeof message === 'string') {
          const parsed = envelope.safeParse(JSON.parse(message))
          if (parsed.success && parsed.data.id !== undefined && heldReads.delete(parsed.data.id)) {
            held.release = () => {
              socket.send(message)
              held.release = null
            }
            return
          }
        }
        socket.send(message)
      })
    })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const copy = getShellCopy('zh-CN')
    await page.goto(base)
    await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
    const composer = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    const draft = '从回复查看文件，不改变这份待发送原稿。'
    const message = page.locator('[data-message-id="history-2"]')
    const link = (line: number, column?: number) =>
      message.getByRole('link', {
        name: copy.session.fileReferences.open({ path, line, ...(column ? { column } : {}) }),
        exact: true,
      })
    await expect(link(2)).toBeVisible()
    await expect(page.locator('[data-hbar-composer-session]')).toHaveAttribute(
      'data-hbar-composer-session',
      host.ready.sessionId,
    )
    await expect(composer).toBeEnabled()
    // Use actual editing input after the source Session is mounted. A direct
    // contenteditable DOM fill during its initial replacement is not a draft ACK.
    await composer.focus()
    await page.keyboard.press('Control+a')
    await page.keyboard.insertText(draft)
    await expectComposerText(composer, draft)
    await page.screenshot({ path: info.outputPath('message-path-entry-1440.png') })
    await link(2).click()
    const files = page.locator('.hbar-app-react-file-workspace')
    const reader = files.getByLabel(copy.files.textPreview(path), { exact: true })
    await expect(reader.locator('[data-revealed="true"] [data-source-code="1"]')).toBeVisible()
    expect(
      await reader.locator('[data-revealed="true"]').evaluate((element) => getComputedStyle(element).backgroundColor),
    ).not.toBe('rgba(0, 0, 0, 0)')
    await page.screenshot({ path: info.outputPath('message-file-line-2-1440.png') })
    await files.getByRole('button', { name: copy.files.close, exact: true }).click()
    await expectComposerText(composer, draft)
    holdNextRead = true
    await link(80, 4).focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => held.release !== null).toBe(true)
    const otherControl = files.getByRole('button', { name: copy.files.showNavigator, exact: true })
    await otherControl.focus()
    await page.keyboard.press('Backspace')
    if (!held.release) throw new Error('The owned delayed file response was not captured')
    held.release()
    await expect(files.getByRole('button', { name: copy.files.edit, exact: true })).toBeEnabled()
    await expect(otherControl).toBeFocused()
    await expect(reader.locator('[data-revealed="true"] [data-source-code="79"]')).toHaveCount(0)
    await files.getByRole('button', { name: copy.files.close, exact: true }).click()
    await link(80, 4).focus()
    await page.keyboard.press('Enter')
    await expect(reader.locator('[data-revealed="true"] [data-source-code="79"]')).toBeVisible()
    await expect
      .poll(async () =>
        reader.evaluate((element) => {
          const row = element.querySelector('[data-revealed="true"]')?.getBoundingClientRect()
          const box = element.getBoundingClientRect()
          return Boolean(row && row.top >= box.top && row.bottom <= box.bottom)
        }),
      )
      .toBe(true)
    await expect(files.getByRole('tablist', { name: copy.files.previews.tabs, exact: true })).toHaveCount(0)
    await page.screenshot({ path: info.outputPath('message-file-line-80-1440.png') })
    await files.getByRole('button', { name: copy.files.expandWorkbench, exact: true }).click()
    await page.getByRole('tab', { name: host.ready.sessionTitle, exact: true }).click()
    await link(2).click()
    const workbench = page.locator('.hbar-app-react-file-workbench')
    await expect(
      workbench
        .getByLabel(copy.files.textPreview(path), { exact: true })
        .locator('[data-revealed="true"] [data-source-code="1"]'),
    ).toBeVisible()
    await expect(page.getByRole('tab')).toHaveCount(2)
    await workbench.getByRole('button', { name: copy.files.returnToConversation, exact: true }).click()
    await expect(page.getByRole('tab')).toHaveCount(1)
    await expectComposerText(composer, draft)
    await files.getByRole('button', { name: copy.files.edit, exact: true }).click()
    const editor = files.getByRole('textbox', { name: path, exact: true })
    const modified = `// retained unsaved draft\n${original}`
    await editor.fill(modified)
    await files.getByRole('button', { name: copy.files.close, exact: true }).click()
    await link(110).click()
    await expect(editor).toHaveValue(modified)
    await expect(editor).toBeFocused()
    await expect
      .poll(async () => editor.evaluate((element: HTMLTextAreaElement) => element.selectionStart))
      .toBe(modified.split('\n').slice(0, 109).join('\n').length + 1)
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(editor).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: info.outputPath('message-file-dirty-edit-390.png') })
    await files.getByRole('button', { name: copy.files.close, exact: true }).click()
    await expectComposerText(composer, draft)
    await message
      .getByRole('link', { name: copy.session.fileReferences.open({ path: 'missing.ts', line: 2 }), exact: true })
      .click()
    await expect(files.getByRole('alert').first()).toBeVisible()
    await files.getByRole('button', { name: copy.files.close, exact: true }).click()
    await expectComposerText(composer, draft)
    await page.keyboard.press('Control+f')
    await page.getByRole('searchbox', { name: copy.session.find.input, exact: true }).fill('missing.ts')
    await expect
      .poll(async () =>
        page.evaluate(() =>
          [...(CSS.highlights.get('hbar-session-find-active') ?? [])]
            .map((range) => (range instanceof Range ? range.toString() : ''))
            .join(''),
        ),
      )
      .toBe('missing.ts')
    await page.getByRole('button', { name: copy.session.find.close, exact: true }).click()
    expect(await readFile(join(root, path), 'utf8')).toBe(original)
    expect((await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs).toHaveLength(0)
    expect(errors).toEqual([])
  } finally {
    try {
      held.release?.()
      await context.close()
    } finally {
      try {
        if (host) await stopWebSessionHost(host)
      } finally {
        await cleanup(root)
      }
    }
  }
})
