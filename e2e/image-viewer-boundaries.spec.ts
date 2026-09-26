import { expect, test, type Browser, type Page } from '@playwright/test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { sessionImageCopy } from '../apps/web/src/session-image-copy'
import { imageFile } from './support/image-file'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const output = 'artifacts/image-viewer-boundaries'
const origin = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 45133}`
const hostPort = Number(process.env.HBAR_E2E_HOST_PORT ?? 45134)
async function removeFixture(root: string) {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-image-boundary-'))
    throw new Error('Unsafe image boundary fixture target')
  await rm(target, { recursive: true, force: true })
}
async function fixture(
  browser: Browser,
  locale: ShellLocale,
  width: number,
  run: (page: Page, host: WebSessionHost) => Promise<void>,
) {
  await mkdir(output, { recursive: true })
  const root = await mkdtemp(join(tmpdir(), 'hbar-image-boundary-'))
  const context = await browser.newContext({ locale, viewport: { width, height: 900 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, port: hostPort, sessionCount: 2, goalAutoContinue: false })
    await context.addInitScript((language) => localStorage.setItem('hbar:web:language', language), locale)
    expect((await context.request.post(`${origin}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(origin)
    const copy = getShellCopy(locale)
    const sourceSession = page.locator(`[data-session-id="${host.ready.sessionId}"] .hbar-app-react-session-target`)
    await expect(sourceSession).toHaveCount(1)
    const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
    if (await show.isVisible()) await show.click()
    await sourceSession.click()
    const hide = page.getByRole('button', { name: copy.shell.hideSidebar, exact: true })
    if (width === 320 && (await hide.isVisible())) await hide.click()
    await expect(page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })).toHaveAttribute(
      'contenteditable',
      'true',
    )
    await run(page, host)
    const sessions = await host.client.call('session.list', { workspaceId: host.ready.workspaceId })
    for (const session of sessions.items)
      expect((await host.client.call('session.snapshot', { sessionId: session.id })).runs).toHaveLength(0)
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await removeFixture(root)
    await writeFile(
      `${output}/cleanup-${locale}.json`,
      JSON.stringify(
        {
          root,
          hostPid: host?.child.pid,
          removed: true,
          boundary:
            'Only the child process created by this fixture; no native/user/protected process queried or stopped.',
        },
        null,
        2,
      ),
    )
  }
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
}

