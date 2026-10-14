import { resolve, dirname } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { buildRuntimePackage } from './build-runtime-package'
import { optionalBundleExternals } from './bundle-externals'
import { withCompiledRuntimePackageData } from './compiled-runtime-package-data'

export async function buildStandaloneCli(project: string, outfile: string): Promise<void> {
  const root = resolve(project),
    output = resolve(outfile)
  const artifactRoot = resolve(root, 'artifacts/standalone-runtime-build')
  const packaged = await buildRuntimePackage(root, artifactRoot)
  await mkdir(dirname(output), { recursive: true })
  await withCompiledRuntimePackageData(
    artifactRoot,
    resolve(root, 'apps/cli/src/embedded-runtime-package.ts'),
    JSON.stringify(packaged),
    async ({ plugin }) => {
      const build = await Bun.build({
        entrypoints: [
          resolve(root, 'apps/cli/src/main.ts'),
          resolve(root, 'packages/storage/src/worker.ts'),
          resolve(root, 'packages/storage/src/maintenance-worker.ts'),
          resolve(root, 'packages/storage/src/node-state-worker.ts'),
        ],
        target: 'bun',
        compile: { outfile: output },
        minify: false,
        external: [...optionalBundleExternals],
        plugins: [plugin],
      })
      if (!build.success) throw new AggregateError(build.logs, 'Standalone CLI did not compile')
    },
  )
}
if (import.meta.main) {
  await import('./build-native-tools')
  const project = resolve(import.meta.dir, '..')
  await buildStandaloneCli(project, resolve(project, Bun.argv[2] ?? 'dist/hbar.exe'))
}
