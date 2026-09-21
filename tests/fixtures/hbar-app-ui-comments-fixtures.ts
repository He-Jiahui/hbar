import type { HbarAppUiCommentsContent } from '../../packages/hbar-app-ui/src/index'
const grown = { kind: 'content-grown', expectedMaximum: 8 } as const
const scroll = { kind: 'pane-scroll', expectedMaximum: 40 } as const
export const HBAR_APP_UI_COMMENTS_FIXTURES: HbarAppUiCommentsContent = {
  discussion: {
    labels: {
      title: 'Threaded discussion',
      detail: 'Replies, reactions and resolve',
      sortLabel: 'Sort comments',
      resolve: 'Resolve',
      resolved: 'Resolved',
      replyPlaceholder: 'Reply to this thread',
    },
    sortOptions: [
      { id: 'new', label: 'Newest' },
      { id: 'old', label: 'Oldest' },
    ],
    initialSortId: 'new',
    initiallyResolved: false,
    messages: [
      {
        id: 'a',
        initials: 'A',
        author: 'Avery',
        body: 'Can we keep this state local to the session?',
        meta: '5m ago',
        reaction: 'Like',
        reactionCount: 2,
        replies: [
          { id: 'm', initials: 'M', author: 'Mina', body: 'The feedback is beside the row now.', meta: '2m ago' },
        ],
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
      italic: 'Italic',
      mention: 'Mention',
      attach: 'Attach',
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
    discussion: {
      ...HBAR_APP_UI_COMMENTS_FIXTURES.discussion!,
      labels: {
        ...HBAR_APP_UI_COMMENTS_FIXTURES.discussion!.labels,
        title: '讨论线程',
        detail: '回复、回应与解决',
        sortLabel: '评论排序',
        resolve: '解决',
        resolved: '已解决',
        replyPlaceholder: '回复此线程',
      },
    },
  }
}
