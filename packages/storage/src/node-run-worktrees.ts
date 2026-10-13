import type { Database } from 'bun:sqlite'
import { HbarError, idSchema, type SessionEvent } from '@hbar/contracts'
import { nodeManagedWorktreeSchema } from '@hbar/contracts/node-worktree'
import {
  nodeIdSchema,
  nodeRootIdSchema,
  nodeWorkspaceLocator,
  parseNodeWorkspaceLocator,
} from '@hbar/contracts/node-address'
import { nodeCapabilitiesSchema } from '@hbar/contracts/node'
import { z } from 'zod'
import { sessionLaunchTargetBindingSchema } from './session-launch-target.ts'
import { sessionLaunchSelectionSchema } from '@hbar/contracts/commands/session-launch-target'
import { workspaceFolderSnapshotSchema } from '@hbar/contracts/commands/workspace-folders'

export const NODE_RUN_WORKTREES_SQL = `
CREATE TABLE node_run_worktrees(
  runId TEXT PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  sessionId TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  workspaceId TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  nodeId TEXT NOT NULL,
  parentRootId TEXT NOT NULL,
  worktreeRootId TEXT NOT NULL,
  worktreeId TEXT NOT NULL,
  createdByRunId TEXT NOT NULL,
  targetRevision INTEGER NOT NULL,
  nodePath TEXT NOT NULL,
  branch TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  launchTargetRevision INTEGER NOT NULL,
  originalNodePath TEXT NOT NULL,
  bindingJson TEXT NOT NULL
) STRICT;
CREATE INDEX node_run_worktrees_session ON node_run_worktrees(sessionId,runId);
`

const runWorktreeInputSchema = z.strictObject({
  runId: idSchema,
  launchTargetRevision: z.number().int().nonnegative().safe(),
  worktree: nodeManagedWorktreeSchema,
})

export const nodeRunWorktreeBindingSchema = z
  .strictObject({
    runId: idSchema,
    sessionId: idSchema,
    workspaceId: idSchema,
    nodeId: nodeIdSchema,
    parentRootId: nodeRootIdSchema,
    worktreeRootId: nodeRootIdSchema,
    worktreeId: z.string().regex(/^[a-f0-9]{32}$/),
    worktreeCreatedByRunId: idSchema,
    worktreeTargetRevision: z.number().int().nonnegative().safe(),
    nodePath: z.string().min(1).max(4_000),
    branch: z.string().min(1).max(255),
    createdAt: z.number().int().nonnegative().safe(),
    launchTargetRevision: z.number().int().nonnegative().safe(),
    launchTarget: sessionLaunchTargetBindingSchema,
    originalWorkspaceLocation: z.strictObject({
      rootId: nodeRootIdSchema,
      nodePath: z.string().min(1).max(4_000),
    }),
  })
  .superRefine((binding, context) => {
    if (
      binding.launchTargetRevision !== binding.launchTarget.expectedRevision ||
      binding.sessionId !== binding.launchTarget.sessionId ||
      binding.launchTarget.selection.mode === 'shared-current' ||
      binding.branch !== binding.launchTarget.branch ||
      binding.worktreeRootId !== `wt_${binding.worktreeId}` ||
      binding.worktreeTargetRevision !== binding.launchTargetRevision ||
      binding.parentRootId !== binding.originalWorkspaceLocation.rootId
    )
      context.addIssue({ code: 'custom', message: 'Managed Run worktree provenance is inconsistent' })
  })
export type NodeRunWorktreeBinding = z.infer<typeof nodeRunWorktreeBindingSchema>
export type NodeRunWorktreeBindInput = z.infer<typeof runWorktreeInputSchema>
export const nodeRunWorktreeAdmissionSchema = z.strictObject({
  runId: idSchema,
  sessionId: idSchema,
  workspaceId: idSchema,
  launchTarget: sessionLaunchTargetBindingSchema,
  workspaceFoldersSnapshot: workspaceFolderSnapshotSchema.optional(),
  originalWorkspaceLocation: z.strictObject({
    nodeId: nodeIdSchema,
    rootId: nodeRootIdSchema,
    nodePath: z.string().min(1).max(4_000),
  }),
})
export type NodeRunWorktreeAdmission = z.infer<typeof nodeRunWorktreeAdmissionSchema>

