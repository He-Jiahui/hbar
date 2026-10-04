import { CommandError, type CommandExecutor } from '@hbar/commands'
import {
  promptTemplateCommands,
  promptTemplatePageSchema,
  promptTemplateSchema,
  renderPromptTemplate,
  type PromptTemplate,
  type PromptTemplatePage,
  type PromptTemplateSaveInput,
  type PromptTemplateDeleteInput,
} from '@hbar/contracts/commands/prompt-templates'
import { createState } from './state'

export interface PromptTemplateApplyTarget {
  readonly kind: 'session' | 'pre-session'
  readonly id: string
  readonly readText: () => Promise<{ text: string; revision?: number }>
  readonly applyText: (input: { text: string; expectedText: string; expectedRevision?: number }) => Promise<void>
}
export interface PromptTemplatesState {
  readonly workspaceId: string | null
  readonly page: PromptTemplatePage | null
  readonly selected: PromptTemplate | null
  readonly draft: PromptTemplateSaveInput | null
  readonly status: 'idle' | 'loading' | 'saving' | 'error' | 'unknown'
  readonly mutation: 'idle' | 'submitting' | 'succeeded' | 'failed' | 'unknown'
  readonly pendingWorkspaceId: string | null
  readonly error: string | null
}
type PendingWrite =
  | {
      readonly commandId: 'promptTemplate.save'
      readonly input: PromptTemplateSaveInput
      readonly draft: PromptTemplateSaveInput
      readonly key: string
    }
  | {
      readonly commandId: 'promptTemplate.delete'
      readonly input: PromptTemplateDeleteInput
      readonly key: string
    }

function uncertain(error: unknown): boolean {
  if (
    error instanceof CommandError &&
    ['RESULT_UNKNOWN', 'TIMEOUT', 'DISCONNECTED', 'INVALID_OUTPUT'].includes(error.code)
  )
    return true
  return error instanceof Error && /unknown|timed?\s*out|disconnect/i.test(error.message)
}

