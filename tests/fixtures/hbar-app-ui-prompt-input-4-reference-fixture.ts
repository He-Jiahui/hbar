import type { LumenPromptTemplateReferenceContent } from '@lumen/app-ui/catalog'

export function createPrompt4ReferenceFixture(locale: 'en' | 'zh' = 'en'): LumenPromptTemplateReferenceContent {
  const chinese = locale === 'zh'
  return {
    variant: 4,
    ownerId: 'prompt-template-preview',
    listStrategy: { kind: 'content-grown', expectedMaximum: 3 },
    parts: chinese
      ? [
          { kind: 'text', text: '为' },
          { kind: 'variable', variableId: 'audience' },
          { kind: 'text', text: '撰写一则' },
          { kind: 'variable', variableId: 'tone' },
          { kind: 'text', text: '公告，介绍' },
          { kind: 'variable', variableId: 'product' },
          { kind: 'text', text: '。' },
        ]
      : [
          { kind: 'text', text: 'Write a ' },
          { kind: 'variable', variableId: 'tone' },
          { kind: 'text', text: ' announcement for ' },
          { kind: 'variable', variableId: 'audience' },
          { kind: 'text', text: ' introducing ' },
          { kind: 'variable', variableId: 'product' },
          { kind: 'text', text: '.' },
        ],
    variables: chinese
      ? [
          {
            id: 'tone',
            label: '语气',
            placeholder: '温暖、直接或活泼',
            value: '温暖',
          },
          {
            id: 'audience',
            label: '受众',
            placeholder: '例如：现有客户',
            value: '现有客户',
          },
          {
            id: 'product',
            label: '产品',
            placeholder: '请输入您即将推出的产品或功能名称',
            value: '',
          },
        ]
      : [
          {
            id: 'tone',
            label: 'Tone',
            placeholder: 'warm, direct, playful',
            value: 'warm',
          },
          {
            id: 'audience',
            label: 'Audience',
            placeholder: 'existing customers',
            value: 'existing customers',
          },
          {
            id: 'product',
            label: 'Product',
            placeholder: 'the feature you ship',
            value: '',
          },
        ],
    labels: {
      run: chinese ? '运行模板' : 'Run template',
      status: (missing) => {
        if (missing === 0) {
          return chinese ? '模板已准备就绪' : 'Template is ready'
        }
        if (chinese) {
          return `还有 ${missing} 个变量需要填写`
        }
        return missing === 1 ? '1 variable needs a value' : `${missing} variables need values`
      },
    },
  }
}
