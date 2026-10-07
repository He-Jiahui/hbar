import { useId } from 'react'
import {
  LumenButton,
  LumenFormField,
  LumenFrame,
  LumenInput,
  LumenPromptInput04,
  LumenTextarea,
  LumenContentText,
  LumenCollection,
  LumenCollectionItem,
} from '@lumen/app-ui'
import {
  PROMPT_TEMPLATE_MAX_NAME,
  PROMPT_TEMPLATE_MAX_BODY,
  type PromptTemplateVariable,
} from '@hbar/contracts/commands/prompt-templates'

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
  const nameId = useId()
  const bodyId = useId()
  const content = (
    <LumenFrame as="section" aria-label={props.labels.title} className="hbar-prompt-template-editor">
      <LumenContentText context="section.title" level={2}>
        {props.labels.title}
      </LumenContentText>
      <LumenContentText context="section.description">{props.labels.detail}</LumenContentText>
      <LumenFormField controlId={nameId} label={props.labels.name} layout="rows">
        <LumenInput
          id={nameId}
          maxLength={PROMPT_TEMPLATE_MAX_NAME}
          disabled={props.disabled}
          value={props.name}
          onChange={(event) => props.onNameChange(event.currentTarget.value)}
        />
      </LumenFormField>
      <LumenFormField controlId={bodyId} label={props.labels.body} layout="rows">
        <LumenTextarea
          id={bodyId}
          maxLength={PROMPT_TEMPLATE_MAX_BODY}
          disabled={props.disabled}
          value={props.body}
          onChange={(event) => props.onBodyChange(event.currentTarget.value)}
        />
      </LumenFormField>
      <LumenCollection aria-label={props.labels.variables} className="hbar-prompt-variable-status">
        {props.variables.map((variable, index) => (
          <LumenCollectionItem key={index}>
            <LumenContentText context="collection.title">{variable.label}</LumenContentText>
            <LumenContentText context="collection.detail" tone={variable.present ? 'success' : 'muted'}>
              {variable.present ? props.labels.valid : props.labels.invalid}
            </LumenContentText>
          </LumenCollectionItem>
        ))}
      </LumenCollection>
      {props.validation ? (
        <LumenContentText context="form.help" tone="danger" role="alert">
          {props.validation}
        </LumenContentText>
      ) : null}
      <LumenFrame as="footer" className="hbar-prompt-actions" role="group" aria-label={props.labels.title} tabIndex={0}>
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
