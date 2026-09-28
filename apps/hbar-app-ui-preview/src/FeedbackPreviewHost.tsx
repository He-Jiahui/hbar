import { useEffect, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { HbarAppUiFeedbackProvider, type HbarAppUiFeedbackContent } from 'hbar-app-ui/catalog'
import { createFeedbackWidgetPreviewStore } from './feedbackWidgetPreviewStore'

export function FeedbackPreviewHost({
  content,
  children,
}: {
  readonly content: HbarAppUiFeedbackContent
  readonly children: ReactNode
}) {
  const [store] = useState(() => createFeedbackWidgetPreviewStore(content.referenceWidget))
  const state = useStore(store)
  useEffect(() => store.getState().reset(content.referenceWidget), [store, content.referenceWidget])
  return (
    <HbarAppUiFeedbackProvider
      content={{
        ...content,
        referenceWidget: content.referenceWidget && {
          ...content.referenceWidget,
          types: state.types,
          selectedTypeId: state.selectedTypeId,
          draft: state.draft,
          screenshotAttached: state.screenshotAttached,
          phase: state.phase,
          onSelectType: state.selectType,
          onDraftChange: state.changeDraft,
          onToggleScreenshot: state.toggleScreenshot,
          onSubmit: state.submit,
          onSendAnother: state.sendAnother,
        },
      }}
    >
      {children}
    </HbarAppUiFeedbackProvider>
  )
}
