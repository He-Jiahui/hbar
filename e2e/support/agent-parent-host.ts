import { HbarClient, createModelCommandClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { emptyUsage } from '@hbar/contracts'
import { definePlugin, provide, type HarnessDriver } from '@hbar/plugin-sdk'
import { z } from 'zod'
import { startServer } from '../../apps/host/src/server'

const root = process.env.HBAR_E2E_DATA_ROOT
if (!root) throw new Error('Owned Agent parent fixture root is required')
const driver = definePlugin({
  manifest: {
    id: 'driver.pi',
    name: 'Agent parent fixture',
    version: '1.0.0',
    apiVersion: '^1.0.0',
    description: 'Deterministic model-side delegation through the production tool gateway',
    scope: 'host',
    required: true,
    provides: { driver: '1.0.0' },
    permissions: [],
  },
  apply(ctx) {
    provide<HarnessDriver>(ctx, 'driver', {
      async run(input) {
        await input.beforeRequest(input.request, `agent-parent-${input.run.id}`)
        const command = /^\/agent\s+(\S+)\s+([\s\S]+)$/.exec(input.run.input.text.trim())
        if (!input.session.parentId && command) {
          const callId = `delegate-${input.run.id}`
          const args = { subagent_type: command[1], prompt: command[2]?.trim() }
          await input.commit('assistant', [{ type: 'tool_call', callId, name: 'agent', args }])
          const result = await input.execute('agent', args, callId)
          if (result.isError) throw new Error(result.text)
          await input.commit('assistant', [{ type: 'text', text: '任务已交给子 Agent，结果可在活动面板查看。' }])
        } else {
          await input.commit('assistant', [{ type: 'text', text: '已核查指定任务；这是受控测试模型的回复。' }])
        }
      },
      summarize: async () => ({ text: 'Owned fixture summary', usage: emptyUsage() }),
    })
  },
})
const kernel = await Kernel.create({
  home: `${root}/data`,
  workspace: root,
  demo: true,
  secrets: new MemorySecrets(),
  profile: { replacements: { 'driver.pi': driver } },
})
const workspace = (await kernel.storage.call('workspaces'))[0]
if (!workspace) throw new Error('Owned fixture Workspace is missing')
const session = await kernel.createSession(workspace.id, 'Parent Agent task')
const webOrigin = process.env.HBAR_E2E_WEB_ORIGIN
const host = await startServer(kernel, {
  port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
  ...(webOrigin ? { origins: [webOrigin] } : {}),
})
const url = `http://127.0.0.1:${host.server.port}`
const response = await fetch(`${url}/auth/pair`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: host.pairing.code, name: 'Owned Agent parent UI fixture' }),
})
if (!response.ok) throw new Error('Owned fixture pairing failed')
const { token } = z.object({ token: z.string().min(1) }).parse(await response.json())
const client = new HbarClient(url, token)
await client.connect()
const models = createModelCommandClient(client)
const configuration = await models.execute('session.getModel', { sessionId: session.id })
await models.execute(
  'session.setModel',
  {
    sessionId: session.id,
    modelId: 'local-fixture',
    baselineRevisions: configuration.revisions,
  },
  { idempotencyKey: 'agent-parent-model' },
)
client.disconnect()
process.stdout.write(
  `${JSON.stringify({
    token,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    sessionId: session.id,
    sessionTitle: session.title,
  })}\n`,
)
let closing = false
async function close(): Promise<void> {
  if (closing) return
  closing = true
  await host.close()
  await kernel.close()
  process.exit(0)
}
process.on('SIGINT', () => {
  void close()
})
process.on('SIGTERM', () => {
  void close()
})
await new Promise(() => {})
