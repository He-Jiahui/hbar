import { expect, test } from 'bun:test'
import { dirname, relative, resolve } from 'node:path'
import * as ts from 'typescript'
import { z } from 'zod'

const root = resolve(import.meta.dirname, '..')
const packageRoot = resolve(root, 'packages/lumen-app-ui')
const publicEntries = [
  { name: '@lumen/app-ui', exportKey: '.' },
  { name: '@lumen/app-ui/catalog', exportKey: './catalog' },
  { name: '@lumen/app-ui/variants', exportKey: './variants' },
] as const

const productionFamilies = [
  'app-shell',
  'app-sidebar',
  'ai-chat',
  'prompt-input',
  'agent-activity',
  'agent-approval',
  'agent-plan',
  'tool-calls',
  'usage',
  'file-manager',
  'editor',
  'settings-form',
  'integrations',
  'notifications',
  'scheduling',
  'kanban',
  'dashboard',
  'analytics',
  'monitoring',
  'command-menu',
  'onboarding',
  'wizard',
  'navbar',
  'mobile',
  'session-components',
  'workspace-components',
  'workbench',
] as const

test('production family subpaths resolve from the web host without opening private source entries', async () => {
  const { options } = await compilerConfiguration()
  const manifest = z
    .object({
      exports: z.record(z.string(), z.string()),
      publishConfig: z.object({ exports: z.record(z.string(), z.unknown()) }),
    })
    .parse(await Bun.file(resolve(packageRoot, 'package.json')).json())
  const importer = resolve(root, 'apps/web/src/App.tsx')
  for (const family of productionFamilies) {
    const key = `./${family}`
    const source = manifest.exports[key]
    if (!source) throw new Error(`Missing production family entry: ${key}`)
    const module = ts.resolveModuleName(`@lumen/app-ui/${family}`, importer, options, ts.sys).resolvedModule
    expect(resolve(module?.resolvedFileName ?? '')).toBe(resolve(packageRoot, source))
    expect(ts.sys.fileExists(resolve(packageRoot, source))).toBe(true)
    expect(manifest.publishConfig.exports[key]).toEqual({
      types: `./dist/types/${source.replace('./src/', '').replace(/\.tsx$/, '.d.ts')}`,
      import: `./dist/${family}.js`,
    })
    expect(source).not.toMatch(/catalog|fixtures|preview|variants\//)
  }
})

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
  const aliases = options.paths ?? {}
  const legacyAliases = Object.entries(aliases).filter(
    ([name]) => name === 'hbar-app-ui' || name.startsWith('hbar-app-ui/'),
  )
  const nonLegacyNames = Object.keys(aliases).filter((name) => !legacyAliases.some(([alias]) => alias === name))
  expect(nonLegacyNames.sort()).toEqual(
    [...publicEntries.map((entry) => entry.name), '@mui/internal-test-utils'].sort(),
  )
  for (const entry of publicEntries) expect(options.paths?.[entry.name]).toHaveLength(1)
  const renderer = ts.resolveModuleName(
    '@mui/internal-test-utils',
    resolve(packageRoot, 'src/session-composer.test.tsx'),
    options,
    ts.sys,
  ).resolvedModule
  expect(resolve(renderer?.resolvedFileName ?? '')).toBe(resolve(root, 'tests/lumen/renderer.tsx'))
  expect(legacyAliases.length).toBeGreaterThan(0)
  const legacySourceRoot = resolve(root, 'packages/hbar-app-ui/src')
  const legacyManifest = z
    .object({ exports: z.record(z.string(), z.string()) })
    .parse(await Bun.file(resolve(root, 'packages/hbar-app-ui/package.json')).json())
  for (const [alias, targets] of legacyAliases) {
    expect(targets).toHaveLength(1)
    const target = resolve(root, targets[0] ?? '')
    const targetRelative = relative(legacySourceRoot, target)
    expect(targetRelative).not.toMatch(/^\.\.(?:[\\/]|$)/)
    expect(ts.sys.fileExists(target)).toBe(true)
    expect(alias).toMatch(/^hbar-app-ui(?:\/|$)/)
    const exportKey = alias === 'hbar-app-ui' ? '.' : `.${alias.slice('hbar-app-ui'.length)}`
    const publicTarget = legacyManifest.exports[exportKey]
    expect(publicTarget, `public compatibility export: ${exportKey}`).toBeDefined()
    expect(target).toBe(resolve(root, 'packages/hbar-app-ui', publicTarget ?? ''))
  }
  const productionRoots = ['/apps/web/src/', '/packages/app-react/src/', '/packages/lumen-app-ui/src/']
  const productionFiles = fileNames.filter((file) => {
    const normalized = file.replaceAll('\\', '/')
    return productionRoots.some((directory) => normalized.includes(directory))
  })
  for (const file of productionFiles) {
    const source = ts.createSourceFile(file, await Bun.file(file).text(), ts.ScriptTarget.Latest, true)
    const legacyImports: string[] = []
    const inspect = (node: ts.Node): void => {
      let specifier: string | undefined
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      )
        specifier = node.moduleSpecifier.text
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
      ) {
        const argument = node.arguments[0]
        if (argument && ts.isStringLiteral(argument)) specifier = argument.text
      }
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal))
        specifier = node.argument.literal.text
      if (specifier && legacyAliases.some(([alias]) => specifier === alias || specifier.startsWith(`${alias}/`)))
        legacyImports.push(specifier)
      ts.forEachChild(node, inspect)
    }
    inspect(source)
    expect(legacyImports, file).toEqual([])
  }
  for (const file of [
    'apps/web/src/App.tsx',
    'apps/hbar-app-ui-preview/src/app-shell-contracts-preview-model.ts',
    'packages/app-react/src/lumen-session-workspace.tsx',
    'packages/kernel/src/index.ts',
    'plugins/agent/src/index.ts',
    'scripts/desktop-smoke.ts',
    'tests/lumen-public-resolution.test.ts',
    'tests/lumen/renderer.tsx',
    'tests/lumen/setup.ts',
    'e2e/message-file-reference.spec.ts',
    'vitest.lumen.config.ts',
  ])
    expect(fileNames.map((name) => resolve(name))).toContain(resolve(root, file))
})

test('maintained Bun test entries retain native and quality gates with the hbar compiler configuration', async () => {
  const manifest = z
    .object({ scripts: z.object({ test: z.string(), 'test:lumen': z.string(), check: z.string() }) })
    .parse(await Bun.file(resolve(root, 'package.json')).json())
  expect(manifest.scripts.test).toBe(
    'bun run native:build && bun test ./tests ./packages/kernel/src/schedule-runner.test.ts ./packages/kernel/src/schedule-service.test.ts --tsconfig-override ./tsconfig.json --timeout 20000',
  )
  expect(manifest.scripts['test:lumen']).toBe('vitest run --config vitest.lumen.config.ts')
  const steps = manifest.scripts.check.split('&&').map((step) => step.trim())
  const requiredSequence = [
    'bun run lint',
    'bun run typecheck',
    'bun run check:sandbox-evaluator',
    'bun run check:theme-tokens',
    'bun run check:styles',
    'bun run check:responsive',
    'bun run check:typed-messages',
    'bun run test',
    'bun run test:lumen',
    'bun run test:app-react',
  ]
  let previous = -1
  for (const required of requiredSequence) {
    const index = steps.indexOf(required)
    expect(index, `required check step: ${required}`).toBeGreaterThan(previous)
    previous = index
  }
})
