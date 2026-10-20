const fields = ['unattended', 'transientRetries', 'repairRetries', 'retryDelayMs'] as const
type BackendExecutionSetting = (typeof fields)[number]
interface SettingCopy {
  readonly label: string
  readonly help: string
}
export type BackendExecutionSettingsCopy = { readonly [Field in BackendExecutionSetting]: SettingCopy }
type Locale = 'zh-CN' | 'en-US'

const messages: Readonly<Record<Locale, BackendExecutionSettingsCopy>> = {
  'zh-CN': {
    unattended: {
      label: '无人值守运行',
      help: '后台继续排队任务，按重试和修复设置处理普通任务故障；需要用户输入时按决策模式处理。',
    },
    transientRetries: {
      label: '普通任务瞬时故障重试次数',
      help: '默认 2 次，可设为 0–8 次。0 表示不重试；重启后保留已用次数。',
    },
    repairRetries: {
      label: '普通任务诊断修复次数',
      help: '默认 3 次，可设为 0–8 次。仅修复有明确诊断的执行错误，保留原权限、预算和取消约束。',
    },
    retryDelayMs: {
      label: '重试与修复初始退避（毫秒）',
      help: '可设为 100–60000 毫秒，默认 1000。每类尝试分别指数退避，最长 5 分钟；已保存的等待时间不变。',
    },
  },
  'en-US': {
    unattended: {
      label: 'Unattended execution',
      help: 'Continue queued work in the backend. Ordinary failures follow retry and repair settings; input requests follow the decision mode.',
    },
    transientRetries: {
      label: 'Ordinary task transient retries',
      help: 'Default: 2. Set 0–8 attempts; 0 disables retries. Used attempts survive restarts.',
    },
    repairRetries: {
      label: 'Ordinary task diagnostic repairs',
      help: 'Default: 3. Set 0–8 attempts. Repair only diagnosed execution errors, preserving original permissions, budgets and cancellation.',
    },
    retryDelayMs: {
      label: 'Initial retry and repair delay (milliseconds)',
      help: 'Set 100–60000 milliseconds; default: 1000. Each attempt category backs off exponentially, capped at 5 minutes. Saved deadlines remain unchanged.',
    },
  },
}

export function backendExecutionSettingsCopy(locale: Locale): BackendExecutionSettingsCopy {
  return messages[locale]
}

/** Host-owned settings copy can be read without importing the workbench's component types. */
export function resolveBackendExecutionSettingCopy(locale: Locale, key: string): string | undefined {
  const copy = backendExecutionSettingsCopy(locale)
  for (const field of fields) {
    if (key === `i18n:settings.backend.${field}.label`) return copy[field].label
    if (key === `i18n:settings.backend.${field}.help`) return copy[field].help
  }
  return undefined
}
