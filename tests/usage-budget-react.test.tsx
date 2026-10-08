import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { CommandError } from '@hbar/commands'
import { createState } from '../packages/app-runtime/src/state'
import { createUsageBudget } from '../packages/app-runtime/src/usage-budget'
import { HbarUsageBudget, type HbarUsageBudgetLabels } from '../packages/app-react/src/usage-budget'

const copies: readonly HbarUsageBudgetLabels[] = [
  {
    title: 'Session token budget',
    description: 'Set the limit for this session',
    cap: 'Token limit',
    save: 'Save budget',
    saving: 'Saving',
    unknown: 'Awaiting original result',
    reconcile: 'Check original result',
    retry: 'Reload budget',
    pendingTarget: (id) => `Pending session: ${id}`,
    error: (value) => `Action failed: ${value}`,
  },
  {
    title: '当前会话的令牌预算与执行用量限制',
    description: '为当前会话设置令牌上限',
    cap: '令牌上限',
    save: '保存预算',
    saving: '正在保存',
    unknown: '原操作结果尚未确认',
    reconcile: '核对原操作结果',
    retry: '重新读取预算',
    pendingTarget: (id) => `待核对的原会话：${id}`,
    error: (value) => `操作失败：${value}`,
  },
]
for (const labels of copies) {
  test(`Usage05 controlled form and unknown receipt action: ${labels.title}`, async () => {
    const target = createState<{ sessionId: string } | null>({ sessionId: 'original-a' }, () => undefined)
    const runtime = createUsageBudget({
      target: target.reader,
      commands: {
        execute: async (id) => {
          if (id === 'session.getBudget') return null
          throw new CommandError('RESULT_UNKNOWN', 'lost acknowledgment')
        },
      },
      getReceipt: async () => null,
    })
    await runtime.refresh()
    runtime.setDraftLimit('12345')
    const ready = renderToStaticMarkup(<HbarUsageBudget runtime={runtime} labels={labels} />)
    expect(ready).toContain(labels.cap)
    expect(ready).toContain('value="12345"')
    expect(ready).toContain(labels.save)
    await runtime.save()
    target.replace({ sessionId: 'new-b' })
    await runtime.refresh()
    const unknown = renderToStaticMarkup(<HbarUsageBudget runtime={runtime} labels={labels} />)
    expect(unknown).toContain(labels.unknown)
    expect(unknown).toContain(labels.pendingTarget('original-a'))
    const buttons = unknown.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? []
    expect(buttons.some((button) => button.includes(labels.reconcile))).toBe(true)
    expect(unknown).toContain(`aria-label="${labels.reconcile}"`)
    expect(unknown).toContain('disabled=""')
    runtime.dispose()
  })
}
