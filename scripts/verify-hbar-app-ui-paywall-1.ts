import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const output = 'artifacts/paywall1-local-review'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function waitForPreview(): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      if ((await fetch(baseUrl)).ok) return
    } catch {
      // Vite may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Preview is not reachable at ${baseUrl}`)
}

async function run(): Promise<void> {
  let server: ReturnType<typeof Bun.spawn> | undefined
  try {
    await waitForPreview()
  } catch {
    server = Bun.spawn(['bun', 'run', 'app-ui:preview', '--', '--host', '127.0.0.1', '--port', '5185'], {
      stdout: 'ignore',
      stderr: 'ignore',
    })
    await waitForPreview()
  }

  await mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ viewport: { width: 1086, height: 640 } })
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  try {
    const url = `${baseUrl}/?variant=hbar-app-ui-paywall-1&mode=isolated&theme=light`
    const panel = page.locator('[data-hbar-app-ui-component="hbar-app-ui-paywall-1"]')
    const article = panel.locator('.hbar-app-ui-paywall-article')
    const card = panel.locator('.hbar-app-ui-paywall-member')
    const preview = panel.locator('.hbar-app-ui-paywall-article-copy')
    const action = card.getByRole('button', { name: 'Become a member: $9/mo' })
    const signIn = card.getByRole('button', { name: 'I already have an account' })

    await page.goto(url, { waitUntil: 'networkidle' })
    assert((await panel.count()) === 1, 'Article lock is not rendered')
    assert((await article.getByRole('heading', { level: 2 }).count()) === 1, 'Article heading should match source h2')
    assert((await card.getByRole('heading', { level: 3 }).count()) === 1, 'Inline member card should match source h3')
    assert((await card.getByRole('listitem').count()) === 3, 'Three host-owned benefits expected')
    assert((await card.getByRole('button').count()) === 2, 'Two member actions expected')
    assert((await action.count()) === 1 && (await preview.count()) === 1, 'Teaser or member action is missing')
    const desktop = await panel.evaluate((element) => {
      const header = element.querySelector('.hbar-app-ui-paywall-article-head')!.getBoundingClientRect()
      const card = element.querySelector('.hbar-app-ui-paywall-member')!.getBoundingClientRect()
      const copy = element.querySelector('.hbar-app-ui-paywall-article-copy')!.getBoundingClientRect()
      return {
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        header: { x: header.x, bottom: header.bottom },
        copy: { y: copy.y, bottom: copy.bottom },
        card: { x: card.x, y: card.y, width: card.width, bottom: card.bottom },
      }
    })
    assert(!desktop.horizontalOverflow, 'Desktop overflows horizontally')
    assert(Math.abs(desktop.header.x - desktop.card.x) < 2, 'Member card is not inline below the article')
    assert(
      desktop.card.y > desktop.header.bottom && desktop.card.y < desktop.copy.bottom,
      'Card should overlap the faded teaser, not sit in a side column',
    )
    await panel.screenshot({ path: `${output}/light-desktop.png` })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(url, { waitUntil: 'networkidle' })
    const mobile = await panel.evaluate((element) => {
      const card = element.querySelector('.hbar-app-ui-paywall-member')!.getBoundingClientRect()
      const article = element.querySelector('.hbar-app-ui-paywall-article')!.getBoundingClientRect()
      const header = element.querySelector('.hbar-app-ui-paywall-article-head')!.getBoundingClientRect()
      const icon = element
        .querySelector('.hbar-app-ui-paywall-member .hbar-app-ui-paywall-icon')!
        .getBoundingClientRect()
      const cardTitle = element.querySelector('.hbar-app-ui-paywall-member h3')!.getBoundingClientRect()
      const cardActions = element.querySelector('.hbar-app-ui-paywall-member-actions')!.getBoundingClientRect()
      const style = getComputedStyle(element)
      const inner = element.querySelector('.lumen-paywall')
      const innerStyle = inner ? getComputedStyle(inner) : null
      const innerRect = inner?.getBoundingClientRect()
      return {
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        layout: { alignItems: style.alignItems, justifyContent: style.justifyContent, paddingTop: style.paddingTop },
        inner:
          innerRect && innerStyle
            ? {
                y: innerRect.y,
                height: innerRect.height,
                display: innerStyle.display,
                flexDirection: innerStyle.flexDirection,
                alignItems: innerStyle.alignItems,
                justifyContent: innerStyle.justifyContent,
                paddingTop: innerStyle.paddingTop,
              }
            : null,
        article: { y: article.y, height: article.height },
        header: { y: header.y, bottom: header.bottom },
        icon: { y: icon.y, bottom: icon.bottom },
        cardTitle: { y: cardTitle.y, bottom: cardTitle.bottom },
        cardActions: { y: cardActions.y, height: cardActions.height },
        card: { x: card.x, y: card.y, width: card.width, bottom: card.bottom },
      }
    })
    assert(
      !mobile.horizontalOverflow && mobile.card.width <= 390,
      `Mobile inline card overflows: ${JSON.stringify(mobile)}`,
    )
    await panel.screenshot({ path: `${output}/light-mobile.png` })
    await page.goto(url.replace('theme=light', 'theme=dark'), { waitUntil: 'networkidle' })
    await panel.screenshot({ path: `${output}/dark-mobile.png` })

    await page.setViewportSize({ width: 320, height: 420 })
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.mouse.move(160, 300)
    await page.mouse.wheel(0, 5000)
    await page.waitForFunction(() => {
      const button = document.querySelector(
        '[data-hbar-app-ui-component="hbar-app-ui-paywall-1"] .hbar-app-ui-paywall-member-actions button:last-child',
      )
      if (!button) return false
      const bounds = button.getBoundingClientRect()
      return bounds.top >= 0 && bounds.bottom <= window.innerHeight + 1
    })
    const shortHeight = await signIn.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      const scroller = element.closest('.lumen-paywall')
      return {
        buttonTop: bounds.top,
        buttonBottom: bounds.bottom,
        paneScrollTop: scroller?.scrollTop ?? 0,
        documentScrollTop: document.scrollingElement?.scrollTop ?? 0,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      }
    })
    assert(
      shortHeight.paneScrollTop + shortHeight.documentScrollTop > 0 && !shortHeight.horizontalOverflow,
      `Short-height card controls are unreachable: ${JSON.stringify(shortHeight)}`,
    )
    await panel.screenshot({ path: `${output}/light-short-height.png` })

    await page.goto(`${url}&paywallFixture=overflow`, { waitUntil: 'networkidle' })
    const benefitList = card.locator('ul[data-hbar-app-ui-list-strategy="pane-scroll"]')
    assert((await benefitList.getByRole('listitem').count()) === 21, 'Over-capacity benefits were dropped')
    await benefitList.focus()
    await page.keyboard.press('End')
    await page.waitForFunction(() => {
      const list = document.querySelector(
        '[data-hbar-app-ui-component="hbar-app-ui-paywall-1"] ul[data-hbar-app-ui-list-strategy="pane-scroll"]',
      )
      return Boolean(list && list.scrollTop > 0)
    })
    const overflow = await benefitList.evaluate((element) => ({
      focused: document.activeElement === element,
      scrollTop: element.scrollTop,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    }))
    assert(
      overflow.focused &&
        overflow.scrollHeight > overflow.clientHeight &&
        overflow.scrollTop > 0 &&
        !overflow.horizontalOverflow,
      `Overflow list is not keyboard-scrollable: ${JSON.stringify(overflow)}`,
    )

    await page.goto(`${url}&paywallFixture=localized`, { waitUntil: 'networkidle' })
    assert(
      (await panel.getByRole('heading', { name: 'Was eine Datenbankmigration wirklich kostet' }).count()) === 1,
      'Localized host copy is missing',
    )
    assert(pageErrors.length === 0, `Paywall 1 preview reported page errors: ${pageErrors.join(' | ')}`)
    console.log(JSON.stringify({ desktop, mobile, shortHeight, overflow, localizedCopy: true, pageErrors: 0 }))
  } finally {
    await browser.close()
    server?.kill()
  }
}

await run()
