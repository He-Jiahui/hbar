import { createStore } from 'zustand/vanilla'
import type { HbarAppUiFeedbackInboxReferenceContent } from 'hbar-app-ui/catalog'
import { selectHbarAppUiFeedbackInboxThread, uniqueHbarAppUiFeedbackInboxThreads } from 'hbar-app-ui/catalog'

type Inbox = HbarAppUiFeedbackInboxReferenceContent

function projection(content: Inbox | undefined) {
  const threads = uniqueHbarAppUiFeedbackInboxThreads(content?.threads ?? [])
  return {
    inboxId: content?.inboxId,
    threads,
    details: (content?.details ?? []).filter((detail) => threads.some((thread) => thread.id === detail.threadId)),
    selectedThreadId: selectHbarAppUiFeedbackInboxThread(threads, content?.selectedThreadId)?.id,
    noteDraft: content?.noteDraft ?? '',
  }
}

interface InboxState extends ReturnType<typeof projection> {
  readonly reset: (content: Inbox | undefined) => void
  readonly selectThread: (inboxId: string, threadId: string) => void
  readonly changeNote: (inboxId: string, draft: string) => void
}

/** Selection is keyed to one inbox; the source's internal note is shared across threads. */
export function createFeedbackInboxPreviewStore(content: Inbox | undefined) {
  return createStore<InboxState>((set) => ({
    ...projection(content),
    reset: (next) => set(projection(next)),
    selectThread: (inboxId, threadId) => set((state) =>
      state.inboxId === inboxId && state.threads.some((thread) => thread.id === threadId)
        ? {selectedThreadId: threadId} : {}),
    changeNote: (inboxId, draft) => set((state) => state.inboxId === inboxId ? {noteDraft: draft} : {}),
  }))
}
