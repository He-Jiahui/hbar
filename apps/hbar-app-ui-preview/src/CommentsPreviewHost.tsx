import { useEffect, useState, type ReactNode } from 'react'
import { HbarAppUiCommentsProvider, type HbarAppUiCommentsContent } from 'hbar-app-ui/catalog'

export function CommentsPreviewHost({content, children}: {readonly content: HbarAppUiCommentsContent; readonly children: ReactNode}) {
  const [sortId, setSortId] = useState(content.referenceDiscussion?.sortId ?? '')
  const [draft, setDraft] = useState(content.referenceDiscussion?.draft ?? '')
  const [messages, setMessages] = useState(content.referenceDiscussion?.messages ?? [])
  useEffect(() => {
    setSortId(content.referenceDiscussion?.sortId ?? '')
    setDraft(content.referenceDiscussion?.draft ?? '')
    setMessages(content.referenceDiscussion?.messages ?? [])
  }, [content])
  return <HbarAppUiCommentsProvider content={{
    ...content,
    referenceDiscussion: content.referenceDiscussion && {
      ...content.referenceDiscussion, sortId, draft, messages,
      onSortChange: setSortId,
      onDraftChange: setDraft,
      onReactionToggle: (id) => setMessages((current) => current.map((message) => message.id === id && message.reactionCount !== undefined
        ? {...message, reacted: !message.reacted, reactionCount: message.reactionCount + (message.reacted ? -1 : 1)} : message)),
    },
  }}>{children}</HbarAppUiCommentsProvider>
}
