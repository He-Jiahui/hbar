import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { z } from 'zod'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const origin = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
const port = Number(process.env.HBAR_E2E_HOST_PORT ?? 4317)
const evidence = 'artifacts/desktop-final-entry-audit/navigation/sidebar-resize'
const path = 'original-sidebar-file-保持原文件编辑稿.md'
const disk = '# Original real file\nResize is not Save.\n'
const dirty = '# Original unsaved file\n调整侧栏不得覆盖、提交或丢失这份草稿\n'
const draftA = 'Original A composer — 原会话A未发送内容'
const draftB = 'Independent B composer — 原会话B未发送内容'
type Copy = ReturnType<typeof getShellCopy>
type Session = Readonly<{ id: string; title: string }>
interface Fixture {
  readonly root: string
  readonly context: BrowserContext
  readonly page: Page
  readonly host: WebSessionHost
  readonly copy: Copy
  readonly a: Session
  readonly b: Session
  readonly errors: string[]
  readonly forbiddenWrites: string[]
}
interface StorageObservation {
  readonly key: string
  readonly failed: boolean
}
interface StorageProbeWindow extends Window {
  readonly __hbarSidebarStorageObservations?: StorageObservation[]
}
const rpc = z.object({ params: z.object({ commandId: z.string().optional() }).passthrough().optional() }).passthrough()
const persisted = z.object({
  value: z.object({
    modules: z.array(z.object({ moduleId: z.string(), size: z.object({ preferredRem: z.number().optional() }) })),
  }),
})

test.beforeAll(() => mkdir(evidence, { recursive: true }))

async function removeRoot(root: string): Promise<void> {
  const resolved = await realpath(root)
  if (dirname(resolved) !== (await realpath(tmpdir())) || !basename(resolved).startsWith('hbar-sidebar-resize-'))
    throw new Error('Refusing cleanup outside the captured sidebar fixture')
  await rm(resolved, { recursive: true, force: true })
}

