import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { imageResourceFixtures } from '../tests/fixtures/image-resource-fixtures'
import { resourceImageFixtures, resourceSvgFixture } from '../tests/fixtures/resource-image-fixtures'
const root = join(import.meta.dir, '..', 'artifacts/resource-references')
const repo = join(import.meta.dir, '..').replaceAll('\\', '/')
const origin = process.env.HBAR_NATIVE_RESOURCE_ORIGIN ?? 'http://127.0.0.1:64171'
const mainCdp = process.env.HBAR_NATIVE_MAIN_CDP ?? 'http://127.0.0.1:64173'
const childCdp = process.env.HBAR_NATIVE_RESOURCE_CDP ?? 'http://127.0.0.1:64174'
await mkdir(root, { recursive: true })
await writeFile(
  join(root, 'native-fixture.html'),
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$ = () => {};window.$RefreshSig$ = () => (type) => type;window.__vite_plugin_react_preamble_installed__ = true;</script></head><body><div id="root"></div><script type="module" src="/@fs/${repo}/tests/fixtures/resource-native-browser.tsx"></script></body></html>`,
)
await writeFile(
  join(root, 'native-page-1.html'),
  '<!doctype html><html><head><title>Resource page one</title></head><body><h1>Page one</h1><a href="native-page-2.html">Page two</a><a href="native-page-2.html" target="_blank">New tab request</a></body></html>',
)
await writeFile(
  join(root, 'native-page-2.html'),
  '<!doctype html><html><head><title>Resource page two</title></head><body><h1>Page two</h1></body></html>',
)
const browser = await chromium.connectOverCDP(mainCdp)
const page = browser
  .contexts()[0]
  ?.pages()
  .find((item) => item.url().startsWith(origin))
if (!page) throw new Error('Running hbar main WebView not found')
const previousUrl = page.url()
const marker = `resource-profile-proof-${crypto.randomUUID()}`
const evidence: Record<string, unknown> = {}
const initialSize = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scale: devicePixelRatio }))
const nativeInvoke = (command: string, args: Record<string, unknown>) =>
  page.evaluate(
    async ({ command, args }) => {
      const bridge = (
        window as Window & {
          __TAURI_INTERNALS__?: { invoke(command: string, args: Record<string, unknown>): Promise<unknown> }
        }
      ).__TAURI_INTERNALS__
      if (!bridge) throw new Error('Native bridge is unavailable')
      return bridge.invoke(command, args)
    },
    { command, args },
  )
const errors: string[] = []
const redirects = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch: () => Response.redirect(`${origin}/@fs/${repo}/artifacts/resource-references/native-page-1.html`),
})
page.on('pageerror', (error) => errors.push(error.message))
let childBrowser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | null = null
try {
  await page.evaluate((key) => localStorage.setItem(key, 'main-only'), marker)
  await page.goto(`${origin}/@fs/${repo}/artifacts/resource-references/native-fixture.html`)
  await page.getByRole('link', { name: /Open http/ }).click()
  await page.waitForSelector('[data-resource-browser]')
  childBrowser = await chromium.connectOverCDP(childCdp, { timeout: 15_000 })
  const child = childBrowser
    .contexts()[0]
    ?.pages()
    .findLast((item) => item.url().includes('native-page-1.html'))
  if (!child) throw new Error('Actual resource WebView not found')
  await child.getByRole('heading', { name: 'Page one' }).waitFor()
  evidence.separateProfile = await child.evaluate((key) => localStorage.getItem(key) === null, marker)
  evidence.deniedHostConnection = await child.evaluate(async () => {
    const bridge = (window as Window & { __TAURI_INTERNALS__?: { invoke(command: string): Promise<unknown> } })
      .__TAURI_INTERNALS__
    if (!bridge) return true
    try {
      await bridge.invoke('connection_info')
      return false
    } catch {
      return true
    }
  })
  await child.getByRole('link', { name: 'Page two' }).click()
  await child.getByRole('heading', { name: 'Page two' }).waitFor()
  await page.getByRole('button', { name: 'Back', exact: true }).waitFor({ state: 'visible' })
  await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('button[aria-label="Back"]')?.disabled)
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await child.getByRole('heading', { name: 'Page one' }).waitFor()
  await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('button[aria-label="Forward"]')?.disabled)
  await page.getByRole('button', { name: 'Forward', exact: true }).click()
  await child.getByRole('heading', { name: 'Page two' }).waitFor()
  evidence.navigation = true
  await page.getByRole('button', { name: 'Reload', exact: true }).click()
  await child.getByRole('heading', { name: 'Page two' }).waitFor()
  await page.getByRole('textbox', { name: 'Website address' }).fill(`http://127.0.0.1:${redirects.port}/redirect`)
  await page.getByRole('textbox', { name: 'Website address' }).press('Enter')
  await child.getByRole('heading', { name: 'Page one' }).waitFor()
  evidence.redirect = child.url().includes('native-page-1.html')
  await child.getByRole('link', { name: 'New tab request' }).click()
  await child.getByRole('heading', { name: 'Page two' }).waitFor()
  evidence.popupUsesOwnedView = childBrowser.contexts()[0]?.pages().length === 1
  await redirects.stop(true)
  await page.getByRole('textbox', { name: 'Website address' }).fill(`http://127.0.0.1:${redirects.port}/closed`)
  await page.getByRole('textbox', { name: 'Website address' }).press('Enter')
  await page.getByRole('alert').waitFor({ timeout: 8000 })
  await page
    .getByRole('textbox', { name: 'Website address' })
    .fill(`${origin}/@fs/${repo}/artifacts/resource-references/native-page-1.html`)
  await page.getByRole('textbox', { name: 'Website address' }).press('Enter')
  await child.getByRole('heading', { name: 'Page one' }).waitFor()
  await page.getByRole('alert').waitFor({ state: 'hidden' })
  evidence.failureRecovery = true
  const bounds = await page.locator('.hbar-resource-browser-viewport').evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { width: rect.width * devicePixelRatio, height: rect.height * devicePixelRatio }
  })
  const native = await child.evaluate(() => ({
    width: innerWidth * devicePixelRatio,
    height: innerHeight * devicePixelRatio,
  }))
  if (Math.abs(bounds.width - native.width) > 3 || Math.abs(bounds.height - native.height) > 3)
    throw new Error(`Viewport mismatch ${JSON.stringify({ bounds, native })}`)
  evidence.bounds = { bounds, native }
  const checkBounds = async () => {
    const deadline = Date.now() + 5000
    while (true) {
      const expected = await page.locator('.hbar-resource-browser-viewport').evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return { width: rect.width * devicePixelRatio, height: rect.height * devicePixelRatio, ratio: devicePixelRatio }
      })
      const actual = await child.evaluate(() => ({
        width: innerWidth * devicePixelRatio,
        height: innerHeight * devicePixelRatio,
        ratio: devicePixelRatio,
      }))
      if (
        Math.abs(expected.width - actual.width) < 3 &&
        Math.abs(expected.height - actual.height) < 3 &&
        Math.abs(expected.ratio - actual.ratio) < 0.02
      )
        return { expected, actual }
      if (Date.now() > deadline)
        throw new Error(`Resized native viewport mismatch ${JSON.stringify({ expected, actual })}`)
      await page.waitForTimeout(100)
    }
  }
  await nativeInvoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: 960, height: 640 } } })
  await page.waitForTimeout(300)
  evidence.windowResize = await checkBounds()
  await page.locator('.native-resource-fixture').evaluate((element: HTMLElement) => {
    element.style.inlineSize = 'calc(100% - 240px)'
  })
  await page.waitForTimeout(200)
  evidence.sidebarResize = await checkBounds()
  await nativeInvoke('plugin:webview|set_webview_zoom', { label: 'main', value: 1.2 })
  await page.waitForTimeout(300)
  evidence.zoom = await checkBounds()
  await nativeInvoke('plugin:webview|set_webview_zoom', { label: 'main', value: 1 })
  await nativeInvoke('plugin:window|set_size', {
    label: 'main',
    value: {
      Physical: {
        width: Math.round(initialSize.width * initialSize.scale),
        height: Math.round(initialSize.height * initialSize.scale),
      },
    },
  })
  await page.locator('.native-resource-fixture').evaluate((element: HTMLElement) => {
    element.style.inlineSize = ''
  })
  await page.waitForTimeout(300)
  await child.screenshot({ path: join(root, 'native-resource-page.png') })
  await page.getByRole('button', { name: 'Choose a resource to open', exact: true }).click()
  await page.getByRole('dialog', { name: 'Choose a resource to open', exact: true }).waitFor()
  const id = await page.locator('[data-resource-browser]').getAttribute('data-resource-browser')
  const visibility = async () =>
    page.evaluate(async (id) => {
      const bridge = (
        window as Window & {
          __TAURI_INTERNALS__?: {
            invoke(command: string, args: Record<string, unknown>): Promise<{ visible: boolean }>
          }
        }
      ).__TAURI_INTERNALS__
      if (!bridge) throw new Error('Native bridge is unavailable')
      return (await bridge.invoke('resource_browser', { id, action: 'status' })).visible
    }, id)
  const waitVisibility = async (expected: boolean) => {
    const deadline = Date.now() + 5000
    while ((await visibility()) !== expected) {
      if (Date.now() > deadline) throw new Error(`Native view did not become ${expected ? 'visible' : 'hidden'}`)
      await page.waitForTimeout(100)
    }
  }
  await waitVisibility(false)
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).last().click()
  await waitVisibility(true)
  evidence.overlayInteractive = true
  const images: string[] = []
  for (const fixture of [...imageResourceFixtures, ...resourceImageFixtures, resourceSvgFixture]) {
    const decoded = await page.evaluate((input) => window.resourceNativeFixture.decodeImage(input), fixture)
    if (decoded.width !== fixture.width || decoded.height !== fixture.height)
      throw new Error(`Native image dimensions changed: ${fixture.name}`)
    images.push(fixture.name)
  }
  evidence.imageFormats = images
  if (process.env.HBAR_VERIFY_SYSTEM_OPEN === '1') {
    const target = join(root, 'native-system-open.txt')
    await writeFile(target, 'hbar resource system association smoke test.\n')
    await nativeInvoke('resource_open_system', { target })
    evidence.systemAssociation = true
  }
  await page.evaluate(() => window.resourceNativeFixture.close())
  await page.waitForTimeout(300)
  evidence.closedViews = child.isClosed()
  evidence.remainingTestViews = childBrowser
    .contexts()[0]
    ?.pages()
    .map((item) => item.url())
  if (!evidence.separateProfile || !evidence.deniedHostConnection || !evidence.closedViews)
    throw new Error(`Native isolation/lifecycle failed: ${JSON.stringify(evidence)}`)
  await writeFile(join(root, 'native-verification.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify(evidence, null, 2))
} catch (error) {
  await writeFile(join(root, 'native-verification-errors.json'), JSON.stringify({ errors }, null, 2))
  await page.screenshot({ path: join(root, 'native-verification-failed.png') }).catch(() => undefined)
  throw error
} finally {
  await redirects.stop(true)
  await nativeInvoke('plugin:webview|set_webview_zoom', { label: 'main', value: 1 }).catch(() => undefined)
  await nativeInvoke('plugin:window|set_size', {
    label: 'main',
    value: {
      Physical: {
        width: Math.round(initialSize.width * initialSize.scale),
        height: Math.round(initialSize.height * initialSize.scale),
      },
    },
  }).catch(() => undefined)
  await page.evaluate(() => window.resourceNativeFixture?.close()).catch(() => undefined)
  await page.evaluate((key) => localStorage.removeItem(key), marker).catch(() => undefined)
  await page.goto(previousUrl).catch(() => undefined)
  await childBrowser?.close().catch(() => undefined)
  await browser.close()
}
