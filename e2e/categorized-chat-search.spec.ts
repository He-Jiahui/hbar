import { expect, test, type Page, type Locator } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, delimiter, dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { HbarClient, createSessionSearchCommandClient } from '@hbar/client'
import { sessionSearchSources } from '@hbar/contracts/commands/session-search'
import { chatSearchCopy } from '../apps/web/src/chat-search-copy'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { lumenMenuForTrigger } from './support/lumen-controls'
import { stopOwnedWebSessionHostChild } from './support/web-session-host'

const prefix = 'hbar-categorized-search-'
const readySchema = z.object({
  url: z.url(),
  token: z.string().min(1),
  workspaceId: z.string(),
  workspaceName: z.string(),
  sessionId: z.string(),
  sessionTitle: z.string(),
  titleOnlyId: z.string(),
  archivedId: z.string(),
  hiddenWorkspaceId: z.string(),
  hiddenSessionId: z.string(),
  hiddenSessionTitle: z.string(),
})

async function start(root: string): Promise<{ child: ChildProcess; ready: z.output<typeof readySchema> }> {
  const executable =
    process.platform === 'win32'
      ? (process.env.PATH ?? '')
          .split(delimiter)
          .flatMap((directory) => [
            join(directory, 'bun.exe'),
            join(directory, 'node_modules', 'bun', 'bin', 'bun.exe'),
          ])
          .find(existsSync)
      : 'bun'
  if (!executable) throw new Error('Bun is unavailable')
  const child = spawn(executable, ['e2e/support/categorized-chat-search-host.ts'], {
    env: { ...process.env, HBAR_CATEGORIZED_SEARCH_ROOT: root },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })
  if (!child.stdout) throw new Error('Missing owned Host stdout')
  const lines = createInterface({ input: child.stdout })
  let diagnostic = ''
  child.stderr?.on('data', (value: Buffer) => {
    diagnostic = (diagnostic + value.toString()).slice(-16_384)
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const ready = await new Promise<z.output<typeof readySchema>>((done, reject) => {
      timer = setTimeout(() => reject(new Error(`Owned Host startup timed out: ${diagnostic}`)), 30_000)
      child.once('error', reject)
      child.once('exit', (code) => reject(new Error(`Owned Host exited ${code}: ${diagnostic}`)))
      lines.on('line', (line) => {
        try {
          const parsed = readySchema.safeParse(JSON.parse(line))
          if (parsed.success) done(parsed.data)
        } catch {
          /* Never expose credential-bearing startup data. */
        }
      })
    })
    return { child, ready }
  } catch (error) {
    await stopOwnedWebSessionHostChild(child)
    throw error
  } finally {
    clearTimeout(timer)
    lines.close()
  }
}

async function cleanup(child: ChildProcess | undefined, root: string) {
  if (child && child.exitCode === null && child.signalCode === null) {
    child.stdin?.write('stop\n')
    await expect.poll(() => child.exitCode, { timeout: 15_000 }).toBe(0)
  }
  const exact = await realpath(root)
  if (exact !== resolve(root) || dirname(exact) !== (await realpath(tmpdir())) || !basename(exact).startsWith(prefix))
    throw new Error('Refusing unowned fixture cleanup')
  await rm(exact, { recursive: true })
}

async function openSearch(page: Page, locale: ShellLocale) {
  const shell = getShellCopy(locale)
  const reveal = page.getByRole('button', { name: shell.shell.showSidebar, exact: true })
  if (await reveal.first().isVisible()) await reveal.first().click()
  await page.getByRole('button', { name: shell.shell.searchChats, exact: true }).click()
  const dialog = page.getByRole('dialog', { name: chatSearchCopy(locale).search, exact: true })
  await expect(dialog).toBeVisible()
  const input = dialog.getByRole('combobox', { name: chatSearchCopy(locale).search, exact: true })
  await expect(input).toBeFocused()
  return { dialog, input }
}

async function alignedHit(viewport: Locator, marker: string) {
  return viewport.evaluate((element, value) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    let node: Node | null
    while ((node = walker.nextNode())) {
      const index = node.textContent?.indexOf(value) ?? -1
      if (index < 0) continue
      const range = document.createRange()
      range.setStart(node, index)
      range.setEnd(node, index + value.length)
      const box = range.getBoundingClientRect()
      const viewportBox = element.getBoundingClientRect()
      return {
        visible: box.bottom > viewportBox.top && box.top < viewportBox.bottom,
        offset: box.top - viewportBox.top - element.clientTop,
      }
    }
    return null
  }, marker)
}

