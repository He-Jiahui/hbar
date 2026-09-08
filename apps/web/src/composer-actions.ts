import type { ComposerAction } from '@hbar/ui-sdk'

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'

export type ComposerActionAvailability = {
  hasSession: boolean
  canAttachImages: boolean
  hasGoalPlugin?: boolean
  hasPlanPlugin?: boolean
  hasBudgetPlugin?: boolean
}

export const BUILTIN_COMPOSER_ACTIONS: readonly ComposerAction[] = [
  {
    id: 'goal',
    label: 'Goal 模式',
    description: '持续推进一个可验证的目标',
    group: 'session',
    icon: 'target',
    keywords: ['goal', '目标', '自治'],
    requiresSession: true,
  },
  {
    id: 'plan',
    label: 'Plan 模式',
    description: '只读探索并生成待审核的实施计划',
    group: 'session',
    icon: 'clipboard-list',
    keywords: ['plan', '计划', '只读'],
    requiresSession: true,
  },
  {
    id: 'budget',
    label: 'Budget 模式',
    description: '为会话设置并追踪 token 预算',
    group: 'session',
    icon: 'gauge',
    keywords: ['budget', '预算', 'token'],
    requiresSession: true,
  },
  {
    id: 'add-image',
    label: '添加图片',
    description: '上传图片并附加到下一条消息',
    group: 'context',
    icon: 'image',
    keywords: ['image', '图片', 'attach', '附件'],
    execute: ({ openFilePicker }) => openFilePicker({ accept: IMAGE_ACCEPT, multiple: true }),
  },
  {
    id: 'add-file',
    label: '添加文件',
    description: '将文件作为上下文附加到下一条消息',
    group: 'context',
    icon: 'file',
    keywords: ['file', '文件', 'attach', '附件'],
    execute: ({ openFilePicker }) => openFilePicker({ accept: '*/*', multiple: true }),
  },
]

function disabledAction(action: ComposerAction, reason: string): ComposerAction {
  return { ...action, disabled: true, disabledReason: reason }
}

export function buildComposerActions(
  contributed: readonly ComposerAction[],
  availability: ComposerActionAvailability,
): ComposerAction[] {
  const builtins = BUILTIN_COMPOSER_ACTIONS.map((action) => {
    if (action.id === 'add-image' && !availability.canAttachImages)
      return disabledAction(action, '当前模型或连接不支持图片附件')
    if (action.id === 'goal' && availability.hasGoalPlugin === false) return disabledAction(action, 'Goal 插件未启用')
    if (action.id === 'plan' && availability.hasPlanPlugin === false) return disabledAction(action, 'Plan 插件未启用')
    if (action.id === 'budget' && availability.hasBudgetPlugin === false)
      return disabledAction(action, 'Budget 插件未启用')
    if (action.requiresSession && !availability.hasSession) return disabledAction(action, '请先打开一个会话')
    return action
  })
  const extensions = contributed.map((action) => {
    if (action.requiresSession && !availability.hasSession) return disabledAction(action, '请先打开一个会话')
    if (!action.disabled && !action.execute) return disabledAction(action, '该插件尚未连接到当前会话')
    return action
  })
  return [...builtins, ...extensions]
}
