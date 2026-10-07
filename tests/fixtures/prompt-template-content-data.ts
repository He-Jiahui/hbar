export const promptTemplateContentName = (index: number, length = 160) =>
  (`原始模板 ${index} Complete original template name ` + '完整名称 '.repeat(40)).slice(0, length)
export const promptTemplateContentDescription = (index: number) =>
  `原始模板说明 ${index} Complete original template description\n`.repeat(40).slice(0, 2000)
export const promptTemplateContentVariableLabel = (index: number) =>
  (`原始变量 ${index} Complete original variable label ` + '完整变量 '.repeat(30)).slice(0, 160)