for (const [locale, width] of [
  ['zh-CN', 1440],
  ['en-US', 320],
] as const) {
  test(`categorized real Host search reaches exact older message, tool call and latest output: ${locale} ${width}`, async ({
    browser,
  }, info) => {
    test.setTimeout(120_000)
    const root = await realpath(await mkdtemp(join(tmpdir(), prefix)))
    const context = await browser.newContext({
      locale,
      colorScheme: width === 320 ? 'light' : 'dark',
      viewport: { width, height: 960 },
    })
    let child: ChildProcess | undefined
    let client: HbarClient | undefined
    try {
      const fixture = await start(root)
      child = fixture.child
      const { ready } = fixture
      client = new HbarClient(ready.url, ready.token)
      await client.connect()
      const commands = createSessionSearchCommandClient(client)
      await expect
        .poll(
          async () =>
            (await commands.execute('session.search', { query: 'needle', matchesPerSession: 10 })).incompleteReason,
          { timeout: 20_000 },
        )
        .toBeNull()
      expect((await context.request.post(`${ready.url}/auth/token`, { data: { token: ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      page.setDefaultTimeout(10_000)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const shell = getShellCopy(locale)
      const copy = chatSearchCopy(locale)
      await page.goto(ready.url)
      const reveal = page.getByRole('button', { name: shell.shell.showSidebar, exact: true })
      if (await reveal.first().isVisible()) await reveal.first().click()
      const project = page.getByRole('treeitem', { name: ready.workspaceName, exact: true })
      await expect(project).toBeVisible()
      if ((await project.getAttribute('aria-expanded')) !== 'true') await project.press('ArrowRight')
      await page.getByRole('treeitem', { name: ready.sessionTitle, exact: true }).click()
      const prompt = page.getByRole('textbox', { name: shell.session.prompt.input, exact: true })
      await prompt.fill('UNSENT_DRAFT_MARKER')
      const viewport = page.locator('.lumen-conversation-messages')

      let search = await openSearch(page, locale)
      await search.input.fill('needle')
      const all = search.dialog.getByRole('option')
      await expect(all).toHaveCount(6)
      await expect(search.dialog.locator(`[data-session-id="${ready.archivedId}"]`)).toHaveCount(0)
      for (const source of sessionSearchSources) {
        const row = search.dialog.locator(`[data-session-id="${ready.sessionId}"][data-result-source="${source}"]`)
        await expect(row).toHaveCount(1)
        await expect(row.locator('.hbar-chat-search-source')).toHaveText(copy.sources[source])
        const badge = await row.locator('.hbar-chat-search-source').boundingBox()
        const body = await row.locator('.hbar-chat-search-row-body').boundingBox()
        expect(badge && body && badge.x < body.x).toBe(true)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: info.outputPath(`search-all-${locale}-${width}.png`) })
      for (const source of sessionSearchSources) {
        const radio = search.dialog.getByRole('radio', { name: copy.scopes[source], exact: true })
        await radio.click()
        await expect(radio).toHaveAttribute('aria-checked', 'true')
        await expect(search.dialog.getByRole('option')).toHaveCount(source === 'title' ? 2 : 1)
        await expect(search.dialog.locator(`[data-result-source]:not([data-result-source="${source}"])`)).toHaveCount(0)
      }
      // First navigate from an initial page containing only later user inputs.
      await search.dialog.getByRole('radio', { name: copy.scopes.title, exact: true }).click()
      await search.dialog.locator(`[data-session-id="${ready.sessionId}"]`).click()
      await expect(search.dialog).toHaveCount(0)
      await expect.poll(async () => (await alignedHit(viewport, 'LATEST_OUTPUT_MARKER'))?.visible).toBe(true)
      search = await openSearch(page, locale)
      await search.input.fill('needle')
      await search.dialog.getByRole('radio', { name: copy.scopes.conversation, exact: true }).click()
      await search.dialog.getByRole('option').click()
      await expect(search.dialog).toHaveCount(0)
      await expect(page.locator('.hbar-app-react-session-main')).toHaveAttribute('data-reading-restoring', 'false')
      await expect.poll(async () => (await alignedHit(viewport, 'DIALOGUE_HIT_MARKER'))?.visible).toBe(true)
      await expect.poll(async () => Math.abs((await alignedHit(viewport, 'needle'))?.offset ?? 10000)).toBeLessThan(32)
      await expectComposerText(prompt, 'UNSENT_DRAFT_MARKER')
      await page.screenshot({ path: info.outputPath(`search-dialogue-target-${width}.png`) })

      for (const source of ['tool', 'file', 'patch'] as const) {
        search = await openSearch(page, locale)
        await search.input.fill('needle')
        await search.dialog.getByRole('radio', { name: copy.scopes[source], exact: true }).click()
        await expect(search.dialog.getByRole('option')).toHaveCount(1)
        await search.dialog.getByRole('option').click()
        await expect(search.dialog).toHaveCount(0)
        const call = viewport.locator(
          `.hbar-session-tool[data-tool-call-id="${source === 'tool' ? 'search-command' : 'search-edit'}"]`,
        )
        await expect(call.locator(':scope > button[aria-expanded]')).toHaveAttribute('aria-expanded', 'true')
        await expect(call).toBeInViewport()
        await expectComposerText(prompt, 'UNSENT_DRAFT_MARKER')
      }
      await page.screenshot({ path: info.outputPath(`search-patch-target-${width}.png`) })
      search = await openSearch(page, locale)
      await search.input.fill('needle')
      await search.dialog.getByRole('radio', { name: copy.scopes.title, exact: true }).click()
      await search.dialog.locator(`[data-session-id="${ready.sessionId}"]`).click()
      await expect(search.dialog).toHaveCount(0)
      await expect.poll(async () => (await alignedHit(viewport, 'LATEST_OUTPUT_MARKER'))?.visible).toBe(true)
      await expectComposerText(prompt, 'UNSENT_DRAFT_MARKER')

      const revealForHide = page.getByRole('button', { name: shell.shell.showSidebar, exact: true })
      if (await revealForHide.first().isVisible()) await revealForHide.first().click()
      const hidden = page.locator(`[data-workspace-id="${ready.hiddenWorkspaceId}"]`)
      const trigger = hidden.locator('.hbar-app-react-project-menu button')
      await trigger.click()
      await (
        await lumenMenuForTrigger(trigger)
      )
        .getByRole('menuitem', { name: shell.shell.organization.hide, exact: true })
        .click()
      await expect(hidden).toHaveCount(0)
      search = await openSearch(page, locale)
      await search.input.fill('hidden-key')
      await expect(search.dialog.getByRole('option')).toHaveCount(1)
      await search.input.press('Enter')
      await expect(search.dialog).toHaveCount(0)
      await expect(
        page.getByRole('region', { name: shell.session.conversationTitle(ready.hiddenSessionTitle), exact: true }),
      ).toBeVisible()
      await expect(viewport.locator('[data-message-id="search-hidden-message"]')).toBeInViewport()
      expect((await client.call('session.snapshot', { sessionId: ready.sessionId })).runs).toHaveLength(0)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      client?.disconnect()
      await cleanup(child, root)
    }
  })
}
