import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const output = resolve(process.env.HBAR_APP_UI_RAIL_OUTPUT ?? 'artifacts/reactbits-pro-visual-audit/app-shell-8-rail')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--disable-http2', '--disable-quic'],
})
try {
  const source = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  await source.goto('https://pro.reactbits.dev/docs/app-ui/app-shell/app-shell-8', { waitUntil: 'domcontentloaded' })
  await source
    .frameLocator('iframe[title="Preview"]')
    .getByRole('heading', { name: 'Today' })
    .waitFor({ state: 'visible' })
  await source.getByRole('button', { name: 'Tablet preview width' }).click()
  const sourceRoot = source.frameLocator('iframe[title="Preview"]').locator('body > div').first()
  await sourceRoot.locator('aside').first().waitFor({ state: 'visible' })
  const sourceGeometry = await sourceRoot.evaluate((root) => {
    const asides = [...root.querySelectorAll('aside')]
    return {
      width: root.getBoundingClientRect().width,
      height: root.getBoundingClientRect().height,
      visibleAsides: asides
        .filter((item) => getComputedStyle(item).display !== 'none')
        .map((item) => Math.round(item.getBoundingClientRect().width)),
      dark: Number.parseInt(getComputedStyle(root).color.match(/\d+/)?.[0] ?? '0', 10) > 128,
      bottomNavigationVisible: [...root.querySelectorAll('nav[aria-label="Queues"]')].some(
        (item) =>
          item.closest('.fixed, .sticky') !== null ||
          (getComputedStyle(item).display !== 'none' && item.getBoundingClientRect().y > 500),
      ),
    }
  })
  if (
    sourceGeometry.visibleAsides.length !== 1 ||
    sourceGeometry.visibleAsides[0] !== 56 ||
    sourceGeometry.width < 720 ||
    sourceGeometry.width >= 1024
  ) {
    throw new Error(`Source icon rail did not appear at the tablet preview width: ${JSON.stringify(sourceGeometry)}`)
  }
  await sourceRoot.screenshot({ path: resolve(output, 'rail-reference.png') })

  const local = await browser.newPage({
    viewport: { width: Math.round(sourceGeometry.width), height: Math.round(sourceGeometry.height) },
    reducedMotion: 'reduce',
  })
  const preview = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5181'
  await local.goto(
    `${preview}/?mode=isolated&theme=${sourceGeometry.dark ? 'dark' : 'light'}&variant=hbar-app-ui-app-shell-8`,
    {
      waitUntil: 'domcontentloaded',
    },
  )
  const localRoot = local.locator('.lumen-adaptive-shell')
  await localRoot.waitFor({ state: 'visible' })
  const localGeometry = await localRoot.evaluate((root) => {
    const rail = root.querySelector('.lumen-adaptive-rail')
    const aside = root.querySelector('.lumen-adaptive-sidebar')
    const bottom = root.querySelector('.lumen-adaptive-bottom-nav')
    return {
      width: root.getBoundingClientRect().width,
      height: root.getBoundingClientRect().height,
      railWidth: rail?.getBoundingClientRect().width,
      sidebarVisible: aside ? getComputedStyle(aside).display !== 'none' : null,
      bottomNavigationVisible: bottom ? getComputedStyle(bottom).display !== 'none' : null,
      horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
    }
  })
  if (
    localGeometry.width !== sourceGeometry.width ||
    localGeometry.height !== sourceGeometry.height ||
    localGeometry.railWidth !== 56 ||
    localGeometry.sidebarVisible ||
    localGeometry.bottomNavigationVisible ||
    localGeometry.horizontalOverflow
  ) {
    throw new Error(
      `Local icon rail does not match the source's responsive structure: ${JSON.stringify({ sourceGeometry, localGeometry })}`,
    )
  }
  await localRoot.screenshot({ path: resolve(output, 'rail-local.png') })
  await writeFile(
    resolve(output, 'rail-metrics.json'),
    `${JSON.stringify({ sourceGeometry, localGeometry }, null, 2)}\n`,
  )
  console.log(JSON.stringify({ sourceGeometry, localGeometry, output }))
} finally {
  await browser.close()
}
