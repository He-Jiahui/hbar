import type { LumenPromptUploadReferenceContent } from '@lumen/app-ui/catalog'

export function createPrompt5ReferenceFixture(locale: 'en' | 'zh' = 'en'): LumenPromptUploadReferenceContent {
  const chinese = locale === 'zh'
  return {
    variant: 5,
    ownerId: 'prompt-upload-preview',
    listStrategy: { kind: 'pane-scroll', expectedMaximum: 12 },
    composer: {
      draft: '',
      attachments: [],
      labels: {
        input: chinese ? '输入提示' : 'Ask anything',
        placeholder: chinese ? '输入提示' : 'Ask anything',
        send: chinese ? '发送' : 'Send',
        attach: chinese ? '添加文件' : 'Attach a file',
        remove: (name) => (chinese ? `移除 ${name}` : `Remove ${name}`),
      },
    },
    uploads: [
      {
        id: 'brand-guidelines',
        name: 'brand-guidelines.pdf',
        detail: '3.4 MB',
        failed: false,
      },
      {
        id: 'campaign-metrics',
        name: 'q3-campaign-metrics.csv',
        detail: '820 KB',
        failed: false,
      },
      {
        id: 'product-shot',
        name: 'product-shot-hero.png',
        detail: chinese ? '连接已断开' : 'Connection lost',
        failed: true,
      },
    ],
    labels: {
      browse: chinese ? '拖放文件，或浏览' : 'Drag files here, or browse',
      drop: chinese ? '将文件拖放到此处' : 'Drop files here',
      retry: (name) => (chinese ? `重试 ${name}` : `Retry ${name}`),
      remove: (name) => (chinese ? `移除 ${name}` : `Remove ${name}`),
      empty: chinese ? '尚未添加文件' : 'No files attached',
    },
  }
}
