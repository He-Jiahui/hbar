import { useEffect, useState, type ReactNode } from 'react'
import { HbarAppUiCommentsProvider, type HbarAppUiCommentsContent } from 'hbar-app-ui/catalog'

export function CommentsPreviewHost({content, children}: {readonly content: HbarAppUiCommentsContent; readonly children: ReactNode}) {
  const [sortId, setSortId] = useState(content.referenceDiscussion?.sortId ?? '')
  const [draft, setDraft] = useState(content.referenceDiscussion?.draft ?? '')
  const [messages, setMessages] = useState(content.referenceDiscussion?.messages ?? [])
  const [activeAnnotationId, setActiveAnnotationId] = useState(content.referenceAnnotation?.activeId ?? '')
  const [annotations, setAnnotations] = useState(content.referenceAnnotation?.annotations ?? [])
  const [reviewResolved, setReviewResolved] = useState(content.referenceReview?.resolved ?? false)
  const [reviewDraft, setReviewDraft] = useState(content.referenceReview?.draft ?? '')
  useEffect(() => {
    setSortId(content.referenceDiscussion?.sortId ?? '')
    setDraft(content.referenceDiscussion?.draft ?? '')
    setMessages(content.referenceDiscussion?.messages ?? [])
    setActiveAnnotationId(content.referenceAnnotation?.activeId ?? '')
    setAnnotations(content.referenceAnnotation?.annotations ?? [])
    setReviewResolved(content.referenceReview?.resolved ?? false)
    setReviewDraft(content.referenceReview?.draft ?? '')
  }, [content])
  return <HbarAppUiCommentsProvider content={{
    ...content,
    referenceReview: content.referenceReview && {
      ...content.referenceReview, resolved: reviewResolved, draft: reviewDraft,
      onResolvedChange: setReviewResolved, onDraftChange: setReviewDraft,
    },
    referenceAnnotation: content.referenceAnnotation && {
      ...content.referenceAnnotation, activeId: activeAnnotationId, annotations,
      onSelectionChange: setActiveAnnotationId,
      onResolveToggle: (id) => setAnnotations((current) => current.map((item) => item.id === id ? {...item, resolved: !item.resolved} : item)),
    },
    referenceDiscussion: content.referenceDiscussion && {
      ...content.referenceDiscussion, sortId, draft, messages,
      onSortChange: setSortId,
      onDraftChange: setDraft,
      onReactionToggle: (id) => setMessages((current) => current.map((message) => message.id === id && message.reactionCount !== undefined
        ? {...message, reacted: !message.reacted, reactionCount: message.reactionCount + (message.reacted ? -1 : 1)} : message)),
    },
  }}>{children}</HbarAppUiCommentsProvider>
}
