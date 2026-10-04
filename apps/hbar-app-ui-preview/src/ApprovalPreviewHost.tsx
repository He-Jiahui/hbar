import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  HbarAppUiAgentApprovalProvider,
  type HbarAppUiAgentApprovalContent,
  type HbarAppUiVariantProps,
} from 'hbar-app-ui/catalog'
import { createApprovalPreviewStore, projectApprovalPreviewContent } from './approval-preview-model'
import { createPermissionPreviewStore, projectPermissionPreviewContent } from './permission-preview-model'
import { createCostPreviewStore, projectCostPreviewContent } from './cost-preview-model'
import { createHistoryPreviewStore, projectHistoryPreviewContent } from './history-preview-model'
import { createApprovalDecisionPreviewStore, type ApprovalDecisionPreviewSeed } from './approvalDecisionPreviewStore'
import { createApprovalPreviewCopy, projectApprovalPreviewCopy } from './approvalPreviewCopy'

interface ApprovalPreviewHostProps extends Pick<HbarAppUiVariantProps, 'spec'> {
  readonly content: HbarAppUiAgentApprovalContent
  readonly localized: boolean
  readonly children: ReactNode
}

export function ApprovalPreviewHost(props: ApprovalPreviewHostProps) {
  if (props.spec.category !== 'agent-approval')
    return <HbarAppUiAgentApprovalProvider content={props.content}>{props.children}</HbarAppUiAgentApprovalProvider>
  return <ApprovalPreviewOwner key={props.spec.id} {...props} />
}

function ApprovalPreviewOwner({ content, spec, localized, children }: ApprovalPreviewHostProps) {
  const source = useMemo(() => projectApprovalPreviewCopy(content, localized), [content, localized])
  const copy = createApprovalPreviewCopy(localized)
  const ownerId = `approval-preview-${spec.id}`
  const seed = useMemo<ApprovalDecisionPreviewSeed>(() => {
    const variant = spec.variant === 2 ? 2 : 1
    const request = variant === 1 ? content.inline : content.diff
    return {
      ownerId: `approval-preview-${spec.id}`,
      variant,
      requestId: request?.requestId ?? `${spec.id}-request`,
      state: request?.state ?? 'pending',
      busy: Boolean(request?.busy),
    }
  }, [content.inline, content.diff, spec.id, spec.variant])
  const [decisionStore] = useState(() => createApprovalDecisionPreviewStore(seed))
  useLayoutEffect(() => decisionStore.getState().reconcile(seed), [decisionStore, seed])
  const decisionState = useStore(decisionStore)
  const queueSource = useMemo(() => (spec.variant === 3 ? source : {}), [source, spec.variant])
  const [store] = useState(() => createApprovalPreviewStore(queueSource))
  useLayoutEffect(() => store.getState().replace(queueSource), [queueSource, store])
  const state = useStore(store)
  const permissionSource = spec.variant === 4 ? source.permission : undefined
  const [permissionStore] = useState(() => createPermissionPreviewStore(permissionSource))
  useLayoutEffect(() => permissionStore.getState().replace(permissionSource), [permissionSource, permissionStore])
  const permissionState = useStore(permissionStore)
  const permission = useMemo(() => projectPermissionPreviewContent(permissionState), [permissionState])
  const permissionId = permission?.requestId
  const permissionPending = permission?.state === 'pending'
  useEffect(() => {
    if (!permissionPending) return undefined
    const interval = setInterval(() => permissionStore.getState().tick(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [permissionId, permissionPending, permissionStore])
  const costSource = spec.variant === 5 ? source.cost : undefined
  const [costStore] = useState(() => createCostPreviewStore(costSource))
  useLayoutEffect(() => costStore.getState().replace(costSource), [costSource, costStore])
  const costState = useStore(costStore)
  const cost = useMemo(() => projectCostPreviewContent(costState), [costState])
  const historySource = spec.variant === 6 ? source.history : undefined
  const [historyStore] = useState(() => createHistoryPreviewStore(historySource))
  useLayoutEffect(() => historyStore.getState().replace(historySource), [historySource, historyStore])
  const historyState = useStore(historyStore)
  const history = useMemo(() => projectHistoryPreviewContent(historyState), [historyState])
  const locallyDecided =
    ((spec.variant === 1 || spec.variant === 2) && decisionState.decision !== 'pending') ||
    state.lastDecision ||
    permissionState.decision ||
    costState.decision
  const projected: HbarAppUiAgentApprovalContent = {
    ...source,
    presentation: {
      ownerId,
      notice: historyState.exportRequested ? copy.exportNotice : locallyDecided ? copy.notice : undefined,
    },
    inline:
      spec.variant === 1 && source.inline
        ? {
            ...source.inline,
            requestId: seed.requestId,
            state: decisionState.decision === 'always-allow' ? 'pending' : decisionState.decision,
            onDecision: (id, decision) => {
              decisionStore.getState().decide(id, decision)
            },
          }
        : source.inline,
    diff:
      spec.variant === 2 && source.diff
        ? {
            ...source.diff,
            requestId: seed.requestId,
            state: decisionState.decision,
            onDecision: (id, decision) => {
              decisionStore.getState().decide(id, decision)
            },
          }
        : source.diff,
    queue: spec.variant === 3 ? projectApprovalPreviewContent(state).queue : source.queue,
    permission: spec.variant === 4 ? permission : source.permission,
    cost: spec.variant === 5 ? cost : source.cost,
    history: spec.variant === 6 ? history : source.history,
  }
  return <HbarAppUiAgentApprovalProvider content={projected}>{children}</HbarAppUiAgentApprovalProvider>
}
