import type { PromptTemplateEditorLabels } from '@hbar/app-react'
import type { ShellLocale } from './shell-copy'

export interface PromptTemplateCopy {
  readonly title: string
  readonly detail: string
  readonly listTitle: string
  readonly empty: string
  readonly loading: string
  readonly loadError: string
  readonly sessionsFailed: string
  readonly sessionCapacity: string
  readonly retry: string
  readonly create: string
  readonly edit: string
  readonly remove: string
  readonly next: string
  readonly first: string
  readonly description: string
  readonly variables: string
  readonly addVariable: string
  readonly removeVariable: string
  readonly variableId: string
  readonly variableLabel: string
  readonly variableRequired: string
  readonly variableDefault: string
  readonly optional: string
  readonly required: string
  readonly validationName: string
  readonly validationDescription: string
  readonly validationBody: string
  readonly validationVariables: string
  readonly validationVariable: string
  readonly validationPlaceholder: string
  readonly saved: string
  readonly deleted: string
  readonly applied: string
  readonly confirmReplace: string
  readonly unknown: string
  readonly reconcile: string
  readonly target: string
  readonly chooseTarget: string
  readonly targetUnavailable: string
  readonly createPreDraft: string
  readonly mode: string
  readonly append: string
  readonly replace: string
  readonly applyTitle: string
  readonly apply: string
  readonly otherWorkspace: string
  readonly preTarget: (index: number) => string
  readonly confirmDelete: (name: string) => string
  readonly pendingWorkspace: (name: string) => string
  readonly editor: PromptTemplateEditorLabels
}

export function promptTemplateCopy(locale: ShellLocale): PromptTemplateCopy {
  const zh = locale === 'zh-CN'
  return {
    title: zh ? '提示词模板' : 'Prompt templates',
    detail: zh ? '管理工作区模板并写入草稿' : 'Manage workspace templates and apply them to drafts',
    listTitle: zh ? '模板列表' : 'Templates',
    empty: zh ? '暂无模板。' : 'No templates yet.',
    loading: zh ? '正在加载模板…' : 'Loading templates…',
    loadError: zh ? '模板加载失败' : 'Templates failed to load',
    sessionsFailed: zh ? '会话列表加载失败，请重试' : 'Sessions could not be loaded. Try again.',
    sessionCapacity: zh ? '已显示前 400 个会话' : 'Showing the first 400 sessions',
    retry: zh ? '重试' : 'Retry',
    create: zh ? '新建模板' : 'New template',
    edit: zh ? '编辑' : 'Edit',
    remove: zh ? '删除' : 'Delete',
    next: zh ? '下一页' : 'Next page',
    first: zh ? '回到第一页' : 'First page',
    description: zh ? '描述' : 'Description',
    variables: zh ? '变量' : 'Variables',
    addVariable: zh ? '添加变量' : 'Add variable',
    removeVariable: zh ? '移除变量' : 'Remove variable',
    variableId: zh ? '变量名称' : 'Variable name',
    variableLabel: zh ? '变量标签' : 'Variable label',
    variableRequired: zh ? '是否必填' : 'Required',
    variableDefault: zh ? '默认值' : 'Default value',
    optional: zh ? '可选' : 'Optional',
    required: zh ? '必填' : 'Required',
    validationName: zh ? '名称必填且不超过 160 个字符。' : 'Name is required and must be at most 160 characters.',
    validationDescription: zh ? '描述不能超过 2000 个字符。' : 'Description must be at most 2,000 characters.',
    validationBody: zh
      ? '正文必填且不超过 200,000 个字符。'
      : 'Body is required and must be at most 200,000 characters.',
    validationVariables: zh ? '变量最多 32 个。' : 'Up to 32 variables are supported.',
    validationVariable: zh
      ? '变量名称必须唯一并符合格式，标签不能为空。'
      : 'Variable names must be unique and valid; labels are required.',
    validationPlaceholder: zh ? '正文包含未声明的变量。' : 'Body contains an undeclared placeholder.',
    saved: zh ? '模板已保存。' : 'Template saved.',
    deleted: zh ? '模板已删除。' : 'Template deleted.',
    applied: zh ? '已写入草稿。' : 'Draft updated.',
    confirmReplace: zh ? '确认替换当前草稿正文' : 'Replace the current draft body',
    unknown: zh ? '操作结果未知，请先核对。' : 'The operation result is unknown; reconcile before retrying.',
    reconcile: zh ? '重新核对' : 'Reconcile',
    target: zh ? '目标草稿' : 'Draft target',
    chooseTarget: zh ? '选择草稿' : 'Choose a draft',
    targetUnavailable: zh ? '目标草稿已变化，请重新选择。' : 'The target draft changed. Choose it again.',
    createPreDraft: zh ? '新建首次发送草稿' : 'New pre-session draft',
    mode: zh ? '写入模式' : 'Write mode',
    append: zh ? '追加' : 'Append',
    replace: zh ? '替换' : 'Replace',
    applyTitle: zh ? '套用模板' : 'Apply template',
    apply: zh ? '写入草稿' : 'Apply to draft',
    otherWorkspace: zh ? '原工作区' : 'Original workspace',
    preTarget: (index) => (zh ? `首次发送草稿 ${index}` : `Pre-session draft ${index}`),
    confirmDelete: (name) => (zh ? `删除“${name}”` : `Delete “${name}”`),
    pendingWorkspace: (name) => (zh ? `待核对工作区：${name}` : `Pending workspace: ${name}`),
    editor: {
      title: zh ? '模板编辑器' : 'Template editor',
      detail: zh ? '编辑名称和正文，变量必须先声明。' : 'Edit the name and body; variables must be declared.',
      name: zh ? '名称' : 'Name',
      body: zh ? '正文' : 'Body',
      variables: zh ? '变量状态' : 'Variable status',
      valid: zh ? '已使用' : 'Used',
      invalid: zh ? '未使用' : 'Unused',
      save: zh ? '保存' : 'Save',
      cancel: zh ? '取消' : 'Cancel',
    },
  }
}
