import { expect, test } from 'bun:test'
import { createElement, createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  LumenAppShell,
  LUMEN_TOOL_SEPARATOR_WIDTH_REM,
  nextLumenToolPaneWidth,
  resolveLumenToolPaneLayout,
  type LumenToolLayout,
  type LumenToolPaneLayoutInput,
} from '@lumen/app-ui'

const descriptor: LumenToolLayout = { mainMinWidthRem: 20, minWidthRem: 20, maxWidthRem: 36 }
const input = (width = 900, root = 16): LumenToolPaneLayoutInput => ({
  toolPresent: true,
  preferredWidthRem: 24,
  layout: descriptor,
  geometry: { availableInlineSizePx: width, rootFontSizePx: root },
})

test('opt-in drawer preserves a 32rem reading budget and old page callers remain compatible', () => {
  for (const root of [16, 20]) {
    const layout: LumenToolLayout = { ...descriptor, mainMinWidthRem: 32, constrainedPresentation: 'drawer' }
    const threshold = (32 + 20 + LUMEN_TOOL_SEPARATOR_WIDTH_REM) * root
    expect(resolveLumenToolPaneLayout({ ...input(threshold - 1, root), layout }).presentation).toBe('drawer')
    expect(resolveLumenToolPaneLayout({ ...input(threshold, root), layout }).presentation).toBe('split')
    expect(resolveLumenToolPaneLayout({ ...input(320, root), layout }).widthRem).toBeNull()
  }
  expect(resolveLumenToolPaneLayout(input(320)).presentation).toBe('page')
})

test('tool split threshold includes both descriptor minima and the normal-flow separator hit area', () => {
  expect(LUMEN_TOOL_SEPARATOR_WIDTH_REM).toBe(0.375)
  const threshold = (20 + 20 + LUMEN_TOOL_SEPARATOR_WIDTH_REM) * 16
  expect(threshold).toBe(646)
  expect(resolveLumenToolPaneLayout(input(threshold - 0.01)).presentation).toBe('page')
  expect(resolveLumenToolPaneLayout(input(threshold)).widthRem).toBe(20)
  expect(resolveLumenToolPaneLayout(input(threshold + 0.01)).presentation).toBe('split')
})

test('900 sidebar open/closed uses actual remaining body width rather than a viewport breakpoint', () => {
  expect(resolveLumenToolPaneLayout(input(900 - 17 * 16)).presentation).toBe('page')
  expect(resolveLumenToolPaneLayout(input(900))).toEqual({
    presentation: 'split',
    widthRem: 24,
    minWidthRem: 20,
    maxWidthRem: 35.875,
  })
  expect(resolveLumenToolPaneLayout(input(1440 - 17 * 16)).presentation).toBe('split')
  expect(resolveLumenToolPaneLayout(input(900 - 12 * 16)).widthRem).toBe(23.875)
})

test('root font growth changes rem capacity without changing the CSS-pixel container', () => {
  expect(resolveLumenToolPaneLayout(input(750, 16)).presentation).toBe('split')
  expect(resolveLumenToolPaneLayout(input(750, 20)).presentation).toBe('page')
  expect(resolveLumenToolPaneLayout(input(807.5, 20)).widthRem).toBe(20)
  expect(resolveLumenToolPaneLayout(input(807.49, 20)).presentation).toBe('page')
})

test('browser zoom is represented by available layout CSS pixels, not devicePixelRatio or screen pixels', () => {
  expect(resolveLumenToolPaneLayout(input(1440)).presentation).toBe('split')
  expect(resolveLumenToolPaneLayout(input(1440 / 2 - 17 * 16)).presentation).toBe('page')
  expect(resolveLumenToolPaneLayout(input(1440 / 2)).presentation).toBe('split')
})

test('320/390 and hidden zero-width body are single-page without a fabricated tool minimum', () => {
  for (const width of [0, 320, 390]) {
    expect(resolveLumenToolPaneLayout(input(width))).toEqual({
      presentation: 'page',
      widthRem: null,
      minWidthRem: null,
      maxWidthRem: null,
    })
  }
})

test('no tool remains none even without browser measurements or with invalid descriptors', () => {
  expect(
    resolveLumenToolPaneLayout({
      ...input(),
      toolPresent: false,
      geometry: null,
      layout: { ...descriptor, minWidthRem: 0 },
    }),
  ).toEqual({ presentation: 'none', widthRem: null, minWidthRem: null, maxWidthRem: null })
})

test('SSR and missing ResizeObserver measurements fail safe to page, not a false split', () => {
  expect(resolveLumenToolPaneLayout({ ...input(), geometry: null }).presentation).toBe('page')
})

test('invalid finite/range inputs cannot create negative panes or Infinity styles', () => {
  for (const invalid of [Number.NaN, Infinity, -Infinity, -1, 0]) {
    expect(resolveLumenToolPaneLayout(input(invalid)).presentation).toBe('page')
    expect(resolveLumenToolPaneLayout(input(900, invalid)).presentation).toBe('page')
    for (const name of ['mainMinWidthRem', 'minWidthRem', 'maxWidthRem'] as const) {
      expect(resolveLumenToolPaneLayout({ ...input(), layout: { ...descriptor, [name]: invalid } }).presentation).toBe(
        'page',
      )
    }
  }
  expect(resolveLumenToolPaneLayout({ ...input(), layout: { ...descriptor, maxWidthRem: 19 } }).presentation).toBe(
    'page',
  )
})

