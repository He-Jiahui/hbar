import type { ApprovalExecutionTargetLabels } from '@hbar/app-react/approval-execution-target'
import type { NodeBackend } from '@hbar/contracts/node-backend'
import { nodeBackendSchema } from '@hbar/contracts/node-backend'
import type { ShellLocale } from './shell-copy'

const backendNames: Readonly<Record<NodeBackend, Readonly<{ zh: string; en: string }>>> = {
  none: { zh: '未启用', en: 'None' },
  bwrap: { zh: 'bubblewrap', en: 'bubblewrap' },
  container: { zh: '容器', en: 'Container' },
  seatbelt: { zh: 'Seatbelt', en: 'Seatbelt' },
  'windows-restricted': { zh: 'Windows 受限令牌', en: 'Windows restricted token' },
  'windows-elevated': { zh: 'Windows 提权后端', en: 'Windows elevated backend' },
}

export function approvalExecutionTargetCopy(locale: ShellLocale): ApprovalExecutionTargetLabels {
  const zh = locale === 'zh-CN'
  const choose = (chinese: string, english: string) => (zh ? chinese : english)
  const yesNo = (value: boolean) => choose(value ? '可用' : '关闭', value ? 'available' : 'disabled')
  return {
    title: choose('执行目标与隔离能力', 'Execution target and isolation capabilities'),
    nodeName: (name) => choose(`节点：${name}`, `Node: ${name}`),
    rootPath: (path, access) =>
      choose(
        `工作区路径：${path}（${access === 'write' ? '节点共享可写' : '节点共享只读'}）`,
        `Workspace path: ${path} (${access === 'write' ? 'node shared as writable' : 'node shared as read only'})`,
      ),
    rootAccess: (access) =>
      choose(
        access === 'write' ? '节点共享可写' : '节点共享只读',
        access === 'write' ? 'node shared writable' : 'node shared read only',
      ),
    local: choose(
      '本机宿主执行。未附加远程节点能力摘要。',
      'Execution is local to this Host. No remote node capability summary is attached.',
    ),
    node: choose('节点', 'Node'),
    root: choose('工作区路径', 'Workspace path'),
    availableBackends: choose('节点报告的可用隔离后端', 'Node-reported available isolation backends'),
    availableBackendsSummary: (backends) =>
      choose(`节点报告的可用隔离后端：${backends}`, `Node-reported available isolation backends: ${backends}`),
    noAvailableBackend: choose('没有报告可用后端', 'No available backend was reported'),
    selectedBackend: (backend) => choose(`实际使用的隔离后端：${backend}`, `Selected isolation backend: ${backend}`),
    selectedBackendUnknown: choose(
      '实际使用的隔离后端：未知（旧审批记录未保存）',
      'Selected isolation backend: unknown (not recorded in this older approval)',
    ),
    backend: (backend) => {
      const parsed = nodeBackendSchema.safeParse(backend)
      if (!parsed.success) return backend
      const name = backendNames[parsed.data]
      return zh ? name.zh : name.en
    },
    filesystem: (state) =>
      choose(
        `文件系统隔离能力：${state === 'enforced' ? '已强制执行' : '不可用'}`,
        `Filesystem isolation capability: ${state}`,
      ),
    network: (state) =>
      choose(
        `网络隔离能力：${state === 'enforced' ? '可强制执行' : state === 'env-only' ? '仅环境变量' : '不可用'}`,
        `Network isolation capability: ${state}`,
      ),
    floor: choose('节点本地底线', 'Node local floor'),
    floorSummaryText: (summary) => choose(`节点本地底线：${summary}`, `Node local floor: ${summary}`),
    floorSummary: (process, terminal, network, confinement) =>
      choose(
        `进程 ${yesNo(process)}；终端 ${yesNo(terminal)}；网络 ${yesNo(network)}；操作系统隔离 ${confinement}`,
        `Processes ${yesNo(process)}; terminal ${yesNo(terminal)}; network ${yesNo(network)}; OS confinement ${confinement}`,
      ),
    observedAt: (date) => choose(`A 于 ${date} 验证`, `Verified by A at ${date}`),
  }
}
