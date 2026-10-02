import { expect, test } from 'bun:test'
import { dirname, resolve } from 'node:path'
import * as ts from 'typescript'
import { z } from 'zod'

const root = resolve(import.meta.dirname, '..')
const packageRoot = resolve(root, 'hbar-ui/packages/lumen-app-ui')
const publicEntries = [
  { name: '@lumen/app-ui', exportKey: '.' },
  { name: '@lumen/app-ui/catalog', exportKey: './catalog' },
  { name: '@lumen/app-ui/variants', exportKey: './variants' },
] as const

async function compilerConfiguration() {
  const config = z
    .object({
      compilerOptions: z.record(z.string(), z.unknown()),
      include: z.array(z.string()),
      exclude: z.array(z.string()),
    })
    .parse(await Bun.file(resolve(root, 'tsconfig.json')).json())
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, root)
  expect(parsed.errors).toEqual([])
  return parsed
}

test('root tests and preview scripts resolve only the declared Lumen TypeScript entries', async () => {
  const { options } = await compilerConfiguration()
  const manifest = z
    .object({ exports: z.record(z.string(), z.string()) })
    .parse(await Bun.file(resolve(packageRoot, 'package.json')).json())
  for (const importer of [
    'tests/lumen-public-resolution.test.ts',
    'tests/fixtures/hbar-app-ui-app-shell-chat-fixtures.ts',
    'e2e/support/file-draft-preview.ts',
    'apps/hbar-app-ui-preview/src/main.tsx',
  ]) {
    const containingFile = resolve(root, importer)
    expect(ts.sys.fileExists(containingFile)).toBe(true)
    for (const entry of publicEntries) {
      const exported = manifest.exports[entry.exportKey]
      if (!exported) throw new Error(`Missing declared public entry: ${entry.exportKey}`)
      const result = ts.resolveModuleName(entry.name, containingFile, options, ts.sys).resolvedModule
      expect(result, `${entry.name} from ${importer}`).toBeDefined()
      expect(resolve(result?.resolvedFileName ?? dirname(containingFile))).toBe(resolve(packageRoot, exported))
    }
    expect(
      ts.resolveModuleName('@lumen/app-ui/src/button', containingFile, options, ts.sys).resolvedModule,
    ).toBeUndefined()
  }
})

test('public entry resolution keeps strict checking enabled without narrowing repository inputs', async () => {
  const { options, fileNames } = await compilerConfiguration()
  for (const flag of [
    'strict',
    'noUncheckedIndexedAccess',
    'exactOptionalPropertyTypes',
    'noImplicitReturns',
    'noFallthroughCasesInSwitch',
    'noUnusedLocals',
    'noUnusedParameters',
  ] as const)
    expect(options[flag]).toBe(true)
  expect(options.paths && Object.keys(options.paths).sort()).toEqual(publicEntries.map((entry) => entry.name).sort())
  for (const entry of publicEntries) expect(options.paths?.[entry.name]).toHaveLength(1)
  for (const file of [
    'apps/web/src/App.tsx',
    'apps/hbar-app-ui-preview/src/app-shell-contracts-preview-model.ts',
    'packages/app-react/src/lumen-session-workspace.tsx',
    'packages/kernel/src/index.ts',
    'plugins/agent/src/index.ts',
    'scripts/desktop-smoke.ts',
    'tests/lumen-public-resolution.test.ts',
    'e2e/message-file-reference.spec.ts',
  ])
    expect(fileNames.map((name) => resolve(name))).toContain(resolve(root, file))
})

test('maintained Bun test entries retain native and quality gates with the hbar compiler configuration', async () => {
  const manifest = z
    .object({ scripts: z.object({ test: z.string(), check: z.string() }) })
    .parse(await Bun.file(resolve(root, 'package.json')).json())
  expect(manifest.scripts.test).toBe(
    'bun run native:build && bun test tests --tsconfig-override ./tsconfig.json --timeout 20000',
  )
  expect(manifest.scripts.check).toBe(
    'bun run native:build && bun run lint && bun run typecheck && bun test tests --tsconfig-override ./tsconfig.json --timeout 20000',
  )
})
