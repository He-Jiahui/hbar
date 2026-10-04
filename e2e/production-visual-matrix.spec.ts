import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host.ts'

type VisualCase = Readonly<{
  width: number
  height: number
  locale: 'zh-CN' | 'en-US'
  theme: 'light' | 'dark'
}>

const matrix: readonly VisualCase[] = [
  { width: 1440, height: 960, locale: 'zh-CN', theme: 'light' },
  { width: 1440, height: 960, locale: 'en-US', theme: 'dark' },
  { width: 1024, height: 768, locale: 'zh-CN', theme: 'dark' },
  { width: 1024, height: 768, locale: 'en-US', theme: 'light' },
  { width: 900, height: 600, locale: 'zh-CN', theme: 'light' },
  { width: 900, height: 600, locale: 'en-US', theme: 'dark' },
  { width: 390, height: 844, locale: 'zh-CN', theme: 'dark' },
  { width: 390, height: 844, locale: 'en-US', theme: 'light' },
  { width: 320, height: 720, locale: 'zh-CN', theme: 'light' },
  { width: 320, height: 720, locale: 'en-US', theme: 'dark' },
]

const copy = {
  'zh-CN': {
    navigation: '工程与会话',
    showNavigation: '显示工程与会话侧栏',
    openSession: '打开会话 ',
    commands: '命令目录',
    closeCommands: '关闭命令目录',
    settings: '设置',
    back: '返回会话',
    status: '状态中心',
    closeStatus: '关闭状态中心',
    connected: '已连接',
  },
  'en-US': {
    navigation: 'Projects and sessions',
    showNavigation: 'Show projects and sessions sidebar',
    openSession: 'Open session ',
    commands: 'Command catalog',
    closeCommands: 'Close command catalog',
    settings: 'Settings',
    back: 'Back to session',
    status: 'Status center',
    closeStatus: 'Close status center',
    connected: 'Connected',
  },
} as const

async function authenticate(context: BrowserContext, token: string): Promise<void> {
  const response = await context.request.post(`http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}/auth/token`, {
    data: { token },
  })
  expect(response.ok()).toBe(true)
}

async function capture(page: Page, directory: string, state: string): Promise<void> {
  await page.screenshot({ path: join(directory, `${state}.png`), fullPage: false })
  const facts = await page.evaluate(() => {
    const box = (selector: string) => {
      const element = document.querySelector(selector)
      if (!element) return null
      const bounds = element.getBoundingClientRect()
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
    }
    const controls = [
      ...document.querySelectorAll<HTMLElement>(
        'button, input:not([type="hidden"]), select, textarea, [role="menuitem"], [role="tab"]',
      ),
    ].map((element) => ({
      name: element.getAttribute('aria-label') ?? element.textContent?.trim().replaceAll(/\s+/g, ' ') ?? '',
      disabled: element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true',
      expanded: element.getAttribute('aria-expanded'),
      pressed: element.getAttribute('aria-pressed'),
      current: element.getAttribute('aria-current'),
    }))
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      locale: document.documentElement.lang,
      theme: document.documentElement.dataset.hbarAppUiTheme,
      devicePixelRatio: window.devicePixelRatio,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      boxes: {
        shell: box('[data-hbar-app-ui-shell="app"]'),
        sidebar: box('.hbar-app-ui-app-sidebar-drawer'),
        frame: box('.hbar-app-ui-app-frame'),
        session: box('.hbar-app-react-session-main'),
        dialog: box('[role="dialog"]'),
      },
      controls,
    }
  })
  await writeFile(join(directory, `${state}.json`), `${JSON.stringify(facts, null, 2)}\n`, 'utf8')
  expect(facts.overflow).toBe(false)
}

test('captures the paired production visual matrix with real Host data', async ({ browser }) => {
  test.setTimeout(180_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-production-visual-'))
  const artifactRoot = 'artifacts/production-ui/visual-matrix'
  await rm(artifactRoot, { recursive: true, force: true })
  await mkdir(artifactRoot, { recursive: true })
  let host: WebSessionHost | undefined
  const manifest: Array<VisualCase & { directory: string; states: string[] }> = []
  try {
    host = await startWebSessionHost({ root })
    for (const item of matrix) {
      const context = await browser.newContext({
        locale: item.locale,
        colorScheme: item.theme,
        viewport: { width: item.width, height: item.height },
        deviceScaleFactor: 1,
      })
      try {
        await authenticate(context, host.ready.token)
        const page = await context.newPage()
        const errors: string[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        await page.addInitScript((theme) => localStorage.setItem('hbar:web:theme', theme), item.theme)
        await page.goto(`http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`)
        const labels = copy[item.locale]
        await expect(page.locator('footer')).toContainText(labels.connected)
        const showNavigation = async () => {
          if (!(await page.getByRole('complementary', { name: labels.navigation, exact: true }).isVisible()))
            await page.getByRole('button', { name: labels.showNavigation, exact: true }).click()
        }
        await showNavigation()
        await page.getByRole('button', { name: `${labels.openSession}${host.ready.sessionTitle}` }).click()
        const directory = join(artifactRoot, `${item.width}x${item.height}-${item.locale}-${item.theme}`)
        await mkdir(directory, { recursive: true })
        await capture(page, directory, 'session')

        await page.keyboard.press('Control+K')
        await expect(page.getByRole('dialog', { name: labels.commands })).toBeVisible()
        await capture(page, directory, 'commands')
        await page.getByRole('button', { name: labels.closeCommands }).click()

        await showNavigation()
        await page.getByRole('button', { name: labels.settings, exact: true }).click()
        await capture(page, directory, 'settings')
        await page.getByRole('button', { name: labels.back }).click()

        await showNavigation()
        await page.getByRole('button', { name: labels.status, exact: true }).click()
        await capture(page, directory, 'status')
        await page.getByRole('button', { name: labels.closeStatus }).click()
        expect(errors).toEqual([])
        manifest.push({ ...item, directory, states: ['session', 'commands', 'settings', 'status'] })
      } finally {
        await context.close()
      }
    }
    await writeFile(join(artifactRoot, 'matrix.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    expect(manifest).toHaveLength(matrix.length)
  } finally {
    if (host) await stopWebSessionHost(host)
    await rm(root, { recursive: true, force: true })
  }
})
