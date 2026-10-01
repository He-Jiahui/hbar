import type { HbarPreSessionChoiceLabels } from '@hbar/app-react'
import type { ShellLocale } from './shell-copy'

export interface WebPreSessionCopy {
  readonly workspace: HbarPreSessionChoiceLabels
  readonly model: HbarPreSessionChoiceLabels
  readonly path: string
  readonly pathHint: string
  readonly addWorkspace: string
  readonly openingWorkspace: string
  readonly checkingModels: string
  readonly retryModels: string
  readonly configureProviders: string
  readonly modelReadFailed: string
  readonly selectedModelUnavailable: string
  readonly selectedThinkingUnavailable: string
  readonly modelActionFailed: string
  readonly slashActionFailed: string
  readonly slashRequiresSession: string
  readonly slashUnavailable: string
  readonly slashModelDescription: string
  readonly slashSettingsDescription: string
  readonly slashGoalDescription: string
  readonly checking: string
  readonly goalReplacesPlan: string
  readonly planReplacesGoal: string
  readonly goalAlreadyPrepared: string
  readonly goalError: (code: string) => string
  readonly error: (code: string) => string
  readonly modelName: (provider: string, model: string) => string
}

export function preSessionCopy(locale: ShellLocale): WebPreSessionCopy {
  const zh = locale === 'zh-CN'
  const choose = (chinese: string, english: string) => (zh ? chinese : english)
  return {
    workspace: {
      title: choose('选择项目', 'Choose project'),
      trigger: (name) =>
        name ? choose(`当前项目：${name}`, `Current project: ${name}`) : choose('选择项目', 'Choose project'),
      search: choose('搜索项目', 'Search projects'),
      clearSearch: choose('清除项目搜索', 'Clear project search'),
      empty: choose('尚无项目。添加服务端目录以继续。', 'No projects yet. Add a server directory to continue.'),
      noMatches: choose('没有匹配的项目。', 'No matching projects.'),
      more: (remaining) =>
        remaining === null
          ? choose('加载更多项目', 'Load more projects')
          : choose(`显示更多项目（还有 ${remaining} 个）`, `Show more projects (${remaining} remaining)`),
      close: choose('关闭', 'Close'),
      error: (code) => choose(`无法选择项目：${code}`, `Could not choose project: ${code}`),
    },
    model: {
      title: choose('选择模型', 'Choose model'),
      trigger: (name) =>
        name ? choose(`当前模型：${name}`, `Current model: ${name}`) : choose('使用默认模型', 'Use default model'),
      search: choose('搜索模型', 'Search models'),
      clearSearch: choose('清除模型搜索', 'Clear model search'),
      empty: choose('尚无可选模型。', 'No models are available.'),
      noMatches: choose('没有匹配的模型。', 'No matching models.'),
      more: (remaining) =>
        remaining === null
          ? choose('加载更多模型', 'Load more models')
          : choose(`显示更多模型（还有 ${remaining} 个）`, `Show more models (${remaining} remaining)`),
      close: choose('关闭', 'Close'),
      error: (code) => choose(`无法选择模型：${code}`, `Could not choose model: ${code}`),
    },
    path: choose('服务端目录', 'Server directory'),
    pathHint: choose('输入服务端上已存在的目录路径。', 'Enter an existing directory path on the server.'),
    addWorkspace: choose('添加项目', 'Add project'),
    openingWorkspace: choose('正在打开项目…', 'Opening project…'),
    checkingModels: choose('正在检查可用模型…', 'Checking available models…'),
    retryModels: choose('重试读取模型', 'Retry models'),
    configureProviders: choose('配置模型提供商', 'Configure providers'),
    modelReadFailed: choose('模型暂时无法加载，请重试。', 'Models could not be loaded. Try again.'),
    selectedModelUnavailable: choose(
      '所选模型已不可用，请重新选择模型。草稿会保留。',
      'The selected model is no longer available. Choose another model; your draft is kept.',
    ),
    selectedThinkingUnavailable: choose(
      '所选思考等级已不受支持，请确认一个可用等级后发送。',
      'The selected thinking level is no longer supported. Confirm an available level before sending.',
    ),
    modelActionFailed: choose('无法打开提供商设置，请重试。', 'Could not open provider settings. Try again.'),
    slashActionFailed: choose('无法打开此入口，请重试。', 'Could not open this action. Try again.'),
    slashRequiresSession: choose(
      '此命令需要先进入会话。首条消息可使用输入区的现有选项。',
      'This command needs an open session. Use the available composer options for the first message.',
    ),
    slashUnavailable: choose(
      '正在准备首次发送，暂时无法打开斜杠命令。',
      'Slash commands are unavailable while preparing the first send.',
    ),
    slashModelDescription: choose('选择首条消息使用的模型', 'Choose the model for the first message'),
    slashSettingsDescription: choose('打开全局设置', 'Open global settings'),
    slashGoalDescription: choose(
      '准备下一条目标消息，可附目标内容',
      'Prepare the next Goal message, optionally with an objective',
    ),
    checking: choose('核对首次发送结果', 'Check first-send result'),
    goalReplacesPlan: choose('退出计划模式并准备目标', 'Exit Plan mode and prepare a Goal'),
    planReplacesGoal: choose(
      '切换为计划模式，取消尚未发送的目标准备。输入内容会保留。',
      'Switch to Plan mode and cancel the unsent Goal setup. Your text is kept.',
    ),
    goalAlreadyPrepared: choose('下一条消息已准备为目标。', 'The next message is already prepared as a Goal.'),
    goalError: (code) =>
      code === 'GOAL_REQUIRED'
        ? choose(
            '使用 /goal 或 /goal 目标内容准备下一条消息；清除准备请使用 /goal clear。',
            'Use /goal or /goal <objective> to prepare the next message; use /goal clear to cancel setup.',
          )
        : choose(`无法准备目标：${code}`, `Could not prepare Goal: ${code}`),
    error: (code) => choose(`无法开始会话：${code}`, `Could not start session: ${code}`),
    modelName: (provider, model) => `${provider} · ${model}`,
  }
}
