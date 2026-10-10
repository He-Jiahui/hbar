import { expect, test, type Page } from '@playwright/test'
import { createRunCommandClient, createUsageCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { usageQueryInputSchema, usageQueryResultSchema } from '@hbar/contracts/commands/usage'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { selectLumenOption } from './support/lumen-controls'
import { openSessionTool } from './support/session-tools-menu'

const rpc = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    params: z.object({ commandId: z.string().optional(), input: z.unknown().optional() }).passthrough().optional(),
  })
  .passthrough()

async function exactCanvasColorCount(page: Page, selector: string, rgb: readonly [number, number, number]) {
  return page.locator(selector).evaluate((element, expected) => {
    if (!(element instanceof HTMLCanvasElement)) throw new Error('Expected a chart canvas')
    const context = element.getContext('2d')
    if (!context) throw new Error('Canvas 2D context is unavailable')
    const pixels = context.getImageData(0, 0, element.width, element.height).data
    let count = 0
    for (let index = 0; index < pixels.length; index += 4)
      if (
        pixels[index] === expected[0] &&
        pixels[index + 1] === expected[1] &&
        pixels[index + 2] === expected[2] &&
        (pixels[index + 3] ?? 0) > 0
      )
        count++
    return count
  }, rgb)
}
async function selectGroup(page: Page, locale: ShellLocale, id: string, label: string) {
  const copy = getShellCopy(locale)
  const mobile = page.getByRole('combobox', { name: copy.settings.groups, exact: true })
  if (await mobile.isVisible()) await selectLumenOption(mobile, id)
  else
    await page
      .getByRole('navigation', { name: copy.settings.groups })
      .getByRole('button', { name: label, exact: true })
      .click()
}

