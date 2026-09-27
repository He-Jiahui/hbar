import type { HbarAppUiCommentsContent } from '../../packages/hbar-app-ui/src/index'
const grown = { kind: 'content-grown', expectedMaximum: 8 } as const
const scroll = { kind: 'pane-scroll', expectedMaximum: 40 } as const
export const HBAR_APP_UI_COMMENTS_FIXTURES: HbarAppUiCommentsContent = {
  referenceDiscussion: {
    labels: {
      title: 'Migration plan feedback',
      detail: '5 comments · 4 participants',
      sortLabel: 'Sort comments',
      replyPlaceholder: 'Write a comment',
      helper: 'Mention a teammate with @ to notify them.',
      comment: 'Comment',
      reply: 'Reply',
      moreActions: (author) => `More actions on ${author}'s comment`,
    },
    sortOptions: [
      { id: 'new', label: 'Newest', direction: 'newest' },
      { id: 'old', label: 'Oldest', direction: 'oldest' },
    ],
    sortId: 'old',
    draft: '',
    messages: [
      {
        id: 'priya',
        initials: 'PN',
        author: 'Priya Nandakumar',
        role: 'Platform',
        body: 'The cutover window is tight. If we hold the read replica until the backfill drains we lose the rollback path, so I would rather split this into two deploys.',
        meta: '2h ago',
        reactionCount: 5,
        reacted: true,
        replies: [
          { id: 'marcus', initials: 'MB', author: 'Marcus Bell', body: 'Agreed. Two deploys also means the schema change lands on a quiet day instead of during the migration itself.', meta: '1h ago' },
          { id: 'sofia', initials: 'SA', author: 'Sofia Alvarez', body: 'I can prepare the second deploy behind a flag so we can flip it without another release.', meta: '48m ago' },
        ],
      },
      {
        id: 'wei', initials: 'WC', author: 'Wei Chen', role: 'Data', meta: '36m ago',
        body: 'One caveat: the backfill job reads from the same connection pool as the API. We should cap it at eight workers or the request latency will spike during business hours.',
        reactionCount: 2,
      },
      {
        id: 'tomas', initials: 'TG', author: 'Tomás Guerrero', role: 'Reliability', meta: '12m ago',
        body: 'Added a dashboard for pool saturation so we can watch it live. Alert fires at 80 percent for five minutes.',
        reactionCount: 1,
      },
    ],
    listStrategy: scroll,
  },
  annotation: {
    labels: {
      title: 'Document annotation',
      detail: 'Select a highlighted range',
      reply: 'Reply',
      empty: 'No annotations',
    },
    annotations: [
      {
        id: 'local',
        before: 'Keep ',
        text: 'this state local',
        after: ' to the session.',
        initials: 'A',
        author: 'Avery',
        comment: 'Annotation linked to the selected range.',
      },
      {
        id: 'failure',
        before: 'When the operation fails, ',
        text: 'explain why',
        after: '.',
        initials: 'M',
        author: 'Mina',
        comment: 'Offer a recovery path.',
      },
    ],
    initialAnnotationId: 'local',
    listStrategy: grown,
  },
  review: {
    labels: {
      title: 'Code review',
      detail: 'Suggested change',
      status: '2 notes',
      suggestion: 'Suggestion',
      accept: 'Accept',
      dismiss: 'Dismiss',
    },
    lines: [
      { id: 'one', value: '  const status = getStatus(run)', tone: 'neutral' },
      { id: 'two', value: '- return status', tone: 'removed' },
      { id: 'three', value: '+ return formatStatus(status)', tone: 'added' },
    ],
    suggestion: 'Use the shared formatter.',
  },
  composer: {
    labels: {
      title: 'Comment composer',
      detail: 'Mentions, attachments and formatting',
      bold: 'Bold',
      boldMark: 'B',
      italic: 'Italic',
      italicMark: 'I',
      mention: 'Mention',
      mentionMark: '@',
      attach: 'Attach',
      attachMark: '+',
      placeholder: 'Write a comment…',
      markdown: 'Markdown supported',
      comment: 'Comment',
    },
    mentions: [
      { id: 'avery', label: 'Avery Chen' },
      { id: 'mina', label: 'Mina Patel' },
    ],
    listStrategy: grown,
  },
  inbox: {
    labels: {
      title: 'Comment inbox',
      detail: 'Resolve from the list',
      filterLabel: 'Comment filter',
      resolve: 'Resolve',
      resolved: 'Resolved',
      empty: 'No comments',
    },
    filters: [
      { id: 'all', label: 'All' },
      { id: 'open', label: 'Unresolved' },
      { id: 'mentions', label: 'Mentions' },
    ],
    initialFilterId: 'all',
    items: [
      { id: 'contract', title: 'Review API contract', meta: '2m ago · Avery', status: 'Unresolved', resolved: false },
      { id: 'mention', title: 'Mentioned you in activity', meta: '3m ago · @you', status: 'Resolved', resolved: true },
    ],
    listStrategy: scroll,
  },
  canvas: {
    labels: {
      canvas: 'Workspace canvas',
      comments: 'Comments',
      selected: (label) => `${label} selected`,
      reply: 'Reply',
      empty: 'No pins',
    },
    pins: [
      {
        id: 'one',
        label: '1',
        x: 32,
        y: 39,
        initials: 'A',
        title: 'Comment on pin 1',
        body: 'Keep this region aligned.',
      },
      {
        id: 'two',
        label: '2',
        x: 58,
        y: 54,
        initials: 'M',
        title: 'Comment on pin 2',
        body: 'Show the state beside the action.',
      },
    ],
    initialPinId: 'one',
    listStrategy: grown,
  },
}
export function createHbarAppUiCommentsLocalizedFixtures(): HbarAppUiCommentsContent {
  return {
    ...HBAR_APP_UI_COMMENTS_FIXTURES,
    referenceDiscussion: {
      ...HBAR_APP_UI_COMMENTS_FIXTURES.referenceDiscussion!,
      labels: {
        ...HBAR_APP_UI_COMMENTS_FIXTURES.referenceDiscussion!.labels,
        title: '讨论线程',
        detail: '回复、回应与解决',
        sortLabel: '评论排序',
        replyPlaceholder: '回复此线程',
        helper: '使用 @ 提及队友并通知他们。',
        comment: '评论',
        reply: '回复',
        moreActions: (author) => `对${author}的评论执行更多操作`,
      },
    },
  }
}
export function createHbarAppUiCommentsOverflowFixtures(): HbarAppUiCommentsContent {
  const discussion = HBAR_APP_UI_COMMENTS_FIXTURES.referenceDiscussion!
  return {
    ...HBAR_APP_UI_COMMENTS_FIXTURES,
    referenceDiscussion: {
      ...discussion,
      messages: Array.from({length: 45}, (_, index) => ({
        id: `extended-${index}`, initials: `${index + 1}`, author: `Additional participant ${index + 1}`,
        role: 'Regional migration and reliability team', meta: 'just now',
        body: `Long migration review ${index + 1}: ${'Keep the rollback path and verify the service capacity. '.repeat(4)}`,
        reactionCount: 0,
      })),
    },
  }
}
