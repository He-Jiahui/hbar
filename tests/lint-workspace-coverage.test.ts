import { expect, test } from 'bun:test'
import { ESLint } from 'eslint'
import { z } from 'zod'

test('repository lint covers hbar and its declared Lumen workspace with the same strict rules', async () => {
  const eslint = new ESLint({ overrideConfigFile: 'eslint.config.js' })
  for (const file of [
    'apps/web/src/main.tsx',
    'packages/kernel/src/index.ts',
    'plugins/workflow/src/index.ts',
    'scripts/desktop-smoke.ts',
    'tests/provider.test.ts',
    'e2e/web-shell.spec.ts',
    'hbar-ui/packages/lumen-app-ui/src/index.ts',
    'hbar-ui/packages/lumen-app-ui/vite.config.ts',
  ]) {
    expect(await eslint.isPathIgnored(file)).toBe(false)
    const config = z
      .object({ rules: z.record(z.string(), z.unknown()) })
      .parse(await eslint.calculateConfigForFile(file))
    expect(config.rules['@typescript-eslint/no-explicit-any']).toEqual([2])
    expect(config.rules['@typescript-eslint/no-floating-promises']).toEqual([2])
    expect(config.rules['import-x/no-cycle']).toEqual([
      2,
      { maxDepth: Infinity, ignoreExternal: false, allowUnsafeDynamicCyclicDependency: false },
    ])
  }
  for (const file of [
    'hbar-ui/docs/pages/index.tsx',
    'hbar-ui/packages/mui-material/src/index.d.ts',
    'hbar-ui/packages/lumen-app-ui/dist/index.js',
    'dist/web/assets/index.js',
  ])
    expect(await eslint.isPathIgnored(file)).toBe(true)
  const rootConfig = z.object({ include: z.array(z.string()) }).parse(await Bun.file('tsconfig.json').json())
  const lintConfig = z.object({ include: z.array(z.string()) }).parse(await Bun.file('tsconfig.eslint.json').json())
  for (const pattern of rootConfig.include) expect(lintConfig.include).toContain(pattern)
  expect(lintConfig.include).toContain('hbar-ui/packages/lumen-app-ui/**/*.tsx')
})
