import type { HbarPreSessionChoiceLabels } from '@hbar/app-react'
import type { ShellLocale } from './shell-copy'

export interface WebPreSessionCopy {
  readonly workspace: HbarPreSessionChoiceLabels
  readonly model: HbarPreSessionChoiceLabels
  readonly path: string
  readonly pathHint: string
  readonly addWorkspace: string
  readonly openingWorkspace: string
  readonly checking: string
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
    checking: choose('核对首次发送结果', 'Check first-send result'),
    error: (code) => choose(`无法开始会话：${code}`, `Could not start session: ${code}`),
    modelName: (provider, model) => `${provider} · ${model}`,
  }
}
