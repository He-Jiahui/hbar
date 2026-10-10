import type { AppPageId } from '@hbar/contracts/commands/surfaces'
import type { ShellLocale } from './shell-copy'

export const globalFeaturePageIds = [
  'run-board',
  'schedules',
  'prompt-templates',
  'onboarding',
  'notifications',
] as const satisfies readonly AppPageId[]
export type GlobalFeaturePageId = (typeof globalFeaturePageIds)[number]

export interface GlobalFeatureCopy {
  readonly navigation: string
  readonly titles: Readonly<Record<GlobalFeaturePageId, string>>
  readonly back: string
  readonly workspaceRequired: string
  readonly configureWorkspace: string
  readonly unavailable: string
}

export function globalFeatureCopy(locale: ShellLocale): GlobalFeatureCopy {
  const zh = locale === 'zh-CN'
  return {
    navigation: zh ? '更多页面' : 'More pages',
    titles: {
      'run-board': zh ? '运行看板' : 'Run board',
      schedules: zh ? '排期' : 'Schedules',
      'prompt-templates': zh ? '提示词模板' : 'Prompt templates',
      onboarding: zh ? '首次配置' : 'Setup',
      notifications: zh ? '通知中心' : 'Notification center',
    },
    back: zh ? '返回会话' : 'Back to conversation',
    workspaceRequired: zh ? '请先选择或配置一个工作区。' : 'Select or set up a workspace to continue.',
    configureWorkspace: zh ? '配置工作区' : 'Set up a workspace',
    unavailable: zh ? '此页面暂不可用。' : 'This page is unavailable.',
  }
}

export function isGlobalFeaturePageId(panelId: string): panelId is GlobalFeaturePageId {
  return globalFeaturePageIds.some((id) => id === panelId)
}
