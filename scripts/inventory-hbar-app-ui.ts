import { HBAR_APP_UI_VARIANT_SPECS } from '../packages/hbar-app-ui/src/specs'
import type { HbarAppUiCategory } from '../packages/hbar-app-ui/src/types'
import { format, resolveConfig } from 'prettier'

const controlled = new Map<string, string>([
  ['app-shell:3', '导航随内容增长；主区和侧栏分别承担滚动'],
  ['ai-chat:1', '正式历史继续分页、虚拟化；嵌入式会话由宿主确定容量'],
  ['prompt-input:1', '附件上限由宿主/协议提供；输入流布局'],
  ['agent-plan:2', '面板滚动；Web 沿用协议 100 步上限'],
  ['settings-form:3', '宿主提供有限偏好选项；随内容增长，失效选项不回退'],
  ['authentication:6', '验证码长度由协议/宿主提供；表单随内容增长，计时和验证结果归宿主'],
  ...[1, 2, 6].map((variant): [string, string] => [
    `command-menu:${variant}`,
    '有限命令随内容增长；大型贡献集合由宿主显式选择虚拟化，按稳定 ID 执行',
  ]),
  ...Array.from({ length: 8 }, (_, index): [string, string] => [
    `ai-usage:${index + 1}`,
    [2, 4, 7].includes(index + 1) ? '宿主显式选择内容增长或虚拟列表' : '宿主提供的有限指标、配额和选项随内容增长',
  ]),
])
const existingContent = new Set<HbarAppUiCategory>([
  'agent-activity',
  'tool-calls',
  'agent-approval',
  'agent-plan',
  'file-manager',
  'feedback',
  'settings-form',
  'authentication',
  'billing',
  'integrations',
  'paywall',
  'navbar',
  'editor',
])
const sourceFor = (category: string) =>
  `packages/hbar-app-ui/src/components/${category
    .split('-')
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join('')}.tsx`
const ids = new Set(HBAR_APP_UI_VARIANT_SPECS.map((spec) => spec.id))
if (ids.size !== 300 || ids.size !== HBAR_APP_UI_VARIANT_SPECS.length)
  throw new Error('Expected 300 unique stable variants')
const categories = new Set(HBAR_APP_UI_VARIANT_SPECS.map((spec) => spec.category))
if (categories.size !== 38) throw new Error('Expected 38 component families')
await Promise.all(
  [...categories].map(async (category) => {
    if (!(await Bun.file(sourceFor(category)).exists())) throw new Error(`Missing family: ${category}`)
  }),
)
const rows = HBAR_APP_UI_VARIANT_SPECS.map((spec) => {
  const strategy = controlled.get(`${spec.category}:${spec.variant}`)
  const state = strategy ? '受控契约已接入' : existingContent.has(spec.category) ? '已有内容契约，继续迁移' : '待数据化'
  const gap = strategy
    ? '仍需最终全包/桌面验收'
    : existingContent.has(spec.category)
      ? '逐变体迁移业务动作与状态，核对失效 ID、容量及完整验证矩阵'
      : '移出示例内容与模拟业务状态，补齐必需文案、具名动作和容量策略'
  return `| ${spec.id} | [${spec.entry}](../${sourceFor(spec.category)}) | ${state} | ${strategy ?? '待逐变体验证；不能视为已完成'} | ${gap} |`
})
const inventoryPath = 'docs/app-ui-variant-inventory.md'
const markdown = `# app-ui 变体迁移清单

通过命令 bun scripts/inventory-hbar-app-ui.ts 生成。列出全部 38 类、300 个稳定变体 ID；画廊继续使用分类包装。

此清单显式记录已迁移的受控表面，不能把“已有内容契约”理解为所有业务状态与动作已经迁完，也不能把单个组件检查理解为最终产品验收。新的独立生产组件（会话导航、文件工作区、审批、问答和事件日志）另见集成文档，它们不占用或替换这 300 个 ID。

当前登记 ${controlled.size} 个变体已接入受控契约；其余 ${rows.length - controlled.size} 个继续按清单迁移。仍需完成 Settings/配对、Goal、工具与专用面板接入，其他组件族清理，以及最终桌面和全包视觉验收。

| 稳定变体 ID | 分类源入口 | 当前状态 | 列表/容量归属 | 剩余验证或契约缺口 |
| --- | --- | --- | --- | --- |
${rows.join('\n')}
`
await Bun.write(inventoryPath, await format(markdown, { ...(await resolveConfig(inventoryPath)), parser: 'markdown' }))
console.log(
  JSON.stringify({
    categories: categories.size,
    variants: rows.length,
    controlled: controlled.size,
    remaining: rows.length - controlled.size,
  }),
)
