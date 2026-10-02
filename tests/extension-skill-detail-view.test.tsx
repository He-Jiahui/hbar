import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarExtensionWorkspace, HbarRuntimeProvider } from '@hbar/app-react'
import { createAppRuntime } from '@hbar/app-runtime'
import { CommandError } from '@hbar/commands'
import type { SkillDetail, SkillDescriptor } from '@hbar/contracts/commands/extensions'
import { getShellCopy } from '../apps/web/src/shell-copy'

const skill = (index: number): SkillDescriptor => ({
  id: `fixture-skill-${index}`,
  path: `D:/fixtures/skills/fixture-skill-${index}`,
  scope: 'global',
})

function detailFor(item: SkillDescriptor, fileCount: number): SkillDetail {
  const files = Array.from({ length: fileCount }, (_, index) => ({
    path: index === 0 ? 'SKILL.md' : `references/review-${String(index).padStart(3, '0')}.md`,
    size: index === 0 ? 88 : 32 + index,
  }))
  return {
    id: item.id,
    path: item.path,
    scope: item.scope,
    entryPath: files.some((file) => file.path === 'SKILL.md') ? 'SKILL.md' : null,
    displayName: '用于长文本回归的技能名称'.repeat(4),
    description: '这是一个很长的中文描述，用于验证详情摘要在窄面板中仍保持正常流并可以换行。',
    body: '# 技能概览\n\n读取真实 Host 返回的技能正文。',
    files,
    filesTruncated: fileCount > 200,
    entryTruncated: false,
  }
}

function fixture(count: number) {
  const skills = Array.from({ length: count }, (_, index) => skill(index))
  const details = new Map(skills.map((item) => [item.id, detailFor(item, Math.min(200, Math.max(1, count)))]))
  const runtime = createAppRuntime({
    instanceId: 'skill-detail-view',
    hostId: 'fixture-host',
    directory: { execute: async () => ({ items: [], nextCursor: null }) },
    extensions: {
      async execute(name, input) {
        if (name === 'plugin.list') return []
        if (name === 'skill.list') return skills
        if (name === 'skill.inspect' && input && typeof input === 'object' && 'id' in input) {
          const value = details.get(String(input.id))
          return value ?? null
        }
        if (name === 'skill.file.read' && input && typeof input === 'object' && 'id' in input && 'path' in input) {
          const value = details.get(String(input.id))
          const path = String(input.path)
          const entry = value?.files.find((file) => file.path === path)
          if (!value || !entry) return null
          return {
            id: value.id,
            path,
            text: `---\ntitle: ${value.displayName}\n---\n\n# ${path}\n\n原始文件正文。`,
            truncated: false,
          }
        }
        throw new CommandError('UNSUPPORTED', name)
      },
    },
    surfaces: { canRender: () => true },
  })
  return { runtime, skills }
}

function render(runtime: ReturnType<typeof createAppRuntime>, labels = getShellCopy('zh-CN').extensions) {
  return renderToStaticMarkup(
    <HbarRuntimeProvider view={runtime.view}>
      <HbarExtensionWorkspace labels={labels} connected collection="skills" instanceId="settings" />
    </HbarRuntimeProvider>,
  )
}

for (const count of [0, 1, 20, 21, 200] as const) {
  test(`skill detail view renders bounded list count ${count} from runtime state`, async () => {
    const fixtureState = fixture(count)
    try {
      await fixtureState.runtime.view.commands.execute('app.openSettings', {
        scope: 'global',
        section: 'skills',
        instanceId: 'settings',
      })
      await fixtureState.runtime.view.commands.execute('extensionWorkspace.refresh', {
        instanceId: 'settings',
        collection: 'skills',
      })
      const html = render(fixtureState.runtime)
      expect((html.match(/data-skill-id=/g) ?? []).length).toBe(Math.min(count, 20))
      if (count > 20) expect(html).toContain('下一页')
      else expect(html).not.toContain('下一页')
    } finally {
      fixtureState.runtime.dispose()
    }
  })
}

test('skill detail actions render overview and raw file source, then return to the retained list state', async () => {
  const fixtureState = fixture(21)
  try {
    const labels = getShellCopy('zh-CN').extensions
    await fixtureState.runtime.view.commands.execute('app.openSettings', {
      scope: 'global',
      section: 'skills',
      instanceId: 'settings',
    })
    await fixtureState.runtime.view.commands.execute('extensionWorkspace.refresh', {
      instanceId: 'settings',
      collection: 'skills',
    })
    await fixtureState.runtime.view.commands.execute('extensionWorkspace.setQuery', {
      instanceId: 'settings',
      query: 'fixture',
      collection: 'skills',
    })
    await fixtureState.runtime.view.commands.execute('extensionWorkspace.setPage', {
      instanceId: 'settings',
      collection: 'skills',
      page: 1,
    })
    const selected = fixtureState.skills[20]
    if (!selected) throw new Error('Expected page two skill fixture')
    await fixtureState.runtime.view.commands.execute('extensionWorkspace.inspectSkill', {
      instanceId: 'settings',
      skillId: selected.id,
    })
    const overview = render(fixtureState.runtime)
    expect(overview).toContain('hbar-app-react-skill-detail')
    expect(overview).toContain('hbar-app-react-skill-overview')
    expect(overview).toContain('读取真实 Host 返回的技能正文。')
    await fixtureState.runtime.view.commands.execute('extensionWorkspace.selectSkillView', {
      instanceId: 'settings',
      view: 'files',
    })
    await fixtureState.runtime.view.commands.execute('extensionWorkspace.openSkillFile', {
      instanceId: 'settings',
      path: 'SKILL.md',
    })
    const files = render(fixtureState.runtime, {
      ...labels,
      skillDetail: { ...labels.skillDetail, back: '返回技能列表（很长的中文本地化标签）'.repeat(3) },
    })
    expect(files).toContain('hbar-app-react-skill-file-content')
    expect(files).toContain('title: 用于长文本回归的技能名称')
    expect(files).toContain('---')
    await fixtureState.runtime.view.commands.execute('extensionWorkspace.backSkill', { instanceId: 'settings' })
    const returned = render(fixtureState.runtime)
    expect(returned).not.toContain('hbar-app-react-skill-detail')
    expect(returned).toContain(`data-skill-id="${selected.id}"`)
    expect(fixtureState.runtime.view.state.extensions.getSnapshot().entries.settings?.queries.skills).toBe('fixture')
    expect(fixtureState.runtime.view.state.extensions.getSnapshot().entries.settings?.skillPage).toBe(1)
    expect(fixtureState.runtime.view.state.extensions.getSnapshot().entries.settings?.selectedSkillId).toBe(selected.id)
  } finally {
    fixtureState.runtime.dispose()
  }
})
