import { mkdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { nodeFloorSchema } from '@hbar/contracts/node'
import { nodeConsoleConnectionSchema, nodeConsoleMethods, type NodeConsoleMethod } from '@hbar/contracts/node-console'
import { NodeStateStorage } from '@hbar/storage/node-state'
import { acquireProcessLease, processIsAlive } from '@hbar/runtime'
import { NodeConsoleService } from './console-service'
import { nodeDataRoot, openNodeIdentity } from './bootstrap'

function hasCode(error: unknown, code: string): boolean {
  return !!error && typeof error === 'object' && 'code' in error && error.code === code
}
async function localConsole(dataRoot: string) {
  try {
    const connection = nodeConsoleConnectionSchema.parse(
      JSON.parse(await readFile(join(dataRoot, 'control.json'), 'utf8')),
    )
    if (processIsAlive(connection.pid)) return connection
  } catch (error) {
    if (!hasCode(error, 'ENOENT')) throw error
  }
  return null
}
/** A console request never falls back to opening storage when a live owner may have accepted it. */
async function invoke(dataRoot: string, method: NodeConsoleMethod, input: unknown): Promise<unknown> {
  const checked = nodeConsoleMethods[method].input.parse(input)
  const connection = await localConsole(dataRoot)
  if (connection) {
    const response = await fetch(connection.url, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + connection.token, 'content-type': 'application/json' },
      body: JSON.stringify({ method, input: checked }),
      signal: AbortSignal.timeout(10_000),
    })
    const value: unknown = await response.json()
    if (!response.ok) {
      const error = z.object({ code: z.string(), message: z.string() }).parse(value)
      throw new HbarError(error.code, error.message)
    }
    if (!value || typeof value !== 'object' || !('result' in value))
      throw new HbarError('NODE_CONTROL_INVALID', 'Invalid console response')
    return nodeConsoleMethods[method].output.parse(value.result)
  }
  await mkdir(dataRoot, { recursive: true, mode: 0o700 })
  const release = await acquireProcessLease(join(dataRoot, 'node.lock'))
  const state = new NodeStateStorage(join(dataRoot, 'node.sqlite'))
  try {
    await state.call('ready', {})
    return await new NodeConsoleService(state, await openNodeIdentity(state), dataRoot).invoke(method, checked)
  } finally {
    await state.close()
    await release()
  }
}
function policyAssignments(value: unknown, assignments: readonly string[]): unknown {
  const floor: Record<string, unknown> = { ...nodeFloorSchema.parse(value) }
  const scalar = new Set([
    'process',
    'network',
    'terminal',
    'osConfinement',
    'backend',
    'maxConcurrentProcesses',
    'maxTimeoutMs',
    'localConfirm',
  ])
  for (const assignment of assignments) {
    const index = assignment.indexOf('=')
    const name = assignment.slice(0, index)
    if (index < 1 || !scalar.has(name))
      throw new HbarError('INVALID_POLICY', 'Use a named floor field or --input-json for structured fields')
    const raw = assignment.slice(index + 1)
    let parsed: unknown = raw
    try {
      parsed = JSON.parse(raw)
    } catch {
      /* Enum values are plain strings. */
    }
    floor[name] = parsed
  }
  return nodeFloorSchema.parse(floor)
}
export async function runNodeCommand(
  argv: readonly string[],
  output: (value: unknown) => void = (value) => console.log(JSON.stringify(value, null, 2)),
): Promise<void> {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      home: { type: 'string' },
      'data-root': { type: 'string' },
      id: { type: 'string' },
      name: { type: 'string' },
      access: { type: 'string' },
      all: { type: 'boolean' },
      follow: { type: 'boolean' },
      after: { type: 'string' },
      limit: { type: 'string' },
      'input-json': { type: 'string' },
      role: { type: 'string' },
      root: { type: 'string', multiple: true },
    },
  })
  const dataRoot = nodeDataRoot(values.home ?? values['data-root'])
  const [command = 'status', subcommand, ...rest] = positionals
  let result: unknown
  switch (command) {
    case 'pair': {
      if (subcommand || rest.length || !values.name)
        throw new HbarError(
          'INVALID_COMMAND',
          'Use node pair --name <device> --role operator|observer [--root <rootId>]',
        )
      const role = values.role ?? 'observer'
      if (role !== 'operator' && role !== 'observer')
        throw new HbarError('INVALID_INPUT', 'Node console role must be operator or observer')
      const roots = values.root ?? []
      result = await invoke(dataRoot, 'node.pairing.create', {
        name: values.name,
        role,
        roots: Array.isArray(roots) ? roots : [roots],
      })
      break
    }
    case 'status':
      result = await invoke(dataRoot, 'node.status', {})
      break
    case 'policy':
      if (subcommand === 'show') result = await invoke(dataRoot, 'node.policy.get', {})
      else if (subcommand === 'set') {
        const floor: unknown = values['input-json']
          ? JSON.parse(values['input-json'])
          : policyAssignments(await invoke(dataRoot, 'node.policy.get', {}), rest)
        result = await invoke(dataRoot, 'node.policy.set', floor)
      } else throw new HbarError('INVALID_COMMAND', 'Use node policy show or node policy set')
      break
    case 'share': {
      if (!subcommand || !values.id)
        throw new HbarError('INVALID_COMMAND', 'Use node share <path> --id <rootId> --access read|write')
      const floor = nodeFloorSchema.parse(await invoke(dataRoot, 'node.policy.get', {}))
      const root = {
        rootId: values.id,
        name: values.name ?? values.id,
        path: resolve(subcommand),
        access: values.access ?? 'read',
      }
      result = await invoke(dataRoot, 'node.policy.set', {
        ...floor,
        roots: [...floor.roots.filter((item) => item.rootId !== root.rootId), root],
      })
      break
    }
    case 'unshare': {
      if (!subcommand) throw new HbarError('INVALID_COMMAND', 'Use node unshare <rootId>')
      const floor = nodeFloorSchema.parse(await invoke(dataRoot, 'node.policy.get', {}))
      result = await invoke(dataRoot, 'node.policy.set', {
        ...floor,
        roots: floor.roots.filter((root) => root.rootId !== subcommand),
      })
      break
    }
    case 'pause':
      result = await invoke(dataRoot, 'node.pause', { paused: true })
      break
    case 'resume':
      result = await invoke(dataRoot, 'node.pause', { paused: false })
      break
    case 'kill':
      result = await invoke(dataRoot, 'node.kill', {
        all: !!values.all,
        ...(subcommand ? { operationId: subcommand } : {}),
      })
      break
    case 'unlink':
      result = await invoke(dataRoot, 'node.unlink', {})
      break
    case 'audit': {
      let after = Number(values.after ?? '0')
      const limit = Number(values.limit ?? '100')
      do {
        const items = nodeConsoleMethods['node.audit'].output.parse(
          await invoke(dataRoot, 'node.audit', { after, limit }),
        )
        if (items.length || !values.follow) output(items)
        after = items.at(-1)?.seq ?? after
        if (values.follow) await Bun.sleep(1_000)
      } while (values.follow)
      return
    }
    default:
      throw new HbarError('INVALID_COMMAND', 'Unknown node command: ' + command)
  }
  output(result)
}
