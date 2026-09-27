import { mkdir, realpath, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { HbarClient, createExtensionCommandClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { resolvePathLayout } from '@hbar/storage'
import { startServer } from '../../apps/host/src/server'

// Only this child owns the temporary Host. Skill files are local test records,
// not installed plugins or executable/provider-backed skills.
const options = z
  .object({ root: z.string().min(1), assets: z.string().min(1), skillCount: z.coerce.number().int().min(0).max(21) })
  .parse({
    root: process.env.HBAR_EXTENSION_COLLECTIONS_ROOT,
    assets: process.env.HBAR_EXTENSION_COLLECTIONS_WEB_DIST,
    skillCount: process.env.HBAR_EXTENSION_COLLECTIONS_SKILL_COUNT ?? '2',
  })
const root = await realpath(options.root)
if (dirname(root) !== (await realpath(tmpdir())) || !basename(root).startsWith('hbar-extension-collections-ui-'))
  throw new Error('Refusing a non-owned extension fixture root')
const layout = await resolvePathLayout({
  dataRoot: join(root, 'data'),
  cacheRoot: join(root, 'cache'),
  pointerFile: join(root, 'paths.json'),
  readPointer: false,
})
const workspacePath = join(root, 'Extensions original workspace — 扩展原工程')
await mkdir(workspacePath, { recursive: true })
const skillsRoot = join(layout.skills, 'global')
interface SeedSkill {
  readonly id: string
  readonly description: string
  readonly body: string
}
const seeds: SeedSkill[] = Array.from({ length: options.skillCount }, (_, index) => ({
  id: `fixture-skill-${String(index + 1).padStart(3, '0')}-long-local-name`,
  description: 'Owned discovery fixture — 本地技能目录验收',
  body: 'This fixture is only listed. It does not request tools, network access or model execution.',
}))
await mkdir(skillsRoot, { recursive: true })
for (const skill of seeds) {
  const directory = join(skillsRoot, skill.id)
  await mkdir(directory)
  await writeFile(
    join(directory, 'SKILL.md'),
    `---\nname: ${skill.id}\ndescription: ${skill.description}\n---\n\n# ${skill.id}\n\n${skill.body}\n`,
    'utf8',
  )
}
const kernel = await Kernel.create({ layout, workspace: workspacePath, demo: false, secrets: new MemorySecrets() })
let host: Awaited<ReturnType<typeof startServer>> | undefined
let client: HbarClient | undefined
let closing: Promise<void> | undefined
function close(): Promise<void> {
  closing ??= (async () => {
    client?.disconnect()
    try {
      await host?.close()
    } finally {
      await kernel.close()
    }
  })()
  return closing
}
try {
  host = await startServer(kernel, { hostname: '127.0.0.1', port: 0, staticRoot: resolve(options.assets) })
  const browserDevice = await host.auth.createDevice('Extension collections browser fixture')
  const observerDevice = await host.auth.createDevice('Extension collections read observer')
  const url = `http://127.0.0.1:${host.server.port}`
  client = new HbarClient(url, observerDevice.token)
  await client.connect()
  const directory = createWorkspaceSessionCommandClient(client)
  const extensions = createExtensionCommandClient(client)
  const workspace = (await directory.execute('workspace.list', { limit: 100 })).items.find(
    (item) => item.path === workspacePath,
  )
  if (!workspace) throw new Error('Owned extension workspace is missing')
  const firstSession = await directory.execute(
    'session.create',
    { workspaceId: workspace.id, title: 'Extension A — 原会话' },
    { idempotencyKey: 'extension-collections-a' },
  )
  const secondSession = await directory.execute(
    'session.create',
    { workspaceId: workspace.id, title: 'Extension B — 独立会话' },
    { idempotencyKey: 'extension-collections-b' },
  )
  const plugins = await extensions.execute('plugin.list', {})
  const skills = await extensions.execute('skill.list', {})
  if (
    skills.length !== seeds.length ||
    skills.some((skill) => dirname(skill.path) !== skillsRoot || !seeds.some((seed) => seed.id === skill.id))
  )
    throw new Error('Public skill discovery did not match the exact isolated root')
  for (const session of [firstSession, secondSession])
    if ((await client.call('session.snapshot', { sessionId: session.id })).runs.length)
      throw new Error('Unexpected fixture Run')
  client.disconnect()
  process.stdout.write(
    `${JSON.stringify({
      url,
      token: browserDevice.token,
      externalToken: observerDevice.token,
      workspace,
      firstSession,
      secondSession,
      plugins,
      skills,
      initialization: { sessionCreates: 2, skillFiles: seeds.length, demo: false, pluginChanges: 0, runs: 0 },
    })}\n`,
  )
  const input = createInterface({ input: process.stdin })
  await new Promise<void>((done) => {
    input.on('line', (line) => {
      if (line === 'stop') done()
    })
    input.once('close', done)
  })
  input.close()
  await close()
} catch (error) {
  try {
    await close()
  } catch {
    process.stderr.write('Owned extension Host cleanup failed\n')
  }
  process.stderr.write(error instanceof Error ? `${error.message}\n` : 'Owned extension Host failed\n')
  process.exitCode = 1
}
