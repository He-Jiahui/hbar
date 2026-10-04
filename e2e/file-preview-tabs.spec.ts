import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { createFileCommandClient, createGitCommandClient } from '@hbar/client'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { z } from 'zod'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const origin = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
const port = Number(process.env.HBAR_E2E_HOST_PORT ?? 4317)
const evidence = 'artifacts/file-preview-tabs/final'
const aPath = 'A-original-document-保留草稿.md'
const bPath = 'B-second-document-独立预览.md'
const firstPath = 'first-directory-原项目/readme.md'
const secondPath = 'second-directory-不同路径/readme.md'
const changedPath = 'both-index-and-worktree-同一文件.md'
const latePath = 'delayed-original-read-晚回复.md'
const readingA = 'long-reading-A-独立位置.md'
const readingB = 'long-reading-B-独立位置.md'
const pagedDiffPath = 'paged-diff-900-lines-独立页码.md'
const pagedText = (version: string) =>
  Array.from({ length: 900 }, (_, index) => `line ${index + 1} ${version}`).join('\n') + '\n'
const longText = (name: string) =>
  Array.from({ length: 220 }, (_, index) => `${name} original line ${index + 1} — 真实文件正文`).join('\n')
const aDisk = '# A original disk\n'
const aDraft = '# A unsaved draft\n切换或关闭入口不得丢失原稿\n'
const composerDraft = 'Original unsent composer — 文件页签不提交消息'
const requests = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    params: z
      .object({
        commandId: z.string().optional(),
        input: z.object({ workspaceId: z.string().optional(), path: z.string().optional() }).passthrough().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
type Copy = ReturnType<typeof getShellCopy>
interface Fixture {
  readonly root: string
  readonly context: BrowserContext
  readonly page: Page
  readonly host: WebSessionHost
  readonly locale: ShellLocale
  readonly copy: Copy
  readonly errors: string[]
  readonly writes: string[]
}

test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true })
})

async function removeFixture(root: string): Promise<void> {
  const resolved = await realpath(root)
  if (dirname(resolved) !== (await realpath(tmpdir())) || !basename(resolved).startsWith('hbar-file-preview-tabs-'))
    throw new Error('Refusing cleanup outside the captured file-preview fixture')
  await rm(resolved, { recursive: true, force: true })
}

