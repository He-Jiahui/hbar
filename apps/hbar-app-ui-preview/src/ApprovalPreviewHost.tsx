import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { HbarAppUiAgentApprovalProvider, type HbarAppUiAgentApprovalContent } from 'hbar-app-ui/catalog'
import { createApprovalPreviewStore, projectApprovalPreviewContent } from './approval-preview-model'
import { createPermissionPreviewStore, projectPermissionPreviewContent } from './permission-preview-model'
import { createCostPreviewStore, projectCostPreviewContent } from './cost-preview-model'

export function ApprovalPreviewHost({
  content,
  children,
}: {
  readonly content: HbarAppUiAgentApprovalContent
  readonly children: ReactNode
}) {
  const [store] = useState(() => createApprovalPreviewStore(content))
  useLayoutEffect(() => store.getState().replace(content), [content, store])
  const state = useStore(store)
  const [permissionStore] = useState(() => createPermissionPreviewStore(content.permission))
  useLayoutEffect(() => permissionStore.getState().replace(content.permission), [content.permission, permissionStore])
  const permissionState = useStore(permissionStore)
  const permission = useMemo(() => projectPermissionPreviewContent(permissionState), [permissionState])
  const permissionId = permission?.requestId
  const permissionPending = permission?.state === 'pending'
  useEffect(() => {
    if (!permissionPending) return undefined
    const interval = setInterval(() => permissionStore.getState().tick(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [permissionId, permissionPending, permissionStore])
  const [costStore] = useState(() => createCostPreviewStore(content.cost))
  useLayoutEffect(() => costStore.getState().replace(content.cost), [content.cost, costStore])
  const costState = useStore(costStore)
  const cost = useMemo(() => projectCostPreviewContent(costState), [costState])
  const projected = useMemo(
    () => ({ ...projectApprovalPreviewContent(state), permission, cost }),
    [state, permission, cost],
  )
  return <HbarAppUiAgentApprovalProvider content={projected}>{children}</HbarAppUiAgentApprovalProvider>
}
