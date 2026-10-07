import { createRoot, type Root } from 'react-dom/client'
import { createSkillImportController, type SkillImportController } from '@hbar/app-runtime/skill-import'
import { CommandError } from '@hbar/commands'
import {
  skillImportPreviewSchema,
  skillImportStartSchema,
  skillImportJobSchema,
  type SkillImportJob,
} from '@hbar/contracts/commands/skill-import'
import { HbarSkillImportPanel } from '@hbar/app-react/skill-import'
import { LumenProvider, LumenToolPane, DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui'
import { skillImportCopy } from '../../apps/web/src/skill-import-copy'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import { skillImportCandidateName, skillImportCandidatePath } from './skill-import-content-data'
import '@lumen/app-ui/styles.css'

export interface SkillImportContentInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly state: 'preview' | 'loading' | 'error' | 'truncated' | 'offline' | 'unknown' | 'retry' | 'running'
  readonly count: number
  readonly suffix: string
  readonly nameLength?: number
  readonly warnings?: number
  readonly duplicate?: boolean
}
declare global {
  interface Window {
    mountSkillImportContent(input: SkillImportContentInput): Promise<void>
    skillImportContentState(): {
      readonly state: ReturnType<SkillImportController['store']['getState']>
      readonly calls: readonly { name: string; input: unknown }[]
      readonly copied: number
      readonly imported: number
    }
    repairSkillImportContent(): void
    disposeSkillImportContent?: () => void
  }
}
let root: Root | undefined
let controller: SkillImportController | undefined
let release: (() => void) | undefined
window.mountSkillImportContent = async (input) => {
  window.disposeSkillImportContent?.()
  const element = document.getElementById('skill-import-content-fixture')
  if (!element) throw new Error('Missing owned import fixture')
  const calls: { name: string; input: unknown }[] = []
  let failed = input.state === 'error'
  let available = false
  let job: SkillImportJob | null = null
  let copied = 0
  let imported = 0
  let hold = false
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const owned = createSkillImportController({
    async preview(request) {
      calls.push({ name: 'preview', input: request })
      if (hold) await gate
      if (failed) throw new CommandError('SKILL_SOURCE_INVALID', 'Owned source failure')
      const result = skillImportPreviewSchema.safeParse({
        request,
        sourceRoots: ['D:/original-source'],
        destination: 'D:/original-destination',
        revision: 'original-revision',
        candidates: Array.from({ length: input.count }, (_, index) => ({
          id: input.duplicate ? 'same-destination-id' : `original-${index}`,
          name: input.nameLength ? '原'.repeat(input.nameLength) : skillImportCandidateName(index),
          sourcePath: skillImportCandidatePath(index),
          status: 'ready',
          warnings: Array.from({ length: input.warnings ?? 1 }, () => 'platform_metadata'),
          files: 2,
          bytes: 1024,
        })),
        truncated: input.state === 'truncated',
      })
      if (!result.success) throw new CommandError('INVALID_OUTPUT', 'Owned preview capacity failure')
      return result.data
    },
    start(raw) {
      const request = skillImportStartSchema.parse(raw)
      calls.push({ name: 'start', input: request })
      if (!job) {
        copied++
        job = skillImportJobSchema.parse({
          operationId: request.operationId,
          request: request.request,
          destination: 'D:/original-destination',
          status: input.state === 'running' ? 'running' : 'succeeded',
          items: [{ id: 'original-0', status: input.state === 'running' ? 'skipped' : 'imported', warnings: [] }],
          error: null,
        })
        if (input.state === 'unknown' || input.state === 'retry')
          return Promise.reject(new CommandError('DISCONNECTED', 'Owned accepted response lost'))
      }
      return Promise.resolve(job)
    },
    get(operationId) {
      calls.push({ name: 'get', input: operationId })
      return Promise.resolve(available || input.state === 'running' ? job : null)
    },
    latest: () => Promise.resolve(null),
    cancel(operationId) {
      calls.push({ name: 'cancel', input: operationId })
      if (job) job = { ...job, status: 'cancelled' }
      return Promise.resolve(job)
    },
  })
  controller = owned
  owned.setSourceRoot('D:/original-source')
  await owned.preview()
  if (input.state === 'loading') {
    hold = true
    void owned.preview()
  }
  if (input.state === 'unknown' || input.state === 'retry' || input.state === 'running') await owned.start()
  const base = skillImportCopy(input.locale)
  const labels = {
    ...base,
    title: base.title + input.suffix,
    description: base.description + input.suffix,
    open: base.open + input.suffix,
    close: base.close + input.suffix,
    sources: { claude: base.sources.claude + input.suffix, codex: base.sources.codex + input.suffix },
    sourceRoot: base.sourceRoot + input.suffix,
    preview: base.preview + input.suffix,
    candidateStatus: { ...base.candidateStatus, ready: base.candidateStatus.ready + input.suffix },
    warnings: { ...base.warnings, platform_metadata: base.warnings.platform_metadata + input.suffix },
    capacity: (files: number, bytes: number) => base.capacity(files, bytes) + input.suffix,
    empty: base.empty + input.suffix,
    truncated: base.truncated + input.suffix,
    unknown: base.unknown + input.suffix,
    error: (code: string) => base.error(code) + input.suffix,
    result: (value: SkillImportJob) => base.result(value) + input.suffix,
    page: (page: number, count: number) => base.page(page, count) + input.suffix,
  }
  window.skillImportContentState = () => ({ state: owned.store.getState(), calls, copied, imported })
  window.repairSkillImportContent = () => {
    failed = false
    hold = false
    available = true
    release?.()
  }
  window.disposeSkillImportContent = () => {
    root?.unmount()
    controller?.dispose()
    release?.()
    root = undefined
    controller = undefined
    release = undefined
  }
  root = createRoot(element)
  root.render(
    <LumenProvider
      className="skill-import-fixture-provider"
      appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, motion: false }}
    >
      <LumenToolPane title={getShellCopy(input.locale).settings.title('global', null)}>
        <HbarSkillImportPanel
          controller={owned}
          labels={labels}
          connected={input.state !== 'offline'}
          onImported={() => {
            imported++
          }}
        />
      </LumenToolPane>
    </LumenProvider>,
  )
}