type AppendEvent = (sessionId: string, type: string, data: unknown, runId?: string) => SessionEvent

export function createNodeRunWorktreeStorage(db: Database, appendEvent: AppendEvent) {
  function row(runId: string): NodeRunWorktreeBinding | null {
    const stored = db
      .query<Record<string, unknown>, [string]>('SELECT * FROM node_run_worktrees WHERE runId=?')
      .get(runId)
    if (!stored) return null
    const binding = nodeRunWorktreeBindingSchema.parse(JSON.parse(String(stored.bindingJson)) as unknown)
    if (
      stored.runId !== binding.runId ||
      stored.sessionId !== binding.sessionId ||
      stored.workspaceId !== binding.workspaceId ||
      stored.nodeId !== binding.nodeId ||
      stored.parentRootId !== binding.parentRootId ||
      stored.worktreeRootId !== binding.worktreeRootId ||
      stored.worktreeId !== binding.worktreeId ||
      stored.createdByRunId !== binding.worktreeCreatedByRunId ||
      stored.targetRevision !== binding.worktreeTargetRevision ||
      stored.nodePath !== binding.nodePath ||
      stored.branch !== binding.branch ||
      stored.createdAt !== binding.createdAt ||
      stored.launchTargetRevision !== binding.launchTargetRevision ||
      stored.originalNodePath !== binding.originalWorkspaceLocation.nodePath
    )
      throw new HbarError('SESSION_LOG_CORRUPTED', 'Managed Run worktree columns conflict with their durable record')
    return binding
  }

  function sameTargetIdentity(left: NodeRunWorktreeBinding, right: NodeRunWorktreeBinding): boolean {
    const { runId: _leftRunId, ...leftTarget } = left
    const { runId: _rightRunId, ...rightTarget } = right
    return JSON.stringify(leftTarget) === JSON.stringify(rightTarget)
  }

  function acceptedRun(runId: string) {
    const accepted = db
      .query<{ data: string; sessionId: string }, [string]>(
        "SELECT data,sessionId FROM events WHERE runId=? AND type IN ('run.queued','run.recoveryQueued') ORDER BY seq LIMIT 1",
      )
      .get(runId)
    if (!accepted) throw new HbarError('RUN_JOURNAL_MISSING', 'Managed worktree has no matching accepted Run record')
    const event = z
      .object({
        run: z.object({ id: idSchema, sessionId: idSchema }),
        launchTarget: sessionLaunchTargetBindingSchema.optional(),
        workspaceId: idSchema.optional(),
        nodeWorkspaceLocation: z
          .strictObject({ nodeId: nodeIdSchema, rootId: nodeRootIdSchema, nodePath: z.string().min(1).max(4_000) })
          .optional(),
        workspaceFoldersSnapshot: workspaceFolderSnapshotSchema.optional(),
      })
      .parse(JSON.parse(accepted.data) as unknown)
    if (event.run.id !== runId || event.run.sessionId !== accepted.sessionId)
      throw new HbarError('SESSION_LOG_CORRUPTED', 'Accepted Run journal identity is inconsistent')
    return { ...event, sessionId: event.run.sessionId }
  }

  function admission(rawRunId: string): NodeRunWorktreeAdmission | null {
    const runId = idSchema.parse(rawRunId)
    const accepted = acceptedRun(runId)
    const locator = accepted.launchTarget ? parseNodeWorkspaceLocator(accepted.launchTarget.targetPath) : null
    if (!accepted.workspaceId || !accepted.nodeWorkspaceLocation) {
      if (locator)
        throw new HbarError(
          'NODE_WORKTREE_ADMISSION_MISSING',
          'This accepted Run predates durable remote workspace provenance and cannot allocate a managed worktree',
        )
      return null
    }
    if (!accepted.launchTarget || accepted.launchTarget.sessionId !== accepted.sessionId)
      throw new HbarError('COMMAND_CONFLICT', 'Managed worktree does not match the accepted launch-target revision')
    if (
      locator &&
      (locator.nodeId !== accepted.nodeWorkspaceLocation.nodeId ||
        locator.rootId !== accepted.nodeWorkspaceLocation.rootId)
    )
      throw new HbarError(
        'SESSION_LOG_CORRUPTED',
        'Accepted Run remote locator differs from its original workspace snapshot',
      )
    const original = db
      .query<{ nodeId: string; rootId: string; nodePath: string }, [string]>(
        'SELECT nodeId,rootId,nodePath FROM node_workspace_locations WHERE workspaceId=?',
      )
      .get(accepted.workspaceId)
    if (
      !original ||
      original.nodeId !== accepted.nodeWorkspaceLocation.nodeId ||
      original.rootId !== accepted.nodeWorkspaceLocation.rootId ||
      original.nodePath !== accepted.nodeWorkspaceLocation.nodePath
    )
      throw new HbarError('SESSION_LOG_CORRUPTED', 'Accepted Run workspace snapshot differs from the original root pin')
    return nodeRunWorktreeAdmissionSchema.parse({
      runId,
      sessionId: accepted.sessionId,
      workspaceId: accepted.workspaceId,
      launchTarget: accepted.launchTarget,
      originalWorkspaceLocation: accepted.nodeWorkspaceLocation,
      ...(accepted.workspaceFoldersSnapshot ? { workspaceFoldersSnapshot: accepted.workspaceFoldersSnapshot } : {}),
    })
  }

  function persist(binding: NodeRunWorktreeBinding, replay: boolean): void {
    const existing = row(binding.runId)
    if (existing) {
      if (JSON.stringify(existing) === JSON.stringify(binding)) return
      throw new HbarError(
        replay ? 'SESSION_LOG_CORRUPTED' : 'IDEMPOTENCY_CONFLICT',
        'A Run is already bound to another managed node worktree',
      )
    }
    const priorTarget = db
      .query<{ bindingJson: string }, [string, number]>(
        'SELECT bindingJson FROM node_run_worktrees WHERE sessionId=? AND launchTargetRevision=? ORDER BY runId LIMIT 1',
      )
      .get(binding.sessionId, binding.launchTargetRevision)
    if (priorTarget) {
      const prior = nodeRunWorktreeBindingSchema.parse(JSON.parse(priorTarget.bindingJson) as unknown)
      if (!sameTargetIdentity(prior, binding))
        throw new HbarError(
          replay ? 'SESSION_LOG_CORRUPTED' : 'IDEMPOTENCY_CONFLICT',
          'A Session launch revision is already bound to another managed worktree',
        )
    }
    const sameWorktree = db
      .query<{ bindingJson: string }, [string]>(
        'SELECT bindingJson FROM node_run_worktrees WHERE worktreeId=? ORDER BY runId LIMIT 1',
      )
      .get(binding.worktreeId)
    if (sameWorktree) {
      const prior = nodeRunWorktreeBindingSchema.parse(JSON.parse(sameWorktree.bindingJson) as unknown)
      if (!sameTargetIdentity(prior, binding))
        throw new HbarError(
          replay ? 'SESSION_LOG_CORRUPTED' : 'IDEMPOTENCY_CONFLICT',
          'Managed worktree ID is already pinned to another immutable target',
        )
    }
    db.query(
      `INSERT INTO node_run_worktrees
       (runId,sessionId,workspaceId,nodeId,parentRootId,worktreeRootId,worktreeId,nodePath,branch,createdAt,
        createdByRunId,targetRevision,launchTargetRevision,originalNodePath,bindingJson)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      binding.runId,
      binding.sessionId,
      binding.workspaceId,
      binding.nodeId,
      binding.parentRootId,
      binding.worktreeRootId,
      binding.worktreeId,
      binding.nodePath,
      binding.branch,
      binding.createdAt,
      binding.worktreeCreatedByRunId,
      binding.worktreeTargetRevision,
      binding.launchTargetRevision,
      binding.originalWorkspaceLocation.nodePath,
      JSON.stringify(binding),
    )
  }

  function checkedBinding(raw: unknown): NodeRunWorktreeBinding {
    const parsed = runWorktreeInputSchema.parse(raw)
    const run = db
      .query<{ sessionId: string; status: string }, [string]>('SELECT sessionId,status FROM runs WHERE id=?')
      .get(parsed.runId)
    if (!run || !['queued', 'running', 'waiting_approval', 'interrupted'].includes(run.status))
      throw new HbarError('INVALID_STATE', 'Managed worktree requires a nonterminal accepted Run')
    if (run.sessionId !== parsed.worktree.sessionId)
      throw new HbarError('WORKSPACE_SCOPE', 'Managed worktree belongs to another Session')
    if (parsed.worktree.targetRevision !== parsed.launchTargetRevision)
      throw new HbarError('COMMAND_CONFLICT', 'B worktree provenance differs from the accepted launch revision')
    const accepted = admission(parsed.runId)
    if (!accepted || accepted.sessionId !== parsed.worktree.sessionId)
      throw new HbarError('WORKSPACE_SCOPE', 'Accepted Run has no pinned remote workspace provenance')
    if (accepted.launchTarget.expectedRevision !== parsed.launchTargetRevision)
      throw new HbarError('COMMAND_CONFLICT', 'Managed worktree launch target changed from the accepted Run revision')
    if (accepted.launchTarget.selection.mode === 'shared-current')
      throw new HbarError('COMMAND_CONFLICT', 'Shared-current Runs cannot bind a managed child worktree')
    if (parsed.worktree.branch !== accepted.launchTarget.branch)
      throw new HbarError('COMMAND_CONFLICT', 'Managed worktree branch differs from the accepted launch target')
    const currentTarget = db
      .query<{ revision: number; selectionJson: string }, [string]>(
        'SELECT revision,selectionJson FROM session_launch_targets WHERE sessionId=?',
      )
      .get(parsed.worktree.sessionId)
    const currentRevision = currentTarget?.revision ?? 0
    const currentSelection = sessionLaunchSelectionSchema.parse(
      currentTarget ? (JSON.parse(currentTarget.selectionJson) as unknown) : { mode: 'shared-current' },
    )
    if (
      currentRevision !== accepted.launchTarget.expectedRevision ||
      JSON.stringify(currentSelection) !== JSON.stringify(accepted.launchTarget.selection)
    )
      throw new HbarError('COMMAND_CONFLICT', 'Session launch target changed after this Run was accepted')
    const workspace = db
      .query<
        {
          workspaceId: string
          path: string
          nodeId: string
          rootId: string
          nodePath: string
          revokedAt: number | null
          capabilities: string | null
        },
        [string, string]
      >(
        `SELECT s.workspaceId,w.path,l.nodeId,l.rootId,l.nodePath,n.revokedAt,n.capabilities FROM sessions s
         JOIN workspaces w ON w.id=s.workspaceId JOIN node_workspace_locations l ON l.workspaceId=w.id
         JOIN workspace_nodes n ON n.nodeId=l.nodeId
         WHERE s.id=? AND s.workspaceId=?`,
      )
      .get(parsed.worktree.sessionId, accepted.workspaceId)
    if (!workspace) throw new HbarError('WORKSPACE_SCOPE', 'Managed worktree requires its original node workspace')
    const locator = parseNodeWorkspaceLocator(workspace.path)
    const capabilities =
      workspace.capabilities === null
        ? null
        : nodeCapabilitiesSchema.parse(JSON.parse(workspace.capabilities) as unknown)
    const parent = capabilities?.roots.find((root) => root.rootId === workspace.rootId)
    const creator = db
      .query<{ sessionId: string }, [string]>('SELECT sessionId FROM runs WHERE id=?')
      .get(parsed.worktree.createdByRunId)
    if (
      !locator ||
      workspace.workspaceId !== accepted.workspaceId ||
      locator.nodeId !== workspace.nodeId ||
      locator.rootId !== workspace.rootId ||
      workspace.nodeId !== accepted.originalWorkspaceLocation.nodeId ||
      workspace.rootId !== accepted.originalWorkspaceLocation.rootId ||
      workspace.nodePath !== accepted.originalWorkspaceLocation.nodePath ||
      workspace.revokedAt !== null ||
      capabilities?.nodeId !== workspace.nodeId ||
      !parent ||
      parent.nodePath !== workspace.nodePath ||
      parent.access !== 'write' ||
      !creator ||
      creator.sessionId !== parsed.worktree.sessionId ||
      parsed.worktree.parentRootId !== workspace.rootId ||
      parsed.worktree.worktreeRootId !== `wt_${parsed.worktree.worktreeId}`
    )
      throw new HbarError('WORKSPACE_SCOPE', 'Managed worktree does not descend from the original node workspace root')
    const launchTarget = accepted.launchTarget
    const binding = nodeRunWorktreeBindingSchema.parse({
      runId: parsed.runId,
      sessionId: parsed.worktree.sessionId,
      workspaceId: workspace.workspaceId,
      nodeId: workspace.nodeId,
      parentRootId: parsed.worktree.parentRootId,
      worktreeRootId: parsed.worktree.worktreeRootId,
      worktreeId: parsed.worktree.worktreeId,
      worktreeCreatedByRunId: parsed.worktree.createdByRunId,
      worktreeTargetRevision: parsed.worktree.targetRevision,
      nodePath: parsed.worktree.nodePath,
      branch: parsed.worktree.branch,
      createdAt: parsed.worktree.createdAt,
      launchTargetRevision: parsed.launchTargetRevision,
      launchTarget,
      originalWorkspaceLocation: { rootId: workspace.rootId, nodePath: workspace.nodePath },
    })
    if (nodeWorkspaceLocator(binding.nodeId, binding.parentRootId) !== workspace.path)
      throw new HbarError('WORKSPACE_SCOPE', 'Managed worktree original workspace locator changed')
    return binding
  }

  return {
    bind(raw: unknown): NodeRunWorktreeBinding {
      return db
        .transaction(() => {
          const binding = checkedBinding(raw)
          const existing = row(binding.runId)
          if (existing) {
            if (JSON.stringify(existing) === JSON.stringify(binding)) return existing
            throw new HbarError('IDEMPOTENCY_CONFLICT', 'Run is already bound to another managed node worktree')
          }
          persist(binding, false)
          appendEvent(binding.sessionId, 'run.worktreeBound', binding, binding.runId)
          return binding
        })
        .immediate()
    },
    read(rawRunId: string): NodeRunWorktreeBinding | null {
      return row(idSchema.parse(rawRunId))
    },
    admission,
    restore(raw: unknown, event: SessionEvent): void {
      const binding = nodeRunWorktreeBindingSchema.parse(raw)
      if (event.type !== 'run.worktreeBound' || event.runId !== binding.runId || event.sessionId !== binding.sessionId)
        throw new HbarError('SESSION_LOG_CORRUPTED', 'Canonical managed worktree event identity is inconsistent')
      const accepted = acceptedRun(binding.runId)
      if (
        accepted.run.sessionId !== binding.sessionId ||
        accepted.workspaceId !== binding.workspaceId ||
        accepted.launchTarget?.expectedRevision !== binding.launchTargetRevision ||
        JSON.stringify(accepted.launchTarget) !== JSON.stringify(binding.launchTarget) ||
        JSON.stringify(accepted.nodeWorkspaceLocation) !==
          JSON.stringify({
            nodeId: binding.nodeId,
            rootId: binding.originalWorkspaceLocation.rootId,
            nodePath: binding.originalWorkspaceLocation.nodePath,
          })
      )
        throw new HbarError('SESSION_LOG_CORRUPTED', 'Managed worktree launch target differs from accepted Run')
      const original = db
        .query<{ nodeId: string; rootId: string; nodePath: string }, [string]>(
          'SELECT nodeId,rootId,nodePath FROM node_workspace_locations WHERE workspaceId=?',
        )
        .get(binding.workspaceId)
      if (
        !original ||
        original.nodeId !== binding.nodeId ||
        original.rootId !== binding.originalWorkspaceLocation.rootId ||
        original.nodePath !== binding.originalWorkspaceLocation.nodePath ||
        original.rootId !== binding.parentRootId
      )
        throw new HbarError('SESSION_LOG_CORRUPTED', 'Managed worktree conflicts with original workspace root pin')
      const creator = db
        .query<{ sessionId: string }, [string]>('SELECT sessionId FROM runs WHERE id=?')
        .get(binding.worktreeCreatedByRunId)
      if (!creator || creator.sessionId !== binding.sessionId)
        throw new HbarError(
          'SESSION_LOG_CORRUPTED',
          'Managed worktree creator Run is missing or belongs to another Session',
        )
      persist(binding, true)
    },
  }
}
