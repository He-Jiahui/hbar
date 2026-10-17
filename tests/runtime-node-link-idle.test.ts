import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { Storage } from '@hbar/storage'
import { StorageNodeRegistryPort } from '@hbar/storage/node-registry'
import { ConversationNodeConnections, NodeRegistryService } from '@hbar/node-link'

/** Actual Storage/public factories; no native node or external socket is exercised. */
const temporaryPrefix = 'hbar-node-idle-'

function validateOwnedRoot(root: string): void {
  if (root !== resolve(root) || dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith(temporaryPrefix))
    throw new Error('Unowned Node idle fixture path')
}

async function closeFixture(
  root: string,
  storage: Storage | undefined,
  registry: NodeRegistryService | undefined,
  connections: ConversationNodeConnections | undefined,
  failure: { readonly error: unknown } | undefined,
): Promise<void> {
  const cleanupErrors: unknown[] = []
  try {
    connections?.dispose()
  } catch (error) {
    cleanupErrors.push(error)
  }
  try {
    registry?.dispose()
  } catch (error) {
    cleanupErrors.push(error)
  }
  try {
    await storage?.close()
  } catch (error) {
    cleanupErrors.push(error)
  }
  // Retain the fixture on any failed resource close; never delete a possibly live DB.
  if (cleanupErrors.length === 0) {
    try {
      validateOwnedRoot(root)
      await rm(root, { recursive: true, force: true })
    } catch (error) {
      cleanupErrors.push(error)
    }
  }
  if (cleanupErrors.length > 0) {
    const errors = failure ? [failure.error, ...cleanupErrors] : cleanupErrors
    throw new AggregateError(errors, 'Node idle fixture cleanup failed', { cause: errors[0] })
  }
  if (failure) throw failure.error
}

test('idle observation preserves a live invitation and does not extend its expiry', async () => {
  const root = resolve(await mkdtemp(join(tmpdir(), temporaryPrefix)))
  validateOwnedRoot(root)
  let storage: Storage | undefined
  let registry: NodeRegistryService | undefined
  let failure: { readonly error: unknown } | undefined
  try {
    storage = new Storage(join(root, 'host.sqlite'))
    await storage.call('ready')
    let now = 1_000_000
    registry = await NodeRegistryService.open(new StorageNodeRegistryPort(storage), () => now)
    expect(registry.idleSnapshot().invitations).toBe(0)
    const invitation = await registry.invite('idle-node')
    expect(registry.idleSnapshot()).toMatchObject({ invitations: 1, pendingInvitations: 0, consumingInvitations: 0 })
    expect(registry.idleSnapshot().invitations).toBe(1)
    now = invitation.expiresAt
    expect(registry.idleSnapshot().invitations).toBe(0)
    // Expiration is evaluated by the real clock; probing does not renew or create a code.
    expect(invitation.expiresAt).toBe(1_300_000)
  } catch (error) {
    failure = { error }
  }
  await closeFixture(root, storage, registry, undefined, failure)
})

test('pure connection snapshot does not disconnect a pending handshake or erase the rate window', async () => {
  const root = resolve(await mkdtemp(join(tmpdir(), `${temporaryPrefix}connection-`)))
  validateOwnedRoot(root)
  let storage: Storage | undefined
  let registry: NodeRegistryService | undefined
  let connections: ConversationNodeConnections | undefined
  let failure: { readonly error: unknown } | undefined
  try {
    storage = new Storage(join(root, 'host.sqlite'))
    await storage.call('ready')
    let now = 1_000_000
    registry = await NodeRegistryService.open(new StorageNodeRegistryPort(storage), () => now)
    connections = new ConversationNodeConnections(registry, {
      observe: async () => {
        throw new Error('No observation expected in handshake-only fixture')
      },
      now: () => now,
    })
    let closes = 0
    connections.open('pending', 'source', {
      send: () => true,
      close: () => {
        closes++
      },
    })
    expect(connections.idleSnapshot()).toMatchObject({ connections: 1, handshakes: 1, rateLimitSources: 1 })
    expect(connections.idleSnapshot().connections).toBe(1)
    expect(closes).toBe(0)
    connections.closeConnection('pending')
    expect(connections.idleSnapshot()).toMatchObject({ connections: 0, handshakes: 0, rateLimitSources: 1 })
    now += 60_000
    expect(connections.idleSnapshot().rateLimitSources).toBe(0)
  } catch (error) {
    failure = { error }
  }
  await closeFixture(root, storage, registry, connections, failure)
})
