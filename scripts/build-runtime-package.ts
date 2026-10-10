import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { RuntimeArtifactStore, type RuntimeArtifact, type RuntimeArtifactPackage } from '@hbar/runtime'
import { hostRuntimeBuildUnits } from '../apps/host/src/runtime-build'

export async function buildRuntimePackage(sourceRoot: string, artifactRoot: string): Promise<RuntimeArtifactPackage> {
  const registry = new RuntimeArtifactStore(artifactRoot, sourceRoot)
  const artifacts: RuntimeArtifact[] = []
  for (const unit of hostRuntimeBuildUnits()) artifacts.push(await registry.build(unit))
  return registry.exportPackage(artifacts)
}
if (import.meta.main) {
  const project = resolve(import.meta.dir, '..')
  const output = resolve(project, Bun.argv[2] ?? 'dist/runtime-package.json')
  const packaged = await buildRuntimePackage(project, resolve(project, 'artifacts/runtime-package-build'))
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(packaged)}\n`)
  console.log(`Prepared ${packaged.units.length} runtime units (${packaged.id}): ${output}`)
}
