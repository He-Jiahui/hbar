import { expect, test } from 'bun:test'
import type { DirectoryState, SessionAgentTreeBranch, SessionAgentTreeState } from '@hbar/app-runtime'
import type { Session } from '@hbar/contracts/directory'
import { renderedSessionAgentIds, visibleSessionAgentRows } from '../packages/app-react/src/session-agent-visible-rows'

const session = (id: string, parentId: string | null = null): Session => ({
  id,
  parentId,
  workspaceId: 'workspace',
  title: id,
  archived: false,
  seq: 1,
  createdAt: 1,
  updatedAt: 1,
})
const branch = (expanded: boolean, ids: readonly string[]): SessionAgentTreeBranch => ({
  expanded,
  status: 'ready',
  totalCount: ids.length,
  nextCursor: null,
  limitReached: false,
  error: null,
  rows: ids.map((sessionId) => ({
    sessionId,
    lastResponseAt: null,
    agentChildCount: 0,
    execution: { state: 'idle', activeCount: 0, queuedCount: 0 },
  })),
})
const tree = (branches: SessionAgentTreeState['branches']): SessionAgentTreeState => ({
  branches,
  revealedRoot: null,
  pathIds: [],
  revealError: null,
})

test('feedback visibility follows rendered roots and expanded children rather than cached facts', () => {
  const root = session('root')
  const child = session('child', root.id)
  const grandchild = session('grandchild', child.id)
  const cached = session('cached')
  const archived = { ...session('archived', root.id), archived: true }
  const directory: DirectoryState = { workspaces: {}, sessions: { root, child, grandchild, cached, archived } }
  const projection = tree({
    root: branch(true, ['child', 'cached', 'archived', 'missing']),
    child: branch(false, ['grandchild']),
  })
  expect([...renderedSessionAgentIds([], directory, projection)]).toEqual([])
  expect([...renderedSessionAgentIds([root], directory, projection)]).toEqual(['root', 'child'])
  expect([
    ...renderedSessionAgentIds(
      [root],
      directory,
      tree({ ...projection.branches, child: branch(true, ['grandchild']) }),
    ),
  ]).toEqual(['root', 'child', 'grandchild'])
  expect([
    ...renderedSessionAgentIds([root], directory, tree({ ...projection.branches, root: branch(false, ['child']) })),
  ]).toEqual(['root'])
  expect(visibleSessionAgentRows(root, ['child'], directory, projection)).toEqual([])
})

test('rendered branch traversal keeps the existing depth bound and excludes archived roots', () => {
  const sessions = Array.from({ length: 33 }, (_, index) =>
    session(`node-${index}`, index === 0 ? null : `node-${index - 1}`),
  )
  const directory: DirectoryState = {
    workspaces: {},
    sessions: Object.fromEntries(sessions.map((item) => [item.id, item])),
  }
  const projection = tree(
    Object.fromEntries(sessions.map((item, index) => [item.id, branch(true, index < 32 ? [`node-${index + 1}`] : [])])),
  )
  const root = sessions[0]
  if (!root) throw new Error('Fixture has no root')
  const visible = renderedSessionAgentIds([root], directory, projection)
  expect(visible.size).toBe(32)
  expect(visible.has('node-31')).toBe(true)
  expect(visible.has('node-32')).toBe(false)
  expect(renderedSessionAgentIds([{ ...root, archived: true }], directory, projection).size).toBe(0)
})
