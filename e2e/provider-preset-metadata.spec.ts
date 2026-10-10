import { expect, test } from '@playwright/test'
import { createConfigurationCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const rpcShape = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    params: z.object({ commandId: z.string().optional() }).passthrough().optional(),
  })
  .passthrough()

test('existing relay selects preset metadata without replacing endpoint or primary', async ({ browser }) => {
  test.setTimeout(120_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-provider-preset-metadata-'))
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 960 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
    const configuration = createConfigurationCommandClient(host.client)
    await configuration.execute('provider.save', {
      provider: {
        id: 'niuma_openai',
        name: 'Niuma OpenAI',
        protocol: 'openai-responses',
        baseUrl: 'http://127.0.0.1:9/custom/v1',
        model: 'legacy-model',
        models: [
          {
            id: 'legacy-model',
            name: 'Legacy model',
            contextWindow: 272_000,
            maxOutput: 128_000,
            reasoning: true,
            thinkingLevels: ['off', 'medium'],
            defaultThinkingLevel: 'medium',
          },
        ],
        thinkingLevels: ['off', 'medium'],
        defaultThinkingLevel: 'medium',
      },
      apiKey: 'fixture-key-only',
    })
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const pageErrors: string[] = []
    const providerRequests: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    page.on('request', (request) => {
      if (request.url().startsWith('http://127.0.0.1:9/') || request.url().startsWith('https://api.openai.com/'))
        providerRequests.push(request.url())
    })
    await page.routeWebSocket('**/rpc', (socket) => {
      const server = socket.connectToServer()
      socket.onMessage((message) => {
        if (typeof message !== 'string') return server.send(message)
        const parsed = rpcShape.safeParse(JSON.parse(message))
        const commandId = parsed.success ? parsed.data.params?.commandId : undefined
        if (commandId === 'provider.preset.list') {
          socket.send(
            JSON.stringify({
              jsonrpc: '2.0',
              id: parsed.success ? parsed.data.id : undefined,
              result: {
                items: [
                  {
                    id: 'fixture:openai-responses',
                    providerId: 'openai',
                    name: 'OpenAI',
                    protocol: 'openai-responses',
                    baseUrl: 'https://api.openai.com/v1',
                    requiresBaseUrlConfiguration: false,
                    modelCount: 1,
                  },
                ],
                nextCursor: null,
                catalogGeneratedAt: 1,
              },
            }),
          )
          return
        }
        if (commandId === 'provider.preset.models') {
          socket.send(
            JSON.stringify({
              jsonrpc: '2.0',
              id: parsed.success ? parsed.data.id : undefined,
              result: {
                preset: {
                  id: 'fixture:openai-responses',
                  providerId: 'openai',
                  name: 'OpenAI',
                  protocol: 'openai-responses',
                  baseUrl: 'https://api.openai.com/v1',
                  requiresBaseUrlConfiguration: false,
                  modelCount: 1,
                },
                items: [
                  {
                    id: 'gpt-6.1-sol',
                    name: 'GPT-6.1 Sol',
                    contextWindow: 272_000,
                    maxOutput: 128_000,
                    imageInput: false,
                    reasoning: true,
                    inputPrice: 0,
                    outputPrice: 0,
                    thinkingLevels: ['off', 'medium'],
                    defaultThinkingLevel: 'medium',
                  },
                ],
                nextCursor: null,
                catalogGeneratedAt: 1,
              },
            }),
          )
          return
        }
        server.send(message)
      })
    })
    await page.goto(base)
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('button', { name: 'Providers', exact: true }).click()
    await page.getByRole('button', { name: 'Edit Niuma OpenAI', exact: true }).click()
    const dialog = page.locator('.hbar-app-react-provider-dialog')
    await expect(dialog.locator('#provider-base-url')).toHaveValue('http://127.0.0.1:9/custom/v1')
    const preset = dialog.getByRole('combobox', { name: 'Provider preset' })
    await preset.fill('OpenAI')
    await page
      .getByRole('option')
      .filter({ has: page.getByText('OpenAI', { exact: true }) })
      .click()
    const catalog = dialog.getByRole('combobox', { name: 'Add from preset catalog' })
    await catalog.fill('gpt-6.1-sol')
    const modelOption = page.getByRole('option').filter({ has: page.getByText('GPT-6.1 Sol', { exact: true }) })
    await expect(modelOption).toBeVisible()
    await modelOption.click()
    await expect(dialog.locator('#provider-base-url')).toHaveValue('http://127.0.0.1:9/custom/v1')
    await dialog.getByRole('button', { name: 'Save provider', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    const saved = (await configuration.execute('provider.list', {})).find((item) => item.provider.id === 'niuma_openai')
    expect(saved?.provider).toMatchObject({
      baseUrl: 'http://127.0.0.1:9/custom/v1',
      protocol: 'openai-responses',
      model: 'legacy-model',
      models: [{ id: 'legacy-model' }, { id: 'gpt-6.1-sol', contextWindow: 272_000, maxOutput: 128_000 }],
    })
    expect(saved?.hasKey).toBe(true)
    await page.getByRole('button', { name: 'Edit Niuma OpenAI', exact: true }).click()
    const reopened = page.locator('.hbar-app-react-provider-dialog')
    await expect(reopened.locator('#provider-base-url')).toHaveValue('http://127.0.0.1:9/custom/v1')
    await expect(reopened.locator('#provider-model-id')).toHaveValue('gpt-6.1-sol')
    expect(pageErrors).toEqual([])
    expect(providerRequests).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await rm(root, { recursive: true, force: true })
  }
})
