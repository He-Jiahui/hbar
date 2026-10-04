import { expect, test } from 'bun:test'
import { z } from 'zod'
import { checkWorkspaceBoundaries, type WorkspaceModule } from '../scripts/architecture/workspace-boundaries'

const manifestSchema = z.object({
  name: z.string(),
  exports: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
})

test('workspace source uses public entries and preserves framework dependency direction', async () => {
  const workspaces: WorkspaceModule[] = []
  for await (const path of new Bun.Glob('{apps,packages,plugins}/*/package.json').scan('.')) {
    const manifest = manifestSchema.parse(await Bun.file(path).json())
    workspaces.push({
      name: manifest.name,
      directory: path.replaceAll('\\', '/').replace('/package.json', ''),
      exports:
        typeof manifest.exports === 'object'
          ? Object.keys(manifest.exports).map((key) => (key === '.' ? key : key.slice(1)))
          : ['.'],
    })
  }
  const sources = []
  for await (const path of new Bun.Glob('{apps,packages,plugins}/*/src/**/*.{ts,tsx}').scan('.'))
    sources.push({ path, source: await Bun.file(path).text() })
  expect(sources.length).toBeGreaterThan(100)
  expect(checkWorkspaceBoundaries(sources, workspaces)).toEqual([])
})

test('boundary guard rejects private imports, reverse edges and cycles through re-exports', () => {
  const workspaces = [
    { name: '@hbar/commands', directory: 'packages/commands', exports: ['.', '/protocol'] },
    { name: '@hbar/contracts', directory: 'packages/contracts', exports: ['.'] },
    { name: '@hbar/app-runtime', directory: 'packages/app-runtime', exports: ['.'] },
  ]
  const result = checkWorkspaceBoundaries(
    [
      { path: 'packages/commands/src/index.ts', source: "export * from '@hbar/contracts'" },
      { path: 'packages/contracts/src/index.ts', source: "import type { Input } from '@hbar/commands/protocol'" },
      {
        path: 'packages/app-runtime/src/index.ts',
        source: "import('../../contracts/src/index'); import('react'); import(variable)",
      },
    ],
    workspaces,
  )
  expect(result.map((item) => item.reason)).toEqual([
    'forbidden-dependency',
    'dynamic-import',
    'private-import',
    'forbidden-dependency',
    'cycle',
  ])
  expect(
    checkWorkspaceBoundaries(
      [
        { path: 'packages/contracts/src/index.ts', source: "import type { Input } from '@hbar/commands/protocol'" },
        { path: 'packages/app-runtime/src/index.ts', source: "import { createStore } from 'zustand/vanilla'" },
      ],
      workspaces,
    ),
  ).toEqual([])
})
