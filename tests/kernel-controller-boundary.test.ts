import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RuntimeArtifactStore } from '@hbar/runtime'

test('the Controller application entry bundles public use cases without loading the executable Kernel, plugins or Workers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-controller-boundary-'))
  try {
    const store = new RuntimeArtifactStore(root, process.cwd())
    const artifact = await store.build({
      descriptor: { id: 'controller-application-analysis', kind: 'base', isolation: 'base', dependencies: [],
        required: false, reloadable: false, contractFingerprint: 'a'.repeat(64), storageSchema: 24 },
      entrypoint: 'packages/kernel/src/controller.ts',
    })
    expect(artifact.inputs).toContain('packages/kernel/src/run-commands.ts')
    expect(artifact.inputs).toContain('packages/kernel/src/settings-service.ts')
    expect(artifact.inputs).not.toContain('packages/kernel/src/index.ts')
    expect(artifact.inputs.filter(input => input.startsWith('plugins/'))).toEqual([])
    expect(artifact.inputs).not.toContain('packages/storage/src/worker.ts')
  } finally { await rm(root, { recursive: true, force: true }) }
})
