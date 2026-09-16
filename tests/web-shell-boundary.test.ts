import { expect, test } from 'bun:test'
import { resolveShellLocale } from '../apps/web/src/shell-copy'

test('Web shell imports production components without business clients, state, or preview fixtures', async () => {
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
  expect([...inputs].some((path) => path.endsWith('/components/app-shell/AppShell.tsx'))).toBe(true)
  expect([...inputs].filter((path) => /\/packages\/(client|kernel|storage|terminal|ui-sdk)\//.test(path))).toEqual([])
  expect(
    [...inputs].filter((path) => /\/(fixtures|profiles|specs|registry|variants|catalog)(\/|\.)/.test(path)),
  ).toEqual([])
  expect([...inputs].filter((path) => path.includes('/zustand/'))).toEqual([])
})

test('shell chooses a supported language without reading the retired workbench store', () => {
  expect(resolveShellLocale(['en-GB', 'zh-CN'])).toBe('en-US')
  expect(resolveShellLocale(['fr', 'zh-TW'])).toBe('zh-CN')
  expect(resolveShellLocale([])).toBe('zh-CN')
})
