import { useState } from 'react'
import { LumenFrame } from '@lumen/app-ui'
import { agentRecordSchema } from '@hbar/contracts/commands/agents'
import { goalPlanSnapshotSchema } from '@hbar/contracts/commands/goals'
import type { PromptMention } from '@hbar/app-runtime'
import type { ModelDescriptor } from '@hbar/contracts/commands/models'
import { ActivityAgentsView } from '../../packages/app-react/src/activity-agents-view'
import { ActivityTasksView } from '../../packages/app-react/src/activity-tasks-view'
import { AgentModelPicker } from '../../packages/app-react/src/agent-model-picker'
import { HbarComposerWorkspaceContexts } from '../../packages/app-react/src/composer-workspace-contexts'
import { HbarQueuedUserRuns } from '../../packages/app-react/src/queued-user-runs'
import { HbarComposerMentionEditor } from '../../packages/app-react/src/composer-mention-editor'
import { getShellCopy, type ShellLocale } from '../../apps/web/src/shell-copy'

/** Test-owned bounded data rendered by the production list, picker, reference and editor components. */
export function SingleLineDataGallery({
  caption,
  locale,
  count,
  onAction,
}: {
  readonly caption: string
  readonly locale: ShellLocale
  readonly count: number
  readonly onAction: (id: string) => void
}) {
  const copy = getShellCopy(locale)
  const [draft, setDraft] = useState<{ text: string; revision: number; mentions: readonly PromptMention[] }>({
    text: '',
    revision: 0,
    mentions: [],
  })
  const path = `source/${caption.replaceAll(' ', '-')}.tsx`
  const model: ModelDescriptor = {
    id: 'provider:model',
    providerId: 'provider',
    providerName: caption,
    modelId: caption,
    modelName: caption,
    contextWindow: 128000,
    maxOutput: 8192,
    imageInput: false,
    reasoning: false,
    thinkingLevels: [],
    defaultThinkingLevel: 'off',
    hasKey: false,
  }
  return (
    <LumenFrame className="single-line-gallery" data-fixture-data>
      <ActivityAgentsView
        entry={{
          instanceId: 'activity',
          sessionId: 'session',
          status: 'ready',
          nextCursor: null,
          limitReached: false,
          error: null,
          items: Array.from({ length: Math.min(count, 50) }, (_, index) =>
            agentRecordSchema.parse({
              agentId: `agent-${index}`,
              parentSessionId: 'session',
              sessionId: `child-${index}`,
              runId: `run-${index}`,
              requestId: `request-${index}`,
              objective: caption,
              modelId: 'local-fixture',
              tokenBudget: null,
              status: 'running',
              error: null,
              createdAt: index,
              updatedAt: index,
            }),
          ),
        }}
        labels={copy.activity.agents}
        connected
        opening={null}
        onRefresh={() => onAction('agents:refresh')}
        onLoadMore={() => onAction('agents:more')}
        onOpen={(agent) => onAction(`agent:${agent.agentId}`)}
      />
      <ActivityTasksView
        sessionId="session"
        connected
        labels={copy.activity.tasks}
        onRefresh={() => onAction('tasks:refresh')}
        facts={{
          sessionId: 'session',
          status: 'ready',
          error: null,
          snapshot: goalPlanSnapshotSchema.parse({
            sessionId: 'session',
            goal: null,
            remainingTokens: null,
            goalSeq: 0,
            planSeq: 1,
            plan: {
              sessionId: 'session',
              revision: 1,
              turnId: null,
              updatedAt: 1,
              explanation: null,
              plan: Array.from({ length: Math.min(count, 100) }, () => ({ step: caption, status: 'pending' })),
            },
          }),
        }}
      />
      <AgentModelPicker
        id="fixture-agent-model"
        value={model.id}
        catalog={{ status: 'ready', models: [model], error: null }}
        connected
        disabled={false}
        labels={copy.agents.modelPicker}
        onSelect={(id) => onAction(`model:${id}`)}
        onRetry={() => onAction('model:retry')}
      />
      <HbarComposerWorkspaceContexts
        contexts={[
          {
            id: 'context',
            kind: 'source-selection',
            workspaceId: 'workspace',
            path,
            lineStart: 4,
            lineEnd: 8,
            quote: 'const selected = true',
            sha256: 'a'.repeat(64),
          },
        ]}
        attachments={[]}
        labels={{ ...copy.session.workspaceContexts, name: () => caption }}
        removeAttachmentLabel={() => caption}
        removeDisabled={false}
        onRemove={(id) => onAction(`context:${id}`)}
        onRemoveAttachment={() => onAction('attachment:remove')}
      />
      <HbarQueuedUserRuns
        state={{
          sessionId: 'session',
          status: 'ready',
          totalQueued: count ? 1 : 0,
          pageIndex: 0,
          cursor: null,
          nextCursor: null,
          previousCursors: [],
          error: null,
          removal: null,
          editing: null,
          items: count
            ? [
                {
                  operationId: 'queued',
                  revision: 1,
                  createdAt: 1,
                  textPreview: caption,
                  truncated: false,
                  attachmentCount: 0,
                },
              ]
            : [],
        }}
        sessionId="session"
        connected
        activeRunId="running"
        labels={copy.session.queuedUserRuns}
        onRefresh={() => onAction('queue:refresh')}
        onPrevious={() => onAction('queue:previous')}
        onNext={() => onAction('queue:next')}
        onStartEdit={(id) => onAction(`edit:${id}`)}
        onEditText={() => undefined}
        onSaveEdit={() => undefined}
        onRetryEdit={() => undefined}
        onGuide={(id) => onAction(`guide:${id}`)}
        onRetryGuide={() => undefined}
        onDismissGuide={() => undefined}
        onCancelEdit={() => undefined}
        onRemove={(id) => onAction(`remove:${id}`)}
        onRetryRemoval={() => undefined}
        onDismissRemoval={() => undefined}
      />
      <HbarComposerMentionEditor
        sessionId="session"
        workspaceId="workspace"
        text={draft.text}
        revision={draft.revision}
        mentions={draft.mentions}
        connected
        disabled={false}
        inputLabel="fixture mention editor"
        placeholder={copy.session.prompt.placeholder}
        labels={copy.session.mentions}
        slashLabels={copy.session.slash}
        files={{
          execute: async (name) =>
            name === 'file.list'
              ? { items: [{ name: path.split('/').at(-1), path, directory: false }] }
              : { paths: [path], truncated: false, filesChecked: 1 },
        }}
        onContent={async (text, mentions, revision) => {
          setDraft({ text, revision, mentions })
          return undefined
        }}
        onSubmit={() => onAction('mention:submit')}
      />
    </LumenFrame>
  )
}
