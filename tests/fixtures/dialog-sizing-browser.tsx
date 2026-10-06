import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { LumenButton, LumenDialog, LumenFormField, LumenInput, LumenText, type LumenDialogProps } from '@lumen/app-ui'
import '../../packages/hbar-app-ui/src/theme.css'

type DialogSize = Exclude<LumenDialogProps['size'], undefined>

interface DialogSizingContent {
  readonly title: string
  readonly sizes: Readonly<Record<DialogSize, string>>
  readonly defaultSize: string
  readonly close: string
  readonly apply: string
  readonly draft: string
  readonly rows: readonly { readonly id: string; readonly text: string }[]
}

function DialogSizingFixture({ content }: { readonly content: DialogSizingContent }) {
  const [selection, setSelection] = useState<{ readonly size?: DialogSize } | null>(null)
  const [draft, setDraft] = useState('')
  const input = useRef<HTMLInputElement>(null)
  return (
    <main className="dialog-sizing-fixture">
      <h1>{content.title}</h1>
      <div className="dialog-sizing-actions">
        {(['large', 'medium', 'small'] as const).map((size) => (
          <LumenButton key={size} data-open-size={size} onClick={() => setSelection({ size })}>
            {content.sizes[size]}
          </LumenButton>
        ))}
        <LumenButton data-open-size="default" onClick={() => setSelection({})}>
          {content.defaultSize}
        </LumenButton>
      </div>
      <LumenDialog
        open={selection !== null}
        size={selection?.size}
        title={content.title}
        closeLabel={content.close}
        onClose={() => setSelection(null)}
        appearance="panel"
        initialFocus={input}
        footer={
          <>
            <LumenButton onClick={() => setSelection(null)}>{content.close}</LumenButton>
            <LumenButton onClick={() => setSelection(null)}>{content.apply}</LumenButton>
          </>
        }
      >
        <div className="dialog-sizing-copy">
          <LumenFormField controlId="dialog-draft" label={content.draft}>
            <LumenInput
              id="dialog-draft"
              ref={input}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </LumenFormField>
          {content.rows.map((row) => (
            <LumenText as="p" key={row.id}>
              {row.text}
            </LumenText>
          ))}
        </div>
      </LumenDialog>
    </main>
  )
}

const chinese = document.documentElement.lang.startsWith('zh')
const content: DialogSizingContent = {
  title: chinese ? '子窗口尺寸验证' : 'Child window sizing fixture',
  sizes: chinese
    ? { large: '大窗口', medium: '中窗口', small: '小窗口' }
    : { large: 'Large', medium: 'Medium', small: 'Small' },
  defaultSize: chinese ? '默认尺寸' : 'Default size',
  close: chinese ? '取消' : 'Cancel',
  apply: chinese ? '应用' : 'Apply',
  draft: chinese ? '保留的草稿' : 'Preserved draft',
  rows: Array.from({ length: 80 }, (_, index) => ({
    id: `row-${index}`,
    text: chinese
      ? `第 ${index + 1} 项：内容应在中间区域滚动，顶部和底部操作保持可见。`
      : `Row ${index + 1}: content scrolls in the body while the header and footer actions stay visible.`,
  })),
}
const root = document.getElementById('fixture-root')
if (!root) throw new Error('The dialog sizing fixture root is missing')
const fixture = createRoot(root)
root.addEventListener('hbar-dialog-sizing-cleanup', () => fixture.unmount(), { once: true })
fixture.render(<DialogSizingFixture content={content} />)
