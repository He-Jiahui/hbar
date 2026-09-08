import { createInterface } from 'node:readline'
import { randomUUID } from 'node:crypto'
import type { CliRuntime } from './runtime.ts'
import { waitForRun } from './runtime.ts'

const commands = `/help /new /sessions /switch <id|name> /fork /archive /resume /model /thinking /compact /approve /deny /stop /retry /export /plugins /skills /settings /paths /diagnose /clear /quit`

export async function runTui(runtime: CliRuntime, prefill?: string) {
  let session = runtime.session
  let modelId = runtime.modelId
  let input = prefill ?? ''
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  const prompt = () => rl.question(`\nhbar [${session.title}]${input ? ` ${input}` : ''}\n> `, (line) => void handle(line))
  const handle = async (line: string) => {
    const text = line || input
    input = ''
    if (!text.trim()) return prompt()
    if (text.startsWith('/')) {
      const [command, ...args] = text.slice(1).split(/\s+/)
      try {
        if (command === 'quit' || command === 'q') return rl.close()
        if (command === 'help') console.log(commands)
        else if (command === 'sessions') console.table((await runtime.client.call('system.bootstrap', {})).sessions.filter((item) => item.workspaceId === runtime.project.id).map((item) => ({ id: item.id, title: item.title, updated: new Date(item.updatedAt).toISOString() })))
        else if (command === 'new') session = await runtime.client.call('session.create', { workspaceId: runtime.project.id })
        else if (command === 'switch') {
          const catalog = await runtime.client.call('system.bootstrap', {})
          const next = catalog.sessions.find((item) => item.id === args[0] || item.title === args.join(' '))
          if (!next) throw new Error('Session not found')
          session = next
        } else if (command === 'model') {
          const catalog = await runtime.client.call('system.bootstrap', {})
          if (!args.length) console.table(catalog.models.map((item) => ({ id: item.id, name: item.name, model: item.model })))
          else modelId = catalog.models.find((item) => item.id === args.join(' ') || item.name === args.join(' '))?.id ?? modelId
        } else if (command === 'archive') {
          session = await runtime.client.call('session.archive', { sessionId: session.id, archived: true })
        } else if (command === 'fork') session = await runtime.client.call('session.fork', { sessionId: session.id })
        else if (command === 'diagnose') console.log(await runtime.client.call('system.diagnose', {}))
        else if (command === 'paths') console.log(await runtime.client.call('system.paths.get', {}))
        else if (command === 'clear') console.clear()
        else console.log(`Unknown command. Available: ${commands}`)
      } catch (error) { console.error(error instanceof Error ? error.message : String(error)) }
      return prompt()
    }
    try {
      const run = await runtime.client.call('run.start', { sessionId: session.id, requestId: randomUUID(), input: { text, images: [], thinking: 'off', approval: 'ask' }, modelId })
      await waitForRun(runtime.client, session, run, 'text', 'ask')
    } catch (error) { console.error(error instanceof Error ? error.message : String(error)) }
    prompt()
  }
  rl.on('close', () => runtime.close())
  console.log('hbar TUI · type /help for commands')
  if (prefill) console.log(`Prefilled message: ${prefill}`)
  prompt()
}
