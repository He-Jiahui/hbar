import { isAbsolute, join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin, provide, type HarnessDriver } from '@hbar/plugin-sdk'

const [root, portValue] = process.argv.slice(2)
const port = Number(portValue)
if (!root || !isAbsolute(root) || !Number.isSafeInteger(port) || port < 1 || port > 65_535)
  throw new Error('Image-generation crash fixture requires an absolute root and valid local port')

const driver = definePlugin({
  manifest: {
    id: 'driver.pi',
    name: 'Crash fixture driver',
    description: 'Starts one durable image-generation effect before the parent terminates the process',
    version: '1.0.0',
    apiVersion: '^1.0.0',
    scope: 'host',
    provides: { driver: '1.0.0' },
    permissions: [],
  },
  apply(context) {
    provide<HarnessDriver>(context, 'driver', {
      async run(input) {
        await input.execute(
          'image_generate',
          { model: 'fixture-images', prompt: 'A crash recovery image' },
          'crash-image-generation-call',
        )
      },
      async summarize() {
        return { text: '', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 } }
      },
    })
  },
})

const secrets = new MemorySecrets()
await secrets.set('fixture-images', 'fixture-secret-token')
const kernel = await Kernel.create({
  home: join(root, 'data'),
  workspace: root,
  demo: true,
  secrets,
  profile: { replacements: { 'driver.pi': driver } },
})
await kernel.saveProvider({
  id: 'fixture-images',
  name: 'Fixture Images',
  protocol: 'openai-responses',
  baseUrl: `http://127.0.0.1:${port}/v1`,
  model: 'paint',
  models: [{ id: 'paint', imageGeneration: true }],
})
const workspace = (await kernel.storage.call('workspaces'))[0]
if (!workspace) throw new Error('Crash fixture workspace is missing')
const session = await kernel.createSession(workspace.id)
await kernel.submit(
  session.id,
  'crash-image-run',
  { text: 'Start one image generation and recover its unknown result', images: [], approval: 'allow' },
  'fixture-images',
)
await new Promise<void>(() => {})
