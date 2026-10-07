import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { ListChecks, RefreshCw } from 'lucide-react'
import { LumenFrame, LumenIcon, LumenIconButton, LumenProvider, LumenToolPane } from '@lumen/app-ui'
import type { ComposerIntentState, WorkflowWorkspaceEntryState } from '@hbar/app-runtime'
import { workflowSnapshotSchema } from '@hbar/contracts'
import { agentRecordSchema } from '@hbar/contracts/commands/agents'
import { goalPlanSnapshotSchema } from '@hbar/contracts/commands/goals'
import { HbarSessionActivityView } from '../../packages/app-react/src/session-activity-workspace'
import { ActivityTasksView } from '../../packages/app-react/src/activity-tasks-view'
import { ActivityAgentsView } from '../../packages/app-react/src/activity-agents-view'
import { ActivityWorkflowView } from '../../packages/app-react/src/activity-workflow-view'
import { createWebLumenAppearance, DEFAULT_WEB_APPEARANCE_DIMENSIONS } from '../../apps/web/src/appearance'
import { getShellCopy, type ShellLocale } from '../../apps/web/src/shell-copy'
import '@lumen/app-ui/styles.css'
import './activity-panel-browser.css'

export interface ActivityPanelFixtureInput {
  readonly locale: ShellLocale
  readonly theme: 'dark' | 'light'
  readonly count?: number
  readonly taskCount?: number
  readonly long?: boolean
  readonly longLabels?: boolean
  readonly revision?: number
  readonly reverse?: boolean
  readonly completed?: boolean
  readonly sessionId?: string
  readonly connected?: boolean
}

declare global {
  interface Window {
    activityPanelFixture: { render(input: ActivityPanelFixtureInput): void; actions(): readonly string[] }
  }
}

const actions: string[] = []
const container = document.getElementById('root')
if (!container) throw new Error('Activity fixture root missing')
const root = createRoot(container)