test('preferred widths are clamped visually without mutating the saved descriptor or input', () => {
  const saved = Object.freeze({ ...input(700), preferredWidthRem: 36 })
  expect(resolveLumenToolPaneLayout(saved).widthRem).toBe(23.375)
  expect(saved.preferredWidthRem).toBe(36)
  expect(saved.layout).toEqual(descriptor)
  expect(resolveLumenToolPaneLayout({ ...saved, geometry: input(1440).geometry }).widthRem).toBe(36)
  expect(resolveLumenToolPaneLayout({ ...input(1440), preferredWidthRem: 80 }).widthRem).toBe(36)
  expect(resolveLumenToolPaneLayout({ ...input(1440), preferredWidthRem: 1 }).widthRem).toBe(20)
  for (const invalid of [Number.NaN, Infinity, 0, -2]) {
    expect(resolveLumenToolPaneLayout({ ...input(), preferredWidthRem: invalid }).widthRem).toBe(20)
  }
})

test('separator keyboard moves the right pane by 32 layout CSS pixels and clamps Home/End', () => {
  const current = input()
  const geometry = current.geometry!
  const layout = resolveLumenToolPaneLayout(current)
  expect(nextLumenToolPaneWidth(24, 'increase', geometry, layout)).toBe(26)
  expect(nextLumenToolPaneWidth(24, 'decrease', geometry, layout)).toBe(22)
  expect(nextLumenToolPaneWidth(24, 'min', geometry, layout)).toBe(20)
  expect(nextLumenToolPaneWidth(24, 'max', geometry, layout)).toBe(35.875)
  expect(nextLumenToolPaneWidth(20, 'decrease', geometry, layout)).toBe(20)
  expect(nextLumenToolPaneWidth(35.875, 'increase', geometry, layout)).toBe(35.875)
  const larger = input(1200, 20)
  expect(nextLumenToolPaneWidth(24, 'increase', larger.geometry!, resolveLumenToolPaneLayout(larger))).toBe(25.6)
})

test('non-split or invalid keyboard geometry has no resize action', () => {
  const geometry = input().geometry!
  const layout = resolveLumenToolPaneLayout(input())
  expect(nextLumenToolPaneWidth(24, 'increase', geometry, resolveLumenToolPaneLayout(input(320)))).toBeNull()
  expect(nextLumenToolPaneWidth(24, 'increase', { ...geometry, rootFontSizePx: 0 }, layout)).toBeNull()
  expect(nextLumenToolPaneWidth(Number.NaN, 'increase', geometry, layout)).toBeNull()
})

test('opt-in SSR retains main/tool content, refs, named fallback targets, and inert page without hiding ancestors', () => {
  let commits = 0
  const html = renderToStaticMarkup(
    createElement(LumenAppShell, {
      label: '当前工作台',
      sidebarWidthRem: 17,
      sidebarOpen: false,
      closeSidebarLabel: '关闭侧栏',
      onCloseSidebar: () => {},
      titlebar: createElement('header', null, 'Native titlebar'),
      header: createElement('header', null, 'Global navigation'),
      mainRef: createRef<HTMLElement>(),
      toolRef: createRef<HTMLElement>(),
      resizeRef: createRef<HTMLElement>(),
      toolLayout: descriptor,
      toolLabel: '文件工具',
      tool: createElement('textarea', { defaultValue: '保留未保存文件草稿' }),
      toolResize: {
        label: '调整文件工具宽度',
        valueText: (value) => `${value} rem`,
        onCommit: () => {
          commits += 1
          return Promise.resolve()
        },
      },
      children: createElement('textarea', { defaultValue: '保留会话草稿' }),
    }),
  )
  expect(html).toContain('data-tool-presentation="page"')
  expect(html).toContain(
    '<main class="lumen-app-main hbar-app-ui-app-main" aria-label="当前工作台" tabindex="-1" inert="">',
  )
  expect(html).toContain('aria-label="文件工具" tabindex="-1"')
  expect(html).toContain('保留未保存文件草稿')
  expect(html).toContain('保留会话草稿')
  expect(html).not.toContain('role="separator" aria-label="调整文件工具宽度"')
  expect(html).not.toContain('aria-modal')
  expect(html).not.toMatch(/<main[^>]*(?:hidden|aria-hidden|style)/u)
  expect(commits).toBe(0)
})

test('omitting the optional contract preserves legacy markup/presentation and supplies no new resize control', () => {
  const html = renderToStaticMarkup(
    createElement(LumenAppShell, {
      label: 'Workspace',
      sidebarWidthRem: 17,
      sidebarOpen: false,
      closeSidebarLabel: 'Close sidebar',
      onCloseSidebar: () => {},
      tool: createElement('section', null, 'Existing Files'),
      children: 'Original conversation',
    }),
  )
  expect(html).not.toContain('data-tool-presentation')
  expect(html).not.toContain('inert=')
  expect(html).not.toContain('role="separator"')
  expect(html).not.toContain('lumen-app-rem-probe')
  expect(html).toContain('--lumen-sidebar-size:17rem')
  expect(html).toContain('--lumen-tool-size:24rem')
})
