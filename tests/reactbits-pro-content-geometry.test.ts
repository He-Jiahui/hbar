import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chromium, type Browser } from '@playwright/test'
import { readAuditContentGeometry, type AuditContentGeometry } from '../scripts/reactbits-audit-content-geometry'

describe('React Bits content geometry probes', () => {
  let browser: Browser | null = null

  beforeAll(async () => {
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    })
  }, 30_000)

  afterAll(async () => {
    await browser?.close()
    browser = null
  }, 30_000)

  function requireBrowser(): Browser {
    if (!browser) throw new Error('The shared browser did not finish launching')
    return browser
  }

  async function geometryFor(markup: string): Promise<{
    geometry: AuditContentGeometry
    page: Awaited<ReturnType<Browser['newPage']>>
  }> {
    const page = await requireBrowser().newPage({ viewport: { width: 286, height: 640 } })
    await page.setContent(`<!doctype html>${markup}`)
    const geometry = await page.locator('#root').evaluate(readAuditContentGeometry)
    return { geometry, page }
  }

  const clippedFlow = `
    <style>
      html, body { margin: 0; width: 286px; height: 640px; overflow: hidden; }
      #root { width: 286px; height: 640px; }
      #clipper { width: 286px; height: 640px; overflow: hidden; }
      #content { display: flex; flex-direction: column; width: 286px; height: 692px; }
      #private-password, #protected-code { position: absolute; width: 1px; height: 1px; }
      header { flex: 0 0 56px; }
      main { flex: 0 0 588px; }
      footer { flex: 0 0 48px; }
    </style>
    <div id="root">
      <div id="clipper">
        <div id="content">
          <header>Header</header>
          <main>Main</main>
          <footer>Footer</footer>
          <input id="private-password" type="password" value="must-not-be-captured">
          <pre id="protected-code">const protectedCode = 'must-not-be-captured';</pre>
        </div>
      </div>
    </div>`

  test('measures natural hidden content and reports an unreachable footer without copying text or values', async () => {
    const { geometry, page } = await geometryFor(clippedFlow)
    try {
      const metrics = await page.locator('#clipper').evaluate((element) => ({
        clientHeight: (element as HTMLElement).clientHeight,
        scrollHeight: (element as HTMLElement).scrollHeight,
        rootScrollHeight: (element.parentElement as HTMLElement).scrollHeight,
        bodyScrollHeight: document.body.scrollHeight,
        footer: (() => {
          const rect = element.querySelector('footer')?.getBoundingClientRect()
          return rect ? { top: rect.top, bottom: rect.bottom } : null
        })(),
      }))
      expect(metrics).toEqual({
        clientHeight: 640,
        scrollHeight: 692,
        rootScrollHeight: 640,
        bodyScrollHeight: 640,
        footer: { top: 644, bottom: 692 },
      })
      expect(geometry.viewport).toEqual({ width: 286, height: 640 })
      expect(geometry.extent).toEqual({ width: 286, height: 692 })
      expect(geometry.scrollOwners).toEqual([])
      const footerClip = geometry.clippedRegions.find(
        (clip) => clip.region.tag === 'footer' && clip.region.kind === 'semantic-region',
      )
      expect(footerClip?.owner.tag).toBe('div')
      expect(footerClip?.owner.overflowY).toBe('hidden')
      expect(footerClip?.owner.client.height).toBe(640)
      expect(footerClip?.owner.scroll.height).toBe(692)
      expect(footerClip?.axes).toEqual(['y'])
      expect(footerClip?.amount).toEqual({ top: 0, right: 0, bottom: 52, left: 0 })
      expect(footerClip?.unreachable).toBe(true)
      expect(JSON.stringify(geometry)).not.toContain('must-not-be-captured')
      expect(JSON.stringify(geometry)).not.toContain('protectedCode')
    } finally {
      await page.close()
    }
  })

  test('does not report a footer as clipped when its nearest scroll owner can reveal it', async () => {
    const { geometry, page } = await geometryFor(`
      <style>
        html, body { margin: 0; width: 286px; height: 640px; overflow: hidden; }
        #root, #clipper { width: 286px; height: 640px; }
        #clipper { overflow: hidden; }
        #scroller { width: 286px; height: 640px; overflow-y: auto; }
        #content { display: flex; flex-direction: column; width: 286px; height: 692px; }
        header { flex: 0 0 56px; }
        main { flex: 0 0 588px; }
        footer { flex: 0 0 48px; }
      </style>
      <div id="root">
        <div id="clipper">
          <div id="scroller">
            <div id="content"><header>Header</header><main>Main</main><footer>Footer</footer></div>
          </div>
        </div>
      </div>`)
    try {
      const owner = geometry.scrollOwners.find((candidate) => candidate.tag === 'div')
      expect(owner).toMatchObject({
        axes: ['y'],
        client: { height: 640 },
        scroll: { height: 692 },
        maxScroll: { y: 52 },
      })
      expect(geometry.clippedRegions.some((region) => region.region.tag === 'footer')).toBe(false)

      await page.locator('#scroller').evaluate((element) => {
        ;(element as HTMLElement).scrollTop = (element as HTMLElement).scrollHeight
      })
      const footer = await page.locator('footer').evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return { top: rect.top, bottom: rect.bottom, visible: rect.top >= 0 && rect.bottom <= innerHeight }
      })
      expect(footer).toEqual({ top: 592, bottom: 640, visible: true })
    } finally {
      await page.close()
    }
  })

  test('reports a scroll owner clipped by a higher hidden ancestor without blaming its scrollable footer', async () => {
    const { geometry, page } = await geometryFor(`
      <style>
        html, body { margin: 0; width: 286px; height: 640px; overflow: hidden; }
        #root, #clipper { width: 286px; height: 640px; }
        #clipper { overflow: hidden; }
        #scroller { width: 286px; height: 640px; margin-top: 32px; overflow-y: auto; }
        #content { display: flex; flex-direction: column; width: 286px; height: 692px; }
        header { flex: 0 0 56px; }
        main { flex: 0 0 588px; }
        footer { flex: 0 0 48px; }
      </style>
      <div id="root">
        <div id="clipper">
          <div id="scroller">
            <div id="content"><header>Header</header><main>Main</main><footer>Footer</footer></div>
          </div>
        </div>
      </div>`)
    try {
      const ownerClip = geometry.clippedRegions.find((clip) => clip.region.kind === 'scroll-owner')
      expect(ownerClip?.region.tag).toBe('div')
      expect(ownerClip?.owner.tag).toBe('div')
      expect(ownerClip?.owner.overflowY).toBe('hidden')
      expect(ownerClip?.axes).toEqual(['y'])
      expect(ownerClip?.amount).toEqual({ top: 0, right: 0, bottom: 32, left: 0 })
      expect(ownerClip?.unreachable).toBe(true)
      expect(geometry.clippedRegions.some((region) => region.region.tag === 'footer')).toBe(false)
    } finally {
      await page.close()
    }
  })

  test('does not let a higher scroll owner conceal an intervening hidden footer clip', async () => {
    const { geometry, page } = await geometryFor(`
      <style>
        html, body { margin: 0; height: 640px; overflow: hidden; }
        #outer { height: 640px; overflow-y: auto; }
        #root { height: 900px; }
        #clipper { height: 640px; overflow: hidden; }
        main { height: 644px; }
        footer { height: 48px; }
      </style>
      <div id="outer"><div id="root"><div id="clipper"><main></main><footer></footer></div></div></div>`)
    try {
      expect(geometry.scrollOwners.some((owner) => owner.maxScroll.y === 260)).toBe(true)
      const clip = geometry.clippedRegions.find((entry) => entry.region.tag === 'footer')
      expect(clip?.owner.overflowY).toBe('hidden')
      expect(clip?.amount.bottom).toBe(52)
      expect(clip?.unreachable).toBe(true)
    } finally {
      await page.close()
    }
  })

  test('does not treat a document scroll range with viewport overflow hidden as user-reachable', async () => {
    const { geometry, page } = await geometryFor(`
      <style>
        html, body { margin: 0; }
        body { overflow: hidden; }
        #root { height: 692px; }
        main { height: 644px; }
        footer { height: 48px; }
      </style>
      <div id="root"><main></main><footer></footer></div>`)
    try {
      const documentRange = await page.evaluate(() => {
        const scroller = document.scrollingElement
        return scroller ? scroller.scrollHeight - scroller.clientHeight : 0
      })
      expect(documentRange).toBe(52)
      expect(geometry.scrollOwners.some((owner) => owner.path === '$viewport')).toBe(false)
      const clip = geometry.clippedRegions.find((entry) => entry.region.tag === 'footer')
      expect(clip?.owner.path).toBe('$viewport')
      expect(clip?.amount.bottom).toBe(52)
      expect(clip?.unreachable).toBe(true)
    } finally {
      await page.close()
    }
  })

  test('ignores nonrendered descendants and treats a titled single-line ellipsis as reachable', async () => {
    const { geometry, page } = await geometryFor(`
      <style>
        html, body { margin: 0; width: 286px; height: 640px; overflow: hidden; }
        #root { position: relative; width: 286px; height: 640px; }
        footer { width: 100px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        #display-none { display: none; width: 10000px; height: 10000px; }
        #visibility-hidden { visibility: hidden; width: 10000px; height: 10000px; }
      </style>
      <div id="root">
        <footer title="A long accessible footer label that is intentionally ellipsized">A long accessible footer label that is intentionally ellipsized</footer>
        <section id="display-none"><footer>Hidden item</footer></section>
        <section id="visibility-hidden"><footer>Hidden item</footer></section>
      </div>`)
    try {
      const textMetrics = await page
        .locator('footer')
        .first()
        .evaluate((element) => ({
          clientWidth: (element as HTMLElement).clientWidth,
          scrollWidth: (element as HTMLElement).scrollWidth,
          title: element.getAttribute('title'),
        }))
      expect(textMetrics.clientWidth).toBeLessThan(textMetrics.scrollWidth)
      expect(textMetrics.title).toContain('long accessible footer label')
      expect(geometry.extent).toEqual({ width: 286, height: 640 })
      expect(geometry.clippedRegions).toEqual([])
    } finally {
      await page.close()
    }
  })
})
