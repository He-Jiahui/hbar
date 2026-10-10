import { expect, test } from '@playwright/test'
import { createConfigurationCommandClient } from '@hbar/client'
import { z } from 'zod'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { selectLumenOption } from './support/lumen-controls'

async function expectControlsAligned(
  left: import('@playwright/test').Locator,
  right: import('@playwright/test').Locator,
) {
  await expect(left).toBeVisible()
  await expect(right).toBeVisible()
  const [leftBox, rightBox] = await Promise.all([left.boundingBox(), right.boundingBox()])
  expect(leftBox).not.toBeNull()
  expect(rightBox).not.toBeNull()
  expect(Math.abs(leftBox!.y - rightBox!.y)).toBeLessThanOrEqual(1)
  expect(Math.abs(leftBox!.height - rightBox!.height)).toBeLessThanOrEqual(1)
}

async function expectSingleScrollRegion(dialog: import('@playwright/test').Locator) {
  const scrollable = await dialog.locator('main, main *').evaluateAll((elements) =>
    elements
      .filter((element) => {
        const style = getComputedStyle(element)
        return (
          // Account for a one-pixel fractional-border rounding in Lumen controls.
          (style.overflowY === 'auto' || style.overflowY === 'scroll') && element.scrollHeight > element.clientHeight + 1
        )
      })
      .map((element) => ({
        tag: element.tagName,
        id: element.id,
        className: element.getAttribute('class'),
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      })),
  )
  expect(scrollable.length, JSON.stringify(scrollable)).toBeLessThanOrEqual(1)
}

