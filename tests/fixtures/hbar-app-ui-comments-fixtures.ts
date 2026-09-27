import type { HbarAppUiCommentsContent } from '../../packages/hbar-app-ui/src/index'
const grown = { kind: 'content-grown', expectedMaximum: 8 } as const
const scroll = { kind: 'pane-scroll', expectedMaximum: 40 } as const
export const HBAR_APP_UI_COMMENTS_FIXTURES: HbarAppUiCommentsContent = {
  referenceReview: {
    labels: {
      title: 'Cap backfill concurrency', detail: 'packages/data/src/query.ts · 2 comments',
      resolve: 'Resolve thread', resolved: 'Resolved', replyPlaceholder: 'Reply to this thread', reply: 'Reply',
      suggestedChange: 'Suggested change', emptyCode: 'No code changes', emptyComments: 'No review comments',
    },
    lines: [
      {id: '82', number: '82', marker: '', value: '  const pool = await getPool(region);', tone: 'neutral'},
      {id: '83', number: '83', marker: '', value: ' ', tone: 'neutral'},
      {id: '84', number: '84', marker: '-', value: '  const rows = await pool.query(sql);', tone: 'removed'},
      {id: '85', number: '85', marker: '+', value: '  const rows = await pool.query(sql, {', tone: 'added'},
      {id: '86', number: '86', marker: '+', value: '    timeout: 30_000,', tone: 'added'},
      {id: '87', number: '87', marker: '+', value: '    maxWorkers: 8,', tone: 'added'},
      {id: '88', number: '88', marker: '+', value: '  });', tone: 'added'},
      {id: '89', number: '89', marker: '', value: ' ', tone: 'neutral'},
      {id: '90', number: '90', marker: '', value: '  return rows.map(toRecord);', tone: 'neutral'},
    ],
    messages: [
      {id: 'wei', initials: 'WC', author: 'Wei Chen', meta: '4h ago', body: 'Hard-coding eight workers here will bite us when the pool size changes. Read it from the pool config so the two never drift apart.', suggestion: 'maxWorkers: pool.size / 2,'},
      {id: 'priya', initials: 'PN', author: 'Priya Nandakumar', meta: '2h ago', body: 'Good catch. I also want the timeout to come from the same place, otherwise a slow region silently inherits the default.'},
    ],
    codeStrategy: {kind: 'content-grown', expectedMaximum: 9},
    messageStrategy: {kind: 'content-grown', expectedMaximum: 2},
    resolved: false,
    draft: '',
  },
  referenceAnnotation: {
    labels: {
      title: 'Service commitment draft',
      summary: (open, total) => `${open} open comment${open === 1 ? '' : 's'} · ${total} total`,
      comments: 'Comments',
      resolve: 'Resolve',
      resolved: 'Resolved',
      showInText: 'Show in text',
      showComment: (text) => `Show comment on "${text}"`,
      review: 'Review',
      reviewSummary: (open) => `${open} open comment${open === 1 ? '' : 's'} on this draft`,
      empty: 'No comments',
    },
    segments: [
      {id: 'intro', text: 'Northwind commits to keeping the platform available and responsive for every customer on a paid plan. This document sets out what we measure, how we report it, and what happens when we fall short.'},
      {id: 'uptime-range', commentId: 'uptime', text: 'We target 99.9 percent uptime'},
      {id: 'maintenance', text: ' measured monthly across the API, the dashboard, and the webhook delivery pipeline. Scheduled maintenance is announced at least five business days in advance and does not count against the target.'},
      {id: 'support-range', commentId: 'support', text: 'Support requests raised through the console are acknowledged within one hour and resolved within four hours'},
      {id: 'hours', text: ' during business hours. Outside those hours an on-call engineer is paged for anything that blocks production traffic.'},
      {id: 'regions-range', commentId: 'regions', text: 'The guarantee applies in every supported region'},
      {id: 'remainder', text: ", and credits are issued automatically against the following invoice when a monthly target is missed. Credits are capped at thirty percent of the monthly fee and are applied without the customer having to ask for them. A customer who believes a target was missed can open a claim for up to sixty days after the affected month closes. We publish a monthly report on the status page with the measured figures, a short note on any incident that consumed error budget, and the remediation work that followed it. Support is staffed between 08:00 and 20:00 in the customer's primary region, Monday through Friday, excluding public holidays observed at the registered billing address. Enterprise plans add weekend coverage for anything classified as severity one. Either party may propose changes to this document. Changes take effect at the start of the following billing period, and customers are notified at least thirty days before an existing commitment is reduced."},
    ],
    annotations: [
      {id: 'support', initials: 'SA', author: 'Sofia Alvarez', meta: '3h ago', quote: 'resolved within four hours', body: 'This promise is stronger than what the contract actually covers. Legal asked us to say response time, not resolution time.', resolved: false},
      {id: 'regions', initials: 'MB', author: 'Marcus Bell', meta: '2h ago', quote: 'every supported region', body: 'Can we name the regions here? Customers on the Frankfurt cluster keep asking whether the guarantee applies to them.', resolved: false},
      {id: 'uptime', initials: 'PN', author: 'Priya Nandakumar', meta: '1h ago', quote: '99.9 percent uptime', body: 'Fixed the figure and linked the status page in the footer.', resolved: true},
    ],
    activeId: 'support',
    listStrategy: {kind: 'content-grown', expectedMaximum: 3},
  },
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
    referenceReview: {
      ...HBAR_APP_UI_COMMENTS_FIXTURES.referenceReview!,
      labels: {
        title: '限制回填任务并发并统一读取连接池配置', detail: '数据访问模块 · 两条审查评论',
        resolve: '解决线程', resolved: '已解决', replyPlaceholder: '回复这条审查线程', reply: '回复',
        suggestedChange: '建议的更改', emptyCode: '没有代码更改', emptyComments: '没有审查评论',
      },
    },
    referenceAnnotation: {
      ...HBAR_APP_UI_COMMENTS_FIXTURES.referenceAnnotation!,
      labels: {
        title: '服务承诺草稿与区域覆盖范围审查',
        summary: (open, total) => `${open} 条未解决批注，共 ${total} 条`,
        comments: '文档批注', resolve: '解决', resolved: '已解决', showInText: '在文档中显示',
        showComment: (text) => `显示“${text}”的批注`,
        review: '审查', reviewSummary: (open) => `这份草稿有 ${open} 条未解决批注`, empty: '没有批注',
      },
    },
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
    referenceReview: {
      ...HBAR_APP_UI_COMMENTS_FIXTURES.referenceReview!,
      lines: Array.from({length: 10}, (_, index) => ({id: `extra-${index}`, number: String(index + 1), marker: '+', value: `  await queueRegionalBackfillWithCapacity(${index});`, tone: 'added' as const})),
      messages: Array.from({length: 3}, (_, index) => ({id: `extra-${index}`, initials: String(index + 1), author: `Additional reviewer ${index + 1}`, meta: 'just now', body: 'The capacity and timeout must be independently reviewable for this regional change. '.repeat(4), suggestion: 'const capacity = regionalPool.capacity;'})),
      codeStrategy: {kind: 'pane-scroll', expectedMaximum: 9},
      messageStrategy: {kind: 'pane-scroll', expectedMaximum: 2},
    },
    referenceAnnotation: {
      ...HBAR_APP_UI_COMMENTS_FIXTURES.referenceAnnotation!,
      annotations: Array.from({length: 4}, (_, index) => ({
        id: `extra-${index}`, initials: `${index + 1}`, author: `Regional reviewer ${index + 1}`, meta: 'just now',
        quote: 'A longer clause that needs to retain its complete accessible description',
        body: 'This longer review must remain reachable without overlapping neighboring content. '.repeat(3),
        resolved: false,
      })),
      activeId: 'missing',
      listStrategy: {kind: 'pane-scroll', expectedMaximum: 3},
    },
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
