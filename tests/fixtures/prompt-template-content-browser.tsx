import { createRoot, type Root } from 'react-dom/client'
import { createAppRuntime, type PromptTemplatesState } from '@hbar/app-runtime'
import { CommandError } from '@hbar/commands'
import { promptTemplateCommands, type PromptTemplate } from '@hbar/contracts/commands/prompt-templates'
import { HbarRuntimeProvider } from '@hbar/app-react'
import { LumenProvider, DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui'
import { PromptTemplatesPage } from '../../apps/web/src/prompt-templates-page'
import { promptTemplateCopy } from '../../apps/web/src/prompt-template-copy'
import {
  promptTemplateContentName,
  promptTemplateContentDescription,
  promptTemplateContentVariableLabel,
} from './prompt-template-content-data'
import '@lumen/app-ui/styles.css'

export interface PromptTemplateContentInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly state: 'list' | 'edit' | 'load-error' | 'save-error' | 'unknown' | 'loading'
  readonly count: number
  readonly suffix: string
  readonly variableCount?: number
  readonly nameLength?: number
  readonly bodyLength?: number
  readonly duplicate?: boolean
  readonly foreign?: boolean
  readonly staleTarget?: boolean
}
declare global {
  interface Window {
    mountPromptTemplateContent(input: PromptTemplateContentInput): Promise<void>
    promptTemplateContentState(): {
      readonly calls: readonly { name: string; input: unknown }[]
      readonly templates: PromptTemplatesState | undefined
      readonly drafts: ReturnType<ReturnType<typeof createAppRuntime>['view']['state']['drafts']['getSnapshot']>
    }
    repairPromptTemplateContent(): void
    reorderPromptTemplateContent(): Promise<void>
    disposePromptTemplateContent?: () => void
  }
}
const workspace = { id: 'original-workspace', path: 'D:/owned-templates', name: 'Original workspace', createdAt: 1 }
const session = {
  id: 'original-session',
  workspaceId: workspace.id,
  title: 'Original draft target 原始草稿目标 '.repeat(4),
  archived: false,
  parentId: null,
  createdAt: 1,
  updatedAt: 2,
  seq: 3,
}
let root: Root | undefined
let release: (() => void) | undefined

