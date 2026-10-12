import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenPromptInput, type LumenPromptInputProps } from '@lumen/app-ui/catalog'
import { HBAR_APP_UI_PROMPT_INPUT_FIXTURES } from './fixtures/hbar-app-ui-prompt-input-fixtures'
import { createPrompt4ReferenceFixture } from './fixtures/hbar-app-ui-prompt-input-4-reference-fixture'
import { createPrompt5ReferenceFixture } from './fixtures/hbar-app-ui-prompt-input-5-reference-fixture'

function renderReference(
  variant: 4 | 5,
  content: NonNullable<NonNullable<LumenPromptInputProps['content']>['referenceViewModel']>['content'],
) {
  const viewModel = {
    content,
    onAction() {},
    onVariableChange() {},
    onRemoveUpload() {},
  }
  const hostContent: NonNullable<LumenPromptInputProps['content']> = {
    ...HBAR_APP_UI_PROMPT_INPUT_FIXTURES,
    referenceViewModel: viewModel,
  }
  return renderToStaticMarkup(
    createElement(LumenPromptInput, {
      variant,
      variantId: `hbar-app-ui-prompt-input-${variant}`,
      content: hostContent,
    }),
  )
}

describe('hbar-app-ui prompt input reference 4/5', () => {
  test('keeps template prose inline and derives readiness from host variables', () => {
    const content = createPrompt4ReferenceFixture()
    const markup = renderReference(4, content)

    expect(markup).toContain('Write a ')
    expect(markup).toContain('existing customers')
    expect(markup).toContain('introducing ')
    expect(markup).toContain('>Product</span>')
    expect(markup).toContain('1 variable needs a value')
    expect(markup).toContain('>Tone</label>')
    expect(markup).toContain('>Audience</label>')
    expect(markup).toContain('>Product</label>')
    expect(markup).toContain('disabled=""')
    expect(markup).not.toContain('Template name')
    expect(markup).not.toContain('Variables</')
  })

  test('renders localized template copy and enables the intent when every variable has a value', () => {
    const content = createPrompt4ReferenceFixture('zh')
    const ready = {
      ...content,
      variables: content.variables.map((variable) =>
        variable.id === 'product' ? { ...variable, value: '全新的协作分析功能' } : variable,
      ),
    }
    const markup = renderReference(4, ready)

    expect(markup).toContain('为')
    expect(markup).toContain('现有客户')
    expect(markup).toContain('全新的协作分析功能')
    expect(markup).toContain('模板已准备就绪')
    expect(markup).toContain('运行模板')
    expect(markup).not.toContain('disabled=""')
    expect(markup).toContain('请输入您即将推出的产品或功能名称')
  })

  test('shows the composer, attachment rows, failure retry and browse/drop in source order', () => {
    const content = createPrompt5ReferenceFixture()
    const markup = renderReference(5, content)

    expect(markup.indexOf('Ask anything')).toBeLessThan(markup.indexOf('brand-guidelines.pdf'))
    expect(markup.indexOf('brand-guidelines.pdf')).toBeLessThan(markup.indexOf('product-shot-hero.png'))
    expect(markup.indexOf('product-shot-hero.png')).toBeLessThan(markup.indexOf('Drag files here, or browse'))
    expect(markup).toContain('3.4 MB')
    expect(markup).toContain('820 KB')
    expect(markup).toContain('Connection lost')
    expect(markup).toContain('aria-label="Retry product-shot-hero.png"')
    expect(markup).toContain('aria-label="Remove brand-guidelines.pdf"')
    expect(markup).not.toContain('100%')
    expect(markup).not.toContain('Uploading')
  })

  test('renders an empty upload state and ignores duplicate attachment IDs', () => {
    const content = createPrompt5ReferenceFixture('zh')
    const duplicate = {
      ...content,
      uploads: [
        ...content.uploads,
        {
          id: 'brand-guidelines',
          name: 'duplicate-name.pdf',
          detail: 'Duplicate copy',
          failed: false,
        },
      ],
    }
    const duplicateMarkup = renderReference(5, duplicate)
    expect(duplicateMarkup).toContain('brand-guidelines.pdf')
    expect(duplicateMarkup).not.toContain('duplicate-name.pdf')
    expect(duplicateMarkup).toContain('拖放文件，或浏览')

    const emptyMarkup = renderReference(5, { ...content, uploads: [] })
    expect(emptyMarkup).toContain('尚未添加文件')
    expect(emptyMarkup).not.toContain('brand-guidelines.pdf')
    expect(emptyMarkup).toContain('aria-label="拖放文件，或浏览"')
  })
})