async function start(
  browser: Browser,
  locale: ShellLocale,
  beforeNavigate?: (page: Page, workspaceId: string) => Promise<void>,
): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'hbar-file-preview-tabs-'))
  const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
  let host: WebSessionHost | undefined
  try {
    await mkdir(join(root, dirname(firstPath)), { recursive: true })
    await mkdir(join(root, dirname(secondPath)), { recursive: true })
    for (const [path, text] of [
      [aPath, aDisk],
      [bPath, '# B independent text\n'],
      [firstPath, '# First directory content\n'],
      [secondPath, '# Second directory content\n'],
      [changedPath, '# Committed original\n'],
      [latePath, '# Late original response\n'],
      [readingA, longText('A')],
      [readingB, longText('B')],
      [pagedDiffPath, pagedText('before')],
    ] as const)
      await writeFile(join(root, path), text)
    host = await startWebSessionHost({ root, port, goalAutoContinue: false })
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'ignore', windowsHide: true })
    git('add', aPath, bPath, firstPath, secondPath, changedPath, latePath, readingA, readingB, pagedDiffPath)
    git('commit', '-m', 'isolated real Host preview-tabs fixture')
    await writeFile(join(root, changedPath), '# Staged version\n')
    git('add', changedPath)
    await writeFile(join(root, changedPath), '# Working tree version\n')
    await writeFile(join(root, pagedDiffPath), pagedText('after'))
    expect((await context.request.post(`${origin}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    page.setDefaultTimeout(15_000)
    const errors: string[] = []
    const writes: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('websocket', (socket) =>
      socket.on('framesent', ({ payload }) => {
        if (typeof payload !== 'string') return
        const decoded: unknown = JSON.parse(payload)
        const request = requests.safeParse(decoded)
        const command = request.success ? request.data.params?.commandId : undefined
        if (command && ['run.submit', 'run.cancel', 'file.write'].includes(command)) writes.push(command)
      }),
    )
    await beforeNavigate?.(page, host.ready.workspaceId)
    await page.goto(origin)
    const copy = getShellCopy(locale)
    await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
    await page.getByRole('button', { name: copy.shell.hideSidebar, exact: true }).click()
    await page.getByRole('textbox', { name: copy.session.prompt.input, exact: true }).fill(composerDraft)
    await page.getByRole('button', { name: copy.session.tools.files, exact: true }).click()
    return { root, context, page, host, locale, copy, errors, writes }
  } catch (reason) {
    await context.close()
    if (host) {
      const captured = host
      await stopWebSessionHost(captured)
      await expect.poll(() => captured.child.exitCode !== null || captured.child.signalCode !== null).toBe(true)
      await removeFixture(root)
    }
    throw reason
  }
}

async function stop(fixture: Fixture): Promise<void> {
  await fixture.context.close()
  await stopWebSessionHost(fixture.host)
  await expect.poll(() => fixture.host.child.exitCode !== null || fixture.host.child.signalCode !== null).toBe(true)
  await removeFixture(fixture.root)
}

function files(fixture: Fixture): Locator {
  return fixture.page.locator('.hbar-app-react-file-workspace')
}
function preview(fixture: Fixture, path: string): Locator {
  return files(fixture).getByLabel(fixture.copy.files.textPreview(path), { exact: true })
}
async function expectSourceText(fixture: Fixture, path: string, text: string): Promise<void> {
  await files(fixture).getByRole('button', { name: fixture.copy.files.source, exact: true }).click()
  // Compare authored line spans only; gutter controls are not document text.
  await expect(preview(fixture, path).locator('[data-source-code]')).toHaveText(
    text.split('\n').map((line) => line || '\u200b'),
  )
}
function editor(fixture: Fixture, path: string): Locator {
  return files(fixture).getByRole('textbox', { name: path, exact: true })
}
async function navigator(fixture: Fixture): Promise<Locator> {
  const show = files(fixture).getByRole('button', { name: fixture.copy.files.showNavigator, exact: true })
  if (await show.isVisible()) await show.click()
  const region = files(fixture).getByRole('region', { name: fixture.copy.files.navigator, exact: true })
  await expect(region).toBeVisible()
  return region
}
async function openFile(fixture: Fixture, path: string): Promise<void> {
  const region = await navigator(fixture)
  await region.getByRole('combobox', { name: fixture.copy.files.changes.mode, exact: true }).selectOption('all')
  await region.getByRole('textbox', { name: fixture.copy.files.tree.filter, exact: true }).fill(path)
  await region.getByRole('button', { name: path, exact: true }).click()
  await expect(preview(fixture, path)).toBeVisible()
}
type PreviewKind = 'document' | 'working' | 'staged'
function previewTab(fixture: Fixture, path: string, kind: PreviewKind = 'document'): Locator {
  return files(fixture).getByRole('tab', { name: fixture.copy.files.previews.tab(path, kind), exact: true })
}
function documentTab(fixture: Fixture, path: string): Locator {
  return previewTab(fixture, path)
}
async function closePreview(fixture: Fixture, path: string, kind: PreviewKind = 'document'): Promise<void> {
  await files(fixture)
    .getByRole('button', { name: fixture.copy.files.previews.close(path, kind), exact: true })
    .click()
}
async function bulkClose(
  fixture: Fixture,
  path: string,
  kind: PreviewKind,
  scope: 'current' | 'others' | 'left' | 'right' | 'all',
  keyboard = false,
): Promise<void> {
  const tab = previewTab(fixture, path, kind)
  if (keyboard) {
    await tab.focus()
    await tab.press('Shift+F10')
  } else await tab.click({ button: 'right' })
  const menu = fixture.page.getByRole('menu', { name: fixture.copy.files.previews.menu(path, kind), exact: true })
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitem', { name: fixture.copy.files.previews.action(scope), exact: true }).click()
}
async function previewIdentity(fixture: Fixture, path: string, kind: PreviewKind = 'document'): Promise<string> {
  const controls = await previewTab(fixture, path, kind).getAttribute('aria-controls')
  if (!controls || !controls.startsWith('file-preview-panel-'))
    throw new Error('Preview has no public tabpanel identity')
  expect(z.string().uuid().safeParse(controls.slice('file-preview-panel-'.length)).success).toBe(true)
  return controls
}
async function openDiff(
  fixture: Fixture,
  path: string,
  kind: 'working' | 'staged',
  expectedText?: string,
): Promise<void> {
  const region = await navigator(fixture)
  await region.getByRole('combobox', { name: fixture.copy.files.changes.mode, exact: true }).selectOption('changed')
  await region.getByRole('button', { name: fixture.copy.files.changes.open(path), exact: true }).click()
  await files(fixture)
    .getByRole('button', {
      name: kind === 'working' ? fixture.copy.files.changes.workingTree : fixture.copy.files.changes.staged,
      exact: true,
    })
    .click()
  await expect(files(fixture).getByLabel(fixture.copy.files.changes.diffContent(path), { exact: true })).toContainText(
    expectedText ?? (kind === 'working' ? '+# Working tree version' : '+# Staged version'),
  )
}
async function screenshot(fixture: Fixture, name: string, width: number): Promise<void> {
  await fixture.page.setViewportSize({ width, height: width > 900 ? 960 : 844 })
  expect(await fixture.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  await fixture.page.screenshot({ path: `${evidence}/${name}-${fixture.locale}-${width}.png` })
}
async function noExecution(fixture: Fixture, expectedWrites: readonly string[] = []): Promise<void> {
  expect(
    (await fixture.host.client.call('session.snapshot', { sessionId: fixture.host.ready.sessionId })).runs,
  ).toHaveLength(0)
  expect(fixture.writes).toEqual(expectedWrites)
  expect(fixture.errors).toEqual([])
  await expectComposerText(
    fixture.page.getByRole('textbox', {
      name: fixture.copy.session.prompt.input,
      exact: true,
      includeHidden: true,
    }),
    composerDraft,
  )
}

async function scrollReader(fixture: Fixture, path: string, delta: number): Promise<number> {
  return scrollContent(fixture, preview(fixture, path), delta)
}
async function scrollContent(fixture: Fixture, content: Locator, delta: number): Promise<number> {
  await content.hover()
  await fixture.page.mouse.wheel(0, delta)
  await expect.poll(() => content.evaluate((element) => element.scrollTop)).toBeGreaterThan(100)
  return content.evaluate(async (element) => {
    let previous = element.scrollTop
    let stable = 0
    for (let frame = 0; frame < 120; frame++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const current = element.scrollTop
      stable = Math.abs(current - previous) < 1 ? stable + 1 : 0
      previous = current
      if (stable >= 4) return current
    }
    throw new Error('File reader did not settle after its actual wheel gesture')
  })
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`real document tabs retain exact paths, edit drafts and selection across four widths: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const fixture = await start(browser, locale)
    const { copy, host, root } = fixture
    try {
      await openFile(fixture, aPath)
      await files(fixture).getByRole('button', { name: copy.files.edit, exact: true }).click()
      await editor(fixture, aPath).fill(aDraft)
      await openFile(fixture, bPath)
      await expect(files(fixture).getByRole('tablist')).toBeVisible()
      await expect(documentTab(fixture, aPath)).toHaveAttribute('aria-selected', 'false')
      await expect(documentTab(fixture, bPath)).toHaveAttribute('aria-selected', 'true')
      await documentTab(fixture, aPath).click()
      await expect(editor(fixture, aPath)).toHaveValue(aDraft)
      await openFile(fixture, firstPath)
      await openFile(fixture, secondPath)
      await expect(files(fixture).getByRole('tab')).toHaveCount(4)
      await documentTab(fixture, firstPath).click()
      await expect(preview(fixture, firstPath)).toContainText('First directory content')
      await documentTab(fixture, secondPath).click()
      await expect(preview(fixture, secondPath)).toContainText('Second directory content')
      for (const width of [1440, 900, 390, 320]) {
        await documentTab(fixture, aPath).click()
        await expect(editor(fixture, aPath)).toHaveValue(aDraft)
        await screenshot(fixture, 'original-A-dirty', width)
        await documentTab(fixture, bPath).click()
        await expect(preview(fixture, bPath)).toContainText('B independent text')
        await screenshot(fixture, 'original-B-selected', width)
      }
      await files(fixture).getByRole('button', { name: copy.files.backToFiles, exact: true }).click()
      await expect(files(fixture).getByRole('tab')).toHaveCount(4)
      await expect(files(fixture).getByRole('tab', { selected: true })).toHaveCount(0)
      await documentTab(fixture, aPath).click()
      await expect(editor(fixture, aPath)).toHaveValue(aDraft)
      const aIdentity = await previewIdentity(fixture, aPath)
      await documentTab(fixture, aPath).press('Delete')
      await expect(documentTab(fixture, aPath)).toBeVisible()
      await expect(files(fixture).locator('.hbar-file-preview-feedback')).toContainText(
        copy.files.previews.blocked(aPath, 'dirty'),
      )
      await documentTab(fixture, bPath).click()
      await documentTab(fixture, bPath).press('Shift+F10')
      const menu = fixture.page.getByRole('menu', { name: copy.files.previews.menu(bPath, 'document'), exact: true })
      await expect(menu).toBeVisible()
      const alpha = await menu.evaluate((element) => {
        const color = getComputedStyle(element).backgroundColor
        const slash = /\/\s*([\d.]+)\s*\)$/.exec(color)
        if (slash?.[1]) return Number(slash[1])
        if (color.startsWith('rgba(')) return Number(color.slice(color.lastIndexOf(',') + 1, -1).trim())
        if (color.startsWith('rgb(') || color.startsWith('color(')) return 1
        if (color === 'transparent') return 0
        throw new Error(`Unrecognized computed menu color: ${color}`)
      })
      expect(alpha).toBe(1)
      await expect(menu).toHaveCSS('opacity', '1')
      await screenshot(fixture, 'opaque-preview-menu', 320)
      await menu.press('Escape')
      await expect(menu).toBeHidden()
      await expect(documentTab(fixture, bPath)).toBeFocused()
      await expect(files(fixture)).toBeVisible()
      await bulkClose(fixture, bPath, 'document', 'all', true)
      await expect(files(fixture).getByRole('tab')).toHaveCount(4)
      await expect(documentTab(fixture, bPath)).toHaveAttribute('aria-selected', 'true')
      await screenshot(fixture, 'dirty-bulk-all-protected', 320)
      await files(fixture).getByRole('button', { name: copy.files.previews.showBlocked, exact: true }).click()
      await expect(editor(fixture, aPath)).toHaveValue(aDraft)

      await documentTab(fixture, aPath).focus()
      await documentTab(fixture, aPath).press('ArrowRight')
      await expect(documentTab(fixture, bPath)).toBeFocused()
      await expect(documentTab(fixture, bPath)).toHaveAttribute('aria-selected', 'true')
      await documentTab(fixture, bPath).press('End')
      await expect(documentTab(fixture, secondPath)).toBeFocused()
      await expect(documentTab(fixture, secondPath)).toHaveAttribute('aria-selected', 'true')
      await documentTab(fixture, secondPath).press('Home')
      await expect(documentTab(fixture, aPath)).toBeFocused()
      await expect(editor(fixture, aPath)).toHaveValue(aDraft)
      await documentTab(fixture, aPath).press('ArrowLeft')
      await expect(documentTab(fixture, secondPath)).toBeFocused()
      await expect(documentTab(fixture, secondPath)).toHaveAttribute('aria-selected', 'true')
      await documentTab(fixture, secondPath).press('Home')
      await expect(editor(fixture, aPath)).toHaveValue(aDraft)
      const original = await createFileCommandClient(host.client).execute('file.read', {
        workspaceId: host.ready.workspaceId,
        path: aPath,
      })
      expect(original.text).toBe(aDisk)
      expect(await readFile(join(root, aPath), 'utf8')).toBe(aDisk)
      await fixture.page.setViewportSize({ width: 1440, height: 960 })
      await files(fixture).getByRole('button', { name: copy.files.save, exact: true }).click()
      await expect(files(fixture).getByRole('button', { name: copy.files.save, exact: true })).toBeDisabled()
      expect(await readFile(join(root, aPath), 'utf8')).toBe(aDraft)
      await documentTab(fixture, bPath).click()
      await closePreview(fixture, firstPath)
      await expect(documentTab(fixture, bPath)).toHaveAttribute('aria-selected', 'true')
      await closePreview(fixture, bPath)
      await expect(documentTab(fixture, secondPath)).toHaveAttribute('aria-selected', 'true')
      await closePreview(fixture, secondPath)
      await expect(files(fixture).getByRole('tablist')).toHaveCount(0)
      await expect(editor(fixture, aPath)).toHaveValue(aDraft)
      await closePreview(fixture, aPath)
      await expect(files(fixture).getByRole('region', { name: copy.files.navigator, exact: true })).toBeVisible()
      await expect(files(fixture).getByRole('tab')).toHaveCount(0)
      await openFile(fixture, aPath)
      await openFile(fixture, bPath)
      expect(await previewIdentity(fixture, aPath)).not.toBe(aIdentity)
      await documentTab(fixture, aPath).click()
      await expectSourceText(fixture, aPath, aDraft)
      await writeFile(join(root, bPath), '# External B refresh\n')
      await documentTab(fixture, bPath).click()
      await expectSourceText(fixture, bPath, '# External B refresh\n')
      await fixture.page.setViewportSize({ width: 320, height: 844 })
      const visibleNavigator = await navigator(fixture)
      await expect(files(fixture).locator('.hbar-file-reader')).toBeHidden()
      await closePreview(fixture, aPath)
      await expect(files(fixture).getByRole('tablist')).toHaveCount(0)
      await expect(visibleNavigator).toBeVisible()
      await expect(visibleNavigator.getByRole('textbox', { name: copy.files.tree.filter, exact: true })).toBeFocused()
      await expect(files(fixture).locator('.hbar-file-reader')).toBeHidden()
      await screenshot(fixture, 'hidden-reader-close-visible-focus', 320)
      await noExecution(fixture, ['file.write'])
      await writeFile(
        `${evidence}/documents-${locale}.json`,
        JSON.stringify(
          {
            actualHost: true,
            dirtyProtected: true,
            bulkAtomic: true,
            backgroundCloseKeptSelection: true,
            rightThenLeftFallback: true,
            reopenedIdentityChanged: true,
            cleanRefreshed: true,
            hiddenReaderCloseFocusedVisibleNavigator: true,
            originalComposer: true,
            runCount: 0,
            writes: fixture.writes,
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

  test(`file, worktree and staged refs survive expansion and captured bulk actions: ${locale}`, async ({ browser }) => {
    test.setTimeout(120_000)
    const fixture = await start(browser, locale)
    const { page, copy } = fixture
    try {
      await openFile(fixture, changedPath)
      await openDiff(fixture, changedPath, 'working')
      await openDiff(fixture, changedPath, 'staged')
      await expect(files(fixture).getByRole('tab')).toHaveCount(3)
      const identities = await Promise.all(
        (['document', 'working', 'staged'] as const).map((kind) => previewIdentity(fixture, changedPath, kind)),
      )
      expect(new Set(identities).size).toBe(3)
      await documentTab(fixture, changedPath).click()
      await expectSourceText(fixture, changedPath, '# Working tree version\n')
      await files(fixture).getByRole('button', { name: copy.files.expandWorkbench, exact: true }).click()
      await expect(page.locator('.hbar-app-react-file-workbench')).toBeVisible()
      await files(fixture).getByRole('button', { name: copy.files.returnToConversation, exact: true }).click()
      await expect(page.locator('.lumen-app-tool-drawer')).toHaveCount(0)
      // Back retires the Workbench tab under the existing public navigation
      // contract. Reopen the retained Files panel explicitly before expanding.
      await page.getByRole('button', { name: copy.session.tools.files, exact: true }).click()
      expect(
        await Promise.all(
          (['document', 'working', 'staged'] as const).map((kind) => previewIdentity(fixture, changedPath, kind)),
        ),
      ).toEqual(identities)
      await files(fixture).getByRole('button', { name: copy.files.expandWorkbench, exact: true }).click()
      await previewTab(fixture, changedPath, 'working').click()
      await expect(
        files(fixture).getByLabel(copy.files.changes.diffContent(changedPath), { exact: true }),
      ).toContainText('+# Working tree version')
      await files(fixture).getByRole('button', { name: copy.files.returnToConversation, exact: true }).click()
      await expect(page.locator('.lumen-app-tool-drawer')).toBeVisible()
      expect(
        await Promise.all(
          (['document', 'working', 'staged'] as const).map((kind) => previewIdentity(fixture, changedPath, kind)),
        ),
      ).toEqual(identities)
      for (const width of [1440, 900, 390, 320]) {
        await expect(
          files(fixture).getByRole('button', { name: copy.files.changes.workingTree, exact: true }),
        ).toBeEnabled()
        await screenshot(fixture, 'three-real-identities', width)
        await previewTab(fixture, changedPath, 'staged').click()
        await expect(
          files(fixture).getByLabel(copy.files.changes.diffContent(changedPath), { exact: true }),
        ).toContainText('+# Staged version')
        await previewTab(fixture, changedPath, 'working')
          .click()
          .catch(async (reason: unknown) => {
            const frames = await previewTab(fixture, changedPath, 'working').evaluate(async (element) => {
              const strip = element.closest('[role="tablist"]')
              if (!(strip instanceof HTMLElement)) return []
              const values: {
                frame: number
                x: number
                width: number
                stripWidth: number
                scrollWidth: number
                scrollLeft: number
                siblingButtons: number
              }[] = []
              for (let frame = 0; frame < 24; frame++) {
                await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
                const rect = element.getBoundingClientRect()
                values.push({
                  frame,
                  x: rect.x,
                  width: rect.width,
                  stripWidth: strip.clientWidth,
                  scrollWidth: strip.scrollWidth,
                  scrollLeft: strip.scrollLeft,
                  siblingButtons: strip.parentElement?.querySelectorAll(':scope > button').length ?? 0,
                })
              }
              return values
            })
            await writeFile(`${evidence}/unstable-tab-${locale}-${width}.json`, JSON.stringify(frames, null, 2))
            throw reason
          })
      }
      await page.setViewportSize({ width: 1440, height: 960 })
      await openFile(fixture, changedPath)
      await expect(files(fixture).getByRole('tab')).toHaveCount(3)
      await openFile(fixture, aPath)
      await openFile(fixture, bPath)
      await expect(files(fixture).getByRole('tab')).toHaveCount(5)
      const oldB = await previewIdentity(fixture, bPath)
      await bulkClose(fixture, bPath, 'document', 'current')
      await expect(files(fixture).getByRole('tab')).toHaveCount(4)
      await openFile(fixture, bPath)
      expect(await previewIdentity(fixture, bPath)).not.toBe(oldB)
      await previewTab(fixture, changedPath, 'working').click()
      await bulkClose(fixture, changedPath, 'working', 'left')
      await expect(files(fixture).getByRole('tab')).toHaveCount(4)
      await expect(documentTab(fixture, changedPath)).toHaveCount(0)
      await expect(previewTab(fixture, changedPath, 'working')).toHaveAttribute('aria-selected', 'true')
      await bulkClose(fixture, changedPath, 'staged', 'right')
      await expect(files(fixture).getByRole('tab')).toHaveCount(2)
      await expect(previewTab(fixture, changedPath, 'working')).toHaveAttribute('aria-selected', 'true')
      await previewTab(fixture, changedPath, 'staged').click()
      await bulkClose(fixture, changedPath, 'staged', 'others')
      await expect(files(fixture).getByRole('tablist')).toHaveCount(0)
      await expect(
        files(fixture).getByLabel(copy.files.changes.diffContent(changedPath), { exact: true }),
      ).toContainText('+# Staged version')
      await closePreview(fixture, changedPath, 'staged')
      await expect(files(fixture).getByRole('region', { name: copy.files.navigator, exact: true })).toBeVisible()
      await expect(files(fixture).getByRole('tab')).toHaveCount(0)
      await openFile(fixture, readingA)
      await expectSourceText(fixture, readingA, longText('A'))
      const aScroll = await scrollReader(fixture, readingA, 670)
      await openFile(fixture, readingB)
      await expectSourceText(fixture, readingB, longText('B'))
      const bScroll = await scrollReader(fixture, readingB, 310)
      expect(Math.abs(aScroll - bScroll)).toBeGreaterThan(100)
      await documentTab(fixture, readingA).click()
      await expect(documentTab(fixture, readingA)).toBeFocused()
      await expect
        .poll(() => preview(fixture, readingA).evaluate((element) => element.scrollTop))
        .toBeCloseTo(aScroll, 0)
      await screenshot(fixture, 'original-reading-A-position', 1440)
      await documentTab(fixture, readingB).click()
      await expect(documentTab(fixture, readingB)).toBeFocused()
      await expect
        .poll(() => preview(fixture, readingB).evaluate((element) => element.scrollTop))
        .toBeCloseTo(bScroll, 0)
      const hostDiff = await createGitCommandClient(fixture.host.client).execute('git.diff', {
        cwd: fixture.root,
        paths: [pagedDiffPath],
        cached: false,
      })
      const diffLines = hostDiff.diff.split('\n')
      expect(diffLines.length).toBeGreaterThan(1600)
      await openDiff(fixture, pagedDiffPath, 'working', '-line 1 before')
      await files(fixture).getByRole('button', { name: copy.files.changes.nextLines, exact: true }).click()
      const pageRange = copy.files.changes.linePage(401, 800, diffLines.length)
      await expect(files(fixture).getByText(pageRange, { exact: true })).toBeVisible()
      const content = files(fixture).getByLabel(copy.files.changes.diffContent(pagedDiffPath), { exact: true })
      const firstLine = diffLines[400]
      const lastLine = diffLines[799]
      if (!firstLine || !lastLine) throw new Error('The real Host diff did not include the expected page bounds')
      await expect(content).toContainText(firstLine)
      await expect(content).toContainText(lastLine)
      const diffScroll = await scrollContent(fixture, content, 420)
      await documentTab(fixture, readingB).click()
      await expectSourceText(fixture, readingB, longText('B'))
      await previewTab(fixture, pagedDiffPath, 'working').click()
      await expect(
        files(fixture).getByRole('button', { name: copy.files.changes.workingTree, exact: true }),
      ).toBeEnabled()
      await expect(files(fixture).getByText(pageRange, { exact: true })).toBeVisible()
      await expect(content).toContainText(firstLine)
      await expect(content).toContainText(lastLine)
      await expect.poll(() => content.evaluate((element) => element.scrollTop)).toBeCloseTo(diffScroll, 0)
      await screenshot(fixture, 'original-diff-page-two-position', 1440)
      await noExecution(fixture)
      await writeFile(
        `${evidence}/diff-workbench-${locale}.json`,
        JSON.stringify(
          {
            actualHost: true,
            threeDistinctIdentities: true,
            noDuplicate: true,
            expandWithoutInteractionBackClosed: true,
            workbenchPreviewInteractionBackDockOpen: true,
            originalIdentitiesRetained: true,
            bulkLeftRightOthers: true,
            finalCloseShowsList: true,
            independentReadingPositions: { a: aScroll, b: bScroll },
            independentDiffPage: { first: 401, last: 800, total: diffLines.length, scrollTop: diffScroll },
            runCount: 0,
            writes: fixture.writes,
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

test('real accepted pending and unknown saves cannot close or replay while selecting another preview', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const pendingWrites = new Set<string | number>()
  const held: { releaseUnknown: (() => void) | null } = { releaseUnknown: null }
  let writeCount = 0
  let readsAfterWrite = 0
  const fixture = await start(browser, 'en-US', async (page, workspaceId) => {
    await page.routeWebSocket('**/rpc', (socket) => {
      const server = socket.connectToServer()
      socket.onMessage((message) => {
        if (typeof message === 'string') {
          const decoded: unknown = JSON.parse(message)
          const request = requests.safeParse(decoded)
          if (
            request.success &&
            request.data.id !== undefined &&
            request.data.params?.input?.workspaceId === workspaceId &&
            request.data.params.input.path === aPath
          ) {
            if (request.data.params.commandId === 'file.write') {
              pendingWrites.add(request.data.id)
              writeCount++
            } else if (request.data.params.commandId === 'file.read' && writeCount > 0) readsAfterWrite++
          }
        }
        server.send(message)
      })
      server.onMessage((message) => {
        if (typeof message === 'string') {
          const decoded: unknown = JSON.parse(message)
          const response = requests.safeParse(decoded)
          const id = response.success ? response.data.id : undefined
          if (id !== undefined && pendingWrites.delete(id)) {
            held.releaseUnknown = () =>
              socket.send(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id,
                  error: { code: -32603, message: 'Fixture lost accepted file save reply', data: 'CONNECTION_CLOSED' },
                }),
              )
            return
          }
        }
        socket.send(message)
      })
    })
  })
  const { copy, page, root } = fixture
  try {
    await openFile(fixture, aPath)
    await files(fixture).getByRole('button', { name: copy.files.edit, exact: true }).click()
    await editor(fixture, aPath).fill(aDraft)
    await files(fixture).getByRole('button', { name: copy.files.save, exact: true }).click()
    await expect.poll(() => held.releaseUnknown !== null).toBe(true)
    expect(await readFile(join(root, aPath), 'utf8')).toBe(aDraft)
    await closePreview(fixture, aPath)
    await expect(files(fixture).locator('.hbar-file-preview-feedback')).toContainText(
      copy.files.previews.blocked(aPath, 'submitting'),
    )
    await expect(editor(fixture, aPath)).toHaveValue(aDraft)
    await screenshot(fixture, 'pending-close-protected', 1440)
    const release = held.releaseUnknown
    if (!release) throw new Error('The real Host save reply was not captured')
    release()
    held.releaseUnknown = null
    await expect(files(fixture).getByRole('button', { name: copy.files.reconcile, exact: true })).toBeVisible()
    await expect(editor(fixture, aPath)).toBeDisabled()
    await openFile(fixture, bPath)
    await closePreview(fixture, aPath)
    await expect(documentTab(fixture, bPath)).toHaveAttribute('aria-selected', 'true')
    await expect(files(fixture).locator('.hbar-file-preview-feedback')).toContainText(
      copy.files.previews.blocked(aPath, 'unknown'),
    )
    await bulkClose(fixture, bPath, 'document', 'all')
    await expect(files(fixture).getByRole('tab')).toHaveCount(2)
    await expect(documentTab(fixture, bPath)).toHaveAttribute('aria-selected', 'true')
    await files(fixture).getByRole('button', { name: copy.files.previews.showBlocked, exact: true }).click()
    await expect(editor(fixture, aPath)).toBeDisabled()
    await expect(editor(fixture, aPath)).toHaveValue(aDraft)
    await screenshot(fixture, 'unknown-close-protected', 320)
    await documentTab(fixture, bPath).click()
    await documentTab(fixture, aPath).click()
    expect(writeCount).toBe(1)
    expect(readsAfterWrite).toBe(0)
    await files(fixture).getByRole('button', { name: copy.files.reconcile, exact: true }).click()
    await expect(editor(fixture, aPath)).toBeEnabled()
    await expect(files(fixture).getByRole('button', { name: copy.files.save, exact: true })).toBeDisabled()
    expect(writeCount).toBe(1)
    expect(readsAfterWrite).toBe(1)
    await closePreview(fixture, aPath)
    await expect(preview(fixture, bPath)).toContainText('B independent text')
    await expect(files(fixture).getByRole('tablist')).toHaveCount(0)
    await page.setViewportSize({ width: 1440, height: 960 })
    await noExecution(fixture, ['file.write'])
    await writeFile(
      `${evidence}/unknown-save.json`,
      JSON.stringify(
        {
          actualHost: true,
          acceptedWriteProtectedPending: true,
          unknownCloseProtected: true,
          atomicBulk: true,
          originalWriteCount: writeCount,
          readOnlyReconciliations: readsAfterWrite,
          runCount: 0,
          errors: fixture.errors,
        },
        null,
        2,
      ),
    )
  } finally {
    held.releaseUnknown?.()
    await stop(fixture)
  }
})

test('closing a loading preview rejects its late reply; clean refresh failure retains prior content and retries', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const pending = new Map<string | number, 'hold' | 'fail'>()
  const held: { release: (() => void) | null } = { release: null }
  let heldOnce = false
  let failNextB = false
  const fixture = await start(browser, 'en-US', async (page, workspaceId) => {
    await page.routeWebSocket('**/rpc', (socket) => {
      const server = socket.connectToServer()
      socket.onMessage((message) => {
        if (typeof message === 'string') {
          const decoded: unknown = JSON.parse(message)
          const request = requests.safeParse(decoded)
          if (
            request.success &&
            request.data.id !== undefined &&
            request.data.params?.commandId === 'file.read' &&
            request.data.params.input?.workspaceId === workspaceId
          ) {
            if (request.data.params.input.path === aPath && !heldOnce) {
              heldOnce = true
              pending.set(request.data.id, 'hold')
            } else if (request.data.params.input.path === bPath && failNextB) {
              failNextB = false
              pending.set(request.data.id, 'fail')
            }
          }
        }
        server.send(message)
      })
      server.onMessage((message) => {
        if (typeof message === 'string') {
          const decoded: unknown = JSON.parse(message)
          const response = requests.safeParse(decoded)
          const id = response.success ? response.data.id : undefined
          const operation = id === undefined ? undefined : pending.get(id)
          if (id !== undefined && operation) {
            pending.delete(id)
            if (operation === 'hold') held.release = () => socket.send(message)
            else
              socket.send(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id,
                  error: { code: -32603, message: 'Fixture read temporarily failed', data: 'DISCONNECTED' },
                }),
              )
            return
          }
        }
        socket.send(message)
      })
    })
  })
  const { copy, root } = fixture
  try {
    await openFile(fixture, bPath)
    const region = await navigator(fixture)
    await region.getByRole('textbox', { name: copy.files.tree.filter, exact: true }).fill(aPath)
    await region.getByRole('button', { name: aPath, exact: true }).click()
    await expect.poll(() => held.release !== null).toBe(true)
    const oldIdentity = await previewIdentity(fixture, aPath)
    await closePreview(fixture, aPath)
    await expect(preview(fixture, bPath)).toContainText('B independent text')
    const release = held.release
    if (!release) throw new Error('Original file.read was not held')
    release()
    held.release = null
    // A subsequent real read visibly completes after the original reply was
    // delivered. No timer or private state bridge is used to claim application.
    await openFile(fixture, latePath)
    await expectSourceText(fixture, latePath, '# Late original response\n')
    await expect(files(fixture).getByRole('tab')).toHaveCount(2)
    await expect(documentTab(fixture, aPath)).toHaveCount(0)
    await openFile(fixture, aPath)
    expect(await previewIdentity(fixture, aPath)).not.toBe(oldIdentity)
    await expectSourceText(fixture, aPath, aDisk)
    await writeFile(join(root, bPath), '# Updated B after read retry\n')
    failNextB = true
    await documentTab(fixture, bPath).click()
    await expectSourceText(fixture, bPath, '# B independent text\n')
    await expect(files(fixture).getByRole('alert')).toHaveCount(1)
    await expect(files(fixture).getByRole('region', { name: bPath, exact: true }).getByRole('alert')).toContainText(
      copy.files.error('DISCONNECTED'),
    )
    await screenshot(fixture, 'read-failed-retains-content', 320)
    await files(fixture)
      .getByRole('region', { name: bPath, exact: true })
      .getByRole('button', { name: copy.files.refresh, exact: true })
      .click()
    await expectSourceText(fixture, bPath, '# Updated B after read retry\n')
    await expect(documentTab(fixture, bPath)).toHaveAttribute('aria-selected', 'true')
    await screenshot(fixture, 'read-retry-original-target', 1440)
    await noExecution(fixture)
    await writeFile(
      `${evidence}/late-read.json`,
      JSON.stringify(
        {
          actualHost: true,
          closedLoadingNotRecreated: true,
          reopenedIdentityChanged: true,
          priorContentOnReadError: true,
          explicitRetryOriginalPath: true,
          runCount: 0,
          writes: fixture.writes,
          errors: fixture.errors,
        },
        null,
        2,
      ),
    )
  } finally {
    held.release?.()
    await stop(fixture)
  }
})
