import { LumenButton, LumenFrame, LumenText } from '@lumen/app-ui'
import type { PromptTemplate } from '@hbar/contracts/commands/prompt-templates'

export interface PromptTemplatePickerLabels {
  readonly title: string
  readonly empty: string
  readonly apply: string
  readonly edit: string
}
export function PromptTemplatePicker(props: {
  readonly templates: readonly PromptTemplate[]
  readonly selectedId: string | null
  readonly labels: PromptTemplatePickerLabels
  readonly onSelect: (id: string) => void
  readonly onApply: (id: string) => void
  readonly onEdit: (id: string) => void
}) {
  return <LumenFrame as="section" aria-label={props.labels.title} className="hbar-prompt-template-picker">
    {props.templates.length === 0 ? <LumenText as="p" tone="muted">{props.labels.empty}</LumenText> : props.templates.map((template) => <LumenFrame as="article" key={template.id} aria-current={template.id === props.selectedId}>
      <LumenButton variant={template.id === props.selectedId ? 'solid' : 'outlined'} aria-pressed={template.id === props.selectedId} onClick={() => props.onSelect(template.id)}>{template.name}</LumenButton>
      <LumenText as="p" tone="muted">{template.description}</LumenText>
      <LumenButton onClick={() => props.onApply(template.id)}>{props.labels.apply}</LumenButton>
      <LumenButton variant="outlined" onClick={() => props.onEdit(template.id)}>{props.labels.edit}</LumenButton>
    </LumenFrame>)}
  </LumenFrame>
}
