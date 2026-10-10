import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarPreSessionLanding } from '@hbar/app-react'
import { getShellCopy } from '../apps/web/src/shell-copy'

test('no-tab landing renders host-owned welcome and composer in reading order for both locales', () => {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const copy = getShellCopy(locale)
    const html = renderToStaticMarkup(
      <HbarPreSessionLanding
        labels={{
          composerFeedback: copy.preSession.composerFeedback,
          hero: {
            ...copy.preSession.hero,
            description: `${copy.preSession.hero.description} ${'长期上下文 '.repeat(30)}`,
          },
          prompt: copy.preSession.prompt,
        }}
        composer={{
          value: 'Draft text',
          attachments: [],
          disabled: false,
          submitting: false,
          uploading: false,
          canSubmit: true,
          controls: <button type="button">{copy.session.addMenu.open}</button>,
          modelPicker: <button type="button">{copy.session.modelPicker.choose}</button>,
          onChange: () => undefined,
          onRemoveAttachment: () => undefined,
          onSubmit: () => undefined,
        }}
      />,
    )
    expect(html).toContain(copy.preSession.hero.title)
    expect(html).toContain('<h1')
    expect(html).toContain(copy.preSession.prompt.input)
    expect(html).toContain(copy.preSession.prompt.send)
    expect(html).toContain(copy.session.addMenu.open)
    expect(html).toContain(copy.session.modelPicker.choose)
    expect(html.indexOf('hbar-pre-session-landing-main')).toBeLessThan(html.indexOf('hbar-pre-session-landing-footer'))
    expect(html.indexOf(copy.preSession.hero.title)).toBeLessThan(html.indexOf('Draft text'))
  }
})