window.mountPromptTemplateContent = async (input) => {
  window.disposePromptTemplateContent?.()
  const element = document.getElementById('prompt-template-content-fixture')
  if (!element) throw new Error('Missing owned template fixture')
  const calls: { name: string; input: unknown }[] = []
  const variables = Array.from({ length: input.variableCount ?? 1 }, (_, index) => ({
    id: `variable${index}`,
    label: promptTemplateContentVariableLabel(index),
    required: false,
    defaultValue: `original value ${index}`,
  }))
  let items: PromptTemplate[] = Array.from({ length: input.count }, (_, index) => ({
    id: input.duplicate ? 'same-template-id' : `original-template-${index}`,
    workspaceId: input.foreign ? 'foreign-workspace' : workspace.id,
    name: promptTemplateContentName(index, input.nameLength),
    description: promptTemplateContentDescription(index),
    body: input.bodyLength
      ? '原'.repeat(input.bodyLength)
      : `Original body 原始正文\n${variables.map((variable) => `{{${variable.id}}}`).join('\n')}`,
    variables,
    revision: 3,
    createdAt: 1,
    updatedAt: 2,
  }))
  let failed = input.state === 'load-error' || input.state === 'save-error'
  let hold = input.state === 'loading'
  let receipt: PromptTemplate | null = null
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const owned = createAppRuntime({
    instanceId: 'prompt-template-content',
    hostId: 'owned-fixture',
    directory: {
      execute(name) {
        if (name === 'session.get') return Promise.resolve(session)
        if (name === 'workspace.get') return Promise.resolve(workspace)
        if (name === 'session.list') return Promise.resolve({ items: [session], nextCursor: null })
        if (name === 'workspace.list') return Promise.resolve({ items: [workspace], nextCursor: null })
        return Promise.reject(new Error(`Unexpected directory command ${name}`))
      },
    },
    surfaces: { canRender: () => true },
    promptTemplates: {
      async execute(name, raw) {
        calls.push({ name, input: raw })
        if (name === 'promptTemplate.list') {
          if (hold) await gate
          if (failed && input.state === 'load-error')
            throw new CommandError('DISCONNECTED', `Owned template read failure ${input.suffix}`)
          const request = promptTemplateCommands[name].input.parse(raw)
          return request.after
            ? { items: [items[0]], nextCursor: null }
            : { items, nextCursor: items.length === 50 ? '2:original-next' : null }
        }
        if (name === 'promptTemplate.save') {
          const request = promptTemplateCommands[name].input.parse(raw)
          if (failed) throw new CommandError('CONFLICT', `Owned original template conflict ${input.suffix}`)
          const original = items.find((item) => item.id === request.id)
          receipt = {
            ...request,
            id: request.id ?? 'new-original-template',
            revision: (original?.revision ?? 0) + 1,
            createdAt: original?.createdAt ?? 1,
            updatedAt: 4,
          }
          // Keep only DTO fields; expectedRevision belongs to the command input.
          receipt = promptTemplateCommands[name].output.parse({
            id: receipt.id,
            workspaceId: receipt.workspaceId,
            name: receipt.name,
            description: receipt.description,
            body: receipt.body,
            variables: receipt.variables,
            revision: receipt.revision,
            createdAt: receipt.createdAt,
            updatedAt: receipt.updatedAt,
          })
          items = [receipt, ...items.filter((item) => item.id !== receipt?.id)]
          if (input.state === 'unknown')
            throw new CommandError('DISCONNECTED', `Owned accepted template response lost ${input.suffix}`)
          return receipt
        }
        if (name === 'promptTemplate.receipt') return receipt
        if (name === 'promptTemplate.delete') {
          const request = promptTemplateCommands[name].input.parse(raw)
          items = items.filter((item) => item.id !== request.id)
          return { deleted: true }
        }
        throw new Error(`Unexpected template command ${name}`)
      },
    },
  })
  await owned.ready
  await owned.view.commands.execute('app.setSession', { workspaceId: workspace.id, sessionId: session.id })
  await owned.view.commands.execute('draft.setText', {
    sessionId: session.id,
    text: 'Original existing draft 原始草稿',
  })
  const api = owned.view.state.promptTemplates
  if (!api) throw new Error('Missing owned template runtime')
  if (input.state === 'edit' || input.state === 'save-error' || input.state === 'unknown') {
    const template = items[0]
    if (!template) throw new Error('Missing original template to edit')
    api.edit(template)
  }
  const base = promptTemplateCopy(input.locale)
  const labels = {
    ...base,
    title: base.title + input.suffix,
    detail: base.detail + input.suffix,
    listTitle: base.listTitle + input.suffix,
    variables: base.variables + input.suffix,
    applyTitle: base.applyTitle + input.suffix,
    empty: base.empty + input.suffix,
    loading: base.loading + input.suffix,
    create: base.create + input.suffix,
    edit: base.edit + input.suffix,
    remove: base.remove + input.suffix,
    unknown: base.unknown + input.suffix,
    saved: base.saved + input.suffix,
    editor: {
      ...base.editor,
      title: base.editor.title + input.suffix,
      detail: base.editor.detail + input.suffix,
      name: base.editor.name + input.suffix,
      body: base.editor.body + input.suffix,
      valid: base.editor.valid + input.suffix,
      invalid: base.editor.invalid + input.suffix,
      save: base.editor.save + input.suffix,
      cancel: base.editor.cancel + input.suffix,
    },
  }
  window.promptTemplateContentState = () => ({
    calls,
    templates: api.reader.getSnapshot(),
    drafts: owned.view.state.drafts.getSnapshot(),
  })
  window.repairPromptTemplateContent = () => {
    failed = false
    hold = false
    release?.()
  }
  window.reorderPromptTemplateContent = async () => {
    items = [...items].reverse()
    await api.list(workspace.id, null)
  }
  window.disposePromptTemplateContent = () => {
    root?.unmount()
    owned.dispose()
    release?.()
    root = undefined
    release = undefined
  }
  root = createRoot(element)
  root.render(
    <LumenProvider
      className="prompt-template-fixture-provider"
      appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, motion: false }}
    >
      <HbarRuntimeProvider view={owned.view}>
        <PromptTemplatesPage
          runtime={owned.view}
          workspaceId={workspace.id}
          sessionId={input.staleTarget ? 'missing-original-target' : session.id}
          locale={input.locale}
          labels={labels}
        />
      </HbarRuntimeProvider>
    </LumenProvider>,
  )
}
