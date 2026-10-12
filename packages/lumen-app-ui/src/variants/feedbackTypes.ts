export interface FeedbackBaseCopy {
  title: string
  detail: string
  empty: string
}

export interface FeedbackSubmission {
  status: 'idle' | 'submitting' | 'sent' | 'failed'
  error: string | null
}

export interface FeedbackActionCopy {
  submit: string
  submitting: string
  sent: string
  retry: string
  reset: string
}

export interface FeedbackOption {
  id: string
  label: string
}

export interface FeedbackFieldState {
  text: string
  selectedId: string | null
  submission: FeedbackSubmission
}

export interface HbarAppUiFeedback01Props {
  copy: FeedbackBaseCopy &
    FeedbackActionCopy & {
      typeLabel: string
      messageLabel: string
      messagePlaceholder?: string | undefined
      attachment: string
      close: string
    }
  content: { id: string; types: readonly FeedbackOption[]; attachmentName: string | null }
  state: FeedbackFieldState
  actions: {
    onTypeChange: (formId: string, typeId: string) => void
    onTextChange: (formId: string, text: string) => void
    onAttach: (formId: string, file: File) => void
    onSubmit: (formId: string, typeId: string, text: string) => void
    onClose: (formId: string) => void
    onReset: (formId: string) => void
  }
}

export interface HbarAppUiFeedback02Props {
  copy: FeedbackBaseCopy &
    FeedbackActionCopy & {
      scale: string
      low: string
      high: string
      reasons: string
      comment: string
      later: string
      scoreLabel: (score: number) => string
    }
  content: { id: string; scores: readonly number[]; reasons: readonly FeedbackOption[] }
  state: {
    score: number | null
    reasonIds: readonly string[]
    comment: string
    submission: FeedbackSubmission
  }
  actions: {
    onScoreChange: (surveyId: string, score: number) => void
    onReasonToggle: (surveyId: string, reasonId: string) => void
    onCommentChange: (surveyId: string, comment: string) => void
    onSubmit: (surveyId: string, score: number, reasonIds: readonly string[], comment: string) => void
    onLater: (surveyId: string) => void
    onReset: (surveyId: string) => void
  }
}

export interface HbarAppUiFeedback03Props {
  copy: FeedbackBaseCopy &
    FeedbackActionCopy & {
      rating: string
      reasons: string
      comment: string
      skip: string
    }
  content: {
    id: string
    ticket: string
    ratings: readonly { value: number; label: string }[]
    reasons: readonly FeedbackOption[]
  }
  state: {
    rating: number | null
    reasonId: string | null
    comment: string
    submission: FeedbackSubmission
  }
  actions: {
    onRatingChange: (ticketId: string, rating: number) => void
    onReasonChange: (ticketId: string, reasonId: string) => void
    onCommentChange: (ticketId: string, comment: string) => void
    onSubmit: (ticketId: string, rating: number, reasonId: string | null, comment: string) => void
    onSkip: (ticketId: string) => void
    onReset: (ticketId: string) => void
  }
}

export interface FeedbackRequest {
  id: string
  title: string
  description: string
  status: string
  tone: 'neutral' | 'info' | 'success' | 'warning'
  category: string
  votes: number
  comments: number
  voted: boolean
}

export interface HbarAppUiFeedback04Props {
  copy: FeedbackBaseCopy & {
    newRequest: string
    sort: string
    search: string
    vote: (title: string) => string
    removeVote: (title: string) => string
    comments: (count: number) => string
  }
  content: {
    boardId: string
    sortOptions: readonly FeedbackOption[]
    requests: readonly FeedbackRequest[]
  }
  state: { sortId: string; query: string; busyIds: readonly string[] }
  actions: {
    onSortChange: (boardId: string, sortId: string) => void
    onQueryChange: (boardId: string, query: string) => void
    onVote: (boardId: string, requestId: string) => void
    onNewRequest: (boardId: string) => void
  }
}

export interface FeedbackThread {
  id: string
  sender: string
  subject: string
  metadata: string
  unread: boolean
  body: string
  sentiment: string
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger'
  tags: readonly FeedbackOption[]
}

export interface HbarAppUiFeedback05Props {
  copy: FeedbackBaseCopy & {
    threads: string
    detailLabel: string
    note: string
    addTag: string
    reply: string
    archive: string
    archiving: string
  }
  content: { inboxId: string; threads: readonly FeedbackThread[] }
  state: { selectedId: string | null; note: string; busyId: string | null; error: string | null }
  actions: {
    onSelect: (inboxId: string, threadId: string) => void
    onNoteChange: (threadId: string, note: string) => void
    onAddTag: (threadId: string) => void
    onReply: (threadId: string, note: string) => void
    onArchive: (threadId: string) => void
  }
}

export interface FeedbackMetric {
  id: string
  label: string
  value: string
  detail: string
}

export interface FeedbackInsightRow {
  id: string
  label: string
  value: string
  percent: number
}

export interface HbarAppUiFeedback06Props {
  copy: FeedbackBaseCopy & {
    period: string
    sentiment: string
    themes: string
    volume: string
    retry: string
  }
  content: {
    reportId: string
    periods: readonly FeedbackOption[]
    metrics: readonly FeedbackMetric[]
    sentiment: readonly FeedbackInsightRow[]
    themes: readonly FeedbackInsightRow[]
    volume: readonly FeedbackInsightRow[]
  }
  state: { periodId: string; loading: boolean; error: string | null }
  actions: {
    onPeriodChange: (reportId: string, periodId: string) => void
    onRetry: (reportId: string) => void
  }
}