const SETTINGS_USAGE_QUERY_WINDOWS = {
  '1h': { duration: 3_600_000, bucketMs: 300_000 },
  '24h': { duration: 86_400_000, bucketMs: 3_600_000 },
  '7d': { duration: 604_800_000, bucketMs: 21_600_000 },
  '30d': { duration: 2_592_000_000, bucketMs: 86_400_000 },
} as const
function isSettingsUsageQuery(
  input: z.infer<typeof usageQueryInputSchema>,
  window: keyof typeof SETTINGS_USAGE_QUERY_WINDOWS,
) {
  const expected = SETTINGS_USAGE_QUERY_WINDOWS[window]
  return (
    input.scope.kind === 'global' &&
    input.maxBuckets === 120 &&
    input.maxSamples === 5_000 &&
    Object.keys(input.filters).length === 0 &&
    input.bucketMs === expected.bucketMs &&
    input.to !== undefined &&
    input.from !== undefined &&
    input.to - input.from === expected.duration
  )
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`usage remains inside the original settings page with true Host facts and local recovery: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-settings-usage-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    const copy = getShellCopy(locale)
    const labels = copy.settingsUsage
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 44873),
        goalAutoContinue: false,
      })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 44875}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      let fault: 'none' | 'failure' | 'hold' = 'none'
      let held: (() => void) | undefined
      let holdId: string | number | undefined
      let heldRequestId: string | number | undefined
      let reads = 0
      const usageRequestInputs = new Map<string | number, unknown>()
      const usageRequestOrder: Array<{
        readonly id: string | number
        readonly input: z.infer<typeof usageQueryInputSchema>
      }> = []
      const usageReports: Array<{
        readonly id: string | number
        readonly input: z.infer<typeof usageQueryInputSchema>
        readonly report: z.infer<typeof usageQueryResultSchema>
      }> = []
      await page.routeWebSocket('**/rpc', (socket) => {
        const server = socket.connectToServer()
        socket.onMessage((message) => {
          const parsed = typeof message === 'string' ? rpc.safeParse(JSON.parse(message)) : null
          if (parsed?.success && parsed.data.params?.commandId === 'usage.query') {
            reads++
            const queryInput = usageQueryInputSchema.safeParse(parsed.data.params.input)
            if (parsed.data.id !== undefined) {
              if (queryInput.success) {
                usageRequestInputs.set(parsed.data.id, queryInput.data)
                usageRequestOrder.push({ id: parsed.data.id, input: queryInput.data })
              }
            }
            const isFaultTarget = queryInput.success && isSettingsUsageQuery(queryInput.data, '30d')
            if (fault === 'failure' && isFaultTarget) {
              fault = 'none'
              socket.send(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id: parsed.data.id,
                  error: { code: -32603, message: 'Injected read failure', data: 'READ_FAILED' },
                }),
              )
              return
            }
            if (fault === 'hold' && isFaultTarget) {
              holdId = parsed.data.id
              fault = 'none'
            }
          }
          server.send(message)
        })
        server.onMessage((message) => {
          const parsed = typeof message === 'string' ? rpc.safeParse(JSON.parse(message)) : null
          if (
            parsed?.success &&
            parsed.data.id !== undefined &&
            usageRequestInputs.has(parsed.data.id) &&
            'result' in parsed.data
          ) {
            const input = usageRequestInputs.get(parsed.data.id)
            const result = usageQueryResultSchema.safeParse(parsed.data.result)
            if (input && result.success) {
              const parsedInput = usageQueryInputSchema.safeParse(input)
              if (parsedInput.success)
                usageReports.push({ id: parsed.data.id, input: parsedInput.data, report: result.data })
            }
            usageRequestInputs.delete(parsed.data.id)
          }
          if (parsed?.success && holdId !== undefined && parsed.data.id === holdId) {
            holdId = undefined
            heldRequestId = parsed.data.id
            held = () => socket.send(message)
          } else socket.send(message)
        })
      })
      await page.goto(base)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      await expect(page.locator('[data-hbar-composer-session]')).toHaveAttribute(
        'data-hbar-composer-session',
        host.ready.sessionId,
      )
      await expect(prompt).toHaveAttribute('contenteditable', 'true')
      const draft = 'Original source draft stays unchanged — 原会话草稿'
      await prompt.focus()
      await page.keyboard.press('ControlOrMeta+a')
      await page.keyboard.insertText(draft)
      await expectComposerText(prompt, draft)
      await openSessionTool(page, copy.session.tools, 'settings')
      await selectGroup(page, locale, 'usage', labels.title)
      const region = page.getByRole('region', { name: labels.title, exact: true })
      const refresh = region.getByRole('button', { name: labels.refresh, exact: true })
      await expect(region.getByText(labels.empty, { exact: true })).toBeVisible()
      await expect(page.getByRole('combobox', { name: copy.settings.scopes, exact: true })).toHaveCount(0)
      await expect(page.locator('.hbar-app-react-settings-fixed-scope')).toHaveText(copy.settings.hostScope)
      await expect(page.locator('.hbar-app-react-status-workspace')).toHaveCount(0)

      const accepted = await createRunCommandClient(host.client).execute(
        'run.submit',
        {
          sessionId: host.ready.sessionId,
          modelId: 'local-fixture',
          input: { text: 'A recorded usage sample', images: [] },
        },
        { idempotencyKey: 'settings-usage-sample' },
      )
      const client = host.client
      const sessionId = host.ready.sessionId
      await expect
        .poll(
          async () =>
            (await client.call('session.snapshot', { sessionId })).runs.find((run) => run.id === accepted.operationId)
              ?.status,
        )
        .toBe('completed')
      const report = await createUsageCommandClient(host.client).execute('usage.query', {
        scope: { kind: 'global' },
        from: Date.now() - 86_400_000,
        to: Date.now(),
        bucketMs: 3_600_000,
      })
      expect(report.series.length).toBeLessThanOrEqual(120)
      expect(report.totals.input + report.totals.output).toBeGreaterThan(0)
      const firstModel = report.models[0]
      if (!firstModel) throw new Error('Recorded Host usage should include its model')
      const requestsBeforeInitialRefresh = usageRequestOrder.length
      await refresh.click()
      await expect
        .poll(() =>
          usageRequestOrder
            .slice(requestsBeforeInitialRefresh)
            .find((entry) => isSettingsUsageQuery(entry.input, '24h')),
        )
        .toBeTruthy()
      const initialRequest = usageRequestOrder
        .slice(requestsBeforeInitialRefresh)
        .find((entry) => isSettingsUsageQuery(entry.input, '24h'))
      if (!initialRequest) throw new Error('Expected the initial UI usage query request')
      await expect.poll(() => usageReports.some((entry) => entry.id === initialRequest.id)).toBe(true)
      const initialResponse = usageReports.find((entry) => entry.id === initialRequest.id)
      const initialVisibleReport = initialResponse?.report
      if (!initialVisibleReport) throw new Error('Expected the initial Host usage report rendered by the UI')
      expect(initialVisibleReport.window.bucketMs).toBe(initialRequest.input.bucketMs)
      expect(initialVisibleReport.scope).toEqual(initialRequest.input.scope)
      let latestVisibleReport = initialVisibleReport
      // LumenUsage01 exposes the overview as an accessible section. The
      // metric values are rendered by its public content contract; there is
      // no list role for this summary surface.
      const summary = region.getByRole('region', { name: labels.summary, exact: true })
      await expect(
        summary.getByText(labels.tokenCount(initialVisibleReport.totals.input + initialVisibleReport.totals.output), {
          exact: true,
        }),
      ).toBeVisible()
      const chart = region.getByRole('img', { name: labels.activity, exact: true })
      await expect(chart.locator('canvas')).toHaveCount(1)
      expect(await region.locator('[data-settings-usage-bucket]').count()).toBeLessThanOrEqual(120)
      await expect
        .poll(async () =>
          chart.locator('canvas').evaluate((element) => {
            if (!(element instanceof HTMLCanvasElement)) return false
            return element.width > 0 && element.height > 0
          }),
        )
        .toBe(true)
      const accent: readonly [number, number, number] = [17, 123, 231]
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.evaluate(() => document.documentElement.style.setProperty('--lumen-accent', 'rgb(17, 123, 231)'))
      const positiveBucket = initialVisibleReport.series.find((item) => item.input + item.output > 0)
      if (!positiveBucket) throw new Error('Expected a positive usage bucket for chart color verification')
      const positiveBucketButton = region.getByRole('button', {
        name: labels.bucket(positiveBucket.start, positiveBucket.end, positiveBucket.input + positiveBucket.output),
        exact: true,
      })
      await positiveBucketButton.focus()
      await page.keyboard.press('Enter')
      await expect(positiveBucketButton).toHaveAttribute('aria-pressed', 'true')
      await expect
        .poll(() => exactCanvasColorCount(page, '.hbar-settings-usage-echarts canvas', accent))
        .toBeGreaterThan(0)
      const nextAccent: readonly [number, number, number] = [211, 42, 90]
      await page.evaluate(() => document.documentElement.style.setProperty('--lumen-accent', 'rgb(211, 42, 90)'))
      await expect
        .poll(() => exactCanvasColorCount(page, '.hbar-settings-usage-echarts canvas', nextAccent))
        .toBeGreaterThan(0)
      const oldChart = chart.locator('canvas')
      await selectGroup(page, locale, 'appearance', copy.appearance.group)
      await expect(oldChart).toHaveCount(0)
      const requestsBeforeChartReopen = usageRequestOrder.length
      await selectGroup(page, locale, 'usage', labels.title)
      const returnedChart = region.getByRole('img', { name: labels.activity, exact: true }).locator('canvas')
      await expect(returnedChart).toHaveCount(1)
      const reopenedWindow = labels.windows.find((item) => item.id === '24h')
      if (!reopenedWindow) throw new Error('Expected the 24h usage window label')
      await expect(region.getByRole('button', { name: reopenedWindow.label, exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await expect
        .poll(() =>
          usageRequestOrder.slice(requestsBeforeChartReopen).find((entry) => isSettingsUsageQuery(entry.input, '24h')),
        )
        .toBeTruthy()
      const reopenedChartRequest = usageRequestOrder
        .slice(requestsBeforeChartReopen)
        .find((entry) => isSettingsUsageQuery(entry.input, '24h'))
      if (!reopenedChartRequest) throw new Error('Expected a usage query after reopening settings')
      await expect
        .poll(() =>
          usageReports.some(
            (entry) =>
              entry.id === reopenedChartRequest.id &&
              entry.input.bucketMs === reopenedChartRequest.input.bucketMs &&
              entry.report.window.bucketMs === reopenedChartRequest.input.bucketMs,
          ),
        )
        .toBe(true)
      const reopenedChartResponse = usageReports.find(
        (entry) =>
          entry.id === reopenedChartRequest.id &&
          entry.input.bucketMs === reopenedChartRequest.input.bucketMs &&
          entry.report.window.bucketMs === reopenedChartRequest.input.bucketMs,
      )
      if (!reopenedChartResponse) throw new Error('Expected the reopened usage report')
      expect(reopenedChartResponse.input.scope).toEqual(reopenedChartRequest.input.scope)
      const reopenedChartPositiveBucket = reopenedChartResponse.report.series.find(
        (item) => item.input + item.output > 0,
      )
      if (!reopenedChartPositiveBucket) throw new Error('Expected a positive usage bucket after reopening settings')
      const reopenedChartBucketButton = region.getByRole('button', {
        name: labels.bucket(
          reopenedChartPositiveBucket.start,
          reopenedChartPositiveBucket.end,
          reopenedChartPositiveBucket.input + reopenedChartPositiveBucket.output,
        ),
        exact: true,
      })
      await reopenedChartBucketButton.focus()
      await page.keyboard.press('Enter')
      await expect(reopenedChartBucketButton).toHaveAttribute('aria-pressed', 'true')
      await expect
        .poll(() => exactCanvasColorCount(page, '.hbar-settings-usage-echarts canvas', nextAccent))
        .toBeGreaterThan(0)
      if (initialVisibleReport.cost.availability === 'available' && initialVisibleReport.cost.value !== null) {
        const value = labels.currency(initialVisibleReport.cost.value)
        await expect(
          summary.getByText(initialVisibleReport.cost.estimated ? labels.estimated(value) : value, { exact: true }),
        ).toBeVisible()
      } else await expect(summary.getByText(labels.costUnavailable, { exact: true })).toBeVisible()
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 960 })
        for (const window of labels.windows) {
          const button = region.getByRole('button', { name: window.label, exact: true })
          const requestsBeforeWindow = usageRequestOrder.length
          await button.focus()
          await page.keyboard.press('Enter')
          await expect(button).toHaveAttribute('aria-pressed', 'true')
          await expect
            .poll(() =>
              usageRequestOrder
                .slice(requestsBeforeWindow)
                .find((entry) => isSettingsUsageQuery(entry.input, window.id)),
            )
            .toBeTruthy()
          const windowRequest = usageRequestOrder
            .slice(requestsBeforeWindow)
            .find((entry) => isSettingsUsageQuery(entry.input, window.id))
          if (!windowRequest) throw new Error(`Expected the selected ${window.id} Host usage query request`)
          await expect.poll(() => usageReports.some((entry) => entry.id === windowRequest.id)).toBe(true)
          const windowResponse = usageReports.find((entry) => entry.id === windowRequest.id)
          if (!windowResponse) throw new Error(`Expected the selected ${window.id} Host usage report`)
          const windowReport = windowResponse.report
          expect(windowReport.window.bucketMs).toBe(windowResponse.input.bucketMs)
          expect(windowReport.scope).toEqual(windowResponse.input.scope)
          latestVisibleReport = windowReport
          const windowTokenCount = windowReport.totals.input + windowReport.totals.output
          const windowPositiveBucket = windowReport.series.find((item) => item.input + item.output > 0)
          if (!windowPositiveBucket) throw new Error('Expected a non-empty bucket for the selected window')
          const windowPositiveBucketLabel = labels.bucket(
            windowPositiveBucket.start,
            windowPositiveBucket.end,
            windowPositiveBucket.input + windowPositiveBucket.output,
          )
          await expect(refresh).toBeEnabled()
          await expect(summary.getByText(labels.tokenCount(windowTokenCount), { exact: true })).toBeVisible()
          const positiveBucketButton = region.getByRole('button', { name: windowPositiveBucketLabel, exact: true })
          await positiveBucketButton.focus()
          await page.keyboard.press('Enter')
          await expect(positiveBucketButton).toHaveAttribute('aria-pressed', 'true')
          await expect(region.getByRole('status').filter({ hasText: windowPositiveBucketLabel })).toBeVisible()
          expect(
            await region.evaluate((element) => {
              const bounds = element.getBoundingClientRect()
              return [...element.querySelectorAll<HTMLElement>('[data-settings-usage-bucket]')].every((button) => {
                const buttonBounds = button.getBoundingClientRect()
                return buttonBounds.left >= bounds.left - 1 && buttonBounds.right <= bounds.right + 1
              })
            }),
          ).toBe(true)
        }
        await mkdir('artifacts/settings-usage', { recursive: true })
        const overflowOffenders = await region.evaluate((element) => {
          const regionBox = element.getBoundingClientRect()
          return [...element.querySelectorAll<HTMLElement>('*')]
            .map((node) => {
              const box = node.getBoundingClientRect()
              return {
                tag: node.tagName,
                className: node.className,
                left: box.left,
                right: box.right,
                width: box.width,
                clientWidth: node.clientWidth,
                scrollWidth: node.scrollWidth,
              }
            })
            .filter((node) => node.right > regionBox.right + 1 || node.scrollWidth > node.clientWidth + 1)
            .sort((left, right) => right.right - left.right)
            .slice(0, 20)
        })
        await writeFile(
          `artifacts/settings-usage/${locale}-${width}-overflow-offenders.json`,
          JSON.stringify(overflowOffenders, null, 2),
        )
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        expect(await region.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
        await region.getByRole('heading', { name: labels.title, exact: true }).scrollIntoViewIfNeeded()
        await page.screenshot({ path: `artifacts/settings-usage/${locale}-${width}.png` })
        await region.getByRole('heading', { name: labels.models, exact: true }).scrollIntoViewIfNeeded()
        await expect(
          region
            .locator('.hbar-settings-usage-models')
            .getByRole('list')
            .getByRole('listitem')
            .filter({ hasText: labels.model(firstModel.providerId, firstModel.modelId) }),
        ).toBeVisible()
        await page.screenshot({ path: `artifacts/settings-usage/${locale}-${width}-details.png` })
      }
      fault = 'failure'
      await refresh.click()
      await expect(region.getByRole('alert')).toHaveText(labels.error('READ_FAILED'))
      await expect(region.getByText(labels.oldResult, { exact: true })).toBeVisible()
      await refresh.click()
      await expect(region.getByRole('alert')).toHaveCount(0)
      await expect(refresh).toBeEnabled()
      fault = 'hold'
      await refresh.click()
      await expect.poll(() => Boolean(held)).toBe(true)
      const requestsBeforeReturn = usageRequestOrder.length
      await selectGroup(page, locale, 'appearance', copy.appearance.group)
      await selectGroup(page, locale, 'usage', labels.title)
      await expect(refresh).toBeEnabled()
      const pendingHeldRequestId = heldRequestId
      held?.()
      held = undefined
      if (!pendingHeldRequestId) throw new Error('Expected the held usage query request id')
      await expect.poll(() => usageReports.some((entry) => entry.id === pendingHeldRequestId)).toBe(true)
      await expect
        .poll(() =>
          usageRequestOrder.slice(requestsBeforeReturn).find((entry) => isSettingsUsageQuery(entry.input, '30d')),
        )
        .toBeTruthy()
      const returnedRequest = usageRequestOrder
        .slice(requestsBeforeReturn)
        .find((entry) => isSettingsUsageQuery(entry.input, '30d'))
      if (!returnedRequest) throw new Error('Expected the reopened usage query request')
      await expect.poll(() => usageReports.some((entry) => entry.id === returnedRequest.id)).toBe(true)
      const returnedResponse = usageReports.find((entry) => entry.id === returnedRequest.id)
      if (!returnedResponse) throw new Error('Expected the reopened usage query response')
      latestVisibleReport = returnedResponse.report
      await expect(region.getByRole('alert')).toHaveCount(0)
      await expect(
        summary.getByText(labels.tokenCount(latestVisibleReport.totals.input + latestVisibleReport.totals.output), {
          exact: true,
        }),
      ).toBeVisible()
      expect(reads).toBeGreaterThanOrEqual(12)
      // Clearly marked layout stress only: the Host records above remain unchanged.
      await region.locator('.hbar-settings-usage-intro > p').evaluate((element) => {
        element.textContent = '长文案 Long localized description '.repeat(25)
      })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await region.getByRole('heading', { name: labels.title, exact: true }).scrollIntoViewIfNeeded()
      await page.screenshot({ path: `artifacts/settings-usage/${locale}-320-long-fixture.png` })
      await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
      await expectComposerText(prompt, draft)
      await openSessionTool(page, copy.session.tools, 'settings')
      await selectGroup(page, locale, 'usage', labels.title)
      await expect(refresh).toBeEnabled()
      await stopWebSessionHost(host)
      host = undefined
      await expect(region.getByText(labels.offline, { exact: true })).toBeVisible({ timeout: 20_000 })
      await expect(refresh).toBeDisabled()
      await expect(region.getByText(labels.oldResult, { exact: true })).toBeVisible()
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
