import type { LumenAiChatThreadReferenceContent } from '@lumen/app-ui/catalog'

/** Test/preview data transcribed from authorized rendered reference evidence, not component source. */
export function createAiChat1ReferenceFixture(locale: 'en' | 'zh' = 'en'): LumenAiChatThreadReferenceContent {
  const zh = locale === 'zh'
  return {
    variant: 1,
    ownerId: 'refund-review',
    title: zh ? '收入分析助手' : 'Revenue assistant',
    subtitle: 'Atlas',
    listStrategy: { kind: 'pane-scroll', expectedMaximum: 80 },
    labels: {
      empty: zh ? '暂无消息' : 'No messages',
      regenerate: zh ? '重新生成' : 'Regenerate',
      copy: zh ? '复制回复' : 'Copy reply',
      openArtifact: zh ? '在面板中打开' : 'Open in panel',
      sources: zh ? '来源' : 'Sources',
    },
    messages: [
      {
        id: 'refund-question',
        side: 'user',
        parts: [{ kind: 'text', text: zh ? '为什么上周退款增加了？' : 'Why did refunds spike last week?' }],
      },
      {
        id: 'refund-summary',
        side: 'assistant',
        disclosures: [
          {
            id: 'refund-thought',
            label: zh ? '思考了 4 秒' : 'Thought for 4s',
            body: zh
              ? '上周退款总额的变化与两个因素有关：12 日发布的定价调整，以及一批续费失败后的自动退款。我先核对了这两项。'
              : 'The refund total moved with two things last week: a pricing change that shipped on the 12th, and a batch of failed renewals that were auto-refunded. I checked both before answering.',
          },
          {
            id: 'refund-search',
            label: zh ? '检索了 1,284 笔退款' : 'Searched 1,284 refunds',
            status: zh ? '完成 · 1.2 秒' : 'Done · 1.2s',
            body: zh
              ? '本地预览摘要：按账单事件和 12 日定价调整归类的退款记录。'
              : 'Local preview summary: refund records grouped by billing events and the June 12 pricing change.',
          },
        ],
        parts: [
          {
            kind: 'text',
            text: zh
              ? '退款增加了 38%，从 $6,730 升至 $9,290。主要来自 12 日缩短重试窗口后续费失败的退款；服务额度退款持平，重复账单只有个位数。'
              : 'Refunds were up 38% last week, from $6,730 to $9,290. Most of that came from failed renewals after the retry window was shortened on the 12th. Credits stayed flat, and duplicate charges were in the single digits.',
          },
        ],
        sourceTags: zh ? ['账单事件', '定价调整 · 6 月 12 日'] : ['Billing events', 'Pricing change · Jun 12'],
      },
      {
        id: 'tier-question',
        side: 'user',
        parts: [{ kind: 'text', text: zh ? '按套餐层级细分。' : 'Break it down by plan tier.' }],
      },
      {
        id: 'tier-summary',
        side: 'assistant',
        regenerate: true,
        copy: true,
        parts: [
          {
            kind: 'text',
            text: zh
              ? 'Growth 占 $5,180，Scale 占 $3,240，Starter 不到 $900。大部分集中在 12 日续费的 Growth 年付套餐；把重试延后一天应该能避免这部分退款。'
              : 'Growth accounts for $5,180, Scale for $3,240, and Starter for under $900. Most of the increase is clustered in Growth annual renewals on the 12th. Retrying a day later should prevent that batch.',
          },
        ],
      },
    ],
    composer: {
      draft: '',
      attachments: [{ id: 'refund-csv', label: 'refunds-week-24.csv' }],
      labels: {
        input: zh ? '提问内容' : 'Ask anything',
        placeholder: zh ? '输入问题…' : 'Ask anything…',
        send: zh ? '发送' : 'Send',
        attach: zh ? '添加附件' : 'Add attachment',
        remove: (name) => (zh ? `移除 ${name}` : `Remove ${name}`),
      },
    },
  }
}
