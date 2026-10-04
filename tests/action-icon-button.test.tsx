import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Plus } from 'lucide-react'
import { LumenIcon } from '@lumen/app-ui'
import { HbarActionIconButton } from '../packages/app-react/src/action-icon-button'
import { HbarComposerAddMenu } from '../packages/app-react/src/composer-add-menu'
import { getShellCopy } from '../apps/web/src/shell-copy'

test('plain actions preserve host names, pressed and disabled semantics without idle lamps', () => {
  for (const label of ['Add', '添加材料、指令与目标——保留完整且较长的宿主提供名称']) {
    for (const pressed of [false, true]) {
      const html = renderToStaticMarkup(
        <HbarActionIconButton label={label} aria-pressed={pressed} disabled size="s">
          <LumenIcon icon={Plus} tier="sm" />
        </HbarActionIconButton>,
      )
      expect(html).toContain(`aria-label="${label}"`)
      expect(html).toContain(`title="${label}"`)
      expect(html).toContain(`aria-pressed="${pressed}"`)
      expect(html).toContain('disabled=""')
      expect(html).toContain('data-size="s"')
      expect(html).toContain('data-lumen-indicator="none"')
      expect(html).not.toContain('data-edge=')
      expect(html.match(/<button/g)).toHaveLength(1)
    }
  }
})

test('busy actions have an explicit glyph and submission lock, while native form and tooltip props survive', () => {
  const html = renderToStaticMarkup(
    <HbarActionIconButton label="Refresh" title="Refresh expanded projects" type="submit" loading>
      <LumenIcon icon={Plus} tier="md" />
    </HbarActionIconButton>,
  )
  expect(html).toContain('type="submit"')
  expect(html).toContain('title="Refresh expanded projects"')
  expect(html).toContain('aria-busy="true"')
  expect(html).toContain('disabled=""')
  expect(html).toContain('hbar-action-icon-busy')
  expect(html).not.toContain('lucide-plus')
  expect(html).not.toContain('data-edge=')
})

test('the composer Add trigger keeps localized disclosure and unavailable semantics', () => {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const labels = getShellCopy(locale).session.addMenu
    const html = renderToStaticMarkup(
      <HbarComposerAddMenu labels={labels} canAddFiles={false} canOpenSlash={false} onOpenSlash={() => {}} />,
    )
    const trigger = html.slice(html.indexOf('<button'), html.indexOf('</button>'))
    expect(trigger).toContain(`aria-label="${labels.open}"`)
    expect(trigger).toContain('aria-expanded="false"')
    expect(trigger).toContain('disabled=""')
    expect(trigger).toContain('data-lumen-indicator="none"')
    expect(trigger).not.toContain('data-edge=')
  }
})
