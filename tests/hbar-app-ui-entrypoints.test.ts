import { describe, expect, test } from 'bun:test'
import * as workbench from '@lumen/app-ui'
import * as catalog from '@lumen/app-ui/catalog'
import { publicLumenStylesheetPlugin } from './fixtures/lumen-public-css-resolver'

describe('Lumen production boundary', () => {
  test('keeps optional reference compositions on the explicit catalog entry', () => {
    expect(workbench.LumenButton).toBeDefined()
    expect(workbench.LumenConversation).toBeFunction()
    expect(Object.keys(workbench)).not.toContain('LumenBilling01')
    expect(Object.keys(workbench)).not.toContain('LumenKanban01')
    expect(Object.keys(catalog)).toContain('LumenBilling01')
    expect(Object.keys(catalog)).toContain('LumenKanban01')
  })

  test('bundling the public workbench entry does not traverse catalog or fixtures', async () => {
    const inputs = new Set<string>()
    const result = await Bun.build({
      entrypoints: ['packages/lumen-app-ui/src/index.ts'],
      target: 'browser',
      external: [
        'react',
        'react/jsx-runtime',
        'react-dom',
        'lucide-react',
        '@emotion/react',
        '@emotion/styled',
        '@mui/material',
        '@tanstack/react-virtual',
      ],
      plugins: [
        {
          name: 'observe-workbench-dependencies',
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
    expect(inputs.size).toBeGreaterThan(1)
    expect([...inputs].some((path) => path.includes('/packages/lumen-app-ui/src/index.ts'))).toBe(true)
    expect(
      [...inputs].filter((path) => /\/(fixtures|profiles|specs|registry|variants|catalog)(\/|\.)/.test(path)),
    ).toEqual([])
  })

  test('the legacy theme compatibility entry resolves its catalog stylesheet', async () => {
    const result = await Bun.build({
      entrypoints: ['packages/hbar-app-ui/src/theme.css'],
      target: 'browser',
      plugins: [publicLumenStylesheetPlugin],
    })

    expect(result.success).toBe(true)
    const outputStyles = await Promise.all(
      result.outputs.filter((output) => output.path.endsWith('.css')).map((output) => output.text()),
    )
    expect(outputStyles.some((styles) => styles.includes('.lumen-analytics'))).toBe(true)
  })
})
