import { expect, test, type Locator, type Page } from '@playwright/test'
import { createSettingsCommandClient } from '@hbar/client'
import { encodePath } from '@hbar/schema-core'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { z } from 'zod'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const origin = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
const hostPort = Number(process.env.HBAR_E2E_HOST_PORT ?? 4317)
const output = 'artifacts/settings-content-recovery/browser'
const modelPath = encodePath([{ kind: 'field', name: 'provider.model' }])
const thinkingPath = encodePath([{ kind: 'field', name: 'provider.thinkingLevel' }])
const rpcSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    method: z.string().optional(),
    params: z.object({ commandId: z.string().optional() }).passthrough().optional(),
  })
  .passthrough()
const querySchema = z.object({
  id: z.union([z.string(), z.number()]),
  method: z.literal('schema.content.query'),
  params: z
    .object({
      callbackId: z.string(),
      request: z
        .object({
          formId: z.string(),
          formRevision: z.number(),
          scope: z.object({ kind: z.string(), id: z.string().optional() }),
          dependencies: z.record(z.string(), z.unknown()),
        })
        .passthrough(),
    })
    .passthrough(),
})
type Read = z.output<typeof querySchema>
type Copy = ReturnType<typeof getShellCopy>

/** Only an isolated read fails or has its real Host response delayed; successful data is never invented. */
async function observeReads(page: Page) {
  const reads: Read[] = []
  const writes: string[] = []
  let failNext = false
  let holdNext = false
  let heldId: string | number | null = null
  let release: (() => void) | null = null
  let failures = 0
  await page.routeWebSocket('**/rpc', (socket) => {
    const remote = socket.connectToServer()
    socket.onMessage((message) => {
      const raw: unknown = typeof message === 'string' ? JSON.parse(message) : null
      const rpc = rpcSchema.safeParse(raw)
      const command = rpc.success ? rpc.data.params?.commandId : undefined
      if (
        command &&
        ['settings.apply', 'settings.set', 'settings.unset', 'run.submit', 'provider.upsert'].includes(command)
      )
        writes.push(command)
      const query = querySchema.safeParse(raw)
      if (query.success) {
        reads.push(query.data)
        if (reads.length > 100) throw new Error('Unexpected unbounded settings option reads')
        if (query.data.params.callbackId === 'settings.getThinkingLevels') {
          if (failNext) {
            failNext = false
            failures += 1
            socket.send(
              JSON.stringify({
                jsonrpc: '2.0',
                id: query.data.id,
                error: { code: -32603, message: 'Isolated read-only failure', data: 'READ_FAILED' },
              }),
            )
            return
          }
          if (holdNext) {
            holdNext = false
            heldId = query.data.id
          }
        }
      }
      remote.send(message)
    })
    remote.onMessage((message) => {
      const raw: unknown = typeof message === 'string' ? JSON.parse(message) : null
      const rpc = rpcSchema.safeParse(raw)
      if (rpc.success && heldId !== null && rpc.data.id === heldId) {
        release = () => socket.send(message)
        return
      }
      socket.send(message)
    })
  })
  return {
    reads,
    writes,
    failures: () => failures,
    fail: () => {
      failNext = true
    },
    hold: () => {
      holdNext = true
    },
    hasHeldResponse: () => release !== null,
    release: () => {
      const send = release
      if (!send) throw new Error('The real Host response has not arrived')
      release = null
      heldId = null
      send()
    },
    thinking: () => reads.filter((read) => read.params.callbackId === 'settings.getThinkingLevels'),
  }
}

function fields(page: Page, copy: Copy) {
  const modelLabel = copy.settings.resolve('i18n:settings.provider.model.label')
  const thinkingLabel = copy.settings.resolve('i18n:settings.provider.thinkingLevel.label')
  const model = page
    .locator('.hbar-schema-form-field')
    .filter({ has: page.locator(`[id="hbar-schema-field-${modelPath}"]`) })
  const thinking = page
    .locator('.hbar-schema-form-field')
    .filter({ has: page.locator(`[id="hbar-schema-field-${thinkingPath}"]`) })
  return {
    model,
    thinking,
    modelInput: page.locator(`[id="hbar-schema-field-${modelPath}"]`),
    thinkingInput: page.locator(`[id="hbar-schema-field-${thinkingPath}"]`),
    modelOptions: model.getByRole('button', { name: copy.settings.form.openOptions(modelLabel), exact: true }),
    thinkingOptions: thinking.getByRole('button', { name: copy.settings.form.openOptions(thinkingLabel), exact: true }),
  }
}

