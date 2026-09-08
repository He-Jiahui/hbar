import { readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { CliArgs } from './args.ts'
import type { CliRuntime } from './runtime.ts'
import { selectModel, selectSession } from './runtime.ts'

function print(value: unknown) {
  process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`)
}

export async function runCliCommand(args: CliArgs, runtime: CliRuntime): Promise<boolean> {
  const [action, selector] = args.commandArgs
  if (args.command === 'diagnose') {
    print(await runtime.client.call('system.diagnose', {}))
    return true
  }
  if (args.command === 'config') {
    if (!action || action === 'show' || action === 'paths') print(await runtime.client.call('system.paths.get', {}))
    else throw new Error('Usage: hbar config paths|show')
    return true
  }
  if (args.command === 'session') {
    const catalog = await runtime.client.call('system.bootstrap', {})
    const sessions = catalog.sessions.filter((session) => session.workspaceId === runtime.project.id)
    if (!action || action === 'list') print(sessions)
    else if (action === 'new') print(await runtime.client.call('session.create', { workspaceId: runtime.project.id }))
    else if (action === 'resume') print(await selectSession(runtime.client, catalog, runtime.project.id, selector))
    else if (action === 'fork')
      print(await runtime.client.call('session.fork', { sessionId: selector ?? runtime.session.id }))
    else if (action === 'archive')
      print(await runtime.client.call('session.archive', { sessionId: selector ?? runtime.session.id, archived: true }))
    else if (action === 'export') {
      const target = selector ?? runtime.session.id
      const events = await runtime.client.call('session.export', { sessionId: target })
      const path = resolve(args.commandArgs[2] ?? `hbar-${target}.jsonl`)
      await writeFile(path, `${events.map((event) => JSON.stringify(event)).join('\n')}\n`, 'utf8')
      print(path)
    } else throw new Error('Usage: hbar session list|new|resume|fork|archive|export')
    return true
  }
  if (args.command === 'model') {
    const catalog = await runtime.client.call('system.bootstrap', {})
    if (!action || action === 'list') print(catalog.models)
    else if (action === 'use') {
      if (!selector) throw new Error('Usage: hbar model use <provider/model|id|name>')
      print({ modelId: selectModel(catalog, selector) })
    } else throw new Error('Usage: hbar model list|use')
    return true
  }
  if (args.command === 'plugins') {
    if (!action || action === 'list') print((await runtime.client.call('system.bootstrap', {})).plugins)
    else if (action === 'install') {
      if (!selector) throw new Error('Usage: hbar plugins install <directory|archive>')
      print(await runtime.client.call('plugin.install', { path: selector, projectId: runtime.project.id }))
    } else if (action === 'enable' || action === 'disable') {
      if (!selector) throw new Error(`Usage: hbar plugins ${action} <package-name>`)
      print(await runtime.client.call(action === 'enable' ? 'plugin.enable' : 'plugin.disable', { id: selector }))
    } else if (action === 'remove') {
      if (!selector) throw new Error('Usage: hbar plugins remove <package-name>')
      print(await runtime.client.call('plugin.remove', { id: selector }))
    } else if (action === 'inspect') {
      if (!selector) throw new Error('Usage: hbar plugins inspect <package-name>')
      const plugin = (await runtime.client.call('system.bootstrap', {})).plugins.find((item) => item.id === selector)
      if (!plugin) throw new Error(`Plugin not found: ${selector}`)
      print(plugin)
    } else if (action === 'doctor') print(await runtime.client.call('plugin.doctor', {}))
    else if (action === 'lock') print(await runtime.client.call('plugin.lock', {}))
    else throw new Error('Usage: hbar plugins list|install|enable|disable|remove|inspect|doctor|lock')
    return true
  }
  if (args.command === 'skills') {
    if (action && action !== 'list') throw new Error('Usage: hbar skills list')
    const root = resolve(runtime.layout.skills, 'global')
    const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
    print(entries.filter((entry) => entry.isDirectory()).map((entry) => ({ id: entry.name, path: resolve(root, entry.name) })))
    return true
  }
  return false
}
