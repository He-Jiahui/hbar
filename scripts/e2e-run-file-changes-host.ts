import { z } from 'zod'
import { basename, join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { HbarClient, createModelCommandClient } from '@hbar/client'
import type { ExecutionProvider } from '@hbar/plugin-sdk'
import type { ToolFileChange } from '@hbar/contracts/run-file-changes'
import { startServer } from '../apps/host/src/server'

const root = process.env.HBAR_E2E_DATA_ROOT
if (!root || !basename(root).startsWith('hbar-file-changes-browser-'))
  throw new Error('Expected an owned file-change fixture')
const port = z.coerce.number().int().min(1).max(65535).parse(process.env.HBAR_E2E_HOST_PORT)
await writeFile(join(root, 'existing.ts'), 'const value = 1\n', 'utf8')
for (const args of [
  ['init'],
  ['config', 'user.email', 'file-summary@hbar.invalid'],
  ['config', 'user.name', 'File summary fixture'],
  ['add', 'existing.ts'],
  ['commit', '-m', 'fixture'],
])
  execFileSync('git', args, { cwd: root, stdio: 'ignore', windowsHide: true })
const kernel = await Kernel.create({
  home: join(root, 'data'),
  workspace: root,
  demo: true,
  secrets: new MemorySecrets(),
})
kernel.tools.register({
  name: 'file_change_fixture',
  description: 'Test-only writer for file summary browser verification.',
  effect: 'write',
  workspaceAccess: { kind: 'workspace' },
  inputSchema: z.strictObject({}),
  async execute(_args, context) {
    const execution = kernel.plugins.get<ExecutionProvider>('execution')
    const fileChanges: ToolFileChange[] = []
    for (let i = 0; i < 10; i++) {
      context.signal.throwIfAborted()
      const path = i === 0 ? 'existing.ts' : `${'nested/'.repeat(i === 1 ? 6 : 1)}file-${i}.ts`
      const result = await execution.write(
        context.workspace.path,
        path,
        `const value = ${i + 2}\n// file summary test ${i}\n`,
      )
      if (result.created === undefined) throw new Error('Fixture requires measured local writes')
      fileChanges.push({ path: result.path, before: result.created ? null : result.before, after: result.after })
    }
    return { text: 'Finished the verified file modifications.', fileChanges }
  },
})
const workspace = (await kernel.storage.call('workspaces'))[0]!
const session = await kernel.createSession(workspace.id, 'File changes fixture')
const host = await startServer(kernel, { port })
const response = await fetch(`http://127.0.0.1:${port}/auth/pair`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: host.pairing.code, name: 'file summary browser fixture' }),
})
if (!response.ok) throw new Error('Fixture pairing failed')
const { token } = z.object({ token: z.string().min(1) }).parse(await response.json())
const client = new HbarClient(`http://127.0.0.1:${port}`, token)
await client.connect()
const model = createModelCommandClient(client),
  previous = await model.execute('session.getModel', { sessionId: session.id })
await model.execute(
  'session.setModel',
  { sessionId: session.id, modelId: 'local-fixture', baselineRevisions: previous.revisions },
  { idempotencyKey: 'file-changes-model' },
)
client.disconnect()
process.stdout.write(
  `${JSON.stringify({ token, workspaceId: workspace.id, workspaceName: workspace.name, sessionId: session.id, sessionTitle: session.title })}\n`,
)
let closing = false
const close = async () => {
  if (closing) return
  closing = true
  await host.close()
  await kernel.close()
  process.exit(0)
}
process.on('SIGINT', () => {
  void close().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
})
process.on('SIGTERM', () => {
  void close().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
})
await new Promise<void>(() => {})
