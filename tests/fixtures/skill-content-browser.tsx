import { createRoot } from 'react-dom/client'
import { createAppRuntime } from '@hbar/app-runtime'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import { extensionCommands, type SkillDetail } from '@hbar/contracts/commands/extensions'
import { HbarRuntimeProvider, HbarExtensionWorkspace } from '@hbar/app-react'
import { LumenProvider, DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import '@lumen/app-ui/styles.css'

export interface SkillContentInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly suffix: string
  readonly count: number
  readonly state:
    | 'ready'
    | 'read-error'
    | 'missing'
    | 'no-overview'
    | 'no-entry'
    | 'truncated'
    | 'file-error'
    | 'file-missing'
    | 'offline'
    | 'duplicates'
}
declare global {
  interface Window {
    mountSkillContent(input: SkillContentInput): Promise<void>
    releaseSkillContent(): void
    repairSkillContent(): void
    mutateSkillContent(change: 'reverse' | 'shrink'): Promise<void>
    skillContentState(): {
      readonly calls: readonly { readonly name: string; readonly input: unknown }[]
      readonly detail: unknown
    }
    skillContentBounds(): Readonly<Record<string, boolean>>
  }
}
window.mountSkillContent = async (input) => {
  const element = document.getElementById('skill-content-fixture')
  if (!element) throw new Error('Missing Skill content fixture root')
  const descriptor = {
    id: 'original-skill',
    path: 'D:/original-skills/' + 'original-parent/'.repeat(35),
    scope: 'global' as const,
  }
  const files = Array.from({ length: input.count }, (_, index) => ({
    path: index === 0 ? 'SKILL.md' : 'references/' + 'original-parent/'.repeat(7) + `reference-${index}.md`,
    size: 2048 + index,
  }))
  let skill: SkillDetail = extensionCommands['skill.inspect'].output.unwrap().parse({
    ...descriptor,
    displayName: '完整原始技能名称 Complete original Skill name '.repeat(9).slice(0, 256),
    description: '原始技能说明 Complete original Skill description '.repeat(8),
    body:
      input.state === 'no-overview' ? '' : '# 原始概览 Original overview\n\nOriginal overview body — 原文概览正文。',
    entryPath: input.count && input.state !== 'no-entry' ? 'SKILL.md' : null,
    files,
    filesTruncated: input.state === 'truncated',
    entryTruncated: input.state === 'truncated',
  })
  let failed = true
  const calls: { name: string; input: unknown }[] = []
  const source =
    '---\ntitle: 原始文件完整标题\n---\n\nOriginal raw line ' +
    'original-argument/'.repeat(30) +
    '\n\n原始正文 retained exactly.'
  const extensions: CommandExecutor = {
    async execute(name, value) {
      calls.push({ name, input: value })
      if (name === 'plugin.list') return []
      if (name === 'skill.list') return [descriptor]
      if (name === 'skill.inspect') {
        const target = extensionCommands[name].input.parse(value)
        if (target.id !== descriptor.id) throw new Error('A foreign Skill was inspected')
        if (input.state === 'read-error' && failed)
          throw new CommandError('DISCONNECTED', 'Owned Skill detail read failed')
        if (input.state === 'missing') return null
        if (input.state === 'duplicates' && skill.files[0]) return { ...skill, files: [skill.files[0], skill.files[0]] }
        return skill
      }
      if (name === 'skill.file.read') {
        const target = extensionCommands[name].input.parse(value)
        if (target.id !== descriptor.id || !skill.files.some((file) => file.path === target.path))
          throw new Error('A foreign Skill file was read')
        if (input.state === 'file-error' && failed)
          throw new CommandError('DISCONNECTED', 'Owned original file read failed')
        if (input.state === 'file-missing' && failed) return null
        return extensionCommands[name].output.parse({
          id: descriptor.id,
          path: target.path,
          text:
            target.path === 'SKILL.md'
              ? source
              : '# 原始文件 Original reference\n\nOriginal Markdown proof — 文件原文。',
          truncated: input.state === 'truncated',
        })
      }
      throw new Error(`Unexpected Skill content query ${name}`)
    },
  }
  const runtime = createAppRuntime({
    instanceId: 'owned-skill-content',
    hostId: 'owned-host',
    directory: {
      async execute() {
        return { items: [], nextCursor: null }
      },
    },
    extensions,
    surfaces: { canRender: () => true },
  })
  const root = createRoot(element)
  window.releaseSkillContent = () => {
    root.unmount()
    runtime.dispose()
  }
  await runtime.ready
  await runtime.view.commands.execute('app.openSettings', {
    scope: 'global',
    section: 'skills',
    instanceId: 'owned-skill-settings',
  })
  await runtime.view.commands.execute('extensionWorkspace.refresh', {
    instanceId: 'owned-skill-settings',
    collection: 'skills',
  })
  const inspect = () =>
    runtime.view.commands.execute('extensionWorkspace.inspectSkill', {
      instanceId: 'owned-skill-settings',
      skillId: descriptor.id,
    })
  try {
    await inspect()
  } catch (reason) {
    if (input.state !== 'read-error' && input.state !== 'duplicates') throw reason
  }
  const base = getShellCopy(input.locale).extensions
  const labels = {
    ...base,
    skillDetail: {
      ...base.skillDetail,
      title: base.skillDetail.title + input.suffix,
      back: base.skillDetail.back + input.suffix,
      retry: base.skillDetail.retry + input.suffix,
      tabs: base.skillDetail.tabs + input.suffix,
      overview: base.skillDetail.overview + input.suffix,
      files: base.skillDetail.files + input.suffix,
      path: base.skillDetail.path + input.suffix,
      fileRetry: base.skillDetail.fileRetry + input.suffix,
      pagination: {
        ...base.skillDetail.pagination,
        previous: base.skillDetail.pagination.previous + input.suffix,
        next: base.skillDetail.pagination.next + input.suffix,
      },
    },
  }
  root.render(
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, motion: false }}>
      <HbarRuntimeProvider view={runtime.view}>
        <HbarExtensionWorkspace
          labels={labels}
          instanceId="owned-skill-settings"
          connected={input.state !== 'offline'}
          collection="skills"
        />
      </HbarRuntimeProvider>
    </LumenProvider>,
  )
  window.repairSkillContent = () => {
    failed = false
  }
  window.mutateSkillContent = async (change) => {
    skill = { ...skill, files: change === 'reverse' ? [...skill.files].reverse() : skill.files.slice(0, 1) }
    await inspect()
  }
  window.skillContentState = () => ({
    calls,
    detail: runtime.view.state.extensions.getSnapshot().entries['owned-skill-settings']?.skillDetail,
  })
  window.skillContentBounds = () => ({
    files200: extensionCommands['skill.inspect'].output.safeParse({
      ...skill,
      files: Array.from({ length: 200 }, (_, index) => ({ path: `ref-${index}.md`, size: 1 })),
    }).success,
    files201: extensionCommands['skill.inspect'].output.safeParse({
      ...skill,
      files: Array.from({ length: 201 }, (_, index) => ({ path: `ref-${index}.md`, size: 1 })),
    }).success,
    name256: extensionCommands['skill.inspect'].output.safeParse({ ...skill, displayName: 'n'.repeat(256) }).success,
    name257: extensionCommands['skill.inspect'].output.safeParse({ ...skill, displayName: 'n'.repeat(257) }).success,
    body262144: extensionCommands['skill.inspect'].output.safeParse({ ...skill, body: 'b'.repeat(262144) }).success,
    body262145: extensionCommands['skill.inspect'].output.safeParse({ ...skill, body: 'b'.repeat(262145) }).success,
  })
}
