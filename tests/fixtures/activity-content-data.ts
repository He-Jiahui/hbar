export const activityContentObjective = (index: number) =>
  `原 Agent ${index} · 完整目标名称 Complete objective `.repeat(3).trim()
export const activityContentStep = (index: number) =>
  `原任务 ${index} · 完整步骤说明 Complete task text `.repeat(3).trim()
export const activityContentFocus = '原工作流焦点 · 完整章节标题 Complete focus heading '.repeat(3).trim()
export const activityContentPreview = '原运行输入 Complete original run input '.repeat(4).slice(0, 160)