const rpcShape = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    params: z.object({ commandId: z.string().optional() }).passthrough().optional(),
  })
  .passthrough()

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`provider editing discloses advanced parameters and keeps cancel/save on the original target: ${locale}`, async ({
    browser,
  }, info) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-provider-progressive-'))
    const evidenceDir = join(process.cwd(), 'artifacts', 'settings-provider-catalog-retry', 'evidence')
    await mkdir(evidenceDir, { recursive: true })
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const configuration = createConfigurationCommandClient(host.client)
      const original = await configuration.execute('provider.list', {})
      const copy = getShellCopy(locale)
      const labels = copy.providers.dialog
      const name = 'Progressive provider — 模型高级配置保留测试'
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      let responseMode: 'normal' | 'failure' | 'unknown' = 'normal'
      let catalogFailureMode: 'none' | 'preset-list-once' | 'preset-list-stale-once' | 'preset-models-once' = 'none'
      let presetListReads = 0
      let presetModelReads = 0
      let releaseStalePresetFailure: (() => void) | undefined
      let signalStalePresetRead: () => void = () => undefined
      const stalePresetRead = new Promise<void>((resolve) => {
        signalStalePresetRead = resolve
      })
      let saveRequestId: string | number | undefined
      let saveWrites = 0
      await page.routeWebSocket('**/rpc', (socket) => {
        const server = socket.connectToServer()
        socket.onMessage((message) => {
          if (typeof message === 'string') {
            const parsed = rpcShape.safeParse(JSON.parse(message))
            const commandId = parsed.success ? parsed.data.params?.commandId : undefined
            if (parsed.success && commandId === 'provider.preset.list') {
              presetListReads += 1
              if (catalogFailureMode === 'preset-list-stale-once') {
                catalogFailureMode = 'none'
                releaseStalePresetFailure = () =>
                  socket.send(
                    JSON.stringify({
                      jsonrpc: '2.0',
                      id: parsed.data.id,
                      error: {
                        code: -32603,
                        message: 'Fixture delivers a superseded preset failure late',
                        data: 'INVALID_INPUT',
                      },
                    }),
                  )
                signalStalePresetRead()
                return
              }
              if (catalogFailureMode === 'preset-list-once') {
                catalogFailureMode = 'none'
                socket.send(
                  JSON.stringify({
                    jsonrpc: '2.0',
                    id: parsed.data.id,
                    error: {
                      code: -32603,
                      message: 'Fixture fails the first preset read',
                      data: 'CAPABILITY_UNAVAILABLE',
                    },
                  }),
                )
                return
              }
            }
            if (parsed.success && commandId === 'provider.preset.models') {
              presetModelReads += 1
              if (catalogFailureMode === 'preset-models-once') {
                catalogFailureMode = 'none'
                socket.send(
                  JSON.stringify({
                    jsonrpc: '2.0',
                    id: parsed.data.id,
                    error: {
                      code: -32603,
                      message: 'Fixture fails the first preset model read',
                      data: 'CAPABILITY_UNAVAILABLE',
                    },
                  }),
                )
                return
              }
            }
            if (parsed.success && commandId === 'provider.save') {
              if (responseMode === 'failure') {
                socket.send(
                  JSON.stringify({
                    jsonrpc: '2.0',
                    id: parsed.data.id,
                    error: { code: -32603, message: 'Fixture rejects an invalid save', data: 'INVALID_INPUT' },
                  }),
                )
                return
              }
              saveRequestId = parsed.data.id
              saveWrites += 1
            }
          }
          server.send(message)
        })
        server.onMessage((message) => {
          if (typeof message === 'string') {
            const parsed = rpcShape.safeParse(JSON.parse(message))
            if (parsed.success && saveRequestId !== undefined && parsed.data.id === saveRequestId) {
              saveRequestId = undefined
              if (responseMode === 'unknown') {
                socket.send(
                  JSON.stringify({
                    jsonrpc: '2.0',
                    id: parsed.data.id,
                    error: { code: -32603, message: 'Fixture hides an accepted result', data: 'RESULT_UNKNOWN' },
                  }),
                )
                return
              }
            }
          }
          socket.send(message)
        })
      })
      await page.goto(base)
      await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
      await page
        .getByRole('button', { name: copy.settings.resolve('i18n:settings.groups.providers'), exact: true })
        .click()
      const add = page.getByRole('button', { name: copy.providers.list.add, exact: true })
      const originalAdd = await add.elementHandle()
      await add.click()
      const dialog = page.locator('.hbar-app-react-provider-dialog')
      const main = dialog.locator('main')
      await expect(dialog).toBeVisible()
      expect(
        await originalAdd?.evaluate((element) => element.isConnected),
        'opening keeps the settings trigger mounted',
      ).toBe(true)
      await dialog.getByRole('button', { name: labels.checkConfiguration, exact: true }).click()
      await expect(dialog.locator('#provider-id')).toBeFocused()
      await expect(dialog.getByRole('button', { name: labels.save, exact: true })).toBeDisabled()
      const preset = dialog.getByRole('combobox', { name: labels.preset.label, exact: true })
      const presetRecovery = dialog.locator('.hbar-provider-catalog-recovery')
      catalogFailureMode = 'preset-list-stale-once'
      await preset.fill('stale')
      await stalePresetRead
      catalogFailureMode = 'preset-list-once'
      await preset.fill('OpenAI')
      const presetRetry = presetRecovery.getByRole('button', { name: labels.preset.retry, exact: true })
      await expect(presetRecovery.getByRole('alert')).toHaveText(labels.preset.readError('CAPABILITY_UNAVAILABLE'))
      await expect(presetRecovery.getByRole('alert')).not.toContainText('CAPABILITY_UNAVAILABLE')
      await expect(dialog.locator('.hbar-app-react-provider-error')).toHaveCount(0)
      await expect(preset).toHaveValue('OpenAI')
      await expect(dialog.getByRole('button', { name: labels.cancel, exact: true })).toBeEnabled()
      releaseStalePresetFailure?.()
      await expect(presetRecovery.getByRole('alert')).toHaveText(labels.preset.readError('CAPABILITY_UNAVAILABLE'))
      await page.screenshot({ path: join(evidenceDir, `provider-presets-failed-${locale}-1440.png`) })
      await page.setViewportSize({ width: 320, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321)
      await expect(presetRetry).toBeVisible()
      await page.screenshot({ path: join(evidenceDir, `provider-presets-failed-${locale}-320.png`) })
      await presetRetry.focus()
      await presetRetry.press('Enter')
      await expect(preset).toBeFocused()
      await expect(presetRecovery).toHaveCount(0)
      await expect(dialog.locator('.hbar-app-react-provider-error')).toHaveCount(0)
      expect(presetListReads).toBeGreaterThanOrEqual(4)
      await page.setViewportSize({ width: 1440, height: 960 })
      catalogFailureMode = 'preset-models-once'
      await page
        .getByRole('option')
        .filter({ has: page.getByText('OpenAI', { exact: true }) })
        .click()
      const modelCatalog = dialog.getByRole('combobox', { name: labels.models.catalog, exact: true })
      const modelRecovery = dialog.locator('.hbar-provider-catalog-recovery')
      const modelRetry = modelRecovery.getByRole('button', { name: labels.models.catalogRetry, exact: true })
      await expect(modelRecovery.getByRole('alert')).toHaveText(
        labels.models.catalogReadError('CAPABILITY_UNAVAILABLE'),
      )
      await expect(dialog.locator('.hbar-app-react-provider-error')).toHaveCount(0)
      await expect(dialog.locator('#provider-id')).toHaveValue('')
      await expect(modelCatalog).toBeVisible()
      await expect(dialog.getByRole('button', { name: labels.cancel, exact: true })).toBeEnabled()
      await modelRecovery.scrollIntoViewIfNeeded()
      await expect(modelRecovery).toBeInViewport()
      await page.screenshot({ path: join(evidenceDir, `provider-model-apply-failed-${locale}-1440.png`) })
      await page.setViewportSize({ width: 320, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321)
      await expect(modelRetry).toBeVisible()
      await page.screenshot({ path: join(evidenceDir, `provider-model-apply-failed-${locale}-320.png`) })
      await modelRetry.focus()
      await modelRetry.press('Enter')
      await expect(modelCatalog).toBeFocused()
      await expect(dialog.locator('#provider-id')).toHaveValue('openai')
      await expect(modelRecovery).toHaveCount(0)
      await expect(dialog.locator('.hbar-app-react-provider-error')).toHaveCount(0)
      expect(presetModelReads).toBeGreaterThanOrEqual(2)
      await page.setViewportSize({ width: 1440, height: 960 })
      catalogFailureMode = 'preset-models-once'
      await modelCatalog.fill('gpt')
      await expect(modelRecovery.getByRole('alert')).toHaveText(
        labels.models.catalogReadError('CAPABILITY_UNAVAILABLE'),
      )
      await expect(dialog.locator('.hbar-app-react-provider-error')).toHaveCount(0)
      await expect(dialog.locator('#provider-id')).toHaveValue('openai')
      await expect(modelCatalog).toHaveValue('gpt')
      await page.screenshot({ path: join(evidenceDir, `provider-model-query-failed-${locale}-1440.png`) })
      await page.setViewportSize({ width: 320, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321)
      await expect(modelRetry).toBeVisible()
      await page.screenshot({ path: join(evidenceDir, `provider-model-query-failed-${locale}-320.png`) })
      await modelRetry.focus()
      await modelRetry.press('Enter')
      await expect(modelCatalog).toBeFocused()
      await expect(modelRecovery).toHaveCount(0)
      await expect(dialog.locator('.hbar-app-react-provider-error')).toHaveCount(0)
      await expect(modelCatalog).toHaveValue('gpt')
      expect(presetModelReads).toBeGreaterThanOrEqual(4)
      await page.setViewportSize({ width: 1440, height: 960 })
      await dialog.locator('#provider-id').fill('progressive-provider')
      await dialog.locator('#provider-name').fill(name)
      await selectLumenOption(dialog.locator('#provider-protocol'), 'openai-responses')
      await dialog.locator('#provider-base-url').fill('http://127.0.0.1')
      await expectControlsAligned(dialog.locator('#provider-id'), dialog.locator('#provider-name'))
      await expectControlsAligned(dialog.locator('#provider-protocol'), dialog.locator('#provider-base-url'))
      const protocol = dialog.locator('#provider-protocol')
      const protocolArrow = protocol.locator('.lumen-popup-select-chevron')
      const [protocolBox, protocolArrowBox] = await Promise.all([protocol.boundingBox(), protocolArrow.boundingBox()])
      expect(protocolBox).not.toBeNull()
      expect(protocolArrowBox).not.toBeNull()
      expect(protocolArrowBox!.x + protocolArrowBox!.width).toBeLessThanOrEqual(protocolBox!.x + protocolBox!.width + 1)
      expect(await protocol.evaluate((element) => getComputedStyle(element).borderStyle)).toBe('none')
      await dialog.getByLabel(labels.provider.apiKey, { exact: true }).fill('test-only-progressive-key')
      const advanced = dialog.getByRole('button', { name: labels.advancedModel, exact: true })
      await expect(advanced).toHaveAttribute('aria-expanded', 'false')
      await expect(dialog.locator('#provider-model-context')).toBeHidden()
      const firstModelId = await dialog.locator('#provider-model-id').inputValue()
      const firstModelName = await dialog.locator('#provider-model-name').inputValue()
      await dialog.locator('#provider-custom-model').fill('second-model')
      const customInput = dialog.locator('#provider-custom-model')
      const addCustom = dialog.getByRole('button', { name: labels.models.addCustom, exact: true })
      const customAction = dialog.locator('.hbar-app-react-provider-inline-action')
      const [customInputBox, addCustomBox, customActionBox] = await Promise.all([
        customInput.boundingBox(),
        addCustom.boundingBox(),
        customAction.boundingBox(),
      ])
      expect(customInputBox).not.toBeNull()
      expect(addCustomBox).not.toBeNull()
      expect(customActionBox).not.toBeNull()
      expect(customInputBox!.width).toBeGreaterThan(0)
      expect(addCustomBox!.x + addCustomBox!.width).toBeLessThanOrEqual(customActionBox!.x + customActionBox!.width + 1)
      await addCustom.click()
      const pricing = dialog.getByRole('button', { name: labels.contextPricing.title, exact: true })
      await pricing.click()
      const contextField = dialog.getByRole('spinbutton', {
        name: labels.contextPricing.field('i18n:settings.providers.context.standard'),
        exact: true,
      })
      await contextField.fill('123456')
      // Deliberately switch without blurring through a filler control first.
      await dialog.getByRole('button', { name: labels.models.select(firstModelName), exact: true }).click()
      await expect(dialog.locator('#provider-model-id')).toHaveValue(firstModelId)
      await dialog.getByRole('button', { name: labels.models.select('second-model'), exact: true }).click()
      await pricing.click()
      await expect(contextField).toHaveValue('123456')
      const purpose = 'For short implementation and review tasks'
      await dialog.getByRole('textbox', { name: labels.models.description, exact: true }).fill(purpose)
      await contextField.fill('1')
      await dialog.getByRole('button', { name: labels.models.select(firstModelName), exact: true }).click()
      await dialog.getByRole('button', { name: labels.checkConfiguration, exact: true }).click()
      await expect(dialog.locator('#provider-model-id')).toHaveValue('second-model')
      await expect(pricing).toHaveAttribute('aria-expanded', 'true')
      await expect(contextField).toBeFocused()
      await expect(dialog.getByRole('button', { name: labels.save, exact: true })).toBeDisabled()
      await contextField.fill('200000')
      await pricing.click()
      await expect(contextField).toBeHidden()
      await pricing.click()
      await expect(contextField).toHaveValue('200000')
      await dialog.getByRole('button', { name: labels.models.select(firstModelName), exact: true }).click()
      await advanced.click()
      const thinkingGroup = dialog.locator('#provider-model-thinking-levels')
      const defaultGroup = dialog.locator('#provider-model-default-thinking')
      const defaultChoice = defaultGroup.locator('[role="radio"][aria-checked="true"]')
      const defaultValue = await defaultChoice.getAttribute('data-value')
      expect(defaultValue).not.toBeNull()
      const defaultToggle = thinkingGroup.locator(`[data-value=${JSON.stringify(defaultValue)}]`)
      await expect(defaultToggle).toBeDisabled()
      const selectedLevels = thinkingGroup.locator('button[aria-pressed="true"]')
      const removableValue = await selectedLevels.evaluateAll((nodes, currentDefault) => {
        const candidate = nodes.find((node) => node.getAttribute('data-value') !== currentDefault)
        return candidate?.getAttribute('data-value') ?? null
      }, defaultValue)
      if (removableValue) {
        const beforeCount = await selectedLevels.count()
        const removable = thinkingGroup.locator(`[data-value=${JSON.stringify(removableValue)}]`)
        await removable.click()
        await expect(selectedLevels).toHaveCount(beforeCount - 1)
        await removable.click()
        await expect(selectedLevels).toHaveCount(beforeCount)
        await expect(defaultGroup.locator('[role="radio"][aria-checked="true"]')).toHaveAttribute(
          'data-value',
          defaultValue!,
        )
      }
      await dialog.getByRole('button', { name: labels.models.select('second-model'), exact: true }).click()
      await pricing.click()
      await dialog
        .getByRole('spinbutton', {
          name: labels.contextPricing.field('i18n:settings.providers.context.input'),
          exact: true,
        })
        .fill('1.25')
      await dialog.getByRole('button', { name: labels.models.setDefault, exact: true }).click()
      await dialog.getByRole('button', { name: labels.save, exact: true }).click()
      await expect(dialog).toHaveCount(0)
      expect(await originalAdd?.evaluate((element) => element.isConnected)).toBe(true)
      await expect(add).toBeFocused()
      const saved = (await configuration.execute('provider.list', {})).find(
        (item) => item.provider.id === 'progressive-provider',
      )
      expect(saved?.provider).toMatchObject({ name, protocol: 'openai-responses', model: 'second-model' })
      expect(saved?.provider.models?.find((model) => model.id === 'second-model')).toMatchObject({
        contextWindow: 200000,
        inputPrice: 1.25,
        description: purpose,
      })
      expect(saved?.hasKey).toBe(true)
      expect(JSON.stringify(saved)).not.toContain('test-only-progressive-key')

      const edit = page.getByRole('button', { name: copy.providers.list.edit(name), exact: true })
      await edit.click()
      await expect(dialog.getByLabel(labels.provider.apiKey, { exact: true })).toHaveValue('')
      await dialog.getByRole('button', { name: labels.models.select('second-model'), exact: true }).click()
      await expect(dialog.getByRole('textbox', { name: labels.models.description, exact: true })).toHaveValue(purpose)
      await expect(advanced).toHaveAttribute('aria-expanded', 'false')
      await dialog.locator('#provider-name').fill('This name will be discarded')
      await dialog.getByLabel(labels.provider.apiKey, { exact: true }).fill('cancelled-test-key')
      await page.keyboard.press('Escape')
      const confirmation = page.getByRole('dialog', {
        name: labels.discardTitle('This name will be discarded'),
        exact: true,
      })
      await expect(confirmation).toBeVisible()
      await confirmation.locator('footer').getByRole('button', { name: labels.keepEditing, exact: true }).click()
      await expect(dialog.locator('#provider-name')).toHaveValue('This name will be discarded')
      await dialog.getByRole('button', { name: labels.cancel, exact: true }).click()
      await confirmation.getByRole('button', { name: labels.discardConfirm, exact: true }).click()
      await expect(dialog).toHaveCount(0)
      await expect(edit).toBeFocused()
      expect(
        (await configuration.execute('provider.list', {})).find((item) => item.provider.id === 'progressive-provider'),
      ).toEqual(saved)
      await edit.click()
      // Existing providers keep their immutable ID out of the editable form;
      // the ID/name geometry check belongs to the new-provider form above.
      await expect(dialog.locator('#provider-id')).toHaveCount(0)
      await expect(dialog.locator('#provider-name')).toHaveValue(name)
      await expect(dialog.getByLabel(labels.provider.apiKey, { exact: true })).toHaveValue('')

      for (const width of [1440, 1024, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 900 })
        await main.evaluate((element) => {
          element.scrollTop = 0
        })
        await expect(dialog.getByRole('button', { name: labels.save, exact: true })).toBeVisible()
        await expect(dialog.getByRole('button', { name: labels.cancel, exact: true })).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
        if (width >= 768) {
          await expectControlsAligned(dialog.locator('#provider-protocol'), dialog.locator('#provider-base-url'))
        }
        const viewportActionBox = await customAction.boundingBox()
        const viewportInputBox = await customInput.boundingBox()
        const viewportAddBox = await addCustom.boundingBox()
        expect(viewportActionBox).not.toBeNull()
        expect(viewportInputBox).not.toBeNull()
        expect(viewportAddBox).not.toBeNull()
        expect(viewportInputBox!.width).toBeGreaterThan(0)
        expect(viewportAddBox!.x + viewportAddBox!.width).toBeLessThanOrEqual(
          viewportActionBox!.x + viewportActionBox!.width + 1,
        )
        await expectSingleScrollRegion(dialog)
        await page.screenshot({ path: info.outputPath(`provider-basic-${locale}-${width}.png`) })
        await advanced.scrollIntoViewIfNeeded()
        await advanced.click()
        await dialog.locator('#provider-model-thinking-levels').scrollIntoViewIfNeeded()
        await page.screenshot({ path: info.outputPath(`provider-advanced-${locale}-${width}.png`) })
        const [bodyBox, footerBox] = await Promise.all([main.boundingBox(), dialog.locator('footer').boundingBox()])
        expect(bodyBox!.y + bodyBox!.height).toBeLessThanOrEqual(footerBox!.y + 1)
        await advanced.click()
        await expect(dialog.locator('#provider-model-context')).toBeHidden()
      }
      await page.setViewportSize({ width: 1440, height: 900 })
      const recoveredName = `${name} — recovered`
      await dialog.locator('#provider-name').fill(recoveredName)
      responseMode = 'failure'
      await dialog.getByRole('button', { name: labels.save, exact: true }).click()
      await expect(dialog.getByRole('alert')).toHaveText(labels.error('INVALID_INPUT'))
      await expect(dialog.locator('#provider-name')).toHaveValue(recoveredName)
      await expect(dialog.getByRole('button', { name: labels.cancel, exact: true })).toBeEnabled()
      responseMode = 'unknown'
      await dialog.getByRole('button', { name: labels.save, exact: true }).click()
      await expect(dialog.getByRole('button', { name: labels.reconcile, exact: true })).toBeVisible()
      await expect(dialog.getByRole('button', { name: labels.cancel, exact: true })).toBeDisabled()
      await expect(dialog.getByRole('button', { name: labels.back, exact: true })).toBeDisabled()
      await expect(dialog.locator('#provider-name')).toBeDisabled()
      await page.keyboard.press('Escape')
      await expect(dialog).toBeVisible()
      await page.screenshot({ path: info.outputPath(`provider-unknown-${locale}-1440.png`) })
      await dialog.getByRole('button', { name: labels.reconcile, exact: true }).click()
      await expect(dialog).toHaveCount(0)
      expect(saveWrites).toBe(2)
      expect(
        (await configuration.execute('provider.list', {})).find((item) => item.provider.id === 'progressive-provider')
          ?.provider.name,
      ).toBe(recoveredName)
      await page.getByRole('button', { name: copy.providers.list.edit(recoveredName), exact: true }).click()
      await dialog.getByLabel(labels.provider.apiKey, { exact: true }).fill('replacement-test-key')
      await dialog.getByRole('button', { name: labels.save, exact: true }).click()
      await expect(dialog.getByRole('button', { name: labels.reconcile, exact: true })).toBeVisible()
      await dialog.getByRole('button', { name: labels.reconcile, exact: true }).click()
      await expect(dialog.getByRole('status')).toContainText(labels.credentialUnconfirmed)
      await expect(dialog.getByRole('button', { name: labels.cancel, exact: true })).toBeDisabled()
      await expect(dialog.getByRole('button', { name: labels.back, exact: true })).toBeDisabled()
      await expect(dialog.getByLabel(labels.provider.apiKey, { exact: true })).toBeDisabled()
      await page.keyboard.press('Escape')
      await expect(dialog).toBeVisible()
      expect(saveWrites).toBe(3)
      await page.setViewportSize({ width: 320, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321)
      await expect(dialog.getByRole('button', { name: labels.reconcile, exact: true })).toBeVisible()
      await page.screenshot({ path: info.outputPath(`provider-credential-unknown-${locale}-320.png`) })
      expect(
        (await configuration.execute('provider.list', {})).filter(
          (item) => item.provider.id !== 'progressive-provider',
        ),
      ).toEqual(original)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
