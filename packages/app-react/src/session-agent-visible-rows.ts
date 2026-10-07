import type { DirectoryState, SessionAgentTreeState } from '@hbar/app-runtime'
import type { Session } from '@hbar/contracts/directory'

/** Shared by the rendered branch and feedback placement; cached facts alone are not visible rows. */
export function visibleSessionAgentRows(
  parent: Readonly<Session>,
  path: readonly string[],
  directory: DirectoryState,
  tree: SessionAgentTreeState,
) {
  const nextPath = [...path, parent.id]
  return (tree.branches[parent.id]?.rows ?? []).flatMap((row) => {
    const child = directory.sessions[row.sessionId]
    return child &&
      !child.archived &&
      child.parentId === parent.id &&
      !nextPath.includes(child.id) &&
      nextPath.length < 32
      ? [{ row, child }]
      : []
  })
}

export function renderedSessionAgentIds(
  roots: readonly Readonly<Session>[],
  directory: DirectoryState,
  tree: SessionAgentTreeState,
): ReadonlySet<string> {
  const visible = new Set<string>()
  const visit = (session: Readonly<Session>, path: readonly string[]) => {
    if (session.archived || visible.has(session.id)) return
    visible.add(session.id)
    if (!tree.branches[session.id]?.expanded) return
    for (const { child } of visibleSessionAgentRows(session, path, directory, tree)) visit(child, [...path, session.id])
  }
  for (const root of roots) visit(root, [])
  return visible
}
