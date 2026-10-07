export const workflowFocusTitle = 'Complete original workflow focus title — 保留完整工作流焦点标题 '.repeat(4).trim()
export const workflowCheckTitle = (index: number) =>
  `Original check ${index} — 保留完整验收内容 Complete original acceptance requirement `.repeat(3).trim()
export const workflowPath = (index: number) =>
  `src/complete-original-path-${index}/` + 'original-relative-folder/'.repeat(12)
