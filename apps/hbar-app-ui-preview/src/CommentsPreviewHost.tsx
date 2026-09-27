import { useEffect, useState, type ReactNode } from 'react'
import { HbarAppUiCommentsProvider, filterHbarAppUiCommentsComposerMentions, insertHbarAppUiCommentsComposerMention, type HbarAppUiCommentsContent } from 'hbar-app-ui/catalog'

export function CommentsPreviewHost({content, children}: {readonly content: HbarAppUiCommentsContent; readonly children: ReactNode}) {
  const [sortId, setSortId] = useState(content.referenceDiscussion?.sortId ?? '')
  const [draft, setDraft] = useState(content.referenceDiscussion?.draft ?? '')
  const [messages, setMessages] = useState(content.referenceDiscussion?.messages ?? [])
  const [activeAnnotationId, setActiveAnnotationId] = useState(content.referenceAnnotation?.activeId ?? '')
  const [annotations, setAnnotations] = useState(content.referenceAnnotation?.annotations ?? [])
  const [reviewResolved, setReviewResolved] = useState(content.referenceReview?.resolved ?? false)
  const [reviewDraft, setReviewDraft] = useState(content.referenceReview?.draft ?? '')
  const [composerDraft, setComposerDraft] = useState(content.referenceComposer?.draft ?? '')
  const [attachments, setAttachments] = useState(content.referenceComposer?.attachments ?? [])
  const [inboxFilterId, setInboxFilterId] = useState(content.referenceInbox?.filterId ?? '')
  const [inboxItems, setInboxItems] = useState(content.referenceInbox?.items ?? [])
  const [canvasPins, setCanvasPins] = useState(content.referenceCanvas?.pins ?? [])
  const [canvasId, setCanvasId] = useState(content.referenceCanvas?.activeId ?? '')
  const [canvasDraft, setCanvasDraft] = useState(content.referenceCanvas?.draft ?? '')
  useEffect(() => {
    setSortId(content.referenceDiscussion?.sortId ?? '')
    setDraft(content.referenceDiscussion?.draft ?? '')
    setMessages(content.referenceDiscussion?.messages ?? [])
    setActiveAnnotationId(content.referenceAnnotation?.activeId ?? '')
    setAnnotations(content.referenceAnnotation?.annotations ?? [])
    setReviewResolved(content.referenceReview?.resolved ?? false)
    setReviewDraft(content.referenceReview?.draft ?? '')
    setComposerDraft(content.referenceComposer?.draft ?? '')
    setAttachments(content.referenceComposer?.attachments ?? [])
    setInboxFilterId(content.referenceInbox?.filterId ?? '')
    setInboxItems(content.referenceInbox?.items ?? [])
    setCanvasPins(content.referenceCanvas?.pins ?? [])
    setCanvasId(content.referenceCanvas?.activeId ?? '')
    setCanvasDraft(content.referenceCanvas?.draft ?? '')
  }, [content])
  return <HbarAppUiCommentsProvider content={{
    ...content,
    referenceCanvas: content.referenceCanvas && {
      ...content.referenceCanvas, pins: canvasPins, activeId: canvasId, draft: canvasDraft,
      onSelectionChange: setCanvasId, onDraftChange: setCanvasDraft,
      onResolvedChange: (id, resolved) => setCanvasPins((current) => current.map((pin) => pin.id === id ? {...pin, resolved} : pin)),
    },
    referenceInbox: content.referenceInbox && {
      ...content.referenceInbox, filterId: inboxFilterId, items: inboxItems,
      onFilterChange: setInboxFilterId,
      onResolvedChange: (id, resolved) => setInboxItems((current) => current.map((item) => item.id === id ? {...item, resolved} : item)),
    },
    referenceComposer: content.referenceComposer && {
      ...content.referenceComposer, draft: composerDraft, attachments,
      suggestions: filterHbarAppUiCommentsComposerMentions(composerDraft, content.referenceComposer.suggestions),
      onDraftChange: setComposerDraft,
      onAttachmentRemove: (id) => setAttachments((current) => current.filter((attachment) => attachment.id !== id)),
      onMentionSelect: (id) => {
        const person = content.referenceComposer?.suggestions.find((item) => item.id === id)
        if (person) setComposerDraft((current) => insertHbarAppUiCommentsComposerMention(current, person.handle))
      },
    },
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