test('twelve real images remain usable at 320px and a thirteenth drop is explicit without losing the draft', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  await fixture(browser, 'zh-CN', 320, async (page, host) => {
    const copy = getShellCopy('zh-CN')
    const images = sessionImageCopy('zh-CN')
    const composer = page.locator('.lumen-prompt-composer')
    const target = page.locator('.hbar-composer-attachment-target')
    const prompt = composer.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    const draft = '十二张图片保持原稿，不发送'
    await prompt.fill(draft)
    let uploads = 0
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/artifacts' && request.method() === 'POST') uploads++
    })
    const files = Array.from({ length: 12 }, (_, index) =>
      imageFile(index, `图片-${String(index + 1).padStart(2, '0')}.png`),
    )
    await composer.locator('input[type="file"]').setInputFiles(files)
    const tiles = composer.locator('.lumen-image-tile')
    await expect(tiles).toHaveCount(12)
    await expect(tiles.locator('img')).toHaveCount(12)
    expect(uploads).toBe(12)
    await expectComposerText(prompt, draft)
    await expect(composer.getByRole('button', { name: copy.session.prompt.addAttachment, exact: true })).toBeDisabled()
    const over = imageFile(12, '第十三张.png')
    const data = await page.evaluateHandle(
      (file) => {
        const transfer = new DataTransfer()
        transfer.items.add(new File([Uint8Array.from(file.bytes)], file.name, { type: file.mime }))
        return transfer
      },
      { name: over.name, mime: over.mimeType, bytes: [...over.buffer] },
    )
    await target.dispatchEvent('drop', { dataTransfer: data })
    await data.dispose()
    await expect(target.getByRole('alert')).toContainText(copy.session.attachments.error('ATTACHMENT_LIMIT'))
    await expect(tiles).toHaveCount(12)
    expect(uploads).toBe(12)
    await expectComposerText(prompt, draft)
    await page.screenshot({ path: `${output}/twelve-and-limit-zh-CN-320.png` })
    const first = files[0]
    if (!first) throw new Error('Missing first image')
    await composer.getByRole('button', { name: images.open(first.name), exact: true }).click()
    const dialog = page.getByRole('dialog', { name: images.gallery.title, exact: true })
    await expect(dialog).toBeVisible()
    const strip = dialog.locator('.lumen-image-gallery-strip')
    const buttons = strip.getByRole('button')
    await expect(buttons).toHaveCount(12)
    const sizes = await buttons.evaluateAll((nodes) =>
      nodes.map((node) => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })),
    )
    expect(sizes.every((size) => size.width >= 48 && size.height >= 48)).toBe(true)
    expect(await strip.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true)
    const visited: number[] = []
    for (let step = 0; step <= 12; step++) {
      const index = step % 12
      const file = files[index]
      if (!file) throw new Error('Missing image occurrence')
      await expect(dialog.getByText(images.gallery.position(index + 1, 12), { exact: true })).toBeVisible()
      const active = dialog.getByRole('button', { name: images.gallery.select(file.name), exact: true })
      await expect(active).toHaveAttribute('aria-pressed', 'true')
      await expect
        .poll(() =>
          active.evaluate((node) => {
            const box = node.getBoundingClientRect()
            const strip = node.parentElement?.getBoundingClientRect()
            return Boolean(strip && box.left >= strip.left - 1 && box.right <= strip.right + 1)
          }),
        )
        .toBe(true)
      await expect(dialog.locator('.lumen-image-gallery-media img')).toHaveAttribute('alt', file.name)
      await expect
        .poll(() =>
          dialog
            .locator('.lumen-image-gallery-media img')
            .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
        )
        .toBe(true)
      visited.push(index + 1)
      if (step === 11) await page.screenshot({ path: `${output}/gallery-last-zh-CN-320.png` })
      if (step < 12) await page.keyboard.press('ArrowRight')
    }
    await page.keyboard.press('ArrowLeft')
    await expect(dialog.getByText(images.gallery.position(12, 12), { exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await expectComposerText(prompt, draft)
    await expect(tiles).toHaveCount(12)
    expect(uploads).toBe(12)
    await noOverflow(page)
    expect((await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).messages).toHaveLength(0)
    await writeFile(
      `${output}/capacity-report.json`,
      JSON.stringify(
        {
          locale: 'zh-CN',
          width: 320,
          uploads,
          sizes,
          visited,
          thirteenthRejected: true,
          draftPreserved: true,
          runCount: 0,
        },
        null,
        2,
      ),
    )
  })
})

/** Valid PNG container/CRC with an invalid zlib stream: Host signature accepts it, actual decoder cannot. */
function undecodableImage() {
  const file = imageFile(20, 'damaged-image.png')
  const offset = 33
  const length = file.buffer.readUInt32BE(offset)
  expect(file.buffer.toString('ascii', offset + 4, offset + 8)).toBe('IDAT')
  file.buffer[offset + 8] = 0
  let crc = 0xffffffff
  for (const byte of file.buffer.subarray(offset + 4, offset + 8 + length)) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  file.buffer.writeUInt32BE((crc ^ 0xffffffff) >>> 0, offset + 8 + length)
  return file
}

