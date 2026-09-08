import { test, expect } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel } from '@hbar/kernel'
import { providerSchema } from '@hbar/contracts'

test.skipIf(process.platform !== 'win32')(
  'Windows credential manager stores and removes a disposable fixture credential',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-credential-'))
    const kernel = await Kernel.create({ home: root })
    try {
      const profile = providerSchema.parse({
        id: 'test-credential',
        name: 'Credential test',
        protocol: 'openai-completions',
        baseUrl: 'http://127.0.0.1:1',
        model: 'fixture',
      })
      await kernel.saveProvider(profile, 'disposable-test-value')
      expect(await kernel.secrets.get(profile.id)).toBe('disposable-test-value')
      expect((await kernel.models())[0]?.hasKey).toBe(true)
      expect(JSON.stringify(await kernel.storage.call('providers'))).not.toContain('disposable-test-value')
      await kernel.deleteProvider(profile.id)
      expect(await kernel.secrets.get(profile.id)).toBeNull()
    } finally {
      await kernel.secrets.delete('test-credential')
      await kernel.close()
      await rm(root, { recursive: true, force: true })
    }
  },
)
