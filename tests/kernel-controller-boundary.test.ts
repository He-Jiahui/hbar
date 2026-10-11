import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { RuntimeArtifactStore } from '@hbar/runtime'

test('the Controller application entry bundles public use cases without loading the executable Kernel, plugins or Workers', async () => {
  const root = await mkdtemp(join(process.cwd(), 'artifacts', 'controller-boundary-'))
  try {
    const entry = join(root, 'controller-consumer.ts')
    await writeFile(entry, "import * as application from '../../packages/kernel/src/controller'; export function create() { return Object.keys(application) }\n")
    const store = new RuntimeArtifactStore(root, process.cwd())
    const artifact = await store.build({
      descriptor: { id: 'controller-application-analysis', kind: 'base', isolation: 'base', dependencies: [],
        required: false, reloadable: false, contractFingerprint: 'a'.repeat(64), storageSchema: 24 },
      entrypoint: entry,
    })
    expect(artifact.inputs).toContain('packages/kernel/src/run-commands.ts')
    expect(artifact.inputs).toContain('packages/kernel/src/settings-service.ts')
    expect(artifact.inputs).not.toContain('packages/kernel/src/index.ts')
    expect(artifact.inputs.filter(input => input.startsWith('plugins/'))).toEqual([])
    expect(artifact.inputs).not.toContain('packages/storage/src/worker.ts')
  } finally { await rm(root, { recursive: true, force: true }) }
})