export function createPromptTemplates(commands: CommandExecutor, onError: (error: unknown) => void) {
  const state = createState<PromptTemplatesState>(
    {
      workspaceId: null,
      page: null,
      selected: null,
      draft: null,
      status: 'idle',
      mutation: 'idle',
      pendingWorkspaceId: null,
      error: null,
    },
    onError,
  )
  const read = () => state.reader.getSnapshot()
  let disposed = false
  let generation = 0
  let writeInFlight = false
  let pending: PendingWrite | null = null
  let listController: AbortController | undefined
  const assertActive = () => {
    if (disposed) throw new CommandError('DISPOSED', 'Prompt templates are disposed')
  }
  const assertWritable = () => {
    assertActive()
    if (writeInFlight || pending)
      throw new CommandError('BUSY', 'Check the pending prompt template write before submitting another')
  }
  function accept(write: PendingWrite, result: unknown) {
    if (write.commandId === 'promptTemplate.save') {
      const parsed = promptTemplateSchema.safeParse(result)
      if (!parsed.success) throw new CommandError('INVALID_OUTPUT', 'Prompt template receipt is invalid')
      const saved = parsed.data
      if (saved.workspaceId !== write.input.workspaceId || (write.input.id && saved.id !== write.input.id))
        throw new CommandError('INVALID_OUTPUT', 'Prompt template receipt target changed')
      if (read().workspaceId === write.input.workspaceId) {
        const page = read().page
        state.replace({
          ...read(),
          ...(page
            ? { page: { ...page, items: [saved, ...page.items.filter((item) => item.id !== saved.id)].slice(0, 50) } }
            : {}),
          ...(read().draft === write.draft ? { selected: saved, draft: null } : {}),
        })
      }
      return saved
    }
    const parsed = promptTemplateCommands['promptTemplate.delete'].output.safeParse(result)
    if (!parsed.success) throw new CommandError('INVALID_OUTPUT', 'Prompt template deletion receipt is invalid')
    const resultData = parsed.data
    if (read().workspaceId === write.input.workspaceId) {
      const current = read()
      state.replace({
        ...current,
        page: current.page
          ? { ...current.page, items: current.page.items.filter((item) => item.id !== write.input.id) }
          : null,
        ...(current.selected?.id === write.input.id ? { selected: null, draft: null } : {}),
      })
    }
    return resultData
  }
  async function executeWrite(write: PendingWrite) {
    assertWritable()
    pending = write
    writeInFlight = true
    state.replace({
      ...read(),
      status: 'saving',
      mutation: 'submitting',
      pendingWorkspaceId: write.input.workspaceId,
      error: null,
    })
    try {
      const value = await commands.execute(write.commandId, write.input, { idempotencyKey: write.key })
      if (!disposed) {
        accept(write, value)
        pending = null
        state.replace({ ...read(), status: 'idle', mutation: 'succeeded', pendingWorkspaceId: null, error: null })
      }
      return value
    } catch (error) {
      if (!disposed) {
        const unknown = uncertain(error)
        if (!unknown) pending = null
        state.replace({
          ...read(),
          status: unknown ? 'unknown' : 'error',
          mutation: unknown ? 'unknown' : 'failed',
          pendingWorkspaceId: unknown ? write.input.workspaceId : null,
          error: error instanceof Error ? error.message : String(error),
        })
      }
      throw error
    } finally {
      writeInFlight = false
    }
  }
  return {
    reader: state.reader,
    async list(workspaceId: string, after?: string | null, signal?: AbortSignal) {
      assertActive()
      if (signal?.aborted) throw new CommandError('CANCELLED', 'Template list cancelled')
      listController?.abort()
      const controller = new AbortController()
      listController = controller
      const abort = () => controller.abort()
      signal?.addEventListener('abort', abort, { once: true })
      const currentGeneration = ++generation
      const changed = workspaceId !== read().workspaceId
      state.replace({
        ...read(),
        workspaceId,
        ...(changed ? { page: null, selected: null, draft: null } : {}),
        status: read().mutation === 'unknown' ? 'unknown' : 'loading',
        error: null,
      })
      try {
        const page = promptTemplatePageSchema.parse(
          await commands.execute(
            'promptTemplate.list',
            { workspaceId, ...(after === undefined ? {} : { after }), limit: 50 },
            { signal: controller.signal },
          ),
        )
        if (!disposed && currentGeneration === generation)
          state.replace({ ...read(), page, status: read().mutation === 'unknown' ? 'unknown' : 'idle' })
        return page
      } catch (error) {
        if (!disposed && currentGeneration === generation && !controller.signal.aborted)
          state.replace({
            ...read(),
            status: read().mutation === 'unknown' ? 'unknown' : 'error',
            error: error instanceof Error ? error.message : String(error),
          })
        throw error
      } finally {
        signal?.removeEventListener('abort', abort)
      }
    },
    select(template: PromptTemplate) {
      assertActive()
      state.replace({ ...read(), workspaceId: template.workspaceId, selected: template, draft: null, error: null })
    },
    edit(template: PromptTemplate) {
      assertWritable()
      state.replace({
        ...read(),
        workspaceId: template.workspaceId,
        selected: template,
        status: 'idle',
        error: null,
        draft: {
          workspaceId: template.workspaceId,
          id: template.id,
          name: template.name,
          description: template.description,
          body: template.body,
          variables: template.variables,
          expectedRevision: template.revision,
        },
      })
    },
    updateDraft(patch: Partial<Pick<PromptTemplateSaveInput, 'name' | 'description' | 'body' | 'variables'>>) {
      assertWritable()
      const draft = read().draft
      if (draft) state.replace({ ...read(), draft: { ...draft, ...patch }, status: 'idle', error: null })
    },
    createDraft(workspaceId: string) {
      assertWritable()
      state.replace({
        ...read(),
        workspaceId,
        selected: null,
        draft: { workspaceId, name: '', description: '', body: '', variables: [] },
        status: 'idle',
        error: null,
      })
    },
    async save(): Promise<PromptTemplate> {
      const draft = read().draft
      if (!draft) throw new CommandError('INVALID_INPUT', 'No prompt template draft')
      return promptTemplateSchema.parse(
        await executeWrite({ commandId: 'promptTemplate.save', input: draft, draft, key: crypto.randomUUID() }),
      )
    },
    async remove(template: PromptTemplate): Promise<{ deleted: boolean }> {
      return promptTemplateCommands['promptTemplate.delete'].output.parse(
        await executeWrite({
          commandId: 'promptTemplate.delete',
          input: { workspaceId: template.workspaceId, id: template.id, expectedRevision: template.revision },
          key: crypto.randomUUID(),
        }),
      )
    },
    async reconcile(): Promise<void> {
      assertActive()
      const write = pending
      if (!write || writeInFlight) throw new CommandError('BUSY', 'No uncertain template receipt is ready to check')
      writeInFlight = true
      try {
        const value = await commands.execute('promptTemplate.receipt', {
          commandId: write.commandId,
          input: write.input,
          idempotencyKey: write.key,
        })
        if (disposed) return
        if (value === null)
          throw new CommandError('RESULT_UNKNOWN', 'Template receipt is unavailable; the write remains uncertain')
        accept(write, value)
        pending = null
        state.replace({ ...read(), status: 'idle', mutation: 'succeeded', pendingWorkspaceId: null, error: null })
      } catch (error) {
        if (!disposed)
          state.replace({
            ...read(),
            status: 'unknown',
            mutation: 'unknown',
            error: error instanceof Error ? error.message : String(error),
          })
        throw error
      } finally {
        writeInFlight = false
      }
    },
    cancel() {
      assertWritable()
      state.replace({ ...read(), draft: null, status: 'idle', error: null })
    },
    async apply(
      template: PromptTemplate,
      values: Readonly<Record<string, string>>,
      target: PromptTemplateApplyTarget,
      mode: 'replace' | 'append',
    ) {
      assertActive()
      const rendered = renderPromptTemplate(template, values)
      const original = await target.readText()
      assertActive()
      const next = mode === 'append' ? original.text + (original.text ? '\n\n' : '') + rendered : rendered
      await target.applyText({
        text: next,
        expectedText: original.text,
        ...(original.revision === undefined ? {} : { expectedRevision: original.revision }),
      })
      return next
    },
    dispose() {
      disposed = true
      generation++
      listController?.abort()
      state.dispose()
    },
  }
}