async function start(browser: Browser, locale: ShellLocale): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'hbar-sidebar-resize-'))
  const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
  let host: WebSessionHost | undefined
  try {
    await writeFile(join(root, path), disk)
    host = await startWebSessionHost({ root, port, sessionCount: 2, goalAutoContinue: false })
    const commands = createWorkspaceSessionCommandClient(host.client)
    const a = await commands.execute('session.rename', {
      sessionId: host.ready.sessionId,
      title:
        locale === 'zh-CN'
          ? '原会话A：足够长的工程任务名称和未提交文件'
          : 'Original A: long project task title and original unsaved file',
    })
    const sessions = await commands.execute('session.list', { workspaceId: host.ready.workspaceId, limit: 100 })
    const b = sessions.items.find((item) => item.id !== a.id)
    if (!b) throw new Error('Missing independent real session B')
    await context.addInitScript(() => {
      const original = Storage.prototype.setItem
      const observations: StorageObservation[] = []
      let rejectNext = false
      Object.defineProperty(window, '__hbarSidebarStorageObservations', { value: observations })
      window.addEventListener('hbar-test-reject-next-layout-write', () => {
        rejectNext = true
      })
      Storage.prototype.setItem = function (key: string, value: string) {
        if (this === window.localStorage && key.endsWith(':layout')) {
          const failed = rejectNext
          rejectNext = false
          observations.push({ key, failed })
          if (observations.length > 100) observations.shift()
          if (failed) throw new DOMException('Isolated fixture rejects one layout write', 'QuotaExceededError')
        }
        return original.call(this, key, value)
      }
    })
    expect((await context.request.post(`${origin}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    page.setDefaultTimeout(15_000)
    const errors: string[] = []
    const forbiddenWrites: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('websocket', (socket) =>
      socket.on('framesent', ({ payload }) => {
        if (typeof payload !== 'string') return
        const raw: unknown = JSON.parse(payload)
        const value = rpc.safeParse(raw)
        const id = value.success ? value.data.params?.commandId : undefined
        if (id && ['run.submit', 'run.cancel', 'file.write'].includes(id)) forbiddenWrites.push(id)
      }),
    )
    await page.goto(origin)
    const copy = getShellCopy(locale)
    const fixture = { root, context, page, host, copy, a, b, errors, forbiddenWrites }
    await showSidebar(fixture, true)
    await page.getByRole('button', { name: copy.shell.openSession(a.title), exact: true }).click()
    await showSidebar(fixture, true)
    return fixture
  } catch (error) {
    await context.close()
    if (host) {
      await stopWebSessionHost(host)
      const captured = host
      await expect.poll(() => captured.child.exitCode !== null || captured.child.signalCode !== null).toBe(true)
      await removeRoot(root)
    }
    throw error
  }
}
async function stop(fixture: Fixture): Promise<void> {
  await fixture.context.close()
  await stopWebSessionHost(fixture.host)
  await expect.poll(() => fixture.host.child.exitCode !== null || fixture.host.child.signalCode !== null).toBe(true)
  await removeRoot(fixture.root)
}
async function showSidebar({ page, copy }: Fixture, shown: boolean): Promise<void> {
  const trigger = page.getByRole('button', {
    name: shown ? copy.shell.showSidebar : copy.shell.hideSidebar,
    exact: true,
  })
  if (await trigger.isVisible()) await trigger.click()
  await expect(page.locator('[data-hbar-sidebar-expanded]')).toHaveAttribute(
    'data-hbar-sidebar-expanded',
    String(shown),
  )
}
function resizer({ page, copy }: Fixture): Locator {
  return page.getByRole('separator', { name: copy.sidebarLayout.resize, exact: true })
}
async function value(separator: Locator, attribute = 'aria-valuenow'): Promise<number> {
  const raw = await separator.getAttribute(attribute)
  if (raw === null || !Number.isFinite(Number(raw))) throw new Error(`Missing ${attribute}`)
  return Number(raw)
}
async function settled(separator: Locator, expected: number): Promise<void> {
  await expect.poll(() => value(separator)).toBeCloseTo(expected, 3)
  await expect(separator).toHaveAttribute('data-resize-status', 'idle')
}
async function storageObservations(page: Page): Promise<StorageObservation[]> {
  return page.evaluate(() => [...((window as StorageProbeWindow).__hbarSidebarStorageObservations ?? [])])
}
async function savedWidths(page: Page): Promise<{ sidebar: number | null; tool: number | null } | null> {
  const raw = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.endsWith(':layout'))
      .map((key) => localStorage.getItem(key)),
  )
  if (raw.length === 0) return null
  if (raw.length !== 1 || raw[0] === null) throw new Error('The isolated Host must have one saved layout namespace')
  const modules = persisted.parse(JSON.parse(raw[0] ?? '') as unknown).value.modules
  return {
    sidebar: modules.find((module) => module.moduleId === 'projects')?.size.preferredRem ?? null,
    tool: modules.find((module) => module.moduleId === 'session-tool')?.size.preferredRem ?? null,
  }
}
async function drag(
  page: Page,
  separator: Locator,
  offset: number,
  finish: 'up' | 'escape' | 'cancel' = 'up',
): Promise<void> {
  const rect = await separator.boundingBox()
  if (!rect) throw new Error('Missing visible sidebar separator')
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2)
  await page.mouse.down()
  await page.mouse.move(rect.x + rect.width / 2 + offset, rect.y + rect.height / 2, { steps: 5 })
  if (finish === 'escape') await page.keyboard.press('Escape')
  if (finish === 'cancel')
    await separator.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', bubbles: true })
  await page.mouse.up()
}
async function noOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
}
async function composerControlsAtMinimumWidth(fixture: Fixture, locale: ShellLocale): Promise<void> {
  const { page, copy } = fixture
  const toolbar = page.locator('.lumen-composer-toolbar')
  const model = toolbar.locator('.hbar-composer-model-trigger')
  await expect(model).toContainText('fixture')
  const geometry = await toolbar.evaluate((element, sendLabel) => {
    const targets = [
      ['model', element.querySelector('.hbar-composer-model-trigger')],
      ['thinking', element.querySelector('.hbar-composer-thinking-trigger')],
      ['budget', element.querySelector('.hbar-session-usage-trigger')],
      [
        'send',
        [...element.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === sendLabel),
      ],
    ] as const
    const controls = targets.map(([id, button]) => {
      if (!button) throw new Error(`Missing actual composer control: ${id}`)
      const box = button.getBoundingClientRect()
      const center = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
      const textBoxes: { left: number; right: number; top: number; bottom: number }[] = []
      const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue
        const range = document.createRange()
        range.selectNodeContents(node)
        for (const text of range.getClientRects())
          textBoxes.push({ left: text.left, right: text.right, top: text.top, bottom: text.bottom })
      }
      return {
        id,
        box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width },
        textBoxes,
        centerHitsOwn: !!center && (center === button || button.contains(center)),
      }
    })
    const overlaps: { a: string; b: string; width: number; height: number }[] = []
    for (let i = 0; i < controls.length; i++)
      for (let j = i + 1; j < controls.length; j++) {
        const a = controls[i]
        const b = controls[j]
        if (!a || !b) continue
        const width = Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left)
        const height = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top)
        if (width > 0.5 && height > 0.5) overlaps.push({ a: a.id, b: b.id, width, height })
      }
    return { mainWidth: element.closest('.lumen-app-main')?.getBoundingClientRect().width, controls, overlaps }
  }, copy.session.prompt.send)
  await writeFile(`${evidence}/composer-controls-${locale}-900.json`, JSON.stringify(geometry, null, 2))
  await page.screenshot({ path: `${evidence}/composer-controls-${locale}-900.png` })
  expect(geometry.mainWidth, 'Exercise the actual 20rem minimum main alongside Files and sidebar').toBeCloseTo(320, 0)
  expect(geometry.overlaps, 'Distinct composer buttons must not intersect').toEqual([])
  for (const control of geometry.controls) {
    expect(control.centerHitsOwn, `${control.id} center must hit its own button`).toBe(true)
    for (const text of control.textBoxes) {
      expect(text.left, `${control.id} text must stay inside its button`).toBeGreaterThanOrEqual(control.box.left - 1)
      expect(text.right, `${control.id} text must stay inside its button`).toBeLessThanOrEqual(control.box.right + 1)
    }
  }
  for (const selector of [
    '.hbar-composer-model-trigger',
    '.hbar-composer-thinking-trigger',
    '.hbar-session-usage-trigger',
  ]) {
    const trigger = toolbar.locator(selector)
    await trigger.click()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const popupId = (await trigger.getAttribute('aria-controls')) ?? (await trigger.getAttribute('popovertarget'))
    if (!popupId) throw new Error(`Missing actual popup association: ${selector}`)
    const popup = page.locator(`[id=${JSON.stringify(popupId)}]`)
    await expect(popup).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(popup).toBeHidden()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  }
  // Actionability only: never dispatch Send or create a paid/fixture Run.
  await toolbar.getByRole('button', { name: copy.session.prompt.send, exact: true }).click({ trial: true })
}
async function noExecution(fixture: Fixture): Promise<void> {
  for (const session of [fixture.a, fixture.b])
    expect((await fixture.host.client.call('session.snapshot', { sessionId: session.id })).runs).toHaveLength(0)
  expect(await readFile(join(fixture.root, path), 'utf8')).toBe(disk)
  expect(fixture.forbiddenWrites).toEqual([])
  expect(fixture.errors).toEqual([])
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`real sidebar resize persists independently and preserves original views at four widths: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const fixture = await start(browser, locale)
    const { page, copy } = fixture
    try {
      const separator = resizer(fixture)
      await expect(separator).toBeVisible()
      await expect(separator).toHaveAttribute('aria-orientation', 'vertical')
      const initial = await value(separator)
      expect(initial).toBe(17)
      const rem = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize))
      await separator.focus()
      await page.keyboard.press('ArrowRight')
      await settled(separator, initial + 32 / rem)
      await page.keyboard.press('ArrowLeft')
      await settled(separator, initial)
      await page.keyboard.press('Home')
      await settled(separator, await value(separator, 'aria-valuemin'))
      await page.keyboard.press('End')
      await settled(separator, await value(separator, 'aria-valuemax'))
      await page.keyboard.press('Enter')
      await settled(separator, initial)
      await page.keyboard.press('ArrowRight')
      await settled(separator, initial + 32 / rem)
      await separator.dblclick()
      await settled(separator, initial)
      await drag(page, separator, 64)
      const preferred = initial + 64 / rem
      await settled(separator, preferred)
      await expect.poll(() => savedWidths(page)).toEqual({ sidebar: preferred, tool: 24 })
      const beforeCancel = await storageObservations(page)
      await drag(page, separator, 24, 'escape')
      await settled(separator, preferred)
      await drag(page, separator, -32, 'cancel')
      await settled(separator, preferred)
      expect(await storageObservations(page)).toEqual(beforeCancel)
      await showSidebar(fixture, false)
      await expect(separator).toBeHidden()
      await showSidebar(fixture, true)
      await settled(separator, preferred)
      for (const width of [1440, 900, 390, 320]) {
        await page.setViewportSize({ width, height: 900 })
        if (width < 1024)
          await expect(page.getByRole('button', { name: copy.shell.showSidebar, exact: true })).toBeVisible()
        await showSidebar(fixture, true)
        if (width < 768) await expect(separator).toBeHidden()
        else await settled(separator, preferred)
        await noOverflow(page)
        await expect.poll(() => savedWidths(page)).toEqual({ sidebar: preferred, tool: 24 })
        await page.screenshot({ path: `${evidence}/sidebar-${locale}-${width}.png` })
        await showSidebar(fixture, false)
      }
      await page.setViewportSize({ width: 1440, height: 960 })
      await showSidebar(fixture, true)
      await page.reload()
      await showSidebar(fixture, true)
      await settled(separator, preferred)

      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      await page.getByRole('button', { name: copy.shell.openSession(fixture.a.title), exact: true }).click()
      await prompt.fill(draftA)
      await page.getByRole('button', { name: copy.session.tools.files, exact: true }).click()
      const files = page.locator('.hbar-app-react-file-workspace')
      await files.getByRole('button', { name: path, exact: true }).click()
      await files.getByRole('button', { name: copy.files.edit, exact: true }).click()
      const editor = files.getByRole('textbox', { name: path, exact: true, includeHidden: true })
      await editor.fill(dirty)
      const tool = page.getByRole('separator', { name: copy.toolLayout.resize, exact: true })
      await expect(tool).toBeVisible()
      const previousTool = await value(tool)
      await tool.focus()
      await page.keyboard.press('ArrowLeft')
      await settled(tool, previousTool + 32 / rem)
      await separator.focus()
      await page.keyboard.press('Home')
      await settled(separator, 12)
      await expect.poll(() => savedWidths(page)).toEqual({ sidebar: 12, tool: previousTool + 32 / rem })
      await expect(editor).toHaveValue(dirty)
      await page.getByRole('button', { name: copy.shell.openSession(fixture.b.title), exact: true }).click()
      await expect(files).toHaveCount(0)
      await prompt.fill(draftB)
      await page.getByRole('button', { name: copy.shell.openSession(fixture.a.title), exact: true }).click()
      await expect(editor).toHaveValue(dirty)
      await expectComposerText(prompt, draftA)
      await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
      await expect(page.getByRole('heading', { name: copy.settings.pageTitle, exact: true })).toBeVisible()
      await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
      await expect(editor).toHaveValue(dirty)
      await expectComposerText(prompt, draftA)
      await page.getByRole('button', { name: copy.shell.status, exact: true }).click()
      await expect(page.getByRole('heading', { name: copy.status.title, exact: true })).toBeVisible()
      await page.getByRole('button', { name: copy.status.close, exact: true }).click()
      await expect(editor).toHaveValue(dirty)
      for (const width of [1440, 900, 390, 320]) {
        await page.setViewportSize({ width, height: 900 })
        await showSidebar(fixture, true)
        await expect(editor).toHaveValue(dirty)
        await noOverflow(page)
        await page.screenshot({ path: `${evidence}/original-files-sidebar-${locale}-${width}.png` })
        if (width === 900) await composerControlsAtMinimumWidth(fixture, locale)
        await showSidebar(fixture, false)
        await expect(editor).toBeVisible()
        await expect(editor).toHaveValue(dirty)
      }
      await files.getByRole('button', { name: copy.files.close, exact: true }).click()
      await expectComposerText(prompt, draftA)
      await page.setViewportSize({ width: 1440, height: 960 })
      await showSidebar(fixture, true)
      await page.getByRole('button', { name: copy.shell.openSession(fixture.b.title), exact: true }).click()
      await expectComposerText(prompt, draftB)
      await expect.poll(() => savedWidths(page)).toEqual({ sidebar: 12, tool: previousTool + 32 / rem })
      for (const width of [390, 320]) {
        await page.setViewportSize({ width: 1440, height: 960 })
        await showSidebar(fixture, true)
        await separator.focus()
        await expect(separator).toBeFocused()
        await page.setViewportSize({ width, height: 900 })
        await expect(page.getByRole('button', { name: copy.shell.showSidebar, exact: true })).toBeVisible()
        const readFocus = () =>
          page.evaluate(() => {
            const element = document.activeElement
            const rect = element?.getBoundingClientRect()
            return {
              tag: element?.tagName ?? null,
              role: element?.getAttribute('role') ?? null,
              label: element?.getAttribute('aria-label') ?? null,
              visible: !!rect && rect.width > 0 && rect.height > 0 && !element?.closest('[inert], [hidden]'),
            }
          })
        try {
          await expect
            .poll(
              async () => {
                const current = await readFocus()
                return current.tag !== null && current.tag !== 'BODY' && current.visible
              },
              { message: 'The vanished sidebar separator must restore visible non-BODY focus' },
            )
            .toBe(true)
        } finally {
          await writeFile(
            `${evidence}/narrow-focus-${locale}-${width}.json`,
            JSON.stringify(await readFocus(), null, 2),
          )
          await page.screenshot({ path: `${evidence}/narrow-focus-${locale}-${width}.png` })
        }
        const focus = await readFocus()
        expect(focus.tag, 'A disappearing sidebar separator must hand focus to an available control').not.toBe('BODY')
        expect(focus.visible).toBe(true)
        await expect(separator).toBeHidden()
        await expectComposerText(prompt, draftB)
      }
      await noExecution(fixture)
      await writeFile(
        `${evidence}/flow-${locale}.json`,
        JSON.stringify(
          {
            initial,
            preferred,
            saved: await savedWidths(page),
            keyboard: true,
            pointer: true,
            cancelledWithoutSave: true,
            reloaded: true,
            originalDrafts: true,
            originalFileDirty: true,
            noRun: true,
            errors: fixture.errors,
          },
          null,
          2,
        ),
      )
    } finally {
      await stop(fixture)
    }
  })

  test(`a rejected sidebar width save stays local and has an explicit original retry: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(60_000)
    const fixture = await start(browser, locale)
    const { page, copy } = fixture
    try {
      const separator = resizer(fixture)
      await expect(separator).toBeVisible()
      const initial = await value(separator)
      const rem = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize))
      const before = await storageObservations(page)
      const previous = await savedWidths(page)
      await page.evaluate(() => window.dispatchEvent(new Event('hbar-test-reject-next-layout-write')))
      await separator.focus()
      await page.keyboard.press('ArrowRight')
      const retry = page.getByRole('button', { name: copy.sidebarLayout.retry, exact: true })
      await expect(retry).toBeVisible()
      await expect(
        page.getByRole('alert').filter({ hasText: copy.sidebarLayout.failed('PERSISTENCE_FAILED') }),
      ).toBeVisible()
      await expect.poll(() => value(separator)).toBe(initial)
      expect(await savedWidths(page)).toEqual(previous)
      const rejected = await storageObservations(page)
      expect(rejected.slice(before.length)).toHaveLength(1)
      expect(rejected.at(-1)?.failed).toBe(true)
      await page.screenshot({ path: `${evidence}/save-failed-${locale}-1440.png` })
      if (locale === 'zh-CN') {
        await page.setViewportSize({ width: 320, height: 900 })
        await expect(page.getByRole('button', { name: copy.shell.showSidebar, exact: true })).toBeVisible()
        await showSidebar(fixture, true)
        await expect(separator).toBeHidden()
        await expect(retry).toBeVisible()
        await noOverflow(page)
        await page.screenshot({ path: `${evidence}/save-failed-${locale}-320.png` })
      }
      await retry.click()
      await expect(retry).toHaveCount(0)
      await expect.poll(() => savedWidths(page)).toEqual({ sidebar: initial + 32 / rem, tool: 24 })
      const recovered = await storageObservations(page)
      expect(recovered.slice(before.length)).toHaveLength(2)
      expect(recovered.at(-1)?.failed).toBe(false)
      await page.setViewportSize({ width: 1440, height: 960 })
      await writeFile(
        `${evidence}/retry-result-${locale}.json`,
        JSON.stringify(
          {
            saved: await savedWidths(page),
            actualWidth: await value(separator),
            sharedStatus: await separator.getAttribute('data-resize-status'),
            visibleRetryCount: await retry.count(),
            recovery: locale === 'en-US' ? '1440 without remount' : '320 then 1440',
          },
          null,
          2,
        ),
      )
      await page.screenshot({ path: `${evidence}/retry-result-${locale}-1440.png` })
      await settled(separator, initial + 32 / rem)
      await page.reload()
      await showSidebar(fixture, true)
      await settled(separator, initial + 32 / rem)
      await noExecution(fixture)
      await writeFile(
        `${evidence}/save-failure-${locale}.json`,
        JSON.stringify(
          {
            injected: 'One isolated localStorage layout write rejection, not Host failure',
            rejected: rejected.slice(before.length),
            recovered: recovered.slice(before.length),
            manualRetryOnly: true,
            saved: await savedWidths(page),
            errors: fixture.errors,
          },
          null,
          2,
        ),
      )
    } finally {
      await stop(fixture)
    }
  })
}
