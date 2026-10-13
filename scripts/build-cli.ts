import { resolve, dirname } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { buildRuntimePackage } from './build-runtime-package'
import { optionalBundleExternals } from './bundle-externals'

export async function buildStandaloneCli(project: string, outfile: string): Promise<void> {
  const root = resolve(project), output = resolve(outfile)
  const packaged = await buildRuntimePackage(root, resolve(root, 'artifacts/standalone-runtime-build'))
  await mkdir(dirname(output), { recursive: true })
  const build = await Bun.build({
    entrypoints: [resolve(root, 'apps/cli/src/main.ts'), resolve(root, 'packages/storage/src/worker.ts'), resolve(root, 'packages/storage/src/maintenance-worker.ts'), resolve(root, 'packages/storage/src/node-state-worker.ts')],
    target: 'bun', compile: { outfile: output }, minify: false,
    external: [...optionalBundleExternals],
    define: { HBAR_RUNTIME_PACKAGE_JSON: JSON.stringify(JSON.stringify(packaged)) },
  })
  if (!build.success) throw new AggregateError(build.logs, 'Standalone CLI did not compile')
}
if (import.meta.main) {
  await import('./build-native-tools')
  const project = resolve(import.meta.dir, '..')
  await buildStandaloneCli(project, resolve(project, Bun.argv[2] ?? 'dist/hbar.exe'))
}
