import type { LumenAiChatVoiceReferenceContent } from '@lumen/app-ui'

export function createAiChat8ReferenceFixture(locale: 'en' | 'zh' = 'en'): LumenAiChatVoiceReferenceContent {
  const chinese = locale === 'zh'
  return {
    variant: 8,
    ownerId: 'ai-chat-8-reference',
    title: chinese ? '语音消息' : 'Voice message',
    subtitle: '0:25',
    messages: [],
    listStrategy: { kind: 'content-grown', expectedMaximum: 1 },
    labels: {
      empty: chinese ? '暂无内容' : 'No content',
      regenerate: chinese ? '重新生成' : 'Regenerate',
      copy: chinese ? '复制' : 'Copy',
      openArtifact: chinese ? '打开文件' : 'Open file',
      sources: chinese ? '来源' : 'Sources',
    },
    transcript: chinese
      ? '从共享文件夹中找出三个设计，并告诉我哪个在深色模式下对比度最好。'
      : 'Pull the three designs from the shared folder and tell me which one has the strongest contrast in dark mode.',
    phase: 'listening',
    waveform: [
      'low',
      'medium',
      'high',
      'medium',
      'low',
      'high',
      'medium',
      'low',
      'high',
      'medium',
      'low',
      'medium',
      'high',
      'low',
      'medium',
      'high',
      'medium',
      'low',
      'high',
      'medium',
      'high',
      'low',
      'medium',
      'high',
      'low',
      'medium',
      'high',
      'medium',
    ].map((level, index) => ({ id: `wave-${index + 1}`, level: level as 'low' | 'medium' | 'high' })),
    attachments: chinese
      ? [
          { id: 'hero-a', label: 'hero-option-a.png' },
          { id: 'hero-b', label: 'hero-option-b.png' },
          { id: 'brand-guidelines', label: 'brand-guidelines.pdf' },
        ]
      : [
          { id: 'hero-a', label: 'hero-option-a.png' },
          { id: 'hero-b', label: 'hero-option-b.png' },
          { id: 'brand-guidelines', label: 'brand-guidelines.pdf' },
        ],
    voiceLabels: {
      listening: chinese ? '聆听中' : 'Listening',
      stopped: chinese ? '已停止' : 'Stopped',
      stop: chinese ? '停止录音' : 'Stop recording',
      resume: chinese ? '继续录音' : 'Resume recording',
      tapToStop: chinese ? '点击即可停止' : 'Tap to stop',
      send: chinese ? '发送' : 'Send',
      remove: (name) => (chinese ? `移除 ${name}` : `Remove ${name}`),
      waveform: chinese ? '语音波形' : 'Voice waveform',
    },
  }
}
