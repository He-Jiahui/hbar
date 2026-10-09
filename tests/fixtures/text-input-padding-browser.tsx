import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DEFAULT_LUMEN_APPEARANCE, type LumenSize } from '@lumen/app-ui/appearance'
import LumenProvider from '@lumen/app-ui/provider'
import { LumenComboBox, LumenFormField, LumenInput, LumenSettingsForm01, LumenTextarea } from '@lumen/app-ui'
import '@lumen/app-ui/styles.css'

const copy = {
  title: '文本输入间距回归验证 / Text input spacing regression',
  label: '一个用于验证窄屏与滚动边界的长中文字段名称 / A long translated field label',
  description: '说明、继承信息和错误提示都应与可见外框保持留白。',
  error: '请检查输入值 / Check the entered value',
  placeholder: '输入文字 / Enter text',
  longValue: '很长的文本和路径 D:/workspace/a-long-directory-name/文件名称.ts',
  multiline: '第一行 / First line\n第二行 / Second line',
  combo: { open: '打开选项', empty: '没有选项', loading: '正在读取' },
  options: [
    { id: 'first', label: '第一个选项' },
    { id: 'second', label: '第二个选项' },
  ],
} as const

function TextInputPaddingFixture() {
  const mode = document.documentElement.dataset.lumenMode === 'light' ? 'light' : 'dark'
  const requestedSize = document.documentElement.dataset.lumenControlSize
  const controlSize: LumenSize = requestedSize === 's' || requestedSize === 'l' ? requestedSize : 'm'
  const [text, setText] = useState('')
  const [multiline, setMultiline] = useState<string>(copy.multiline)
  const [query, setQuery] = useState('')
  const [selection, setSelection] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  return (
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode, controlSize }} withCssBaseline={false}>
      <main className="padding-fixture">
        <h1>{copy.title}</h1>
        <section className="padding-fields">
          <LumenFormField controlId="padding-empty" label={copy.label} description={copy.description}>
            <LumenInput
              id="padding-empty"
              value={text}
              placeholder={copy.placeholder}
              onChange={(event) => setText(event.currentTarget.value)}
            />
          </LumenFormField>
          <LumenInput id="padding-long" aria-label={copy.label} defaultValue={copy.longValue} />
          <LumenInput id="padding-numeric" aria-label={copy.label} inputMode="numeric" defaultValue="90" />
          <LumenInput id="padding-number" aria-label={copy.label} type="number" defaultValue="90" />
          <LumenInput id="padding-password" aria-label={copy.label} type="password" defaultValue="fixture-secret" />
          <LumenInput
            id="padding-url"
            aria-label={copy.label}
            type="url"
            defaultValue="https://example.test/a-long-path"
          />
          <LumenInput id="padding-readonly" aria-label={copy.label} readOnly value={copy.longValue} />
          <LumenInput id="padding-disabled" aria-label={copy.label} disabled value={copy.longValue} />
          <LumenFormField controlId="padding-invalid" label={copy.label} error={copy.error}>
            <LumenInput id="padding-invalid" defaultValue="invalid" />
          </LumenFormField>
          {(['s', 'm', 'l'] as const).map((size) => (
            <LumenInput
              key={size}
              id={`padding-explicit-${size}`}
              aria-label={copy.label}
              size={size}
              defaultValue={copy.longValue}
            />
          ))}
          <div className="padding-button-spacing-scope">
            <LumenInput id="padding-independent" aria-label={copy.label} defaultValue={copy.longValue} />
          </div>
          <LumenComboBox
            id="padding-combo"
            aria-label={copy.label}
            value={selection}
            query={query}
            open={open}
            options={copy.options}
            labels={copy.combo}
            onQueryChange={setQuery}
            onOpenChange={setOpen}
            onValueChange={(value) => {
              setSelection(value)
              setQuery(copy.options.find((option) => option.id === value)?.label ?? '')
              setOpen(false)
            }}
          />
          <LumenTextarea
            id="padding-multiline"
            aria-label={copy.label}
            size="s"
            value={multiline}
            onChange={(event) => setMultiline(event.currentTarget.value)}
          />
        </section>
        <LumenSettingsForm01
          slots={{
            content: (
              <LumenFormField
                controlId="padding-settings"
                label={copy.label}
                description={copy.description}
                error={copy.error}
              >
                <LumenInput id="padding-settings" inputMode="numeric" defaultValue="90" />
              </LumenFormField>
            ),
          }}
        />
      </main>
    </LumenProvider>
  )
}

const root = document.getElementById('fixture-root')
if (!root) throw new Error('Missing text input spacing fixture root')
createRoot(root).render(<TextInputPaddingFixture />)
