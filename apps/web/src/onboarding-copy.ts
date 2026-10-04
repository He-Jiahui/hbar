import type { OnboardingReadinessLabels } from '@hbar/app-react/onboarding'
import type { ShellLocale } from './shell-copy'
export function onboardingCopy(locale: ShellLocale): OnboardingReadinessLabels {
  const zh = locale === 'zh-CN'
  return {
    disconnected: zh ? 'Host 尚未连接' : 'Host is not connected',
    connected: zh ? 'Host 已连接' : 'Host connected',
    workspace: zh ? '工作区' : 'Workspace',
    workspaceDetail: zh
      ? '至少需要一个 Host 已确认的工作区。'
      : 'At least one workspace confirmed by the Host is required.',
    model: zh ? '可用模型' : 'Available model',
    modelDetail: zh ? '需要一个 Host 确认可以运行的模型。' : 'A model confirmed as executable by the Host is required.',
    project: zh ? '项目路径' : 'Project path',
    projectDetail: zh ? '当前工作区必须有可用项目路径。' : 'The selected workspace must expose a usable project path.',
    configure: zh ? '配置' : 'Configure',
    create: zh ? '创建' : 'Create',
    open: zh ? '打开' : 'Open',
    progress: zh ? '首次配置进度' : 'First-run setup progress',
    progressText: (completed, total) =>
      zh ? `已完成 ${completed}/${total} 项` : `${completed} of ${total} checks confirmed`,
    footer: zh ? '状态来自 Host 的已确认事实。' : 'Status is based on confirmed Host facts.',
    empty: zh ? '暂无配置项。' : 'No setup checks are available.',
    readyTitle: zh ? '可以开始了' : 'You are ready to start',
    readyDescription: zh ? 'Host 已确认首次配置所需条件。' : 'The Host confirmed the requirements for a first session.',
    readyWorkspace: zh ? '工作区' : 'Workspace',
    readyModel: zh ? '模型' : 'Model',
    readyProject: zh ? '已确认' : 'Confirmed',
    openWorkspace: zh ? '打开工作区' : 'Open workspace',
    takeTour: zh ? '查看引导' : 'Take a tour',
    inboxNote: zh ? '你可以从工作区开始新的会话。' : 'Start a new session from the workspace.',
    setupTitle: zh ? '完成首次配置' : 'Finish first-run setup',
    setupDescription: zh ? '配置工作区和模型后即可开始。' : 'Configure a workspace and model before starting.',
    workspaceName: zh ? '工作区路径' : 'Workspace path',
    workspaceNamePlaceholder: zh ? '例如：D:/projects/my-app' : 'For example: D:/projects/my-app',
    workspaceUrl: zh ? '工作区路径' : 'Workspace path',
    workspaceUrlPlaceholder: zh ? '输入本地路径' : 'Enter a local path',
    memberHint: zh ? '路径由 Host 验证并持久化。' : 'The Host validates and persists this path.',
    region: zh ? '运行区域' : 'Runtime region',
    regionHint: zh ? '本地 Host 使用本机区域。' : 'The local Host uses the machine region.',
    privateWorkspace: zh ? '私有工作区' : 'Private workspace',
    privateWorkspaceDescription: zh ? '仅当前 Host 使用。' : 'Available to this Host only.',
    back: zh ? '返回' : 'Back',
    continue: zh ? '继续' : 'Continue',
    setupPath: zh ? '路径' : 'Path',
    setupPathPlaceholder: zh ? '输入项目路径' : 'Enter project path',
    setupPathHint: zh
      ? 'Host 会验证目录并创建工作区。'
      : 'The Host validates the directory before creating a workspace.',
    cancel: zh ? '取消' : 'Cancel',
    retry: zh ? '重试' : 'Retry',
    error: (code) => (zh ? `操作失败：${code}` : `Action failed: ${code}`),
    loading: zh ? '正在加载模型目录' : 'Loading model catalog',
    unavailable: zh ? '模型目录暂不可用' : 'Model catalog unavailable',
  }
}
