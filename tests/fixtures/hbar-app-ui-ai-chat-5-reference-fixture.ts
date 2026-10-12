import type { LumenAiChatApprovalReferenceContent } from '@lumen/app-ui/catalog'

export function createAiChat5ReferenceFixture(locale: 'en' | 'zh' = 'en'): LumenAiChatApprovalReferenceContent {
  const isChinese = locale === 'zh'

  return {
    variant: 5,
    ownerId: 'ai-chat-5:staging-cleanup',
    title: isChinese ? '清理暂存环境' : 'Staging cleanup',
    messages: [
      {
        id: 'cleanup-request',
        side: 'user',
        parts: [
          {
            kind: 'text',
            text: isChinese
              ? '请在明天演示前清理暂存环境。'
              : 'Clean up the staging environment before tomorrow’s demo.',
          },
        ],
      },
      {
        id: 'staging-scan',
        side: 'assistant',
        parts: [
          {
            kind: 'text',
            text: isChinese
              ? '我扫描了暂存项目，发现两个预览数据库已 30 天未查询，还有三个 API 密钥近期没有请求。我会分几步清理，让你逐项审批。'
              : 'I scanned the staging project and found two preview databases that have not been queried in 30 days and three API keys with no recent requests. I’ll remove them in a few steps so you can approve each one.',
          },
        ],
        disclosures: [
          {
            id: 'scanned-staging-resources',
            label: isChinese ? '已扫描暂存资源' : 'Scanned staging resources',
            body: isChinese
              ? '扫描发现两个长期未查询的预览数据库、五个空闲会话，以及三个没有近期请求的 API 密钥。当前请求只涉及这三个密钥。'
              : 'The scan found two preview databases with no queries in 30 days, five idle sessions, and three API keys with no recent requests. This approval only applies to those three keys.',
            status: isChinese ? '完成 · 0.9 秒' : 'Done · 0.9s',
          },
        ],
      },
    ],
    listStrategy: { kind: 'content-grown', expectedMaximum: 4 },
    labels: {
      empty: isChinese ? '暂无消息' : 'No messages',
      regenerate: isChinese ? '重新生成' : 'Regenerate',
      copy: isChinese ? '复制回复' : 'Copy reply',
      openArtifact: isChinese ? '打开文件' : 'Open artifact',
      sources: isChinese ? '来源' : 'Sources',
    },
    previousApprovals: [
      {
        id: 'approved-preview-databases',
        label: isChinese ? '已删除 2 个预览数据库' : 'Deleted 2 preview databases',
        badge: isChinese ? '已批准' : 'Approved',
      },
      {
        id: 'approved-idle-sessions',
        label: isChinese ? '已清理 5 个空闲会话' : 'Cleared 5 idle sessions',
        badge: isChinese ? '已批准' : 'Approved',
      },
    ],
    approval: {
      id: 'approval-delete-staging-api-keys',
      status: isChinese ? '需要审批' : 'Needs approval',
      description: isChinese
        ? '删除暂存项目中 3 个未使用的 API 密钥。任何仍使用这些密钥的服务都将开始返回 401 错误。此操作无法撤销。'
        : 'Delete 3 unused API keys from the staging project. Any service still using them will start returning 401 errors. This cannot be undone.',
      request: isChinese
        ? '请求：删除暂存项目中没有近期请求的 3 个 API 密钥。若仍有服务依赖这些密钥，请选择保留。'
        : 'Request: delete the three staging API keys with no recent requests. Keep them if any service still depends on these credentials.',
      labels: {
        showRequest: isChinese ? '查看请求' : 'Show request',
        allow: isChinese ? '删除密钥' : 'Delete keys',
        deny: isChinese ? '保留密钥' : 'Keep them',
      },
    },
  }
}
