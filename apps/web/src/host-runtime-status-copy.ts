import type { HbarRuntimeStatusLabels } from '@hbar/app-react'

export function hostRuntimeStatusCopy(locale: 'zh-CN' | 'en-US'): HbarRuntimeStatusLabels {
  const zh = locale === 'zh-CN'
  const choose = <Value>(chinese: Value, english: Value): Value => (zh ? chinese : english)
  const number = new Intl.NumberFormat(locale)
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  return {
    title: choose('服务运行单元', 'Service units'),
    diagnostics: choose('查看诊断', 'View diagnostics'),
    empty: choose('尚未收到运行单元状态。', 'No service unit status has been received.'),
    phases: {
      unavailable: choose('运行状态暂不可用', 'Service status is unavailable'),
      initializing: choose('服务正在准备', 'Preparing the service'),
      serving: choose('服务正常', 'Service ready'),
      preparing: choose('正在准备更新', 'Preparing an update'),
      prepared: choose('更新已准备，可显式应用', 'Update prepared and ready to apply'),
      waiting: choose('等待旧任务或存储交接', 'Waiting for existing tasks or storage handover'),
      recovering: choose('部分服务正在恢复', 'Recovering a service unit'),
      failed: choose('更新失败，可查看诊断', 'Update failed; diagnostics are available'),
      restart_required: choose('此更新需要重启', 'This update requires a restart'),
    },
    generationPhases: {
      preparing: choose('准备中', 'Preparing'),
      ready: choose('已就绪', 'Ready'),
      serving: choose('服务中', 'Serving'),
      recovering: choose('恢复中', 'Recovering'),
      draining: choose('等待任务结束', 'Draining'),
      disposing: choose('释放资源中', 'Releasing resources'),
      disposed: choose('已释放', 'Disposed'),
      failed: choose('失败', 'Failed'),
    },
    roles: {
      candidate: choose('候选版本', 'Candidate'),
      default: choose('当前版本', 'Current'),
      draining: choose('旧版本', 'Previous'),
    },
    kinds: {
      base: choose('服务入口', 'Service entry'),
      controller: 'Controller',
      kernel: 'Kernel',
      driver: choose('模型驱动', 'Model driver'),
      plugin: choose('插件', 'Plugin'),
      storage: choose('存储', 'Storage'),
      maintenance: choose('维护', 'Maintenance'),
      resources: choose('执行资源', 'Execution resources'),
    },
    unit: (kind, id) => `${kind} · ${id}`,
    generation: (generation, role) =>
      choose(`第 ${number.format(generation)} 代 · ${role}`, `Generation ${number.format(generation)} · ${role}`),
    process: (pid) => choose(`进程 ${number.format(pid)}`, `Process ${number.format(pid)}`),
    references: (value) =>
      choose(
        `运行 ${number.format(value.runs)} · 资源 ${number.format(value.resources)} · 请求 ${number.format(value.requests)}`,
        `Runs ${number.format(value.runs)} · Resources ${number.format(value.resources)} · Requests ${number.format(value.requests)}`,
      ),
    retry: (timestamp) =>
      choose(`下次恢复尝试：${time.format(timestamp)}`, `Next recovery attempt: ${time.format(timestamp)}`),
    reason: (code) => choose(`原因：${code}`, `Reason: ${code}`),
    more: (count) =>
      choose(`另有 ${number.format(count)} 个版本未展示。`, `${number.format(count)} more generations not shown.`),
    error: (code) =>
      choose(
        `运行状态读取失败：${code}。可刷新诊断重试。`,
        `Could not read service status: ${code}. Refresh diagnostics to try again.`,
      ),
  }
}
