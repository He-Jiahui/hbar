import type { ShellLocale } from './shell-copy'
import type { HbarUsageFeaturesLabels } from '@hbar/app-react'

const text = (locale: ShellLocale, zh: string, en: string) => (locale === 'zh-CN' ? zh : en)

export function usageFeatureCopy(locale: ShellLocale): HbarUsageFeaturesLabels {
  const zh = locale === 'zh-CN'
  return {
    requests: {
      title: text(locale, '请求记录', 'Requests'), description: text(locale, 'Host 记录的请求与成本。', 'Host-recorded requests and costs.'), request: text(locale, '请求', 'Request'), timeLabel: text(locale, '时间', 'Time'), filterOptions: [{ id: 'all', label: text(locale, '全部', 'All') }, { id: 'model', label: text(locale, '模型', 'Model') }, { id: 'compaction', label: text(locale, '压缩', 'Compaction') }], model: text(locale, '模型', 'Model'), tokens: text(locale, '令牌', 'Tokens'), latency: text(locale, '延迟', 'Latency'), cost: text(locale, '费用', 'Cost'), empty: text(locale, '暂无请求记录。', 'No requests in this window.'), open: text(locale, '打开请求', 'Open request'), previous: text(locale, '上一页', 'Previous'), next: text(locale, '下一页', 'Next'), page: (from, to, total) => zh ? `${from}-${to} / ${total}` : `${from}-${to} of ${total}`, time: (value) => new Date(value).toLocaleString(locale), tokenCount: (value) => String(value), duration: (value) => value === null ? (zh ? '不可用' : 'Unavailable') : `${value} ms`, costValue: (value) => value.availability === 'available' && value.value !== null ? `${value.value} ${value.unit}` : (zh ? '不可用' : 'Unavailable'), status: (value) => value ?? (zh ? '未知' : 'Unknown'), source: (value) => value, detail: { attempt: text(locale, '尝试', 'Attempt'), session: text(locale, '会话', 'Session'), provider: text(locale, '提供方', 'Provider'), source: text(locale, '来源', 'Source'), status: text(locale, '状态', 'Status') },
    },
    budget: { title: text(locale, '会话预算', 'Session budget'), description: text(locale, '限制此会话的令牌预算。', 'Limit tokens for this session.'), cap: text(locale, '令牌上限', 'Token cap'), save: text(locale, '保存', 'Save'), saving: text(locale, '保存中…', 'Saving…'), unknown: text(locale, '结果未确认', 'Result unconfirmed'), reconcile: text(locale, '核对结果', 'Check result'), pendingTarget: (sessionId) => zh ? `正在等待会话 ${sessionId} 的原始更新结果。` : `Waiting for the original update for session ${sessionId}.`, retry: text(locale, '重试', 'Retry'), error: (message) => zh ? `预算操作失败：${message}` : `Budget action failed: ${message}` },
  }
}
