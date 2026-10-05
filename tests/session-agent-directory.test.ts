import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage } from '@hbar/storage'
import { sessionAgentChildrenPageSchema } from '@hbar/contracts/sidebar-directory'

async function fixture(operation: (storage: Storage, path: string, workspaceId: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-session-agent-directory-'))
  const path = join(root, 'test.sqlite')
  const storage = new Storage(path)
  try {
    await storage.call('ready')
    const workspace = await storage.call('createWorkspace', root, 'Fixture')
    await operation(storage, path, workspace.id)
  } finally {
    await storage.close()
    await rm(root, { recursive: true, force: true })
  }
}
async function child(storage: Storage, workspaceId: string, parentId: string, title: string) {
  const session = await storage.call('createSession', workspaceId, title, parentId)
  await storage.call('append', session.id, 'agent.created', { parentSessionId: parentId })
  return session
}

test('Agent roots are filtered before project and global paging, while ordinary forks stay independent', async () => {
  await fixture(async (storage, path, workspaceId) => {
    const parent = await storage.call('createSession', workspaceId, 'Parent')
    const second = await storage.call('createSession', workspaceId, 'Second')
    const fork = await storage.call('createSession', workspaceId, 'Fork', parent.id)
    await storage.call('append', fork.id, 'session.forked', { parentId: parent.id })
    for (let index = 0; index < 61; index++) await child(storage, workspaceId, parent.id, `Child ${index}`)
    const db = new Database(path)
    try {
      db.query('UPDATE sessions SET updatedAt=1 WHERE id=?').run(parent.id)
      db.query('UPDATE sessions SET updatedAt=2 WHERE id=?').run(second.id)
      db.query('UPDATE sessions SET updatedAt=3 WHERE id=?').run(fork.id)
    } finally {
      db.close()
    }
    const page = await storage.call('sidebarSessionActivityPage', { workspaceId, limit: 2 })
    expect(page.items.map((item) => item.session.id)).toEqual([fork.id, second.id])
    if (!page.nextCursor) throw new Error('Missing root cursor')
    const next = await storage.call('sidebarSessionActivityPage', { workspaceId, limit: 2, cursor: page.nextCursor })
    expect(next.items.map((item) => item.session.id)).toEqual([parent.id])
    expect(next.items[0]?.agentChildCount).toBe(61)
    expect(next.nextCursor).toBeNull()
    const global = await storage.call('globalSessionActivityPage', { limit: 2 })
    expect(global.items.map((item) => item.session.id)).toEqual([fork.id, second.id])
    expect((await storage.call('sessionAgentAncestors', fork.id)).items.map((item) => item.session.id)).toEqual([
      fork.id,
    ])
    expect((await storage.call('sessionActivityPage', { workspaceId, limit: 100 })).items).toHaveLength(64)
    const started = performance.now()
    for (let sample = 0; sample < 10; sample++) {
      const children = await storage.call('sessionAgentChildren', { parentSessionId: parent.id, limit: 50 })
      expect(children.items).toHaveLength(50)
    }
    expect(performance.now() - started).toBeLessThan(2_000)
    const over = await storage.call('sessionAgentChildren', { parentSessionId: parent.id, limit: 101 }).then(
      () => null,
      (error: unknown) => error,
    )
    expect(over).toMatchObject({ code: 'INVALID_INPUT' })
  })
})

test('Agent child ordering uses response time, not rename time; cursors, active inclusion and cross-workspace ancestry are exact', async () => {
  await fixture(async (storage, path, workspaceId) => {
    const parent = await storage.call('createSession', workspaceId, 'Parent')
    const first = await child(storage, workspaceId, parent.id, 'First')
    const otherWorkspace = await storage.call('createWorkspace', `${path}-worktree`, 'Worktree')
    const latest = await child(storage, otherWorkspace.id, parent.id, 'Latest')
    const pending = await child(storage, workspaceId, parent.id, 'No response yet')
    const grandchild = await child(storage, otherWorkspace.id, latest.id, 'Grandchild')
    for (const [session, at] of [
      [first, 100],
      [latest, 200],
    ] as const) {
      await storage.call('commit', session.id, `run-${session.id}`, 'assistant', [
        { type: 'text', text: 'private response must not leak into navigation' },
      ])
      const db = new Database(path)
      try {
        db.query('UPDATE messages SET createdAt=? WHERE sessionId=?').run(at, session.id)
      } finally {
        db.close()
      }
    }
    const page = await storage.call('sessionAgentChildren', {
      parentSessionId: parent.id,
      limit: 1,
      includeSessionId: pending.id,
    })
    expect(page.items.map((item) => item.session.id)).toEqual([latest.id])
    expect(page.items[0]?.lastResponseAt).toBe(200)
    expect(page.items[0]?.agentChildCount).toBe(1)
    expect(page.includedItem?.session.id).toBe(pending.id)
    expect(page.totalCount).toBe(3)
    expect(JSON.stringify(page)).not.toContain('private response')
    if (!page.nextCursor) throw new Error('Missing child cursor')
    const next = await storage.call('sessionAgentChildren', {
      parentSessionId: parent.id,
      limit: 2,
      cursor: page.nextCursor,
    })
    expect(next.items.map((item) => item.session.id)).toEqual([first.id, pending.id])
    await storage.call('updateSession', first.id, { title: 'Renamed much later' })
    const stale = await storage
      .call('sessionAgentChildren', { parentSessionId: parent.id, cursor: page.nextCursor })
      .then(
        () => null,
        (error: unknown) => error,
      )
    expect(stale).toMatchObject({ code: 'STALE_CURSOR' })
    const fresh = await storage.call('sessionAgentChildren', {
      parentSessionId: parent.id,
      limit: 100,
      includeSessionId: grandchild.id,
    })
    expect(fresh.items.map((item) => item.session.id)).toEqual([latest.id, first.id, pending.id])
    expect(fresh.includedItem).toBeNull()
    expect((await storage.call('sessionAgentAncestors', grandchild.id)).items.map((item) => item.session.id)).toEqual([
      parent.id,
      latest.id,
      grandchild.id,
    ])
    expect((await storage.call('sessionAgentAncestors', grandchild.id)).workspace.id).toBe(workspaceId)
    await storage.call('updateSession', latest.id, { archived: true })
    expect(
      (await storage.call('sessionAgentChildren', { parentSessionId: parent.id, limit: 100 })).items.map(
        (item) => item.session.id,
      ),
    ).toEqual([first.id, pending.id])
    expect(sessionAgentChildrenPageSchema.safeParse({ ...page, items: [page.items[0], page.items[0]] }).success).toBe(
      false,
    )
    expect(sessionAgentChildrenPageSchema.safeParse({ ...fresh, items: [...fresh.items].reverse() }).success).toBe(
      false,
    )
  })
})

test('Agent ancestry rejects cycles and forged parent event links without inventing a parent', async () => {
  await fixture(async (storage, path, workspaceId) => {
    const parent = await storage.call('createSession', workspaceId, 'Parent')
    const forged = await storage.call('createSession', workspaceId, 'Forged', parent.id)
    await storage.call('append', forged.id, 'agent.created', { parentSessionId: 'other-parent' })
    expect((await storage.call('sessionAgentChildren', { parentSessionId: parent.id })).items).toEqual([])
    expect((await storage.call('sessionAgentAncestors', forged.id)).items.map((item) => item.session.id)).toEqual([
      forged.id,
    ])
    const owned = await child(storage, workspaceId, parent.id, 'Owned')
    const db = new Database(path)
    try {
      db.query('UPDATE sessions SET parentId=? WHERE id=?').run(owned.id, parent.id)
    } finally {
      db.close()
    }
    await storage.call('append', parent.id, 'agent.created', { parentSessionId: owned.id })
    const invalid = await storage.call('sessionAgentAncestors', owned.id).then(
      () => null,
      (error: unknown) => error,
    )
    expect(invalid).toMatchObject({ code: 'INVALID_AGENT_TREE' })
  })
})

test('empty branches and the 32-Session ancestry boundary are bounded', async () => {
  await fixture(async (storage, _path, workspaceId) => {
    const root = await storage.call('createSession', workspaceId, 'Root')
    expect(await storage.call('sessionAgentChildren', { parentSessionId: root.id })).toMatchObject({
      totalCount: 0,
      items: [],
      nextCursor: null,
    })
    let current = root
    for (let depth = 1; depth < 32; depth++) current = await child(storage, workspaceId, current.id, `Depth ${depth}`)
    expect((await storage.call('sessionAgentAncestors', current.id)).items).toHaveLength(32)
    current = await child(storage, workspaceId, current.id, 'Beyond boundary')
    const over = await storage.call('sessionAgentAncestors', current.id).then(
      () => null,
      (error: unknown) => error,
    )
    expect(over).toMatchObject({ code: 'AGENT_DEPTH_LIMIT' })
  })
})
