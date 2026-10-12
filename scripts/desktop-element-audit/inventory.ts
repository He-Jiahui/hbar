import { readdir } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import * as ts from 'typescript'
import { classifyDesktopSource } from './classify'
import { loadDesktopSourceGraph } from './graph'
import { collectNativePlatformElements } from './platform'
import type { DesktopElement, DesktopElementInventory } from './types'

const roots = ['apps/web/src', 'packages/app-react/src', 'packages/schema-react/src'] as const

async function tsxFiles(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true })
  const result: string[] = []
  for (const entry of entries) {
    const current = resolve(path, entry.name)
    if (entry.isDirectory()) result.push(...(await tsxFiles(current)))
    else if (entry.name.endsWith('.tsx')) result.push(current)
  }
  return result
}

export async function collectDesktopElements(root: string): Promise<DesktopElementInventory> {
  const graph = loadDesktopSourceGraph(root)
  const sourceModules = [...graph.sources.keys()]
    .map((path) => relative(root, path).replaceAll('\\', '/'))
    .filter((path) => path.endsWith('.tsx') && roots.some((prefix) => path.startsWith(prefix + '/')))
    .sort()
  const elements: DesktopElement[] = []
  const program = ts.createProgram({
    rootNames: [resolve(root, 'apps/web/src/main.tsx')],
    options: graph.compilerOptions,
  })
  const checker = program.getTypeChecker()
  for (const [path, source] of graph.sources) {
    const display = relative(root, path).replaceAll('\\', '/')
    if (sourceModules.includes(display))
      elements.push(...classifyDesktopSource(display, program.getSourceFile(path) ?? source, checker))
  }
  elements.push(...(await collectNativePlatformElements(root)))
  const allFiles = (await Promise.all(roots.map((prefix) => tsxFiles(resolve(root, prefix)))))
    .flat()
    .map((path) => relative(root, path).replaceAll('\\', '/'))
  return {
    schemaVersion: 1,
    entry: 'apps/web/src/main.tsx',
    elements: elements.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line),
    sourceModules,
    unusedTsxModules: allFiles.filter((path) => !sourceModules.includes(path)).sort(),
    excludedBoundaries: graph.externalBoundaries,
    productionBuildInputs: [],
    productionBuildStatus: 'not-run',
  }
}

export async function collectDesktopBuildInputs(root: string): Promise<readonly string[]> {
  const inputs = new Set<string>()
  const result = await Bun.build({
    entrypoints: [resolve(root, 'apps/web/src/main.tsx')],
    target: 'browser',
    plugins: [
      {
        name: 'desktop-element-inputs',
        setup(build) {
          build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, (args) => {
            const path = relative(root, args.path).replaceAll('\\', '/')
            if (!path.startsWith('../') && !path.includes('node_modules/')) inputs.add(path)
            return undefined
          })
        },
      },
    ],
  })
  if (!result.success) throw new AggregateError(result.logs, 'Desktop production dependency build failed')
  return [...inputs].sort()
}
