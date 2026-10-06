import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { format, resolveConfig } from 'prettier'
import { collectDesktopBuildInputs, collectDesktopElements } from './desktop-element-audit/inventory'
import type { DesktopElementInventory } from './desktop-element-audit/types'

export function renderDesktopInventory(inventory: DesktopElementInventory): string {
  const lines = [
    '# Desktop 元素清单',
    '',
    '由 `bun scripts/audit-desktop-elements.ts --write` 从运行时入口、命名延迟加载、barrel 导出和 JSX 生成。完整的元素、槽位、内容来源、可访问名称、动作目标、状态来源和待处理问题见 [类型化清单](desktop-elements.json)。',
    '',
    `入口：\`${inventory.entry}\`。相关 TSX 模块 ${inventory.sourceModules.length} 个；元素 ${inventory.elements.length} 个。实际构建输入核对：${inventory.productionBuildStatus}。`,
    '',
    '## 类别与展示边界',
    '',
    '| 类别 | 元素 | pending | 设计职责 |',
    '| --- | ---: | ---: | --- |',
  ]
  const categories = {
    structure: 'Lumen flow 容器、区域、页面与工具标题；业务组件拥有区域组合。',
    text: 'LumenContentText 明确用途；具名文案与真实数据由宿主提供。',
    interaction: 'Lumen 控件与共享浮层；稳定目标、键盘、焦点和就近反馈。',
    form: '类型化字段、草稿、校验与保存；Schema 展示由宿主适配。',
    collection: '稳定记录、分页／虚拟化与窗格滚动；标题、副文本与元数据各有归属。',
    technical: '原文、代码、Markdown、图示与媒体的专用 renderer；辅助操作仍使用 Lumen。',
    feedback: '空、加载、运行、成功、失败、恢复与取消的宿主状态及语义反馈。',
    platform: 'Tauri 标题、托盘与通知；操作系统展示，宿主提供文案。',
  }
  for (const [category, description] of Object.entries(categories)) {
    const elements = inventory.elements.filter((element) => element.category === category)
    lines.push(
      `| ${category} | ${elements.length} | ${elements.filter((element) => element.status === 'pending').length} | ${description} |`,
    )
  }
  lines.push(
    '',
    '## 按生产模块核对',
    '',
    '| 模块 | 表面 | 元素 | 已声明用途文本 | 未分类文本 | 其他待处理 |',
    '| --- | --- | ---: | ---: | ---: | ---: |',
  )
  for (const path of inventory.sourceModules) {
    const entries = inventory.elements.filter((element) => element.path === path)
    const pendingText = entries.filter((element) => element.issues.includes('text-purpose-not-declared'))
    lines.push(
      `| [${path}](../../${path}) | ${[...new Set(entries.map((element) => element.surface))].join(' / ')} | ${entries.length} | ${entries.filter((element) => element.context).length} | ${pendingText.length} | ${entries.filter((element) => element.issues.length > 0 && !pendingText.includes(element)).length} |`,
    )
  }
  lines.push(
    '',
    '## 审计含义',
    '',
    '- `semantic`：文本 context 已声明；`composed`：通过 Lumen 或独立业务组件组合；这两项只证明源码边界，不代替行为与容量验收。',
    '- `pending`：存在未归属文本、原生业务元素或平台文案契约。逐项处理后重新生成，不将原生标签按名称机械替换为完成。',
    '- `renderer-boundary`：只允许登记的专用 renderer 片段；`schema-boundary`：通用 Schema 渲染，Desktop 必须注入 Lumen 展示适配。',
    '- `contentSources`、`targetSources` 和 `stateSources` 保存真实源码表达式；大型 JSX 组合保留源码行号与依赖引用，子元素另有独立记录。未出现属性不等于没有隐式依赖，需结合组件 props、ViewModel 与行为验收。',
    '- `flow` 的组件归属描述表示需要核对对应组件容量与滚动契约，不能视为已证明虚拟化或可滚动。',
    '- 清单同时保留未进入入口图的 TSX 与参考／兼容边界。最终必须和实际生产构建输入及页面回归共同核对。',
    '',
    '## 未进入生产入口图的 TSX',
    '',
    ...inventory.unusedTsxModules.map((path) => `- \`${path}\``),
    '',
  )
  return lines.join('\n')
}

if (import.meta.main) {
  const root = resolve(import.meta.dirname, '..')
  let inventory = await collectDesktopElements(root)
  if (Bun.argv.includes('--build'))
    inventory = {
      ...inventory,
      productionBuildInputs: await collectDesktopBuildInputs(root),
      productionBuildStatus: 'passed',
    }
  const formatting = await resolveConfig(resolve(root, 'package.json'))
  const generated = await format(JSON.stringify(inventory), { ...formatting, parser: 'json' })
  const generatedMarkdown = await format(renderDesktopInventory(inventory), { ...formatting, parser: 'markdown' })
  if (Bun.argv.includes('--check')) {
    const existing = await Bun.file(resolve(root, 'docs/ui/desktop-elements.json')).text()
    if (
      generated !== existing ||
      generatedMarkdown !== (await Bun.file(resolve(root, 'docs/ui/desktop-elements.md')).text())
    ) {
      throw new Error('Desktop element inventory is stale; regenerate with --write and the same --build option')
    }
  }
  if (Bun.argv.includes('--write')) {
    await mkdir(resolve(root, 'docs/ui'), { recursive: true })
    await Bun.write(resolve(root, 'docs/ui/desktop-elements.json'), generated)
    await Bun.write(resolve(root, 'docs/ui/desktop-elements.md'), generatedMarkdown)
  }
  const pending = inventory.elements.filter((element) => element.status === 'pending')
  console.log(
    JSON.stringify({
      modules: inventory.sourceModules.length,
      elements: inventory.elements.length,
      pending: pending.length,
      text: pending.filter((element) => element.issues.includes('text-purpose-not-declared')).length,
      build: inventory.productionBuildStatus,
    }),
  )
  if (Bun.argv.includes('--strict') && pending.length > 0) process.exit(1)
}
