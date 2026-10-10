import {
  LumenContentText,
  LumenButton,
  LumenFormField,
  LumenFrame,
  LumenInput,
  LumenPromptInput04,
  LumenTextarea,
} from '@lumen/app-ui'
import type { PromptTemplateVariable } from '@hbar/contracts/commands/prompt-templates'

export interface PromptTemplateEditorLabels {
  readonly title: string
  readonly detail: string
  readonly name: string
  readonly body: string
  readonly variables: string
  readonly valid: string
  readonly invalid: string
  readonly save: string
  readonly cancel: string
}
export interface PromptTemplateEditorProps {
  readonly name: string
  readonly body: string
  readonly variables: readonly (PromptTemplateVariable & { readonly present: boolean })[]
  readonly labels: PromptTemplateEditorLabels
  readonly validation: string | null
  readonly canSave: boolean
  readonly disabled?: boolean
  readonly onNameChange: (value: string) => void
  readonly onBodyChange: (value: string) => void
  readonly onSave: () => void
  readonly onCancel: () => void
}

export function PromptTemplateEditor(props: PromptTemplateEditorProps) {
  const content = (
    <LumenFrame as="section" aria-label={props.labels.title} className="hbar-prompt-template-editor">
      <LumenContentText context="section.title">{props.labels.title}</LumenContentText>
      <LumenContentText context="section.description" tone="muted">
        {props.labels.detail}
      </LumenContentText>
      <LumenFormField controlId="prompt-template-name" label={props.labels.name}>
        <LumenInput
          disabled={props.disabled}
          value={props.name}
          onChange={(event) => props.onNameChange(event.currentTarget.value)}
        />
      </LumenFormField>
      <LumenFormField controlId="prompt-template-body" label={props.labels.body}>
        <LumenTextarea
          disabled={props.disabled}
          value={props.body}
          onChange={(event) => props.onBodyChange(event.currentTarget.value)}
        />
      </LumenFormField>
      <LumenFrame aria-label={props.labels.variables}>
        {props.variables.map((variable, index) => (
          <LumenFrame key={index}>
            <LumenContentText context="message.inline">{variable.label}</LumenContentText>
            <LumenContentText context="message.inline" tone={variable.present ? 'success' : 'muted'}>
              {variable.present ? props.labels.valid : props.labels.invalid}
            </LumenContentText>
          </LumenFrame>
        ))}
      </LumenFrame>
      {props.validation ? (
        <LumenContentText context="message.inline" tone="danger">
          {props.validation}
        </LumenContentText>
      ) : null}
      <LumenFrame as="footer">
        <LumenButton tone="primary" disabled={!props.canSave} onClick={props.onSave}>
          {props.labels.save}
        </LumenButton>
        <LumenButton variant="outlined" disabled={props.disabled} onClick={props.onCancel}>
          {props.labels.cancel}
        </LumenButton>
      </LumenFrame>
    </LumenFrame>
  )
  return <LumenPromptInput04 controlled={{ body: content }} />
}