/** Test-only Host-shaped data, rendered by the production Activity views and the actual Lumen pane. */
function Fixture({ input }: { readonly input: ActivityPanelFixtureInput }) {
  const copy = getShellCopy(input.locale).activity
  const sessionId = input.sessionId ?? 'parent'
  const caption =
    input.locale === 'zh-CN'
      ? '检查活动面板的任务进度、运行输入与子 Agent 状态，让中文长句、文件路径和命令都自然换行。'
      : 'Inspect task progress, run input and child agent status while keeping long sentences, file paths and commands readable. '
  const content = input.long
    ? `${caption.repeat(8)} source/${'unbroken_filename_segment_'.repeat(12)}.tsx\n${caption.repeat(3)}`
    : caption
  const labels = input.longLabels
    ? {
        ...copy,
        tasks: { ...copy.tasks, title: caption.repeat(3) },
        agents: { ...copy.agents, title: caption.repeat(3) },
      }
    : copy
  const count = input.count ?? 5
  const agents = Array.from({ length: Math.min(count, 50) }, (_, index) =>
    agentRecordSchema.parse({
      agentId: `agent-${index}`,
      parentSessionId: sessionId,
      sessionId: `child-${index}`,
      runId: `run-${index}`,
      requestId: `request-${index}`,
      objective: `${index}: ${content}`,
      modelId: 'local-fixture',
      tokenBudget: null,
      status: input.completed ? 'completed' : 'running',
      error: null,
      createdAt: index,
      updatedAt: input.reverse ? index : count - index,
    }),
  )
  const taskCount = input.taskCount ?? 5
  const facts: ComposerIntentState['facts'] = {
    sessionId,
    status: 'ready',
    error: null,
    snapshot: goalPlanSnapshotSchema.parse({
      sessionId,
      goal: null,
      remainingTokens: null,
      goalSeq: 0,
      planSeq: 1,
      plan: {
        sessionId,
        revision: input.revision ?? 1,
        turnId: null,
        updatedAt: 1,
        explanation: null,
        plan: Array.from({ length: taskCount }, (_, index) => ({
          step: `${index}: ${content}`,
          status: input.completed || index === 0 ? 'completed' : 'pending',
        })),
      },
    }),
  }
  const workflowAgent = agents[0] ? { ...agents[0], agentId: 'workflow-agent', sessionId: 'workflow-child' } : null
  const workflow: WorkflowWorkspaceEntryState = {
    instanceId: 'activity',
    sessionId,
    status: 'ready',
    agents: {},
    visibleEvidence: 0,
    actions: {},
    error: null,
    snapshot: workflowSnapshotSchema.parse({
      plan: null,
      workflow: workflowAgent
        ? {
            schemaVersion: 2,
            executionModel: 'focus_v2',
            workflowId: 'workflow',
            sessionId,
            goalId: null,
            planRevision: 1,
            revision: 1,
            status: 'active',
            explorationCount: 0,
            focus: {
              focusId: 'focus',
              planRevision: 1,
              stepIndex: 0,
              stepTextHash: 'a'.repeat(64),
              title: content,
              status: 'delegated',
              scope: { readPaths: [], writePaths: [], tools: [] },
              acceptanceChecks: [],
              completionPolicy: 'agent',
              startedAt: 1,
              completedAt: null,
            },
            scopeExpansions: [],
            evidence: [],
            createdAt: 1,
            updatedAt: 1,
            delegations: [
              {
                delegationId: 'delegation',
                itemId: 'focus',
                agentId: workflowAgent.agentId,
                modelId: 'local-fixture',
                tokenBudget: null,
                status: 'running',
                patchId: null,
                createdAt: 1,
                updatedAt: 1,
              },
            ],
          }
        : null,
    }),
  }
  const connected = input.connected ?? true
  return (
    <LumenProvider appearance={createWebLumenAppearance(input.theme, DEFAULT_WEB_APPEARANCE_DIMENSIONS, false)}>
      <LumenToolPane
        title={copy.title}
        targetLabel={input.long ? caption.repeat(3) : caption}
        icon={ListChecks}
        className="hbar-session-activity-workspace"
        actions={
          <LumenIconButton label={copy.refresh} onClick={() => actions.push('refresh')}>
            <LumenIcon icon={RefreshCw} tier="sm" />
          </LumenIconButton>
        }
        closeLabel={copy.close}
        onClose={() => actions.push('close')}
      >
        <LumenFrame as="main" className="hbar-session-activity-body">
          <ActivityTasksView
            facts={facts}
            sessionId={sessionId}
            labels={labels.tasks}
            connected={connected}
            onRefresh={() => actions.push('tasks:refresh')}
          />
          <HbarSessionActivityView
            entry={{
              instanceId: 'activity',
              sessionId,
              status: 'ready',
              items: count
                ? [{ operationId: 'operation', status: 'running', createdAt: 1, startedAt: 1, intentPreview: content }]
                : [],
              totalActive: count ? 1 : 0,
              nextCursor: null,
              sessionSeq: 1,
              limitReached: false,
              error: null,
            }}
            labels={labels}
            connected={connected}
            onRefresh={() => actions.push('runs:refresh')}
            onLoadMore={() => actions.push('runs:more')}
          />
          <ActivityWorkflowView
            entry={workflow}
            sessionId={sessionId}
            liveAgents={workflowAgent ? [workflowAgent] : []}
            labels={labels.workflow}
            connected={connected}
            opening={null}
            onRefresh={() => actions.push('workflow:refresh')}
            onOpen={(agent) => actions.push(`open:${agent.agentId}`)}
          />
          <ActivityAgentsView
            entry={{
              instanceId: 'activity',
              sessionId,
              status: 'ready',
              items: agents,
              nextCursor: count > 50 ? 'next-page' : null,
              limitReached: false,
              error: null,
            }}
            labels={labels.agents}
            connected={connected}
            opening={null}
            onRefresh={() => actions.push('agents:refresh')}
            onLoadMore={() => actions.push('agents:more')}
            onOpen={(agent) => actions.push(`open:${agent.agentId}`)}
          />
        </LumenFrame>
      </LumenToolPane>
    </LumenProvider>
  )
}

window.activityPanelFixture = {
  render: (input) => flushSync(() => root.render(<Fixture key={input.sessionId ?? 'parent'} input={input} />)),
  actions: () => [...actions],
}
window.activityPanelFixture.render({ locale: 'zh-CN', theme: 'dark' })
