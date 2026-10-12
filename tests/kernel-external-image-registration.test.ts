import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, test } from 'bun:test'
import { z } from 'zod'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { Storage } from '@hbar/storage'
import { definePlugin, provide, type HbarPlugin } from '@hbar/plugin-sdk'
import piPlugin from '@hbar/pi-driver'
import localTools, { localExecutionPlugin } from '@hbar/local-tools'
import imageGenerationPlugin from '@hbar/image-generation'
import goalPlugin from '@hbar/goal'
import planPlugin from '@hbar/plan'
import budgetPlugin from '@hbar/budget'
import agentPlugin from '@hbar/agent'
import workflowPlugin from '@hbar/workflow'
import gitPlugin from '@hbar/git'
import browserPlugin from '@hbar/browser-use'
import computerPlugin from '@hbar/computer-use'

const externalFlagNames = ['HBAR_EXTERNAL_DRIVER', 'HBAR_EXTERNAL_PLUGINS'] as const

function pluginWithSameManifest(source: HbarPlugin): HbarPlugin {
  return definePlugin({
    manifest:
      source.manifest.id === 'image-generation.openai-compatible'
        ? { ...source.manifest, name: 'Remote image-generation fixture' }
        : source.manifest,
    apply(context) {
      for (const name of Object.keys(source.manifest.provides ?? {})) provide(context, name, {})
    },
  })
}

async function removeFixture(root: string): Promise<void> {
  const resolved = resolve(root)
  if (dirname(resolved) !== resolve(tmpdir()) || !basename(resolved).startsWith('hbar-kernel-external-image-'))
    throw new Error('Refusing to remove a path outside the owned external-image Kernel fixture')
  await rm(resolved, { recursive: true, force: true })
}

async function createFixtureStorage(dataRoot: string): Promise<Storage> {
  await mkdir(dataRoot, { recursive: true })
  return new Storage(join(dataRoot, 'state.sqlite'))
}

test('external Kernel registers the remote image-generation capability without starting the local implementation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-kernel-external-image-'))
  const priorFlags = new Map(externalFlagNames.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  let kernel: Kernel | undefined
  let remoteImagePluginStarts = 0
  let remoteImageToolExecutions = 0
  try {
    for (const name of externalFlagNames) Reflect.set(globalThis, name, true)
    const localExecution = localExecutionPlugin([join(root, 'data')], {
      root: join(root, 'worktrees'),
      protectedRoot: join(root, 'data'),
      verify: async () => true,
    })
    const sources = [
      piPlugin,
      localExecution,
      localTools,
      goalPlugin,
      planPlugin,
      budgetPlugin,
      agentPlugin,
      workflowPlugin,
      gitPlugin,
      browserPlugin,
      computerPlugin,
      imageGenerationPlugin,
    ]
    const replacements = Object.fromEntries(
      sources.map((source) => [source.manifest.id, pluginWithSameManifest(source)]),
    )
    const imageReplacement = replacements['image-generation.openai-compatible']
    if (!imageReplacement) throw new Error('The isolated image-generation replacement fixture is missing')
    replacements['image-generation.openai-compatible'] = definePlugin({
      manifest: { ...imageReplacement.manifest, name: 'Remote image-generation fixture' },
      apply(context) {
        remoteImagePluginStarts += 1
        for (const name of Object.keys(imageReplacement.manifest.provides ?? {})) provide(context, name, {})
        context.hbar.api.tools.register({
          name: 'image_generate',
          description: 'Remote image-generation capability fixture',
          inputSchema: z.object({}),
          effect: 'network',
          async execute() {
            remoteImageToolExecutions += 1
            return { text: 'fixture image tool' }
          },
        })
      },
    })

    const replacementsWithoutImage = { ...replacements }
    delete replacementsWithoutImage['image-generation.openai-compatible']
    let missingPortError: unknown
    try {
      const unexpectedlyCreated = await Kernel.create({
        home: join(root, 'missing-data'),
        cacheRoot: join(root, 'missing-cache'),
        pointerFile: join(root, 'missing-pointer.json'),
        secrets: new MemorySecrets(),
        lifecycle: 'candidate',
        profile: {
          createStorage: createFixtureStorage,
          replacements: replacementsWithoutImage,
        },
      })
      await unexpectedlyCreated.close()
    } catch (error) {
      missingPortError = error
    }
    expect(missingPortError).toMatchObject({ code: 'RUNTIME_PLUGIN_REQUIRED' })

    kernel = await Kernel.create({
      home: join(root, 'data'),
      cacheRoot: join(root, 'cache'),
      pointerFile: join(root, 'pointer.json'),
      secrets: new MemorySecrets(),
      lifecycle: 'candidate',
      profile: {
        createStorage: createFixtureStorage,
        replacements,
      },
    })

    const imagePlugin = kernel.plugins.list().find((plugin) => plugin.id === 'image-generation.openai-compatible')
    expect(imagePlugin?.name).toBe('Remote image-generation fixture')
    expect(kernel.tools.get('image_generate')).toBeDefined()
    expect(remoteImagePluginStarts).toBe(1)
    expect(remoteImageToolExecutions).toBe(0)
  } finally {
    await kernel?.close()
    for (const [name, descriptor] of priorFlags) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
    await removeFixture(root)
  }
})
