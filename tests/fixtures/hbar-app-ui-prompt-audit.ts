import type { HbarAppUiPromptLabels } from '../../packages/hbar-app-ui/src/production'

export const promptAuditCopy: Readonly<
  Record<
    'zh-CN' | 'en-US',
    {
      readonly labels: HbarAppUiPromptLabels
      readonly model: string
      readonly thinking: string
      readonly error: string
      readonly draft: string
      readonly attachment: string
      readonly submitted: string
    }
  >
> = {
  'zh-CN': {
    labels: {
      input: '提示词',
      placeholder: '描述需要完成的任务…',
      send: '发送',
      submitTitle: '发送提示词',
      stop: '停止生成',
      uploading: '附件上传中',
      addAttachment: '添加附件',
      removeAttachment: (item) => `移除附件 ${item.name}`,
    },
    model: '当前工作区的模型配置',
    thinking: '较高思考等级',
    error: '连接已中断，草稿和附件已保留。恢复连接后可以重试。',
    draft: '请检查这个工程的界面布局，并说明需要修复的问题。',
    attachment: '需要检查的界面布局与组件行为说明文档.md',
    submitted: '最近提交',
  },
  'en-US': {
    labels: {
      input: 'Prompt',
      placeholder: 'Describe the task…',
      send: 'Send',
      submitTitle: 'Send prompt',
      stop: 'Stop generation',
      uploading: 'Uploading attachments',
      addAttachment: 'Add attachments',
      removeAttachment: (item) => `Remove attachment ${item.name}`,
    },
    model: 'Workspace model configuration',
    thinking: 'High reasoning effort',
    error: 'Connection interrupted. Your draft and attachments are preserved. Reconnect and retry.',
    draft: 'Review the workspace layout and explain which interface components need correction.',
    attachment: 'workspace-layout-and-component-interaction-review.md',
    submitted: 'Last submission',
  },
}
