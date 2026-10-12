import type { LumenAiChatCitationsReferenceContent, LumenAiChatReferenceMessage } from '@lumen/app-ui/catalog'

export function createAiChat7ReferenceFixture(locale: 'en' | 'zh' = 'en'): LumenAiChatCitationsReferenceContent {
  const chinese = locale === 'zh'
  const sources: readonly (readonly [string, string, string])[] = chinese
    ? [
        ['q3-board-deck', 'Q3-board-deck.pdf', 'PDF · 24 页'],
        ['revenue-model', 'revenue-model.xlsx', '电子表格 · 10 月 2 日更新'],
        ['churn-analysis', 'churn-analysis.md', '笔记 · 1,200 字'],
        ['renewals-export', 'renewals-export.csv', '数据 · 8,400 行'],
        ['qbr-notes', 'qbr-notes.md', '笔记 · 640 字'],
        ['pricing-change-brief', 'pricing-change-brief.pdf', 'PDF · 6 页'],
        ['support-tickets', 'support-tickets.csv', '数据 · 2,100 行'],
        ['win-back-playbook', 'win-back-playbook.md', '笔记 · 900 字'],
        ['exec-summary', 'exec-summary.docx', '文档 · 3 页'],
        ['segment-cohorts', 'segment-cohorts.xlsx', '电子表格 · 14 个标签页'],
      ]
    : [
        ['q3-board-deck', 'q3-board-deck.pdf', 'PDF · 24 pages'],
        ['revenue-model', 'revenue-model.xlsx', 'Spreadsheet · updated Oct 2'],
        ['churn-analysis', 'churn-analysis.md', 'Note · 1,200 words'],
        ['renewals-export', 'renewals-export.csv', 'Data · 8,400 rows'],
        ['qbr-notes', 'qbr-notes.md', 'Note · 640 words'],
        ['pricing-change-brief', 'pricing-change-brief.pdf', 'PDF · 6 pages'],
        ['support-tickets', 'support-tickets.csv', 'Data · 2,100 rows'],
        ['win-back-playbook', 'win-back-playbook.md', 'Note · 900 words'],
        ['exec-summary', 'exec-summary.docx', 'Doc · 3 pages'],
        ['segment-cohorts', 'segment-cohorts.xlsx', 'Spreadsheet · 14 tabs'],
      ]
  const messages: readonly LumenAiChatReferenceMessage[] = chinese
    ? [
        {
          id: 'q3-question',
          side: 'user',
          parts: [{ kind: 'text', text: '总结一下第三季度净收入留存率下降的原因。' }],
        },
        {
          id: 'q3-summary',
          side: 'assistant',
          parts: [
            { kind: 'text', text: '第三季度净收入留存率从上一季度的 111% 降至 104%。' },
            { kind: 'citation', sourceId: 'q3-board-deck', label: '1' },
            { kind: 'text', text: '下降主要集中在中端市场，两家大型客户在组织调整后降低了套餐。' },
            { kind: 'citation', sourceId: 'revenue-model', label: '2' },
            { kind: 'text', text: '企业客户的扩展表现稳定，但价格调整后新增升级放缓。' },
            { kind: 'citation', sourceId: 'churn-analysis', label: '3' },
          ],
        },
        { id: 'q3-lever-question', side: 'user', parts: [{ kind: 'text', text: '什么措施最能快速恢复留存率？' }] },
        {
          id: 'q3-lever-answer',
          side: 'assistant',
          parts: [
            {
              kind: 'text',
              text: '最快的办法是重新联系两家降低套餐的中端市场客户，它们合计占流失的七个百分点中的四个百分点。',
            },
            { kind: 'citation', sourceId: 'revenue-model', label: '2' },
            {
              kind: 'text',
              text: '在续约前提供有针对性的挽回方案可以解决大部分缺口；同时应重新审视新套餐，改善升级放缓的问题。',
            },
            { kind: 'citation', sourceId: 'churn-analysis', label: '3' },
          ],
        },
        { id: 'q3-segment-question', side: 'user', parts: [{ kind: 'text', text: '哪个客户群表现最好？' }] },
        {
          id: 'q3-segment-answer',
          side: 'assistant',
          parts: [
            {
              kind: 'text',
              text: '企业客户表现最好：该群体的扩展收入基本持平，因此拖累主要来自中端市场，而非普遍下降。',
            },
            { kind: 'citation', sourceId: 'churn-analysis', label: '3' },
            { kind: 'text', text: '企业客户的毛收入留存率实际略有改善，因此净收入留存率没有进一步下降。' },
            { kind: 'citation', sourceId: 'renewals-export', label: '4' },
          ],
        },
        { id: 'q3-board-question', side: 'user', parts: [{ kind: 'text', text: '给董事会拟一句话总结。' }] },
        {
          id: 'q3-board-answer',
          side: 'assistant',
          parts: [
            { kind: 'text', text: '第三季度净收入留存率降至 104%，主要受两家中端市场客户降低套餐影响。' },
            { kind: 'citation', sourceId: 'q3-board-deck', label: '1' },
            { kind: 'text', text: '在续约前采取挽回措施有望弥补大部分缺口。' },
            { kind: 'citation', sourceId: 'revenue-model', label: '2' },
          ],
        },
      ]
    : [
        {
          id: 'q3-question',
          side: 'user',
          parts: [{ kind: 'text', text: 'Summarize why net revenue retention dropped in Q3.' }],
        },
        {
          id: 'q3-summary',
          side: 'assistant',
          parts: [
            { kind: 'text', text: 'Net revenue retention fell to 104% from 111% the prior quarter.' },
            { kind: 'citation', sourceId: 'q3-board-deck', label: '1' },
            {
              kind: 'text',
              text: 'The decline is concentrated in the mid-market segment, where two large accounts downgraded after a reorganization.',
            },
            { kind: 'citation', sourceId: 'revenue-model', label: '2' },
            { kind: 'text', text: 'Expansion held up in enterprise, but new upsells slowed after the pricing change.' },
            { kind: 'citation', sourceId: 'churn-analysis', label: '3' },
          ],
        },
        { id: 'q3-lever-question', side: 'user', parts: [{ kind: 'text', text: 'What would recover it fastest?' }] },
        {
          id: 'q3-lever-answer',
          side: 'assistant',
          parts: [
            {
              kind: 'text',
              text: 'The quickest lever is re-engaging the two downgraded mid-market accounts, which together account for four of the seven points lost.',
            },
            { kind: 'citation', sourceId: 'revenue-model', label: '2' },
            {
              kind: 'text',
              text: 'A targeted win-back offer before renewal would address most of the gap, and reversing the upsell slowdown means revisiting the new tiers.',
            },
            { kind: 'citation', sourceId: 'churn-analysis', label: '3' },
          ],
        },
        { id: 'q3-segment-question', side: 'user', parts: [{ kind: 'text', text: 'Which segment held up best?' }] },
        {
          id: 'q3-segment-answer',
          side: 'assistant',
          parts: [
            {
              kind: 'text',
              text: 'Enterprise held up best: expansion there was roughly flat, so almost all of the drag is coming from mid-market rather than a broad-based decline.',
            },
            { kind: 'citation', sourceId: 'churn-analysis', label: '3' },
            {
              kind: 'text',
              text: "Gross retention in enterprise actually improved slightly, which is why the net number didn't fall further.",
            },
            { kind: 'citation', sourceId: 'renewals-export', label: '4' },
          ],
        },
        {
          id: 'q3-board-question',
          side: 'user',
          parts: [{ kind: 'text', text: 'Draft a one-line summary for the board.' }],
        },
        {
          id: 'q3-board-answer',
          side: 'assistant',
          parts: [
            { kind: 'text', text: 'Net revenue retention slipped to 104% in Q3 after two mid-market downgrades.' },
            { kind: 'citation', sourceId: 'q3-board-deck', label: '1' },
            { kind: 'text', text: 'A renewal-timed win-back should recover most of the gap.' },
            { kind: 'citation', sourceId: 'revenue-model', label: '2' },
          ],
        },
      ]

  return {
    variant: 7,
    ownerId: 'ai-chat-7-reference',
    title: chinese ? 'Q3 留存率复盘' : 'Q3 retention review',
    subtitle: chinese ? '6 个来源 · 已引用' : '6 sources · cited',
    sourcesTitle: chinese ? '固定来源' : 'Pinned sources',
    sources: sources.map(([id, label, detail], index) => ({ id, label, detail, badge: String(index + 1) })),
    selectedSourceId: null,
    messages,
    composer: {
      draft: '',
      attachments: [],
      labels: {
        input: chinese ? '消息' : 'Message',
        placeholder: chinese ? '向助手提问' : 'Ask a follow-up',
        send: chinese ? '发送消息' : 'Send message',
        attach: chinese ? '附加文件' : 'Attach file',
        remove: (name) => (chinese ? `移除 ${name}` : `Remove ${name}`),
      },
    },
    listStrategy: { kind: 'pane-scroll', expectedMaximum: 120 },
    labels: {
      empty: chinese ? '暂无消息' : 'No messages',
      regenerate: chinese ? '重新生成' : 'Regenerate',
      copy: chinese ? '复制' : 'Copy',
      openArtifact: chinese ? '打开文件' : 'Open file',
      sources: chinese ? '来源' : 'Sources',
    },
  }
}
