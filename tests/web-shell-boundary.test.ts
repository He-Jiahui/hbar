import { expect, test } from 'bun:test'
import { resolveShellLocale } from '../apps/web/src/shell-copy'
import { canRenderWebSurface, webSurfaceOutlets } from '../apps/web/src/surface-manifest'

test('Web composition root imports runtime and transport without server or preview implementations', async () => {
  const inputs = new Set<string>()
  const result = await Bun.build({
    entrypoints: ['apps/web/src/main.tsx'],
    target: 'browser',
    plugins: [
      {
        name: 'web-shell-boundary',
        setup(build) {
          build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, (args) => {
            inputs.add(args.path.replaceAll('\\', '/'))
            return undefined
          })
        },
      },
    ],
  })
  expect(result.success).toBe(true)
  expect([...inputs].some((path) => path.endsWith('/hbar-ui/packages/lumen-app-ui/src/workbench.tsx'))).toBe(true)
  expect([...inputs].some((path) => path.endsWith('/packages/client/src/index.ts'))).toBe(true)
  expect([...inputs].some((path) => path.endsWith('/packages/app-react/src/index.ts'))).toBe(true)
  expect([...inputs].filter((path) => /\/packages\/(kernel|storage|terminal|ui-sdk)\//.test(path))).toEqual([])
  expect(
    [...inputs].filter((path) =>
      /\/packages\/hbar-app-ui\/src\/(fixtures|profiles|specs|registry|variants|catalog)(\/|\.)/.test(path),
    ),
  ).toEqual([])
  expect([...inputs].some((path) => /\/zustand\/(?:esm\/)?vanilla\.[mc]?js$/.test(path))).toBe(true)
  expect([...inputs].some((path) => path.endsWith('/components/app-shell/WorkbenchShell.tsx'))).toBe(false)
  expect([...inputs].some((path) => path.endsWith('/components/app-shell/AppShell.tsx'))).toBe(false)
})

test('shell chooses a supported language without reading the retired workbench store', () => {
  expect(resolveShellLocale(['en-GB', 'zh-CN'])).toBe('en-US')
  expect(resolveShellLocale(['fr', 'zh-TW'])).toBe('zh-CN')
  expect(resolveShellLocale([])).toBe('zh-CN')
})

test('Web composition does not restore the retired writable store or placeholder panels', async () => {
  const app = await Bun.file('apps/web/src/App.tsx').text()
  const copy = await Bun.file('apps/web/src/shell-copy.ts').text()
  expect(app).not.toContain('workbench-store')
  expect(app).not.toContain('copy.panels')
  expect(app).toContain("presentation.page.kind === 'status'")
  expect(app).toContain('presentation.toolInstanceId')
  expect(app).toContain('presentation.modalInstanceId')
  expect(copy).not.toContain('readonly panels:')
})

test('Web surface manifest assigns every production surface to one outlet', () => {
  expect(webSurfaceOutlets).toEqual({
    settings: 'page',
    status: 'page',
    files: 'tool',
    monitoring: 'tool',
    agents: 'tool',
    goals: 'tool',
    commands: 'modal',
    'settings-editor': 'modal',
  })
  expect(canRenderWebSurface('files')).toBe(true)
  expect(canRenderWebSurface('extensions')).toBe(false)
  expect(canRenderWebSurface('unknown')).toBe(false)
})
