import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { createNodeIdentity, validateNodeIdentity } from '@hbar/node-core'
import type { NodeStatePort } from '@hbar/contracts/node-state'

export function nodeDataRoot(home?: string): string {
  return resolve(home ?? process.env.HBAR_NODE_HOME ?? join(homedir(), '.hbar-node'))
}
export async function openNodeIdentity(state: NodeStatePort) {
  const stored = await state.call('config.get', { key: 'identity' })
  const identity = stored ? validateNodeIdentity(stored) : createNodeIdentity()
  if (!stored) await state.call('config.set', { key: 'identity', value: identity })
  return identity
}