test('real bad decoding is named and delayed authenticated reads cannot reopen after close/session change', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  await fixture(browser, 'en-US', 900, async (page, host) => {
    const copy = getShellCopy('en-US')
    const images = sessionImageCopy('en-US')
    const composer = page.locator('.lumen-prompt-composer')
    const prompt = composer.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    const draft = 'Keep this draft while an image read is delayed.'
    await prompt.fill(draft)
    const good = imageFile(30, 'good-image.png')
    const bad = undecodableImage()
    let uploads = 0
    let holdNext = false
    let finished = false
    const held: { release(): void; done: Promise<void> }[] = []
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/artifacts' && request.method() === 'POST') uploads++
    })
    await page.route('**/api/artifacts/*', async (route) => {
      if (!holdNext || route.request().method() !== 'GET') {
        await route.continue()
        return
      }
      holdNext = false
      const response = await route.fetch()
      const wait = Promise.withResolvers<void>()
      const done = Promise.withResolvers<void>()
      held.push({ release: () => wait.resolve(), done: done.promise })
      if (finished) wait.resolve()
      await wait.promise
      try {
        await route.fulfill({ response })
      } catch {
        /* Browser cancellation is expected after close; never fabricate success data. */
      } finally {
        done.resolve()
      }
    })
    try {
      await composer.locator('input[type="file"]').setInputFiles([good, bad])
      const badTile = composer
        .locator('.lumen-image-tile')
        .filter({ has: page.getByRole('button', { name: images.open(bad.name), exact: true }) })
      await expect(badTile.getByRole('alert')).toHaveText(images.error('DECODE_FAILED'))
      await expect(badTile).toContainText(bad.name)
      await expect(badTile.locator('img')).toHaveCount(0)
      const goodOpen = composer.getByRole('button', { name: images.open(good.name), exact: true })
      await expect(goodOpen.locator('img')).toBeVisible()
      const dialog = page.getByRole('dialog', { name: images.gallery.title, exact: true })
      await badTile.getByRole('button', { name: images.open(bad.name), exact: true }).click()
      await expect(dialog.getByRole('alert')).toHaveText(images.error('DECODE_FAILED'))
      await expect(dialog.locator('.lumen-image-gallery-name')).toHaveText(bad.name)
      await page.screenshot({ path: `${output}/bad-decode-en-US-900.png` })
      await page.keyboard.press('Escape')
      await expect(goodOpen.locator('img')).toBeVisible()
      const others = await host.client.call('session.list', { workspaceId: host.ready.workspaceId })
      const other = others.items.find((session) => session.id !== host.ready.sessionId)
      if (!other) throw new Error('Missing second isolated session')
      for (const switching of [false, true]) {
        const count = held.length
        holdNext = true
        await goodOpen.click()
        await expect(dialog.getByText(images.gallery.loading, { exact: true })).toBeVisible()
        await expect.poll(() => held.length).toBe(count + 1)
        await page.keyboard.press('Escape')
        await expect(dialog).not.toBeVisible()
        if (switching) {
          const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
          if (await show.isVisible()) await show.click()
          await page.locator(`[data-session-id="${other.id}"] .hbar-app-react-session-target`).click()
          await expect(page.getByRole('heading', { name: other.title, exact: true })).toBeVisible()
        }
        const delayed = held[count]
        if (!delayed) throw new Error('Missing actual delayed Host response')
        delayed.release()
        await delayed.done
        await page.evaluate(
          () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
        )
        await expect(dialog).not.toBeVisible()
        if (switching) {
          const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
          if (await show.isVisible()) await show.click()
          await page.locator(`[data-session-id="${host.ready.sessionId}"] .hbar-app-react-session-target`).click()
        }
        await expectComposerText(prompt, draft)
        await expect(goodOpen.locator('img')).toBeVisible()
      }
      await composer
        .getByRole('button', {
          name: copy.session.prompt.removeAttachment({ id: '', kind: 'image', name: bad.name }),
          exact: true,
        })
        .click()
      await expect(composer.locator('.lumen-image-tile')).toHaveCount(1)
      await goodOpen.click()
      await expect(dialog.locator('.lumen-image-gallery-media img')).toBeVisible()
      await expect(dialog.getByText(images.gallery.position(1, 1), { exact: true })).toBeVisible()
      await page.keyboard.press('Escape')
      await expectComposerText(prompt, draft)
      expect(uploads).toBe(2)
      await noOverflow(page)
      await writeFile(
        `${output}/late-report.json`,
        JSON.stringify(
          {
            locale: 'en-US',
            width: 900,
            uploads,
            heldReplies: held.length,
            badDecodeNamed: true,
            lateDidNotReopen: true,
            removedOnlyDraftItem: true,
            runCount: 0,
            historyBoundary:
              'This test submits no Run; immutable sent-image/history removal is covered by image-viewer.spec.ts.',
          },
          null,
          2,
        ),
      )
    } finally {
      finished = true
      holdNext = false
      for (const response of held) response.release()
    }
  })
})