async function screenshot(page: Page, locale: ShellLocale, state: string, widths = [1440, 320]) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 800 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: `${output}/${locale}-${state}-${width}.png` })
  }
}

async function removeFixture(root: string): Promise<void> {
  const exact = await realpath(root)
  if (dirname(exact) !== (await realpath(tmpdir())) || !basename(exact).startsWith('hbar-settings-content-'))
    throw new Error('Refusing to remove an unrelated fixture')
  await rm(exact, { recursive: true })
}

async function recoveryGeometry(input: Locator) {
  return input.evaluate((element) => {
    const pane = element.closest('.hbar-app-react-settings-scroll')
    const popupId = element.getAttribute('aria-controls')
    const option = popupId ? document.getElementById(popupId)?.querySelector('[role="option"]') : null
    if (!pane || !option) throw new Error('Missing original settings scroll pane or recovered option')
    const box = element.getBoundingClientRect()
    const clip = pane.getBoundingClientRect()
    const first = option.getBoundingClientRect()
    const left = Math.max(0, clip.left)
    const right = Math.min(innerWidth, clip.right)
    const top = Math.max(0, clip.top)
    const bottom = Math.min(innerHeight, clip.bottom)
    const center = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
    const optionLeft = Math.max(left, first.left)
    const optionRight = Math.min(right, first.right)
    const optionTop = Math.max(top, first.top)
    const optionBottom = Math.min(bottom, first.bottom)
    const optionHit = document.elementFromPoint((optionLeft + optionRight) / 2, (optionTop + optionBottom) / 2)
    const rect = (value: DOMRect) => ({
      x: value.x,
      y: value.y,
      width: value.width,
      height: value.height,
      bottom: value.bottom,
      right: value.right,
    })
    return {
      input: rect(box),
      pane: rect(clip),
      firstOption: rect(first),
      scrollTop: pane.scrollTop,
      inputFullyVisible:
        box.width > 0 &&
        box.height > 0 &&
        box.left >= left - 0.5 &&
        box.right <= right + 0.5 &&
        box.top >= top - 0.5 &&
        box.bottom <= bottom + 0.5,
      inputCenterHit: center === element || (center !== null && element.contains(center)),
      optionPartVisible: optionRight - optionLeft > 1 && optionBottom - optionTop > 1,
      optionPartHit: optionHit === option || (optionHit !== null && option.contains(optionHit)),
    }
  })
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`settings options recover in place without saving or retargeting the draft: ${locale}`, async ({ browser }) => {
    test.setTimeout(90_000)
    await mkdir(output, { recursive: true })
    const root = await mkdtemp(join(tmpdir(), 'hbar-settings-content-'))
    const context = await browser.newContext({ locale, viewport: { width: 900, height: 600 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: hostPort, goalAutoContinue: false })
      const settings = createSettingsCommandClient(host.client)
      const baseline = await settings.execute('settings.get', { scope: { kind: 'global' } })
      await context.addInitScript((language) => localStorage.setItem('hbar:web:language', language), locale)
      expect((await context.request.post(`${origin}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      page.setDefaultTimeout(10_000)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const traffic = await observeReads(page)
      const copy = getShellCopy(locale)
      const retryLabel = copy.settings.contentRecovery.retry
      const loadingLabel = copy.settings.contentRecovery.loading
      await page.goto(origin)
      const initialSidebar = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      await expect(initialSidebar).toBeVisible()
      await initialSidebar.click()
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      // Session activation closes the sidebar asynchronously below 64rem.
      await expect(initialSidebar).toBeVisible()
      await initialSidebar.click()
      await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
      await page
        .getByRole('navigation', { name: copy.settings.groups, exact: true })
        .getByRole('button', { name: copy.settings.resolve('i18n:settings.groups.model'), exact: true })
        .click()
      const form = page.locator('.hbar-schema-form')
      const controls = fields(page, copy)
      const retry = page.getByRole('button', { name: retryLabel, exact: true })
      await expect(controls.thinking).toContainText(copy.settings.form.unavailable('missing_model'))
      await expect(controls.thinkingInput).toBeDisabled()
      await expect(controls.thinkingOptions).toBeDisabled()
      await expect(retry).toHaveCount(0)
      const initial = traffic.thinking().at(-1)
      expect(initial?.params.request.scope.kind).toBe('global')
      const formElement = await form.elementHandle()
      if (!formElement) throw new Error('Missing original Settings form')
      await controls.modelOptions.click()
      traffic.fail()
      await page.getByRole('option', { name: /local.*fixture/i }).click()
      await expect(controls.thinking.getByRole('alert')).toContainText(copy.settings.form.contentError('READ_FAILED'))
      await expect(page.getByText(copy.settings.unsaved(1), { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: copy.settings.refresh, exact: true })).toBeDisabled()
      await expect(page.getByRole('button', { name: copy.settings.save, exact: true })).toBeEnabled()
      const failed = traffic.thinking().at(-1)
      if (!failed) throw new Error('Missing failed original option request')
      const originalModelValue = await controls.modelInput.inputValue()
      await writeFile(
        `${output}/${locale}-failure-state.json`,
        JSON.stringify(
          {
            formId: failed.params.request.formId,
            draftRevision: failed.params.request.formRevision,
            originalModelValue,
            hostRevisions: baseline.revisions,
            thinkingReads: traffic.thinking().length,
            writes: traffic.writes,
          },
          null,
          2,
        ),
      )
      await page.screenshot({ path: `${output}/${locale}-failed-900.png` })
      await expect(retry).toBeVisible()
      await expect(controls.thinking.getByRole('button', { name: retryLabel, exact: true })).toBeVisible()

      traffic.fail()
      const beforeRepeatedFailure = traffic.thinking().length
      await retry.focus()
      await page.keyboard.press('Enter')
      await expect.poll(() => traffic.failures()).toBe(2)
      await expect(retry).toBeEnabled()
      await expect(retry).toBeFocused()
      expect(traffic.thinking()).toHaveLength(beforeRepeatedFailure + 1)
      await expect(controls.modelInput).toHaveValue(originalModelValue)

      await page.setViewportSize({ width: 900, height: 600 })
      const showSidebar = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      if (await showSidebar.isVisible()) await showSidebar.click()
      traffic.hold()
      const readCount = traffic.thinking().length
      await retry.focus()
      await page.keyboard.press('Enter')
      await expect.poll(traffic.hasHeldResponse).toBe(true)
      await expect(retry).toBeDisabled()
      await expect(controls.thinking).toContainText(loadingLabel)
      await page.keyboard.press('Enter')
      await page.keyboard.press('Enter')
      expect(traffic.thinking()).toHaveLength(readCount + 1)
      const retried = traffic.thinking().at(-1)
      expect(retried?.params.request).toMatchObject({
        formId: failed.params.request.formId,
        formRevision: failed.params.request.formRevision,
        dependencies: failed.params.request.dependencies,
        scope: failed.params.request.scope,
      })
      await page.screenshot({ path: `${output}/${locale}-loading-900.png` })
      traffic.release()
      await expect(retry).toHaveCount(0)
      await expect(controls.thinkingInput).toBeFocused()
      await expect(controls.modelInput).toHaveValue(originalModelValue)
      expect(await formElement.evaluate((element) => element === document.querySelector('.hbar-schema-form'))).toBe(
        true,
      )
      await expect(page.getByText(copy.settings.unsaved(1), { exact: true })).toBeVisible()
      // LumenComboBox opens its real options when recovery returns focus to the input.
      await expect(page.getByRole('listbox')).toBeVisible()
      expect(await page.getByRole('listbox').getByRole('option').count()).toBeGreaterThan(1)
      // Focus alone is insufficient: do not use click/scrollIntoView to hide a
      // clipped focused input. Measure the actual pane and hit targets first.
      try {
        await expect
          .poll(async () => {
            const geometry = await recoveryGeometry(controls.thinkingInput)
            return (
              geometry.inputFullyVisible &&
              geometry.inputCenterHit &&
              geometry.optionPartVisible &&
              geometry.optionPartHit
            )
          })
          .toBe(true)
      } finally {
        await writeFile(
          `${output}/${locale}-recovered-geometry-900.json`,
          JSON.stringify(await recoveryGeometry(controls.thinkingInput), null, 2),
        )
        await page.screenshot({ path: `${output}/${locale}-recovered-focus-900.png` })
      }
      await page.keyboard.press('ArrowDown')
      const activeOption = await controls.thinkingInput.getAttribute('aria-activedescendant')
      if (!activeOption) throw new Error('Keyboard did not identify a real thinking option')
      const selectedThinking = (await page.locator(`[id=${JSON.stringify(activeOption)}]`).innerText()).trim()
      await page.keyboard.press('Enter')
      await expect(controls.thinkingInput).toHaveValue(selectedThinking)
      await expect(page.getByText(copy.settings.unsaved(2), { exact: true })).toBeVisible()
      await screenshot(page, locale, 'recovered')

      // A second real App window has its own content cache and draft owner.
      // Keep the original window/draft intact; do not defeat normal caching to
      // manufacture another failed read in the first window.
      const latePage = await context.newPage()
      await latePage.setViewportSize({ width: 1440, height: 1000 })
      latePage.on('pageerror', (error) => errors.push(error.message))
      const lateTraffic = await observeReads(latePage)
      await latePage.goto(origin)
      await latePage.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      await latePage.getByRole('button', { name: copy.shell.settings, exact: true }).click()
      await latePage
        .getByRole('navigation', { name: copy.settings.groups, exact: true })
        .getByRole('button', { name: copy.settings.resolve('i18n:settings.groups.model'), exact: true })
        .click()
      const lateControls = fields(latePage, copy)
      const lateRetry = latePage.getByRole('button', { name: retryLabel, exact: true })
      await lateControls.modelOptions.click()
      lateTraffic.fail()
      await latePage.getByRole('option', { name: /local.*fixture/i }).click()
      await expect(lateRetry).toBeVisible()
      await screenshot(latePage, locale, 'failed')
      const lateOriginal = lateTraffic.thinking().at(-1)
      lateTraffic.hold()
      await lateRetry.click()
      await expect.poll(lateTraffic.hasHeldResponse).toBe(true)
      const scope = latePage.getByRole('combobox', { name: copy.settings.scopes, exact: true })
      await scope.selectOption('workspace')
      await expect(scope).toHaveValue('workspace')
      await expect(lateControls.thinking).toContainText(copy.settings.form.unavailable('missing_model'))
      const workspaceRead = lateTraffic.thinking().at(-1)
      expect(workspaceRead?.params.request.formId).not.toBe(lateOriginal?.params.request.formId)
      expect(workspaceRead?.params.request.scope).toEqual({ kind: 'workspace', id: host.ready.workspaceId })
      await scope.focus()
      lateTraffic.release()
      await latePage.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
      )
      await expect(scope).toBeFocused()
      await expect(lateControls.thinking).toContainText(copy.settings.form.unavailable('missing_model'))
      await expect(latePage.getByRole('button', { name: copy.settings.save, exact: true })).toBeDisabled()
      await expect(lateControls.modelInput).toHaveValue('')
      await scope.selectOption('global')
      await expect(lateControls.modelInput).toHaveValue(originalModelValue)
      await expect(latePage.getByText(copy.settings.unsaved(1), { exact: true })).toBeVisible()
      await expect(lateControls.thinkingInput).toBeEnabled()
      await expect(lateRetry).toHaveCount(0)
      await screenshot(latePage, locale, 'returned-global', [320])
      await expect(controls.modelInput).toHaveValue(originalModelValue)
      await expect(controls.thinkingInput).toHaveValue(selectedThinking)
      await expect(page.getByText(copy.settings.unsaved(2), { exact: true })).toBeVisible()
      expect(await formElement.evaluate((element) => element === document.querySelector('.hbar-schema-form'))).toBe(
        true,
      )
      expect(await settings.execute('settings.get', { scope: { kind: 'global' } })).toEqual(baseline)
      expect(traffic.writes).toEqual([])
      expect(lateTraffic.writes).toEqual([])
      expect(traffic.failures()).toBe(2)
      expect(lateTraffic.failures()).toBe(1)
      expect(errors).toEqual([])
      await writeFile(
        `${output}/${locale}-report.json`,
        JSON.stringify(
          {
            fixture:
              'Real temporary demo Host and two production App windows; three read-only option failures and delayed real replies are injected. No model Run or provider configuration write.',
            originalFormId: failed.params.request.formId,
            originalDraftRevision: failed.params.request.formRevision,
            retryDraftRevision: retried?.params.request.formRevision,
            sameFormDOM: true,
            originalModelValue,
            selectedThinking,
            finalLocalDirtyCount: 2,
            baselineRevisions: baseline.revisions,
            reads: traffic.reads,
            lateReads: lateTraffic.reads,
            writes: traffic.writes,
            lateWrites: lateTraffic.writes,
            restoredFocus: true,
            lateScopeIsolated: true,
            errors,
          },
          null,
          2,
        ),
      )
    } finally {
      await context.close()
      if (host) {
        await stopWebSessionHost(host)
        const captured = host
        await expect.poll(() => captured.child.exitCode !== null || captured.child.signalCode !== null).toBe(true)
        await removeFixture(root)
        await writeFile(
          `${output}/${locale}-cleanup.json`,
          JSON.stringify({ root, hostPid: host.child.pid, removed: true }),
        )
      }
    }
  })
}
