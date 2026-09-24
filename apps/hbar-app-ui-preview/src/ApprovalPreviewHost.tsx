import { useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { HbarAppUiAgentApprovalProvider, type HbarAppUiAgentApprovalContent } from 'hbar-app-ui/catalog'
import { createApprovalPreviewStore, projectApprovalPreviewContent } from './approval-preview-model'

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
  const projected = useMemo(() => projectApprovalPreviewContent(state), [state])
  return <HbarAppUiAgentApprovalProvider content={projected}>{children}</HbarAppUiAgentApprovalProvider>
}
